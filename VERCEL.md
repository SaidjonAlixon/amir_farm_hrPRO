# Vercel deployment — HR PROFI / VAKSINA HR

## 1. Database
Use hosted Postgres (Neon, Supabase, or Vercel Postgres).

```bash
# Locally / in CI after setting DATABASE_URL
pnpm run db:push
# Then seed if needed: node scripts/src/seed.mjs
```

## 2. Vercel project
1. Import this Git repo in [Vercel](https://vercel.com/new).
2. Framework Preset: **Other** (vercel.json sets it).
3. Root Directory: leave empty (monorepo root).
4. Env vars (Production + Preview):

| Name | Required | Notes |
|------|----------|--------|
| `DATABASE_URL` | yes | `?sslmode=require` for Neon/Supabase |
| `SESSION_SECRET` | recommended | random string |
| `CRON_SECRET` | recommended | Vercel Cron Bearer token |
| `TELEGRAM_BOT_TOKEN` | for bot | BotFather token — see `TELEGRAM.md` |
| `PUBLIC_APP_URL` | for bot | e.g. `https://hr-ai-gamma.vercel.app` |
| `TELEGRAM_WEBHOOK_SECRET` | recommended | Webhook header secret |
| `TELEGRAM_SETUP_SECRET` | optional | Setup endpoint (or use CRON_SECRET) |

5. Deploy.

## 3. Local check of Vercel build
```bash
pnpm install
pnpm run build:vercel
```

Frontend / API: Vercel Build Output API → `.vercel/output/` (static + `/api` function)

## Vercel dashboard (required)
| Setting | Value |
|---------|--------|
| Root Directory | **empty** (not `./`, not `artifacts/api-server`) |
| Build Command | `pnpm -w run build:vercel` |
| Install Command | `pnpm -w install --no-frozen-lockfile --prod=false` |
| Output Directory | `artifacts/vaksina-hr/dist/public` (Override ON) |

Save, then **Clear cache and Redeploy**.


## 4. How it works
- Static SPA from Vite
- `/api/*` → Express on a Vercel Function (Build Output `api.func` + `api/index.mjs` fallback)
- Cron every 10 minutes → `/api/jobs/vacancy-reminders`  
  (Vercel Hobby: max 1 cron/day — change `crons.schedule` in `vercel.json` if needed)
