# Telegram bot + Mini App

VAKSINA MED HR Telegram boti: login/parol qabul qiladi, faol akkaunt ma’lumotini chiqaradi va **Kirish** tugmasi orqali to‘liq Mini App (dastur) ochadi.

## Foydalanuvchi oqimi

1. Botda `/start`
2. Bot: *Xush kelibsiz — login va parol yuboring*
3. Yuborish namuna:
   - `farmasevt1 pass123`
   - yoki 2 qator: login / parol
   - yoki `login: farmasevt1` + `parol: pass123`
4. Baza tekshiradi — faol bo‘lsa ism, lavozim, holat chiqadi
5. **Platformaga kirish** tugmasi → dastur to‘liq ekranda ochiladi (sessiya avtomatik)

Buyruqlar: `/holat`, `/chiqish`, `/yordam`

## Vercel Environment Variables

| Key | Majburiy | Izoh |
|-----|----------|------|
| `TELEGRAM_BOT_TOKEN` | ha | BotFather dan `@BotFather` → /newbot |
| `PUBLIC_APP_URL` | ha | Masalan `https://hr-ai-gamma.vercel.app` |
| `TELEGRAM_WEBHOOK_SECRET` | tavsiya | Tasodifiy string (webhook himoya) |
| `TELEGRAM_SETUP_SECRET` yoki `CRON_SECRET` | tavsiya | Setup endpoint uchun |

`DATABASE_URL` allaqachon bo‘lishi kerak. Birinchi webhook chaqiruvida `telegram_id` ustuni va `telegram_auth_tokens` jadvali avtomatik yaratiladi (yoki `pnpm db:push`).

## Bot yaratish (BotFather)

1. Telegramda [@BotFather](https://t.me/BotFather) → `/newbot`
2. Tokenni nusxa oling → Vercel `TELEGRAM_BOT_TOKEN`
3. `/setdomain` — Mini App domeni (masalan `hr-ai-gamma.vercel.app`)
4. Bot Settings → Menu Button → Configure → Web App URL: `https://SIZNING-DOMEN/tg`

## Webhook o‘rnatish

Deploydan keyin:

```bash
# .env yoki muhitda:
# TELEGRAM_BOT_TOKEN=...
# PUBLIC_APP_URL=https://hr-ai-gamma.vercel.app
# CRON_SECRET=...

node scripts/src/telegram-setup-webhook.mjs
```

Yoki:

```bash
curl -X POST "https://SIZNING-DOMEN/api/telegram/setup" \
  -H "Authorization: Bearer CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"CRON_SECRET\"}"
```

Tekshirish: `GET /api/telegram/status`

## API

| Method | Path | Vazifa |
|--------|------|--------|
| POST | `/api/telegram/webhook` | Bot yangilanishlari |
| POST | `/api/telegram/mini-auth` | `{ token }` → session cookie |
| GET | `/api/telegram/status` | Sozlama holati |
| POST | `/api/telegram/setup` | Webhook o‘rnatish |

## Xavfsizlik

- Parol Telegram chatda yuboriladi — faqat ishonchli xodimlar, shaxsiy chat
- Mini App tokeni 15 daqiqa, bir marta ishlatiladi
- Webhook `TELEGRAM_WEBHOOK_SECRET` bilan himoyalanishi mumkin
