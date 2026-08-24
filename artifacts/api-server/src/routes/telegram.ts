import { Router, type IRouter } from "express";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  departmentsTable,
  telegramAuthTokensTable,
} from "@workspace/db";
import { setTelegramSessionCookie } from "../lib/session";
import {
  answerCallbackQuery,
  getMe,
  getWebhookInfo,
  isTelegramConfigured,
  newAuthToken,
  parseLoginPassword,
  publicAppUrl,
  ROLE_LABEL_UZ,
  sendMessage,
  setMyCommands,
  setWebhook,
  statusLabelUz,
  verifyTelegramInitData,
  verifyWebhookSecret,
  type TelegramUpdate,
} from "../lib/telegram";

const router: IRouter = Router();

function canSignIn(status?: string | null) {
  return status === "active" || status === "on_leave";
}

function statusBlockMessage(status?: string | null) {
  if (status === "on_leave") return "Foydalanuvchi tatilda (kirish mumkin, lekin cheklangan)";
  if (status === "terminated") return "Foydalanuvchi tugatilgan";
  if (status === "vacant" || status === "inactive" || status === "blocked") {
    return "Foydalanuvchi hozir bo‘sh / nofaol holatda";
  }
  return "Foydalanuvchi faol emas";
}

async function ensureTelegramSchema() {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id text
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_auth_tokens (
      id serial PRIMARY KEY,
      token text NOT NULL UNIQUE,
      user_id integer NOT NULL,
      telegram_user_id text NOT NULL,
      chat_id text NOT NULL,
      used boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS telegram_auth_tokens_user_idx ON telegram_auth_tokens (user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS telegram_auth_tokens_tg_idx ON telegram_auth_tokens (telegram_user_id)
  `);
}

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
      telegramId: usersTable.telegramId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

async function findUserByTelegramId(telegramUserId: string) {
  try {
    const [row] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramUserId))
      .limit(1);
    return row ? getUserWithDept(row.id) : null;
  } catch (err) {
    console.error("findUserByTelegramId:", err);
    return null;
  }
}

async function linkTelegram(userId: number, telegramUserId: string) {
  await db
    .update(usersTable)
    .set({ telegramId: null })
    .where(and(eq(usersTable.telegramId, telegramUserId), ne(usersTable.id, userId)));
  await db
    .update(usersTable)
    .set({ telegramId: telegramUserId })
    .where(eq(usersTable.id, userId));
}

async function unlinkTelegram(telegramUserId: string) {
  await db
    .update(usersTable)
    .set({ telegramId: null })
    .where(eq(usersTable.telegramId, telegramUserId));
}

async function createMiniToken(opts: {
  userId: number;
  telegramUserId: string;
  chatId: string;
}) {
  const token = newAuthToken();
  // Mini App qayta ochilishi uchun — 7 kun amal qiladi (bir marta ishlatilsa ham qayta ochish mumkin)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(telegramAuthTokensTable).values({
    token,
    userId: opts.userId,
    telegramUserId: opts.telegramUserId,
    chatId: opts.chatId,
    used: false,
    expiresAt,
  });
  return token;
}

function miniAppEntryUrl(opts?: { next?: string; token?: string }): string | null {
  const base = publicAppUrl();
  if (!base) return null;
  const u = new URL(`${base}/tg`);
  if (opts?.next) u.searchParams.set("next", opts.next);
  if (opts?.token) u.searchParams.set("token", opts.token);
  // Har safar yangi akkauntga o‘tish — eski sessiya cache bo‘lmasin
  u.searchParams.set("fresh", "1");
  return u.toString();
}

function formatUserCard(user: {
  fullName: string;
  login: string;
  role: string;
  status: string;
  phone: string | null;
  departmentName: string | null;
}): string {
  const role = ROLE_LABEL_UZ[user.role] || user.role;
  const lines = [
    `✅ <b>Kirish tasdiqlandi</b>`,
    ``,
    `👤 <b>${escapeHtml(user.fullName)}</b>`,
    `🔑 Login: <code>${escapeHtml(user.login)}</code>`,
    `🏷 Lavozim: <b>${escapeHtml(role)}</b>`,
    `📌 Holat: <b>${escapeHtml(statusLabelUz(user.status))}</b>`,
  ];
  if (user.departmentName) {
    lines.push(`🏢 Bo‘lim: ${escapeHtml(user.departmentName)}`);
  }
  if (user.phone) {
    lines.push(`📞 Telefon: ${escapeHtml(user.phone)}`);
  }
  lines.push(
    ``,
    `Pastdagi <b>Platformaga kirish</b> — istalgan vaqt oching (login/parol bir marta yetarli).`,
    `<b>Davomat</b> — Face ID + to‘liq holat.`,
    `Chiqish uchun <b>Chiqish</b> tugmasini bosing.`,
  );
  return lines.join("\n");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function welcomeText(name?: string): string {
  const greet = name ? `, ${escapeHtml(name)}` : "";
  return [
    `👋 <b>Xush kelibsiz${greet}!</b>`,
    ``,
    `VAKSINA MED HR Telegram botiga hush kelibsiz.`,
    `Davom etish uchun <b>login</b> va <b>parol</b>ni yuboring.`,
    ``,
    `<b>Namuna (1 qator):</b>`,
    `<code>farmasevt1 pass123</code>`,
    ``,
    `<b>Yoki 2 qator:</b>`,
    `<code>farmasevt1`,
    `pass123</code>`,
    ``,
    `<b>Yoki:</b>`,
    `<code>login: farmasevt1`,
    `parol: pass123</code>`,
    ``,
    `Faol akkaunt bo‘lsa — ma’lumotlaringiz chiqadi va <b>Kirish</b> orqali Mini App ochiladi.`,
  ].join("\n");
}

function helpText(): string {
  return [
    `<b>Buyruqlar</b>`,
    `/start — boshidan boshlash`,
    `/holat yoki /kirish — yangi «Platformaga kirish» havolasi`,
    `/davomat — Face ID davomat (Mini App)`,
    `/chiqish — Telegram bog‘lanishni uzish`,
    `/yordam — yordam`,
    ``,
    `Login/parolni yuqoridagi namuna tartibda yuboring.`,
  ].join("\n");
}

async function sendLoggedInCard(
  chatId: number | string,
  user: NonNullable<Awaited<ReturnType<typeof getUserWithDept>>>,
  telegramUserId: string,
) {
  const tokenOpts = {
    userId: user.id,
    telegramUserId,
    chatId: String(chatId),
  };
  const loginToken = await createMiniToken(tokenOpts);
  const davomatToken = await createMiniToken(tokenOpts);
  const loginUrl = miniAppEntryUrl({ token: loginToken });
  const davomatUrl = miniAppEntryUrl({ next: "davomat-face", token: davomatToken });

  const rows: Array<Array<{ text: string; web_app?: { url: string }; callback_data?: string }>> = [];
  if (loginUrl) {
    rows.push([{ text: "🚀 Platformaga kirish", web_app: { url: loginUrl } }]);
  }
  if (davomatUrl) {
    rows.push([{ text: "📋 Davomat — Face ID", web_app: { url: davomatUrl } }]);
  }
  rows.push([{ text: "🔄 Yangi kirish havolasi", callback_data: "refresh_entry" }]);
  rows.push([{ text: "🚪 Chiqish", callback_data: "logout" }]);

  const markup = { inline_keyboard: rows };

  let text = formatUserCard(user);
  if (!loginUrl && !davomatUrl) {
    text +=
      "\n\n⚠️ <b>PUBLIC_APP_URL</b> sozlanmagan — Mini App havolasi yaratilmadi. Admin Vercel env ga qo‘shishi kerak.";
  }
  await sendMessage(chatId, text, { reply_markup: markup });
}

async function sendDavomatMiniApp(
  chatId: number | string,
  user: NonNullable<Awaited<ReturnType<typeof getUserWithDept>>>,
  telegramUserId: string,
) {
  const token = await createMiniToken({
    userId: user.id,
    telegramUserId,
    chatId: String(chatId),
  });
  const davomatUrl = miniAppEntryUrl({ next: "davomat-face", token });
  if (!davomatUrl) {
    await sendMessage(chatId, "⚠️ PUBLIC_APP_URL sozlanmagan — Davomat Mini App ochilmaydi.");
    return;
  }
  await sendMessage(chatId, `📋 <b>Davomat — Face ID</b>\n\n${escapeHtml(user.fullName)}, tugmani bosing:`, {
    reply_markup: {
      inline_keyboard: [[{ text: "📋 Davomat — Face ID", web_app: { url: davomatUrl } }]],
    },
  });
}

async function handleStart(chatId: number, fromId: number, firstName?: string) {
  const linked = await findUserByTelegramId(String(fromId));
  if (linked && canSignIn(linked.status)) {
    await sendMessage(
      chatId,
      `👋 Yana xush kelibsiz!\nSiz allaqachon tizimga bog‘langansiz.`,
    );
    await sendLoggedInCard(chatId, linked, String(fromId));
    return;
  }
  await sendMessage(chatId, welcomeText(firstName));
}

async function handleCredentials(
  chatId: number,
  fromId: number,
  loginRaw: string,
  passwordRaw: string,
) {
  const compact = (v: string) => String(v ?? "").replace(/[\s\u00a0\u200b\uFEFF]+/g, "");
  const login = compact(loginRaw);
  const password = compact(passwordRaw);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.login}) = lower(${login})`)
    .limit(1);

  if (!user || compact(String(user.password ?? "")) !== password) {
    await sendMessage(
      chatId,
      `❌ Login yoki parol noto‘g‘ri.\n\nNamuna:\n<code>farmasevt1 pass123</code>`,
    );
    return;
  }

  if (!canSignIn(user.status)) {
    await sendMessage(
      chatId,
      `⛔ ${statusBlockMessage(user.status)}\nHolat: <b>${statusLabelUz(user.status)}</b>`,
    );
    return;
  }

  await linkTelegram(user.id, String(fromId));
  const full = await getUserWithDept(user.id);
  if (!full) {
    await sendMessage(chatId, "❌ Foydalanuvchi yuklanmadi");
    return;
  }
  await sendLoggedInCard(chatId, full, String(fromId));
}

async function handleUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id;
    const fromId = cq.from.id;
    const data = cq.data || "";
    try {
      await answerCallbackQuery(cq.id);
    } catch {
      /* ignore */
    }
    if (!chatId) return;

    if (data === "logout") {
      await unlinkTelegram(String(fromId));
      await sendMessage(chatId, "🚪 Chiqildi. Qayta kirish uchun login va parol yuboring.\n/start");
      return;
    }
    if (data === "refresh_entry") {
      const linked = await findUserByTelegramId(String(fromId));
      if (!linked || !canSignIn(linked.status)) {
        await sendMessage(chatId, "Avval login va parol yuboring.\n/start");
        return;
      }
      await sendMessage(chatId, "🔄 Yangi kirish havolasi tayyor:");
      await sendLoggedInCard(chatId, linked, String(fromId));
      return;
    }
    return;
  }

  const msg = update.message;
  if (!msg?.text || !msg.from || msg.from.is_bot) return;

  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const text = msg.text.trim();

  if (text === "/start" || text.startsWith("/start ")) {
    await handleStart(chatId, fromId, msg.from.first_name);
    return;
  }
  if (text === "/yordam" || text === "/help") {
    await sendMessage(chatId, helpText());
    return;
  }
  if (text === "/holat" || text === "/kirish") {
    const linked = await findUserByTelegramId(String(fromId));
    if (!linked) {
      await sendMessage(chatId, "Hali akkaunt bog‘lanmagan.\nLogin va parol yuboring yoki /start.");
      return;
    }
    await sendLoggedInCard(chatId, linked, String(fromId));
    return;
  }
  if (text === "/davomat") {
    const linked = await findUserByTelegramId(String(fromId));
    if (!linked || !canSignIn(linked.status)) {
      await sendMessage(chatId, "Avval login va parol yuboring.\n/start");
      return;
    }
    await sendDavomatMiniApp(chatId, linked, String(fromId));
    return;
  }
  if (text === "/chiqish" || text === "/logout") {
    await unlinkTelegram(String(fromId));
    await sendMessage(chatId, "🚪 Chiqildi. Qayta kirish: /start");
    return;
  }

  const creds = parseLoginPassword(text);
  if (creds) {
    await handleCredentials(chatId, fromId, creds.login, creds.password);
    return;
  }

  await sendMessage(
    chatId,
    `Tushunmadim.\n\nLogin va parolni shu tartibda yuboring:\n<code>login parol</code>\n\nYordam: /yordam`,
  );
}

/** Telegram webhook — avval ishlov berish, keyin 200 (Vercel serverless freeze muammosi) */
router.post("/telegram/webhook", async (req, res): Promise<void> => {
  if (!isTelegramConfigured()) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN sozlanmagan" });
    return;
  }
  if (!verifyWebhookSecret(req.header("x-telegram-bot-api-secret-token") || undefined)) {
    res.status(401).json({ error: "Webhook secret noto‘g‘ri" });
    return;
  }

  try {
    await ensureTelegramSchema();
    await handleUpdate(req.body as TelegramUpdate);
  } catch (err) {
    console.error("telegram webhook handler:", err);
  }

  res.status(200).json({ ok: true });
});

/** Mini App: Telegram initData yoki (eski) token → session cookie */
router.post("/telegram/mini-auth", async (req, res): Promise<void> => {
  const initData = String(req.body?.initData || "").trim();
  const token = String(req.body?.token || "").trim();

  try {
    await ensureTelegramSchema();

    if (initData) {
      const parsed = verifyTelegramInitData(initData);
      if (!parsed) {
        res.status(401).json({ error: "Telegram tasdiqlanmadi. Botdan qayta oching." });
        return;
      }

      const linked = await findUserByTelegramId(String(parsed.user.id));
      if (!linked) {
        res.status(403).json({
          error: "Avval botda login va parol yuboring, keyin «Platformaga kirish» ni bosing.",
        });
        return;
      }
      if (!canSignIn(linked.status)) {
        res.status(403).json({ error: statusBlockMessage(linked.status) });
        return;
      }

      setTelegramSessionCookie(res, linked.id);
      const { telegramId: _tg, ...safe } = linked as typeof linked & { telegramId?: string | null };
      res.json({ user: safe, ok: true });
      return;
    }

    if (!token) {
      res.status(400).json({ error: "Telegram initData kerak" });
      return;
    }

    // Muddat ichida — ishlatilgan token ham qayta ochishda ishlaydi (Mini App yopib qayta kirish)
    const [row] = await db
      .select()
      .from(telegramAuthTokensTable)
      .where(
        and(
          eq(telegramAuthTokensTable.token, token),
          gt(telegramAuthTokensTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(401).json({
        error: "Token muddati tugagan. Botdan «Platformaga kirish» yoki /start bosing.",
        code: "token_invalid",
      });
      return;
    }

    const user = await getUserWithDept(row.userId);
    if (!user || !canSignIn(user.status)) {
      res.status(403).json({ error: statusBlockMessage(user?.status) });
      return;
    }

    if (!row.used) {
      await db
        .update(telegramAuthTokensTable)
        .set({ used: true })
        .where(eq(telegramAuthTokensTable.id, row.id));
    }

    if (user.telegramId !== row.telegramUserId) {
      await linkTelegram(user.id, row.telegramUserId);
    }

    setTelegramSessionCookie(res, user.id);
    const { telegramId: _tg, ...safe } = user as typeof user & { telegramId?: string | null };
    res.json({ user: safe, ok: true });
  } catch (err) {
    console.error("telegram mini-auth:", err);
    res.status(503).json({ error: "Kirish muvaffaqiyatsiz — qayta urinib ko‘ring" });
  }
});

/** Holat: bot sozlanganmi */
router.get("/telegram/status", async (_req, res): Promise<void> => {
  const configured = isTelegramConfigured();
  const appUrl = publicAppUrl();
  let webhook: unknown = null;
  if (configured) {
    try {
      webhook = await getWebhookInfo();
    } catch (e) {
      webhook = { error: (e as Error).message };
    }
  }
  let bot: { username?: string; first_name?: string } | null = null;
  if (configured) {
    try {
      bot = await getMe();
    } catch {
      bot = null;
    }
  }
  res.json({
    configured,
    appUrl: appUrl || null,
    miniAppReady: !!(configured && appUrl),
    botUsername: bot?.username ? `@${bot.username}` : null,
    botName: bot?.first_name ?? null,
    webhook,
  });
});

/** Webhookni o‘rnatish — CRON_SECRET yoki TELEGRAM_SETUP_SECRET */
router.post("/telegram/setup", async (req, res): Promise<void> => {
  const secret =
    process.env.TELEGRAM_SETUP_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const auth = req.header("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const bodySecret = String(req.body?.secret || "");
  if (!secret || (bearer !== secret && bodySecret !== secret)) {
    res.status(401).json({ error: "Ruxsat yo‘q" });
    return;
  }
  if (!isTelegramConfigured()) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN sozlanmagan" });
    return;
  }

  const base = publicAppUrl();
  if (!base) {
    res.status(400).json({
      error: "PUBLIC_APP_URL (yoki VERCEL_URL) kerak — masalan https://hr-ai-gamma.vercel.app",
    });
    return;
  }

  try {
    await ensureTelegramSchema();
    const webhookUrl = `${base}/api/telegram/webhook`;
    const whSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    await setWebhook(webhookUrl, whSecret);
    await setMyCommands([
      { command: "start", description: "Boshlash / kirish" },
      { command: "holat", description: "Akkaunt va Mini App" },
      { command: "davomat", description: "Face ID davomat" },
      { command: "chiqish", description: "Bog‘lanishni uzish" },
      { command: "yordam", description: "Yordam" },
    ]);
    const info = await getWebhookInfo();
    res.json({ ok: true, webhookUrl, info });
  } catch (err) {
    console.error("telegram setup:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
