# Platforma qotmasligi — to‘liq qo‘llanma

Bu fayl **nima uchun** tizim sekinlashadi yoki “qotadi”, **hozir kodda nima qilingan**, va **siz baza / Vercel / kompyuterda nima qilishingiz kerak**ligini tushuntiradi.

Maqsad: login, sahifa ochilishi, Telegram Mini App va oddiy ish (davomat, chat) **doimiy 503 / “Yuklanmoqda…” / tushunarsiz kutish** bo‘lmasin.

---

## 1. Tizim qanday ishlaydi (qisqa, lekin to‘g‘ri)

HR PROFI ikki qism:

| Qism | Qayerda | Nima qiladi |
|------|---------|-------------|
| **Frontend** | Brauzer (Vercel static: `artifacts/vaksina-hr`) | Sahifa, tugmalar, so‘rovlar |
| **API** | Vercel Function: `api/index.mjs` → Express | Login, baza, Face ID, Telegram |
| **Baza** | Hosted Postgres (`DATABASE_URL`) — odatda **Neon** yoki Railway | Barcha foydalanuvchi, davomat, chat |

**Muhim:** Vercel’dagi API **doimiy server emas**. Har `/api/...` so‘rovi alohida “sovuq” yoki qisqa umrli funksiya. U Postgres’ga **ulanish ochadi**. Agar baza sekin yoki ulanish limiti tugasa, **butun platforma qotadi** — frontend aybdor emas.

Lokalda:

- Frontend: `http://localhost:3000` (Vite)
- API: `http://localhost:8080`
- Vite `/api` ni 8080 ga proxy qiladi

Production:

- Sayt: masalan `https://hr-ai-gamma.vercel.app`
- `/api/*` shu domen ichida, lekin **Vercel Function + tashqi Postgres**

---

## 2. “Qotish” aslida nima (3 xil holat)

### A) Sahifa ochilmaydi / “Yuklanmoqda…” uzoq turadi

Brauzer `/api/auth/me` yoki login kutadi. Baza javob bermasa yoki timeout bo‘lsa — ekran qotgandek ko‘rinadi.

Kodda endi `/auth/me` **8 soniyadan** keyin kutishni to‘xtatadi (`AuthContext`). Lekin **baza o‘zi sekin** bo‘lsa, har tugma yana kutadi.

### B) Login “noto‘g‘ri” yoki 503

- Haqiqiy parol xato (boshqa masala).
- Yoki `DATABASE_URL` yo‘q / Neon **suspend** / DNS timeout → kod 503: *“Baza bilan aloqa yo‘q”*.
- Frontend ba’zan 503 ni ham “login xato” deb ko‘rsatardi — tuzatilgan.

### C) Kirgandan keyin sekin / 503 / chat “tirik emas”

Sabab: **juda ko‘p so‘rov** bir vaqtda Postgres pool’ni to‘ldiradi.

Vercel’da har function **maksimum 2 ta** DB ulanish (`lib/db/src/index.ts`). 20 ta ochiq tab + har 20 soniyada sync + menyu poll = baza **navbat**da. Natija: timeout, 503, “qotish”.

---

## 3. Asosiy aybdor: Postgres (Neon / Railway), Vercel emas

### Neon (eng ko‘p uchraydi)

**Free / Scale-to-zero compute:**

1. 5 daqiqa ishlatilmasa compute **uxlaydi**.
2. Keyingi so‘rov **5–30 soniya** “uyg‘onadi” — login/qotish shu.
3. Bir vaqtda **kam ulanish** (masalan 60–100). Vercel 50 ta concurrent so‘rov bersa, yangilari **kutadi yoki uziladi**.

**Siz qilishingiz kerak (Neon dashboard):**

1. [https://console.neon.tech](https://console.neon.tech) → loyiha → **Compute**.
2. **Autosuspend** ni o‘chiring yoki **minimum 7 kun** qiling (ish vaqtida uxlamasin).
3. Compute hajmini **kamida 0.25–0.5 vCPU** qiling. `0 CU` / “scale to zero only” ishlab chiqarish uchun yaramaydi.
4. **Connection pooling:** connection string’da host `...-pooler.` bo‘lishi kerak (Neon **pooled** URL).
   - To‘g‘ri: `ep-xxxx.region.aws.neon.tech` o‘rniga **pooler**: `ep-xxxx-pooler.region.aws.neon.tech`
   - Query: `?sslmode=require`
5. Shu `DATABASE_URL` ni **Vercel → Project → Settings → Environment Variables** ga qo‘ying:
   - Environment: **Production**, **Preview**, **Development** — **hammasi**.
   - Save → **Redeploy** (eski deploy eski URL bilan ishlaydi).

### Railway Postgres

Agar `.env` da `metro.proxy.rlwy.net` bo‘lsa:

- DNS ba’zan yechilmaydi (kodda Google DNS fallback bor).
- Railway **sleep** / kredit tugashi = butun tizim o‘lik.
- Ishlab chiqarish uchun **Neon pooled** yoki doimiy Postgres afzal.

### Vercel Environment

| O‘zgaruvchi | Qayerga | Nima uchun |
|-------------|---------|------------|
| `DATABASE_URL` | Vercel Env (Production+Preview) | API bazaga ulanadi. **Bo‘lmasa login 503.** |
| `SESSION_SECRET` | Vercel Env | Cookie (ixtiyoriy, lekin tavsiya) |
| `PUBLIC_APP_URL` | Vercel Env | Telegram Mini App |
| `TELEGRAM_BOT_TOKEN` | Vercel Env | Bot |

**Qayerga qo‘yiladi:** Vercel sayt → loyiha (`hr-ai` / `hr-ai-gamma`) → **Settings** → **Environment Variables** → `DATABASE_URL` → **Save** → **Deployments** → oxirgi → **Redeploy**.

Lokal: loyiha ildizidagi `.env` (git’ga **kiritilmaydi**).

---

## 4. Kodda allaqachon qilingan (qayta “tezlashtirish” shart emas)

Bu qismlar **push qilingan**. Vercel deploy yangilangan bo‘lsa, ishlaydi.

| Joy | Nima |
|-----|------|
| `Layout.tsx` | Menyu har 30s emas: bildirishnoma ~90s, statistika/ariza ~120s |
| `realtime-sync.tsx` | Chat ochiq: 4.5s; boshqa sahifa: 20s; yengil `light=1` (faqat unread) |
| `App.tsx` QueryClient | `staleTime` 45s, **refetchOnWindowFocus: false** (har tabga qaytishda to‘liq qayta yuklash yo‘q) |
| `AuthContext` | `/auth/me` 8s timeout — cheksiz “Yuklanmoqda” yo‘q |
| `lib/db` pool | Vercel: max **2** ulanish, so‘rov timeout 12s |
| `app.ts` | Vercel’da og‘ir `ensurePersistentSchema` **loginni bloklamaydi** |
| `face-match.ts` | Face vektorlari 60s cache |
| Login | Bo‘sh joy/tab avtomatik olib tashlanadi |

Agar production **hali sekin** — sabab deyarli **Neon uxlaydi / pooler yo‘q / deploy eski**.

---

## 5. Siz qiladigan ishlar (tartib bilan)

### 5.1. Baza — birinchi navbat (eng muhim)

1. Neon’da **Compute doim yoqilgan** (autosuspend OFF yoki uzoq).
2. **Pooled** `DATABASE_URL` ni Vercel’ga qo‘ying.
3. Neon **Monitoring**:
   - `connection count` limitga yaqinmi?
   - `compute` 100%mi?
   - `slow queries` bormi?

Agar compute doim 100% — reja oshiring **yoki** so‘rovlarni kamaytiring (kodda asosan qilingan).

### 5.2. Vercel Function

1. **Hobby** reja: function **sovuq start** 1–3s; cron cheklangan.
2. `vercel.json`: `maxDuration: 60` — uzoq Face/Excel uchun. Login 2–5s bo‘lishi kerak.
3. **Concurrent** ko‘p bo‘lsa — Pro reja yoki **kamroq ochiq tab**.

**Qayer:** Vercel → Project → Settings → Functions (reja). Kod: `vercel.json` → `functions["api/index.mjs"].maxDuration`.

### 5.3. Brauzer / xodimlar

- Bir odam **10 ta** ochiq tab = 10 × poll. Tabni yoping.
- Telegram Mini App + brauzer birga — ikki sessiya, ikki poll.
- Wi‑Fi zaif = timeout; bu “kod qotishi” emas.

### 5.4. Indexlar (baza ichida, bir marta)

Kodda ba’zi indexlar bor (`chat_messages`, `attendance`). **Bildirishnoma** jadvalida `user_id + is_read` indexi **yo‘q** — har 20s `COUNT(*)` sekinlashishi mumkin.

Neon **SQL Editor** da (yoki `psql`) **bir marta**:

```sql
-- Bildirishnoma (realtime/sync, dashboard)
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, is_read)
  WHERE is_read = false;

-- Login
CREATE INDEX IF NOT EXISTS users_login_lower_idx
  ON users (lower(login));

-- Face ID
CREATE INDEX IF NOT EXISTS face_profiles_user_idx
  ON face_profiles (user_id);

-- Telegram
CREATE INDEX IF NOT EXISTS users_telegram_id_idx
  ON users (telegram_id)
  WHERE telegram_id IS NOT NULL;
```

**Qayer:** Neon → SQL Editor → Run. Schema o‘zgarmasa xato bermaydi (`IF NOT EXISTS`).

### 5.5. Lokal ishlash (qotmasin)

1. `.env` da **ishlaydigan** `DATABASE_URL` (Neon pooled, `sslmode=require`).
2. API **8080**, frontend **3000**. API o‘lik bo‘lsa Vite kutadi — “sayt qotgan”.
3. Bir vaqtda **ikki** `pnpm dev` API ishga tushirmang (port band).

Tekshiruv:

```text
Brauzer → F12 → Network → /api/auth/login yoki /api/auth/me
Status 200 + 200–800ms  → yaxshi
Status 503 yoki 10s+    → baza yoki pool
```

---

## 6. Qaysi so‘rovlar og‘ir (bilib turing)

| So‘rov | Kim chaqiradi | Og‘irligi |
|--------|----------------|-----------|
| `GET /api/realtime/sync` | Har login qilgan, 20s / chatda 4.5s | Chat **tashqarisida** yengil (faqat unread). Chatda og‘irroq |
| `GET /api/dashboard/stats` | Layout, ~2 daqiqa | Ko‘p `COUNT(*)` — HR/admin |
| `GET /api/notifications?unreadOnly` | Layout ~90s | Index bo‘lmasa sekin |
| `GET /api/requests` | HR layout ~2 daqiqa | Katta ro‘yxat |
| `POST /api/auth/face/login` | Face ID | Barcha yuz vektorlari (cache 60s) |
| `GET /api/admin/faces` | Admin Face sahifa | Juda og‘ir — faqat kerak bo‘lganda oching |
| Cron `/api/jobs/vacancy-reminders` | Har 10 daqiqa | Vercel + baza; Hobby’da cheklov |

**Qoidasi:** og‘ir sahifani (holat, pharmacy-network, faces) ochiq qoldirmang.

---

## 7. Telegram Mini App “qotishi”

Bu **baza emas**, sessiya:

- Eski token bir marta ishlatilgach xato chiqardi — **tuzatilgan** (muddat ichida qayta ochish + initData).
- Mini App yopilsa cookie ba’zan saqlanmaydi — botdan **yangi** «Platformaga kirish» yoki `/kirish`.

Vercel `PUBLIC_APP_URL` to‘g‘ri HTTPS domen bo‘lishi shart.

---

## 8. Face ID sekinligi

Har taqqoslashda avval butun `face_profiles` o‘qilardi. Endi **60 soniya xotirada**.

Baribir:

- Yuzlar soni 500+ bo‘lsa, serverless har safar sekinroq.
- Admin «o‘xshash yuzlar» sahifasi **barcha juftlik** — ish vaqtida ochmang.

---

## 9. Kelajakda qotish qaytmasin (qoida)

1. **Yangi sahifaga `refetchInterval: 5_000` qo‘ymang.** Minimum 45–120s yoki umuman yo‘q.
2. **Layout**ga yangi global `useGetX` qo‘shmang (har sahifada ishlaydi).
3. SSE `/realtime/stream` Vercel’da **yomon** (ulanish ochiq qoladi). Poll qolsin.
4. `SELECT * FROM users` kabi to‘liq jadvallar Face/admin’dan tashqari yo‘q.
5. Excel export / katta rasm — alohida tugma, avtomatik emas.

---

## 10. Tezkor diagnostika (5 daqiqa)

1. Vercel → **Logs** (Runtime): `ETIMEDOUT`, `503`, `too many clients`.
2. Neon → **Monitoring**: suspend? CPU? connections?
3. Brauzer Network: qaysi URL 5s+?
4. `DATABASE_URL` da `-pooler.` bormi?
5. Oxirgi Git push Vercel’da **Ready**mi? Eski deploy = eski sekin kod.

---

## 11. “Qayerga nima qo‘yaman” — bitta jadval

| Nima | Qayer |
|------|--------|
| Postgres URL (pooled) | Neon dashboard → Connection string → Vercel Env `DATABASE_URL` |
| Compute uxlamasin | Neon → Compute → Autosuspend **off** |
| Index SQL | Neon → SQL Editor (5.4) |
| Frontend/API kod | Git `main` → Vercel avtomatik deploy |
| Lokal URL | `.env` loyiha ildizida |
| Telegram URL | Vercel `PUBLIC_APP_URL` = production HTTPS |
| Cron | `vercel.json` → `crons` (Hobby’da kamaytiring) |

---

## 12. Xulosa

**Kod** pollni kamaytirgan, poolni cheklagan, login timeout qo‘ygan.

**Qotishning 80% sababi:** Neon compute uxlaydi, pooling yo‘q, yoki Vercel’da `DATABASE_URL` noto‘g‘ri/eski.

**Sizning asosiy ish:** Neon compute + pooled URL + Vercel Env + Redeploy + (ixtiyoriy) 5.4 indexlar.

Shundan keyin ham sekin bo‘lsa: Neon Monitoring skrin + Vercel logdagi sekin URL — shu bilan aniq qatlam (baza vs function vs sahifa) topiladi.
