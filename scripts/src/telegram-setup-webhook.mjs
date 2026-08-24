/**
 * Telegram webhook o‘rnatish.
 *
 * Kerakli env:
 *   TELEGRAM_BOT_TOKEN
 *   PUBLIC_APP_URL=https://hr-ai-gamma.vercel.app
 *   CRON_SECRET yoki TELEGRAM_SETUP_SECRET (ixtiyoriy, lekin tavsiya)
 *   TELEGRAM_WEBHOOK_SECRET (ixtiyoriy)
 *
 * Ishlatish:
 *   node scripts/src/telegram-setup-webhook.mjs
 * yoki
 *   PUBLIC_APP_URL=... TELEGRAM_BOT_TOKEN=... node scripts/src/telegram-setup-webhook.mjs
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const appUrl = (
  process.env.PUBLIC_APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  ""
)
  .trim()
  .replace(/\/$/, "");
const withProto = appUrl
  ? appUrl.startsWith("http")
    ? appUrl
    : `https://${appUrl}`
  : "";
const setupSecret =
  process.env.TELEGRAM_SETUP_SECRET?.trim() || process.env.CRON_SECRET?.trim();
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

async function viaApi() {
  if (!withProto || !setupSecret) return null;
  const res = await fetch(`${withProto}/api/telegram/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${setupSecret}`,
    },
    body: JSON.stringify({ secret: setupSecret }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function viaTelegramDirect() {
  if (!token || !withProto) {
    throw new Error("TELEGRAM_BOT_TOKEN va PUBLIC_APP_URL kerak");
  }
  const webhookUrl = `${withProto}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret || undefined,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "setWebhook failed");

  await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Boshlash / kirish" },
        { command: "holat", description: "Akkaunt va Mini App" },
        { command: "davomat", description: "Face ID davomat" },
        { command: "chiqish", description: "Bog‘lanishni uzish" },
        { command: "yordam", description: "Yordam" },
      ],
    }),
  });

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoRes.json();
  return { ok: true, webhookUrl, info: info.result };
}

async function main() {
  console.log("PUBLIC_APP_URL:", withProto || "(yo‘q)");
  console.log("BOT token:", token ? "✓" : "✗");

  try {
    let result = null;
    if (setupSecret && withProto) {
      console.log("Setup via /api/telegram/setup …");
      result = await viaApi();
    } else {
      console.log("Setup via Telegram API to‘g‘ridan-to‘g‘ri …");
      result = await viaTelegramDirect();
    }
    console.log(JSON.stringify(result, null, 2));
    console.log("\nTayyor. BotFather → Bot → Menu Button → Web App URL:");
    console.log(`  ${withProto}/tg`);
    console.log("\nBotga /start yuboring.");
  } catch (e) {
    console.error("Xato:", e.message || e);
    process.exit(1);
  }
}

main();
