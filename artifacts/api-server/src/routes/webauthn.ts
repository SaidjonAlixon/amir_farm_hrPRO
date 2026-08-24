import { Router, type IRouter } from "express";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  db,
  usersTable,
  departmentsTable,
  webauthnCredentialsTable,
  webauthnChallengesTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { rpFromRequest, webauthnUnsupportedHostMessage } from "../lib/webauthn-rp";
import { setSessionCookie } from "../lib/session";

const router: IRouter = Router();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

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

async function saveChallenge(kind: "register" | "login", challenge: string, userId?: number) {
  await db.insert(webauthnChallengesTable).values({
    userId: userId ?? null,
    challenge,
    kind,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
}

async function takeChallenge(challenge: string, kind: "register" | "login") {
  const now = new Date();
  const [row] = await db
    .select()
    .from(webauthnChallengesTable)
    .where(
      and(
        eq(webauthnChallengesTable.challenge, challenge),
        eq(webauthnChallengesTable.kind, kind),
        gt(webauthnChallengesTable.expiresAt, now),
      ),
    )
    .limit(1);
  if (row) {
    await db.delete(webauthnChallengesTable).where(eq(webauthnChallengesTable.id, row.id));
  }
  // eski challenge'larni tozalash
  void db
    .delete(webauthnChallengesTable)
    .where(lt(webauthnChallengesTable.expiresAt, now))
    .catch(() => undefined);
  return row ?? null;
}

function userIdBytes(id: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, id, false);
  return bytes;
}

function asInternalCreds(
  rows: { credentialId: string; transports: string | null }[],
): { id: string; transports: AuthenticatorTransportFuture[] }[] {
  return rows.map((c) => ({
    id: c.credentialId,
    transports: ["internal"],
  }));
}

async function listAllowCredentials(userId?: number) {
  const q = db
    .select({
      credentialId: webauthnCredentialsTable.credentialId,
      transports: webauthnCredentialsTable.transports,
    })
    .from(webauthnCredentialsTable)
    .orderBy(desc(webauthnCredentialsTable.lastUsedAt), desc(webauthnCredentialsTable.id))
    .limit(64);
  const rows = userId
    ? await db
        .select({
          credentialId: webauthnCredentialsTable.credentialId,
          transports: webauthnCredentialsTable.transports,
        })
        .from(webauthnCredentialsTable)
        .where(eq(webauthnCredentialsTable.userId, userId))
        .orderBy(desc(webauthnCredentialsTable.lastUsedAt), desc(webauthnCredentialsTable.id))
        .limit(64)
    : await q;
  return asInternalCreds(rows);
}

router.get("/auth/webauthn/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const creds = await db
    .select({
      id: webauthnCredentialsTable.id,
      createdAt: webauthnCredentialsTable.createdAt,
      lastUsedAt: webauthnCredentialsTable.lastUsedAt,
      deviceType: webauthnCredentialsTable.deviceType,
    })
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.userId, userId));
  res.json({ registered: creds.length > 0, count: creds.length, credentials: creds });
});

router.post("/auth/webauthn/register/options", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName, login: usersTable.login })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }

  const existing = await db
    .select({ credentialId: webauthnCredentialsTable.credentialId, transports: webauthnCredentialsTable.transports })
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.userId, userId));

  const { rpID, rpName } = rpFromRequest(req);
  const hostErr = webauthnUnsupportedHostMessage(rpID);
  if (hostErr) {
    res.status(400).json({ error: hostErr });
    return;
  }
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.login,
    userDisplayName: user.fullName,
    userID: userIdBytes(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: ["internal"] as AuthenticatorTransportFuture[],
    })),
    preferredAuthenticatorType: "localDevice",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "discouraged",
      requireResidentKey: false,
      userVerification: "required",
    },
  });

  await saveChallenge("register", options.challenge, userId);
  res.json(options);
});

router.post("/auth/webauthn/register/verify", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const body = req.body as RegistrationResponseJSON;
  if (!body?.id || !body?.response) {
    res.status(400).json({ error: "Noto‘g‘ri Face ID javobi" });
    return;
  }

  let expectedChallenge = "";
  try {
    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: string };
    expectedChallenge = String(clientData.challenge || "");
  } catch {
    res.status(400).json({ error: "Noto‘g‘ri Face ID javobi" });
    return;
  }
  const stored = await takeChallenge(expectedChallenge, "register");
  if (!stored || stored.userId !== userId) {
    res.status(400).json({ error: "Face ID sessiyasi tugagan — qayta urinib ko‘ring" });
    return;
  }

  const { rpID, origin } = rpFromRequest(req);
  const hostErr = webauthnUnsupportedHostMessage(rpID);
  if (hostErr) {
    res.status(400).json({ error: hostErr });
    return;
  }
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    console.error("webauthn register verify:", err);
    res.status(400).json({ error: "Face ID tasdiqlanmadi" });
    return;
  }

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: "Face ID tasdiqlanmadi" });
    return;
  }

  const info = verification.registrationInfo;
  const credential = info.credential;
  const credentialId = credential.id;
  const publicKey = Buffer.from(credential.publicKey).toString("base64url");
  const transports = credential.transports ? JSON.stringify(credential.transports) : null;

  await db.insert(webauthnCredentialsTable).values({
    userId,
    credentialId,
    publicKey,
    counter: credential.counter ?? 0,
    deviceType: info.credentialDeviceType ?? null,
    backedUp: Boolean(info.credentialBackedUp),
    transports,
  });

  res.json({ ok: true, registered: true });
});

router.post("/auth/webauthn/login/options", async (req, res): Promise<void> => {
  const { rpID } = rpFromRequest(req);
  const hostErr = webauthnUnsupportedHostMessage(rpID);
  if (hostErr) {
    res.status(400).json({ error: hostErr });
    return;
  }
  const login = typeof req.body?.login === "string" ? req.body.login.trim() : "";
  let userId: number | undefined;
  if (login) {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.login, login))
      .limit(1);
    userId = user?.id;
  }
  const allowCredentials = await listAllowCredentials(userId);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
  });
  await saveChallenge("login", options.challenge);
  res.json(options);
});

router.post("/auth/webauthn/login/verify", async (req, res): Promise<void> => {
  const body = req.body as AuthenticationResponseJSON;
  if (!body?.id || !body?.response) {
    res.status(400).json({ error: "Noto‘g‘ri Face ID javobi" });
    return;
  }

  let expectedChallenge = "";
  try {
    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: string };
    expectedChallenge = String(clientData.challenge || "");
  } catch {
    res.status(400).json({ error: "Noto‘g‘ri Face ID javobi" });
    return;
  }

  const stored = await takeChallenge(expectedChallenge, "login");
  if (!stored) {
    res.status(400).json({ error: "Face ID sessiyasi tugagan — qayta urinib ko‘ring" });
    return;
  }

  const [cred] = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.credentialId, body.id))
    .limit(1);
  if (!cred) {
    res.status(401).json({ error: "Bu qurilmada Face ID ro‘yxatdan o‘tmagan" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, cred.userId));
  if (!user || user.status !== "active") {
    res.status(403).json({ error: "Foydalanuvchi faol emas" });
    return;
  }

  const { rpID, origin } = rpFromRequest(req);
  const hostErr = webauthnUnsupportedHostMessage(rpID);
  if (hostErr) {
    res.status(400).json({ error: hostErr });
    return;
  }
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: Uint8Array.from(Buffer.from(cred.publicKey, "base64url")),
        counter: cred.counter ?? 0,
        transports: cred.transports
          ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    console.error("webauthn login verify:", err);
    res.status(401).json({ error: "Face ID mos kelmadi" });
    return;
  }

  if (!verification.verified) {
    res.status(401).json({ error: "Face ID mos kelmadi" });
    return;
  }

  await db
    .update(webauthnCredentialsTable)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(webauthnCredentialsTable.id, cred.id));

  setSessionCookie(res, user.id);
  const fullUser = await getUserWithDept(user.id);
  res.json({ user: fullUser });
});

router.delete("/auth/webauthn", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  await db.delete(webauthnCredentialsTable).where(eq(webauthnCredentialsTable.userId, userId));
  res.json({ ok: true });
});

export default router;
