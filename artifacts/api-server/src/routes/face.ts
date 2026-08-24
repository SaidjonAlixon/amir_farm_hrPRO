import { Router, type IRouter } from "express";
import { asc, eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import {
  db,
  usersTable,
  departmentsTable,
  faceProfilesTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { setSessionCookie } from "../lib/session";
import {
  FACE_ENROLL_BLOCK_MAX,
  FACE_MATCH_MAX,
  LIVENESS_THRESHOLD,
  evaluateLiveness,
  packDescriptors,
  type LivenessProof,
  FACE_SIMILAR_WARN,
  distanceBetweenDescriptors,
  minDistanceBetweenVectors,
  parseStoredVectors,
  findDuplicateEnrollHits,
  findNearestFaces,
  invalidateFaceCache,
  matchFaceForAuthWithAi,
  parseFaceDescriptor,
} from "../lib/face-match";
import { inspectEnrollFaceWithAi, rejectIfFaceTakenByAi } from "../lib/face-ai-verify";
import { issueFaceChallenge } from "../lib/face-identity";
import { clientKey, rateLimitAllow } from "../lib/rate-limit";
import { ROLE_LABEL_UZ } from "../lib/telegram";
import { logger } from "../lib/logger";
import { readBlobUpload, readLocalUpload } from "../lib/blob-storage";

function parseDescriptorList(body: { descriptors?: unknown; descriptor?: unknown }): number[][] {
  if (Array.isArray(body?.descriptors)) {
    return (body.descriptors as unknown[]).map(parseFaceDescriptor).filter((d): d is number[] => Boolean(d));
  }
  const one = parseFaceDescriptor(body?.descriptor);
  return one ? [one] : [];
}

const router: IRouter = Router();

const MAX_SNAPSHOT_CHARS = 180_000; // ~135 KB base64 JPEG

async function getUserWithDept(userId: number) {
  const [user] = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
      login: usersTable.login,
      phone: usersTable.phone,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

function parseDescriptor(raw: unknown): number[] | null {
  return parseFaceDescriptor(raw);
}

function sanitizeSnapshot(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("data:image/")) return null;
  if (s.length > MAX_SNAPSHOT_CHARS) return null;
  return s;
}

function decodeSnapshotBuffer(dataUrl: string): { buffer: Buffer; mime: string; ext: "jpg" | "png" } | null {
  const m = /^data:image\/(jpeg|jpg|png);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const raw = m[1]!.toLowerCase();
  const ext = raw === "png" ? "png" : "jpg";
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  try {
    const buffer = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
    if (buffer.length < 80 || buffer.length > 1_800_000) return null;
    return { buffer, mime, ext };
  } catch {
    return null;
  }
}

/** Face ID rasmi Neon `face_profiles.photo_url` da (data URL). Blob/tmp ishlatilmaydi. */
async function persistFacePhoto(_userId: number, dataUrl: string): Promise<string> {
  const decoded = decodeSnapshotBuffer(dataUrl);
  if (!decoded) throw new Error("Yuz rasmi yaroqsiz");
  const stored = `data:${decoded.mime};base64,${decoded.buffer.toString("base64")}`;
  if (stored.length > MAX_SNAPSHOT_CHARS) throw new Error("Yuz rasmi juda katta");
  return stored;
}

/** Rasm yo‘q profilga bir marta yozadi. Bor bo‘lsa tegilmaydi. */
export async function maybeBackfillFacePhoto(profileId: number, snapshotRaw: unknown): Promise<boolean> {
  const snapshot = sanitizeSnapshot(snapshotRaw);
  if (!snapshot || !Number.isFinite(profileId)) return false;
  const [row] = await db
    .select({
      id: faceProfilesTable.id,
      userId: faceProfilesTable.userId,
      photoUrl: faceProfilesTable.photoUrl,
    })
    .from(faceProfilesTable)
    .where(eq(faceProfilesTable.id, profileId))
    .limit(1);
  if (!row || (row.photoUrl && row.photoUrl.trim())) return false;
  try {
    const photoUrl = await persistFacePhoto(row.userId, snapshot);
    await db
      .update(faceProfilesTable)
      .set({ photoUrl, updatedAt: new Date() })
      .where(eq(faceProfilesTable.id, row.id));
    return true;
  } catch {
    return false;
  }
}

async function loadFacePhotoBuffer(photoUrl: string | null | undefined): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!photoUrl) return null;
  const parsed = parsePhotoDataUrl(photoUrl);
  if (parsed) {
    return {
      buffer: Buffer.from(parsed.base64, "base64"),
      contentType: parsed.extension === "png" ? "image/png" : "image/jpeg",
    };
  }
  const remote = /[?&]path=([^&]+)/.exec(photoUrl);
  if (remote) {
    const blob = await readBlobUpload(decodeURIComponent(remote[1]!));
    if (blob) return { buffer: blob.buffer, contentType: blob.contentType || "image/jpeg" };
  }
  const local = /\/api\/uploads\/([^/?#]+)/.exec(photoUrl);
  if (local) {
    const buf = await readLocalUpload(decodeURIComponent(local[1]!));
    if (buf) return { buffer: buf, contentType: "image/jpeg" };
  }
  return null;
}

function sendFacePhoto(
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (b: unknown) => void }; send: (b: Buffer) => void },
  packed: { buffer: Buffer; contentType: string } | null,
) {
  if (!packed) {
    res.status(404).json({ error: "Rasm yo‘q" });
    return;
  }
  res.setHeader("Content-Type", packed.contentType);
  res.setHeader("Cache-Control", "private, max-age=120");
  res.send(packed.buffer);
}

function requireAdmin(req: AuthRequest, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat admin Face ID ro‘yxatini ko‘radi" });
    return false;
  }
  return true;
}

router.get("/auth/face/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const [row] = await db
    .select({
      id: faceProfilesTable.id,
      createdAt: faceProfilesTable.createdAt,
      updatedAt: faceProfilesTable.updatedAt,
      photoUrl: faceProfilesTable.photoUrl,
    })
    .from(faceProfilesTable)
    .where(eq(faceProfilesTable.userId, userId))
    .limit(1);
  const stamp = row?.updatedAt ? new Date(row.updatedAt).getTime() : Date.now();
  res.json({
    registered: Boolean(row),
    count: row ? 1 : 0,
    hasPhoto: Boolean(row?.photoUrl),
    photoUrl: row?.photoUrl ? `/api/auth/face/photo?t=${stamp}` : null,
    createdAt: row?.createdAt ?? null,
  });
});

router.get("/auth/face/photo", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [row] = await db
    .select({ photoUrl: faceProfilesTable.photoUrl })
    .from(faceProfilesTable)
    .where(eq(faceProfilesTable.userId, req.userId!))
    .limit(1);
  sendFacePhoto(res, await loadFacePhotoBuffer(row?.photoUrl));
});

router.get("/auth/face/challenge", async (req, res): Promise<void> => {
  const ip = clientKey(req);
  if (!rateLimitAllow(`face-challenge:${ip}`, 30, 10 * 60_000)) {
    res.status(429).json({ error: "Ko‘p urinish — birozdan keyin qayta urinib ko‘ring" });
    return;
  }
  const mode = String(req.query.mode || "login") === "enroll" ? "enroll" : "login";
  const issued = issueFaceChallenge(mode);
  res.json({ token: issued.token, steps: issued.steps, mode });
});

router.post("/auth/face/enroll", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  if (!rateLimitAllow(`face-enroll:${userId}`, 12, 10 * 60_000)) {
    res.status(429).json({ error: "Ko‘p urinish — birozdan keyin qayta urinib ko‘ring" });
    return;
  }
  const descriptors = parseDescriptorList(req.body ?? {});
  if (descriptors.length < 3) {
    res.status(400).json({ error: "Yuz bir necha burchakdan olinishi shart — qayta urinib ko‘ring" });
    return;
  }

  const live = evaluateLiveness(req.body?.liveness as LivenessProof | undefined, "enroll");
  if (!live.ok) {
    logger.info({ event: "face_enroll", ok: false, code: live.code, userId }, "face enroll liveness");
    res.status(403).json({ error: live.error, code: live.code });
    return;
  }

  const snapshot = sanitizeSnapshot(req.body?.snapshot ?? req.body?.photo);
  if (!snapshot) {
    res.status(400).json({ error: "Yuz rasmi olinmadi — kameraga qarab qayta urinib ko‘ring" });
    return;
  }

  const inspected = await inspectEnrollFaceWithAi(snapshot);
  if (!inspected.ok) {
    logger.info({ event: "face_enroll", ok: false, code: inspected.code, userId }, "face enroll AI inspect");
    res.status(400).json({ error: inspected.error, code: inspected.code });
    return;
  }

  const nearest = await findDuplicateEnrollHits(descriptors.slice(0, 1), userId);
  if (nearest.length) {
    logger.info(
      {
        event: "face_enroll",
        ok: false,
        code: "face_already_taken",
        userId,
        dist: Number(nearest[0]!.dist.toFixed(4)),
        threshold: FACE_ENROLL_BLOCK_MAX,
      },
      "face enroll blocked duplicate",
    );
    res.status(409).json({
      error: "Bu yuz allaqachon boshqa accountga biriktirilgan",
      code: "face_already_taken",
    });
    return;
  }

  const similar = await findNearestFaces(descriptors[0]!, {
    excludeUserId: userId,
    limit: 3,
  });
  const taken = await rejectIfFaceTakenByAi({
    liveSnapshot: snapshot,
    neighborProfileIds: similar.map((h) => h.id),
  });
  if (!taken.ok) {
    logger.info({ event: "face_enroll", ok: false, code: taken.code, userId }, "face enroll AI duplicate");
    res.status(409).json({ error: taken.error, code: taken.code });
    return;
  }

  let photoUrl = "";
  try {
    photoUrl = await persistFacePhoto(userId, snapshot);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message || "Yuz rasmi saqlanmadi" });
    return;
  }

  const payload = {
    userId,
    descriptor: packDescriptors(descriptors),
    updatedAt: new Date(),
    photoUrl,
  };

  const [existing] = await db
    .select({ id: faceProfilesTable.id })
    .from(faceProfilesTable)
    .where(eq(faceProfilesTable.userId, userId))
    .limit(1);
  if (existing) {
    await db
      .update(faceProfilesTable)
      .set(payload)
      .where(eq(faceProfilesTable.id, existing.id));
  } else {
    await db.insert(faceProfilesTable).values(payload);
  }
  invalidateFaceCache();
  logger.info({ event: "face_enroll", ok: true, userId, templates: descriptors.length }, "face enrolled");
  res.json({
    ok: true,
    registered: true,
    hasPhoto: true,
    photoUrl: `/api/auth/face/photo?t=${Date.now()}`,
  });
});

router.post("/auth/face/login", async (req, res): Promise<void> => {
  const ip = clientKey(req);
  if (!rateLimitAllow(`face-login:${ip}`, 12, 10 * 60_000)) {
    res.status(429).json({ error: "Ko‘p urinish — birozdan keyin qayta urinib ko‘ring" });
    return;
  }
  const descriptors = parseDescriptorList(req.body ?? {});
  if (!descriptors.length) {
    res.status(400).json({ error: "Yuz aniq olinmadi — kameraga qarab turing" });
    return;
  }

  const live = evaluateLiveness(req.body?.liveness as LivenessProof | undefined, "login");
  if (!live.ok) {
    logger.info({ event: "face_login", ok: false, code: live.code, liveness: false }, "face login liveness");
    res.status(403).json({ error: live.error, code: live.code });
    return;
  }

  const matched = await matchFaceForAuthWithAi(descriptors, req.body?.snapshot ?? req.body?.photo);
  if (!matched.ok) {
    res.status(401).json({
      error: matched.error,
      code: matched.code,
    });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, matched.userId));
  if (!user || (user.status !== "active" && user.status !== "on_leave")) {
    res.status(403).json({
      error: user?.fullName
        ? `${user.fullName}: profil faol emas`
        : "Foydalanuvchi faol emas",
      code: "user_inactive",
      fullName: user?.fullName ?? undefined,
    });
    return;
  }

  await db
    .update(faceProfilesTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(faceProfilesTable.id, matched.id));

  await maybeBackfillFacePhoto(matched.id, req.body?.snapshot ?? req.body?.photo);

  // Tanilgan yuz egasi — sessiya shu profilga o‘tadi (eski cookie yoziladi)
  setSessionCookie(res, user.id);
  const fullUser = await getUserWithDept(user.id);
  const fullName = fullUser?.fullName ?? user.fullName;
  res.json({
    ok: true,
    user: fullUser,
    fullName,
    message: fullName,
    sessionUserId: user.id,
  });
});

router.delete("/auth/face", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  await db.delete(faceProfilesTable).where(eq(faceProfilesTable.userId, userId));
  invalidateFaceCache();
  res.json({ ok: true });
});

/** Admin: barcha xodimlar + Face ID holati + o‘xshash juftliklar */
router.get("/admin/faces", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  try {
    const users = await db
      .select({
        userId: usersTable.id,
        fullName: usersTable.fullName,
        login: usersTable.login,
        role: usersTable.role,
        status: usersTable.status,
        phone: usersTable.phone,
        departmentName: departmentsTable.name,
        faceId: faceProfilesTable.id,
        descriptor: faceProfilesTable.descriptor,
        hasPhotoFlag: sql<number>`CASE WHEN ${faceProfilesTable.photoUrl} IS NOT NULL AND length(${faceProfilesTable.photoUrl}) > 8 THEN 1 ELSE 0 END`,
        createdAt: faceProfilesTable.createdAt,
        updatedAt: faceProfilesTable.updatedAt,
        lastUsedAt: faceProfilesTable.lastUsedAt,
      })
      .from(usersTable)
      .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
      .leftJoin(faceProfilesTable, eq(faceProfilesTable.userId, usersTable.id))
      .orderBy(asc(usersTable.fullName));

    const parsed = users.map((row) => ({
      ...row,
      vectors: row.descriptor ? parseStoredVectors(row.descriptor) : [],
      hasPhoto: Number(row.hasPhotoFlag) === 1,
    }));

    const withFace = parsed.filter((u) => u.faceId != null && u.vectors.length > 0);

    const faces = parsed.map((row) => {
      const registered = Boolean(row.faceId && row.vectors.length);
      let nearest: {
        userId: number;
        fullName: string;
        login: string;
        distance: number;
      } | null = null;

      if (registered) {
        for (const other of withFace) {
          if (other.faceId === row.faceId) continue;
          const dist = minDistanceBetweenVectors(row.vectors, other.vectors);
          if (dist == null) continue;
          if (!nearest || dist < nearest.distance) {
            nearest = {
              userId: other.userId,
              fullName: other.fullName,
              login: other.login,
              distance: Number(dist.toFixed(4)),
            };
          }
        }
      }

      return {
        id: row.faceId ?? row.userId,
        userId: row.userId,
        fullName: row.fullName,
        login: row.login,
        role: row.role,
        roleLabel: ROLE_LABEL_UZ[row.role] || row.role,
        status: row.status,
        phone: row.phone,
        departmentName: row.departmentName,
        photoUrl: registered && row.hasPhoto ? `/api/admin/faces/${row.userId}/photo` : null,
        hasPhoto: row.hasPhoto,
        faceRegistered: registered,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastUsedAt: row.lastUsedAt,
        nearest,
        similarRisk:
          nearest != null && nearest.distance <= FACE_SIMILAR_WARN
            ? nearest.distance <= FACE_MATCH_MAX
              ? "high"
              : "medium"
            : "none",
      };
    });

    const duplicates: Array<{
      a: { userId: number; fullName: string; login: string };
      b: { userId: number; fullName: string; login: string };
      distance: number;
    }> = [];
    for (let i = 0; i < withFace.length; i++) {
      for (let j = i + 1; j < withFace.length; j++) {
        const a = withFace[i]!;
        const b = withFace[j]!;
        const dist = minDistanceBetweenVectors(a.vectors, b.vectors);
        if (dist == null || dist > FACE_SIMILAR_WARN) continue;
        duplicates.push({
          a: { userId: a.userId, fullName: a.fullName, login: a.login },
          b: { userId: b.userId, fullName: b.fullName, login: b.login },
          distance: Number(dist.toFixed(4)),
        });
      }
    }
    duplicates.sort((x, y) => x.distance - y.distance);

    const registeredCount = faces.filter((f) => f.faceRegistered).length;

    res.json({
      total: faces.length,
      registered: registeredCount,
      notRegistered: faces.length - registeredCount,
      withPhoto: faces.filter((r) => r.hasPhoto).length,
      similarPairs: duplicates.length,
      enrollBlockMax: FACE_ENROLL_BLOCK_MAX,
      matchMax: FACE_MATCH_MAX,
      livenessThreshold: LIVENESS_THRESHOLD,
      faces,
      duplicates,
    });
  } catch (err) {
    logger.error({ err }, "GET /admin/faces failed");
    res.status(503).json({ error: "Server xatosi" });
  }
});

function parsePhotoDataUrl(photoUrl: string | null | undefined): {
  extension: "jpeg" | "png";
  base64: string;
} | null {
  if (!photoUrl) return null;
  const m = /^data:image\/(jpeg|jpg|png);base64,([\s\S]+)$/i.exec(photoUrl.trim());
  if (!m) return null;
  const raw = m[1]!.toLowerCase();
  const extension = raw === "png" ? "png" : "jpeg";
  const base64 = m[2]!.replace(/\s/g, "");
  if (!base64) return null;
  return { extension, base64 };
}

function fmtExcelDt(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Admin — Face ID ro‘yxati Excel (rasmlar bilan) */
router.get("/admin/faces/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  try {
    await db.execute(sql`ALTER TABLE face_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  } catch {
    /* ignore */
  }

  const statusFilter = String(req.query.status || "all"); // all | yes | no
  const onlyRisk = String(req.query.onlyRisk || "") === "1" || String(req.query.onlyRisk || "") === "true";
  const needle = String(req.query.q || "")
    .trim()
    .toLowerCase();

  const users = await db
    .select({
      userId: usersTable.id,
      fullName: usersTable.fullName,
      login: usersTable.login,
      role: usersTable.role,
      departmentName: departmentsTable.name,
      faceId: faceProfilesTable.id,
      descriptor: faceProfilesTable.descriptor,
      photoUrl: faceProfilesTable.photoUrl,
      createdAt: faceProfilesTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .leftJoin(faceProfilesTable, eq(faceProfilesTable.userId, usersTable.id))
    .orderBy(asc(usersTable.fullName));

  const withFace = users.filter((u) => u.faceId != null && u.descriptor);

  type ExportRow = {
    userId: number;
    fullName: string;
    login: string;
    roleLabel: string;
    departmentName: string | null;
    photoUrl: string | null;
    faceRegistered: boolean;
    createdAt: Date | string | null;
    similarRisk: "none" | "medium" | "high";
  };

  const rows: ExportRow[] = users.map((row) => {
    const registered = Boolean(row.faceId && row.descriptor);
    let nearestDist: number | null = null;
    if (registered && row.descriptor) {
      for (const other of withFace) {
        if (other.faceId === row.faceId || !other.descriptor) continue;
        const dist = distanceBetweenDescriptors(row.descriptor, other.descriptor);
        if (dist == null) continue;
        if (nearestDist == null || dist < nearestDist) nearestDist = dist;
      }
    }
    const similarRisk: ExportRow["similarRisk"] =
      nearestDist != null && nearestDist <= FACE_SIMILAR_WARN
        ? nearestDist <= FACE_MATCH_MAX
          ? "high"
          : "medium"
        : "none";

    return {
      userId: row.userId,
      fullName: row.fullName,
      login: row.login,
      roleLabel: ROLE_LABEL_UZ[row.role] || row.role,
      departmentName: row.departmentName,
      photoUrl: row.photoUrl,
      faceRegistered: registered,
      createdAt: row.createdAt,
      similarRisk,
    };
  });

  const filtered = rows.filter((f) => {
    if (statusFilter === "yes" && !f.faceRegistered) return false;
    if (statusFilter === "no" && f.faceRegistered) return false;
    if (onlyRisk && f.similarRisk === "none") return false;
    if (!needle) return true;
    return (
      f.fullName.toLowerCase().includes(needle) ||
      f.login.toLowerCase().includes(needle) ||
      (f.departmentName || "").toLowerCase().includes(needle) ||
      f.roleLabel.toLowerCase().includes(needle)
    );
  });

  const registeredCount = filtered.filter((f) => f.faceRegistered).length;
  const notRegistered = filtered.length - registeredCount;
  const withPhoto = filtered.filter((f) => Boolean(f.photoUrl)).length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VAKSINA MED HR";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Face ID", {
    views: [{ state: "frozen", ySplit: 3, xSplit: 0 }],
    properties: { defaultRowHeight: 22 },
  });

  sheet.mergeCells("A1:G1");
  const title = sheet.getCell("A1");
  title.value = "VAKSINA MED — Face ID ro‘yxati";
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A5C" } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 34;

  sheet.mergeCells("A2:G2");
  const stats = sheet.getCell("A2");
  stats.value = `Jami: ${filtered.length}   ·   O‘tgan: ${registeredCount}   ·   O‘tmagan: ${notRegistered}   ·   Suratli: ${withPhoto}   ·   ${new Date().toLocaleString("uz-UZ")}`;
  stats.font = { name: "Calibri", size: 10, color: { argb: "FF334155" } };
  stats.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
  stats.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2).height = 22;

  const headers = ["№", "Yuz", "Xodim", "Login", "Rol / Bo‘lim", "Status", "Ro‘yxat"];
  const headerRow = sheet.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A5F8A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0B3A5C" } },
      left: { style: "thin", color: { argb: "FF0B3A5C" } },
      bottom: { style: "thin", color: { argb: "FF0B3A5C" } },
      right: { style: "thin", color: { argb: "FF0B3A5C" } },
    };
  });
  headerRow.height = 26;

  sheet.columns = [
    { key: "n", width: 5 },
    { key: "photo", width: 12 },
    { key: "name", width: 28 },
    { key: "login", width: 24 },
    { key: "role", width: 26 },
    { key: "status", width: 12 },
    { key: "reg", width: 18 },
  ];

  const thinBorder = {
    top: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
    left: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
    right: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
  };

  for (let i = 0; i < filtered.length; i++) {
    const f = filtered[i]!;
    const excelRow = 4 + i;
    const row = sheet.getRow(excelRow);
    row.height = 52;

    const zebra = i % 2 === 1;
    const baseFill = zebra ? "FFF8FAFC" : "FFFFFFFF";

    row.getCell(1).value = i + 1;
    row.getCell(2).value = "";
    row.getCell(3).value = f.fullName;
    row.getCell(4).value = f.login;
    row.getCell(5).value = `${f.roleLabel}${f.departmentName ? ` / ${f.departmentName}` : ""}`;
    row.getCell(6).value = f.faceRegistered ? "O‘tdi" : "O‘tmadi";
    row.getCell(7).value = f.faceRegistered ? fmtExcelDt(f.createdAt) : "—";

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF0F172A" } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 1 || c === 2 || c === 6 ? "center" : "left",
        wrapText: c === 3 || c === 5,
      };
      if (c !== 6) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: baseFill } };
      }
    }

    row.getCell(3).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF0F172A" } };

    if (f.faceRegistered) {
      row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
      row.getCell(6).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF065F46" } };
    } else {
      row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      row.getCell(6).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF92400E" } };
    }

    const parsed = parsePhotoDataUrl(f.photoUrl);
    if (parsed) {
      try {
        const imageId = workbook.addImage({
          base64: parsed.base64,
          extension: parsed.extension,
        });
        // B column = index 1; slight inset so photo sits in cell
        sheet.addImage(imageId, {
          tl: { col: 1.15, row: excelRow - 1 + 0.12 },
          ext: { width: 44, height: 44 },
          editAs: "oneCell",
        });
      } catch {
        row.getCell(2).value = "—";
      }
    } else {
      row.getCell(2).value = f.faceRegistered ? "—" : "";
      row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: "FF94A3B8" } };
    }
  }

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3 + Math.max(filtered.length, 1), column: 7 },
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="face-id_${stamp}.xlsx"`);
  res.send(buffer);
});

router.get("/admin/faces/:userId/photo", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const userId = parseInt(String(req.params.userId), 10);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Noto‘g‘ri user id" });
    return;
  }
  const [row] = await db
    .select({ photoUrl: faceProfilesTable.photoUrl })
    .from(faceProfilesTable)
    .where(eq(faceProfilesTable.userId, userId))
    .limit(1);
  sendFacePhoto(res, await loadFacePhotoBuffer(row?.photoUrl));
});

/** Admin: barcha Face ID larni tozalash */
router.delete("/admin/faces", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const deleted = await db.delete(faceProfilesTable).returning({ id: faceProfilesTable.id });
  invalidateFaceCache();
  logger.info({ event: "face_clear_all", adminId: req.userId, removed: deleted.length }, "all face ids cleared");
  res.json({
    ok: true,
    removed: deleted.length,
    message: deleted.length
      ? `${deleted.length} ta Face ID tozalandi — xodimlar qayta ro‘yxatdan o‘tishi kerak`
      : "Tozalash uchun Face ID yo‘q edi",
  });
});

/** Admin: xodim Face ID sini tozalash — qayta ro‘yxatdan o‘tishi uchun */
router.delete("/admin/faces/:userId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const userId = parseInt(String(req.params.userId), 10);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Noto‘g‘ri user id" });
    return;
  }
  const [user] = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  const deleted = await db
    .delete(faceProfilesTable)
    .where(eq(faceProfilesTable.userId, userId))
    .returning({ id: faceProfilesTable.id });
  invalidateFaceCache();
  res.json({
    ok: true,
    removed: deleted.length > 0,
    fullName: user.fullName,
    message: deleted.length
      ? `${user.fullName} Face ID o‘chirildi — qayta ro‘yxatdan o‘tishi mumkin`
      : `${user.fullName} da Face ID yo‘q edi`,
  });
});

export default router;
