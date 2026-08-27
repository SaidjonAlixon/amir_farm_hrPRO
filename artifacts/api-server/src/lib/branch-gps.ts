import { eq } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import { isHrRole } from "./roles";
import { displayBranchName, parseGpsText, withGpsSuffix } from "./geo-location";

export type BranchGpsOk = {
  ok: true;
  id: number;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type BranchGpsErr = { ok: false; status: number; error: string };

export async function saveManagerBranchLocation(opts: {
  actorRole: string;
  actorUserId: number;
  employeeId: number;
  coordinates: string;
  /** Filialning ko‘rinadigan nomi (masalan: Novza, Olmos 2) */
  branchName?: string | null;
}): Promise<BranchGpsOk | BranchGpsErr> {
  const canSet =
    opts.actorRole === "koordinator" ||
    opts.actorRole === "admin" ||
    opts.actorRole === "director" ||
    isHrRole(opts.actorRole);
  if (!canSet) {
    return { ok: false, status: 403, error: "Filial lokatsiyasini koordinator kiritadi" };
  }

  const [manager] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, opts.employeeId));
  if (!manager) {
    return { ok: false, status: 404, error: "Mudir topilmadi" };
  }
  if (manager.orgRole && manager.orgRole !== "manager") {
    return { ok: false, status: 400, error: "Bu xodim mudir emas" };
  }

  if (opts.actorRole === "koordinator") {
    const coordRows = await db
      .select({ id: employeesTable.id, orgRole: employeesTable.orgRole })
      .from(employeesTable)
      .where(eq(employeesTable.userId, opts.actorUserId));
    const owns = coordRows.some((r) => r.id === manager.reportsToId);
    if (!owns) {
      return { ok: false, status: 403, error: "Faqat o‘z mudirlaringizga lokatsiya kiritasiz" };
    }
  }

  const nameRaw = String(opts.branchName ?? "").trim();
  const existingName = displayBranchName(manager.location);
  const branchLabel =
    nameRaw ||
    (existingName && existingName !== "Filial" ? existingName : "") ||
    "Filial";

  let lat = manager.latitude;
  let lng = manager.longitude;
  const coordText = String(opts.coordinates || "").trim();
  if (coordText) {
    const parsed = parseGpsText(coordText);
    if (!parsed) {
      return {
        ok: false,
        status: 400,
        error: "Ikkala tomonni ham yozing: 41°18'23.3\"N 69°18'28.0\"E",
      };
    }
    lat = parsed.lat;
    lng = parsed.lng;
  } else if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      status: 400,
      error: "Avval koordinatani kiriting: 41°18'23.3\"N 69°18'28.0\"E",
    };
  }

  const encoded = withGpsSuffix(branchLabel, lat!, lng!);

  const [updated] = await db
    .update(employeesTable)
    .set({
      location: encoded,
      latitude: lat,
      longitude: lng,
    })
    .where(eq(employeesTable.id, manager.id))
    .returning();

  await db
    .update(employeesTable)
    .set({
      location: encoded,
      latitude: lat,
      longitude: lng,
    })
    .where(eq(employeesTable.reportsToId, manager.id));

  return {
    ok: true,
    id: updated.id,
    location: updated.location,
    latitude: updated.latitude,
    longitude: updated.longitude,
  };
}
