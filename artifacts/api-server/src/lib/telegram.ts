import crypto from "node:crypto";

const TG_API = "https://api.telegram.org";

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type InlineKeyboardButton =
  | { text: string; web_app: { url: string } }
  | { text: string; callback_data: string }
  | { text: string; url: string };

function botToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t || null;
}

export function isTelegramConfigured(): boolean {
  return !!botToken();
}

export function publicAppUrl(): string {
  const raw =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "";
  if (!raw) return "";
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: T };
  if (!data.ok) {
    throw new Error(data.description || `Telegram API xato: ${method}`);
  }
  return data.result as T;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts?: {
    parse_mode?: "HTML" | "Markdown";
    reply_markup?: { inline_keyboard: InlineKeyboardButton[][] };
    disable_web_page_preview?: boolean;
  },
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts?.parse_mode ?? "HTML",
    reply_markup: opts?.reply_markup,
    disable_web_page_preview: opts?.disable_web_page_preview ?? true,
  });
}

export async function answerCallbackQuery(id: string, text?: string) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: id,
    text: text || undefined,
  });
}

export async function getMe() {
  return tgCall<{ id: number; username?: string; first_name?: string }>("getMe", {});
}

export async function setWebhook(url: string, secret?: string) {
  return tgCall("setWebhook", {
    url,
    secret_token: secret || undefined,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export async function getWebhookInfo() {
  return tgCall<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_message?: string;
  }>("getWebhookInfo", {});
}

export async function setMyCommands(
  commands: Array<{ command: string; description: string }>,
) {
  return tgCall("setMyCommands", { commands });
}

export function newAuthToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function verifyWebhookSecret(header: string | undefined): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  return header === secret;
}

/** Telegram Mini App initData — WebApp ochilganda doimiy kirish */
export function verifyTelegramInitData(initData: string): {
  user: TelegramUser;
  authDate: number;
} | null {
  const token = botToken();
  if (!token || !initData?.trim()) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const entries: [string, string][] = [];
  params.forEach((value, key) => {
    if (key !== "hash") entries.push([key, value]);
  });
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (calculatedHash !== hash) return null;

  const authDate = Number(params.get("auth_date") || 0);
  const maxAgeSec = 7 * 24 * 60 * 60;
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    if (!user?.id) return null;
    return { user, authDate };
  } catch {
    return null;
  }
}

/** Login/parol matnini ajratib olish — bir necha namuna format */
export function parseLoginPassword(text: string): { login: string; password: string } | null {
  const compact = (v: string) => v.replace(/[\s\u00a0\u200b\uFEFF]+/g, "");
  const t = text.trim().replace(/\u00a0/g, " ");
  if (!t) return null;

  const labeled =
    /(?:^|\n)\s*(?:login|логин)\s*[:=]\s*(\S+)\s*(?:\n|\s)+(?:parol|password|пароль|pass)\s*[:=]\s*(\S+)/i.exec(
      t,
    );
  if (labeled?.[1] && labeled[2]) {
    const login = compact(labeled[1]);
    const password = compact(labeled[2]);
    if (login && password) return { login, password };
  }

  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 2) {
    const a = compact(lines[0]!.replace(/^(?:login|логин)\s*[:=]\s*/i, ""));
    const b = compact(lines[1]!.replace(/^(?:parol|password|пароль|pass)\s*[:=]\s*/i, ""));
    if (a && b) return { login: a, password: b };
  }

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts[0] && parts[1]) {
    const login = compact(parts[0]);
    const password = compact(parts[1]);
    if (login && password) return { login, password };
  }

  return null;
}

export const ROLE_LABEL_UZ: Record<string, string> = {
  admin: "Admin",
  hr: "HR",
  hr_direktor: "HR Direktor",
  hr_auditor: "HR Auditor",
  hr_menejer: "HR Menejer",
  recruiter: "Rekruter",
  trainer: "Trener",
  mentor: "Mentor",
  director: "Direktor",
  department_head: "Bo‘lim boshlig‘i",
  mudir: "Mudir",
  koordinator: "Koordinator",
  texnik: "Texnik",
  ombor: "Ombor",
  sb: "SB operatori",
  sb_boshliq: "SB bo‘limi boshlig‘i",
  farmasevt: "Farmasevt",
  stajyor: "Stajyor",
};

export function statusLabelUz(status?: string | null): string {
  switch (status) {
    case "active":
      return "Faol";
    case "on_leave":
      return "Tatilda";
    case "vacant":
      return "Bo‘sh";
    case "terminated":
      return "Tugatilgan";
    case "inactive":
      return "Nofaol";
    case "blocked":
      return "Bloklangan";
    default:
      return status || "Noma’lum";
  }
}
