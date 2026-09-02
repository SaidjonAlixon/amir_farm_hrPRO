# Face ID — AMIR FARM HR

3 qatlamli hybrid Face ID: brauzer (bepul) → server lokal match (bepul) → OpenAI Vision (ixtiyoriy, arzon).

## Oqimlar

| Oqim | Qayerda | Tavsif |
|------|---------|--------|
| **Enroll** | Profil / Davomat | Login kerak → challenge → 2–3 kadr → `POST /api/auth/face/enroll` |
| **Verify** | Davomat | Login kerak → `POST /api/davomat/face-verify` — faqat sessiya egasining yuzi |
| **Punch** | Davomat | Verify dan keyin → `POST /api/davomat/face-punch` (liveness qayta emas) |

Login Face ID **o‘chirilgan** — avval login/parol, keyin Davomatda yuz.

## Qatlamlar

### 1. Client (bepul)
- `face-api.js`: TinyFaceDetector + faceLandmark68Net + faceRecognitionNet
- 128-d L2-normalized embedding
- Fayllar: `artifacts/vaksina-hr/src/lib/face-id.ts`, `FaceScanDialog.tsx`, `FaceIdEnroll.tsx`

### 2. Server lokal (bepul)
- Euclidean + cosine, AES-256-GCM descriptor shifrlash
- Fayllar: `face-identity.ts`, `face-match.ts`

### 3. OpenAI (ixtiyoriy)
- Faqat: enroll sifat, duplicate, shubhali match, chegaradagi verify anti-spoof
- `FACE_AI_IMAGE_DETAIL=low` (~85 token/rasm)
- `FACE_AI_VERIFY=0` → butun AI o‘chadi

## Threshold (default)

| Parametr | Qiymat | Env |
|----------|--------|-----|
| Login match | dist ≤ 0.34, cosine ≥ 0.942 | `FACE_MATCH_THRESHOLD`, `FACE_MATCH_MIN_COSINE` |
| **Davomat owner** | dist ≤ **0.32**, cosine ≥ **0.945** — har ikkala kadr | `FACE_OWNER_MATCH_THRESHOLD`, `FACE_OWNER_MIN_COSINE` |
| Enroll duplicate (lokal) | dist ≤ 0.22 | `FACE_ENROLLMENT_THRESHOLD` |
| AI duplicate | dist ≤ 0.38 + AI "same" | — |
| Ambiguous margin | 0.08 | `FACE_AMBIGUOUS_MARGIN` |

## Davomat — faqat profil egasi

1. Login/parol bilan kirish majburiy
2. Yuz faqat **shu akkaunt** enroll qilingan shablonlar bilan solishtiriladi (global qidiruv yo‘q)
3. **2 ta markaz kadr** — ikkalasi ham thresholddan o‘tishi shart
4. AI yoqilgan bo‘lsa: profil rasmi bilan 1:1 tasdiq (skip yo‘q)
5. Mos kelmasa: `403 face_not_account_owner` — «siz emassiz»

## API

```
GET    /api/auth/face/status
GET    /api/auth/face/challenge?mode=enroll|login
POST   /api/auth/face/enroll
DELETE /api/auth/face
GET    /api/auth/face/photo
POST   /api/auth/face/login          → 403 (o‘chirilgan)
POST   /api/davomat/face-verify
POST   /api/davomat/face-punch
GET    /api/admin/faces
DELETE /api/admin/faces/:userId
```

## Env o‘zgaruvchilar

```env
# Majburiy (production)
FACE_DESCRIPTOR_KEY=...          # yoki SESSION_SECRET ishlatiladi
DATABASE_URL=...

# Lokal matching
FACE_MATCH_THRESHOLD=0.34
FACE_MATCH_MIN_COSINE=0.942
FACE_ENROLLMENT_THRESHOLD=0.22
FACE_AMBIGUOUS_MARGIN=0.08

# OpenAI (ixtiyoriy)
OPENAI_API_KEY=sk-...
OPENAI_FACE_MODEL=gpt-4o          # tavsiya — arzon vision (detail:low = 85 token/rasm)
# OPENAI_FACE_MODEL=gpt-4.1       # muqobil — xuddi shu vision narxi, ba’zan arzonroq text
# ❌ gpt-4o-mini / gpt-4.1-mini — vision uchun QIMMAT (2833+ token/rasm)
FACE_AI_VERIFY=1                  # 0 = faqat lokal
FACE_AI_IMAGE_DETAIL=low          # low | high | auto — low majburiy arzonlik uchun
FACE_AI_GALLERY_MAX=3
FACE_AI_PAIRWISE_MAX=3
FACE_AI_DUP_MAX=2
FACE_AI_SKIP_IF_CLEAR=false       # true = aniq lokal matchda AI o‘tkaziladi
FACE_AI_TIMEOUT_MS=20000
```

## Arzonlashtirish qoidalari

1. Har kadr uchun AI **chaqirilmaydi**
2. Enroll: 1 ta inspect + max `FACE_AI_DUP_MAX` ta duplicate compare
3. Davomat verify: owner 1:1 — lokal + AI tasdiq
4. Chegaradagi match (dist > 0.24): 1 ta anti-spoof
5. Punch: AI yo‘q

## OpenAI model tanlovi (Vercel)

| Model | Vision `detail:low` | Face ID uchun |
|-------|---------------------|---------------|
| **gpt-4o** ✅ | ~85 token/rasm | **Tavsiya** — arzon + ishonchli |
| **gpt-4.1** ✅ | ~85 token/rasm | Muqobil (accountda bo‘lsa) |
| gpt-4o-mini ❌ | ~2833 token/rasm | Vision uchun **qimmat** |
| gpt-4.1-mini ❌ | ~1500+ token/rasm | Face ID uchun mos emas |

```env
OPENAI_FACE_MODEL=gpt-4o
FACE_AI_IMAGE_DETAIL=low
```

Bitta davomat verify ≈ 1–2 ta AI chaqiruv (~$0.001 dan kam).

## DB

Jadval: `face_profiles`
- `user_id` (unique)
- `descriptor` (JSON yoki AES shifrlangan)
- `photo_url` (data URL)
- `last_used_at`

## Cursor prompt

Boshqa loyihaga ko‘chirish uchun chatga `@docs/FACE-ID-IMPLEMENTATION.md` va manba fayllarni ulang, keyin 14.2 to‘liq promptni ishlating.
