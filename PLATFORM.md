# VAKSINA MED HR — platforma nima qila oladi

Bu hujjat **HR PROFI / VAKSINA MED HR** tizimining imkoniyatlari, bo‘limlari va **barcha rollar**ni tushuntiradi.

Kirish: login + parol yoki **Face ID** (kamera, HTTPS/localhost). Telegram Mini App orqali ham ochiladi.

Lokal: frontend `http://localhost:3000`, API `http://localhost:8080`.  
Ishlab chiqarish: Vercel + Postgres (Neon).

---

## 1. Platforma nima uchun

Dorixona tarmog‘i uchun yagona HR tizimi:

- xodim va foydalanuvchi boshqaruvi
- ishga qabul (ariza → vakansiya → nomzod → suhbat → staj)
- apteka tarmog‘i, ehtiyoj, cheklist audit
- Face ID bilan davomat (GPS hudud)
- oylik KPI va filial **hisob-kitob** (savdo, fiksa, bonus, jarima)
- chat, topshiriq, eslatma, tashkiliy tuzilma

---

## 2. Bo‘limlar (imkoniyatlar)

### Kirish va profil

- Login / parol, Face ID bilan kirish
- Profil: ism, familiya, parol
- Face ID ulash / qayta ulash / o‘chirish — yuz rasmi saqlanadi, akkauntda (avatar) ko‘rinadi

### Boshqaruv paneli

- Rolga qarab kartochkalar: ariza, vakansiya, nomzod, topshiriq, chat, holat, moliya
- Tezkor o‘tish havolalari

### Topshiriqlar (`/vazifalar`)

- Berilgan / olingan ishlar, muddat, holat (bajarildi, tasdiqlandi)
- Oylik KPI da **topshiriq** ulushi shu yerdan olinadi

### Eslatmalar (`/eslatmalar`)

- Shaxsiy eslatma, muddat, Telegram eslatmalari (sozlangan bo‘lsa)

### Chat (`/chat`)

- Xodimlar o‘rtasida suhbat, fayl, o‘qilmagan soni

### Tashkiliy tuzilma (`/tashkiliy-tuzilma`)

- Bo‘limlar, lavozimlar, kim kimga bo‘ysunadi

### Arizalar (`/requests`)

- Bo‘lim/filialdan kadr ehtiyoji, tasdiqlash, rekruterga biriktirish

### Ish o‘rinlari (`/vacancies`)

- E’lon, kanal, muddat, nashr, muddatni cho‘zish (HR/direktor)

### Nomzodlar (`/candidates`)

- Anketa, rasm, telefon/online/offline suhbat, preboarding, hujjat, offer, staj

### Suhbatlar (`/interviews`)

- Rejalashtirilgan suhbatlar ro‘yxati

### Pipeline (`/pipeline`)

- Nomzod bosqichlari kanban taxtasi

### Stajirovkalar (`/internships`)

- Stajor, trener, baholash, yakun

### Xodimlar (`/employees`)

- Kartochka: lavozim, filial, fiks maosh, KPI bonus foizi, holat (ishlayapti / ketgan…)

### Aptekalar tarmog‘i (`/pharmacy-network`)

- Filial, mudir, farmasevt, smena, GPS, holat o‘zgarishi, kadr ogohlantirishi

### Ehtiyoj (`/ehtiyoj`)

- Filialdan tovar/kadr so‘rovi

### Cheklist (`/checklist`) — asosan koordinator

- Filialga tashrif, GPS (50 m), savollar, ball
- Oylik KPI da **checklist** shu tashriflardan

### Cheklist holati / reyting (`/checklist-holati`, `/reyting`)

- Tashriflar, qamrov, koordinator reytingi, filial balli
- Excel eksport (HR/direktor)

### Davomat Face (`/davomat-face`)

- GPS “yashil hudud”
- Yuz tanish → kelish / ketish
- 18:00 dan keyin chiqish qoidalari (sozlangan mantiq)

### Davomat hisobot (`/davomat`)

- Kunlik jurnal, kechikish, filtr, Excel
- Oylik KPI da **davomat** shu yerdan

### Masofaviy davomat (`/davomat-uzoq`)

- Ofisdan tashqari belgilash (ruxsat berilgan rollar)

### Oylik / KPI (`/oylik`)

- **Jami = fiks maosh + bonus** (oklad deyilmaydi)
- KPI: davomat 40% + topshiriq 30% + checklist 30% (yo‘q komponent chiqariladi, qolgani oshadi)
- Xodimlar jadvali, qayta hisoblash, Excel
- Og‘irliklarni HR direktor / direktor / moliyachi / admin o‘zgartiradi

### Hisob-kitob (`/hisobkitob`)

Filial savdo oyligi (Excel ANTEY uslubi):

| Maydon | Mantiq |
|--------|--------|
| Savdo | Xodimning shaxsiy savdosi |
| Protsent | Masalan 0.6% = 0.006 |
| **Oylik %** | **Savdo × protsent** (faqat o‘z savdosi, filial jami emas) |
| Fiksa | Qat’iy maosh |
| Reja bonusi | Reja bajarilgani uchun qo‘shimcha |
| Avans / pereuchyot / vaqt jarimasi / muddat ushlovi | Ayiriladi |
| **Jami** | Oylik % + fiksa + reja bonusi − ayirmalar |
| Karta | Odatda jami bilan teng (farq 0) |
| Gross | Karta / 0.88 (≈12% soliq) |

Filial qatori: joriy reja, oldingi oy reja, jami savdo, iyuldan farq, bajarilish %.  
Tasdiqlash, Excel, yangi filial varaqasi.

### Kirish (stajyor o‘quv) (`/kirish`)

- Video / PDF, savollar, bosqichlar
- Materiallarni admin yuklaydi (`/admin/kirish-videolar`)

### Holat (`/admin/holat`)

- Tarmoq: koordinator, mudir, farmasevt, stajyor, jamoasi bor/yo‘q filiallar

---

## 3. Rollar

Har kimda odatda: **Boshqaruv**, **Davomat (Face)**, **Chat** (stajyorda cheklangan), **Oylik** (o‘z KPI — menyuga qo‘shiladi).

### Admin

Faqat **admin panel**: foydalanuvchilar, bo‘limlar, Face ID ro‘yxati, kirish materiallari, holat va tizimdagi barcha qolgan bo‘limlarga to‘liq kirish.

---

### Direktor

Ko‘radi / qiladi:

- Ariza, vakansiya, nomzod, suhbat, pipeline, staj
- Xodimlar, tarmoq, ehtiyoj, holat
- Davomat hisobot, masofaviy, Face
- Cheklist holati (eksport)
- **Hisob-kitob** (tahrir, tasdiq)
- Oylik KPI (boshqarish, tasdiq)
- Topshiriq, eslatma, chat, tuzilma

---

### Moliyachi (`moliya`)

Bo‘lim: **Moliya**. Demo login (agar yaratilgan bo‘lsa): `moliyachi1`.

- Oylik KPI: xodimlar, qayta hisoblash, Excel, fiks/bonus, og‘irlik, tasdiq
- **Hisob-kitob**: filial savdo oyligi
- Xodimlar, tuzilma, davomat, Face, cheklist holati
- Topshiriq, eslatma, chat  
Rekruting (vakansiya/nomzod) yo‘q.

---

### HR menejer / HR (`hr`, `hr_menejer`)

To‘liq rekruting + kadrlar:

- Ariza, vakansiya, nomzod, suhbat, pipeline, staj
- Xodimlar, davomat hisobot, tarmoq, ehtiyoj, holat
- Cheklist holati + Excel
- Topshiriq, eslatma, chat, tuzilma

### HR direktor (`hr_direktor`)

HR menejer + KPI og‘irlik / fiks-bonus (oylik), nazorat kengroq.

### HR auditor (`hr_auditor`)

Qisqaroq: boshqaruv, topshiriq, chat, tuzilma, Face, vakansiya, nomzod, suhbat, pipeline. To‘liq tarmoq/davomat paneli yo‘q.

---

### Rekruter

Ariza, vakansiya, nomzod, suhbat, pipeline, tarmoq, ehtiyoj, topshiriq, chat, Face. Stajirovka bo‘limi yo‘q (trenerda bor).

### Trener

Vakansiya, nomzod, suhbat, pipeline, **stajirovkalar**, topshiriq, Face.

### Mentor

Ariza, xodimlar, eslatma, chat, Face.

### Bo‘lim boshlig‘i (`department_head`)

O‘z bo‘limi arizalari, xodimlar, tarmoq, topshiriq, Face.

---

### Koordinator

- Tarmoq, ehtiyoj, xodimlar, ariza
- **Cheklist** (GPS tashrif)
- Reyting / cheklist holati
- Face davomat, tuzilma, chat

### Mudir

O‘z filiali: tarmoq, ehtiyoj, xodimlar, ariza, Face, tuzilma. Cheklist yozish yo‘q (koordinator yozadi).

### Farmasevt

Ehtiyoj, topshiriq, eslatma, chat, **reyting** (o‘z filiali), Face davomat.

### Stajyor

**Kirish** o‘quvi, reyting, Face davomat. Rekruting yo‘q.

---

### SB operatori / SB bo‘lim boshlig‘i

Xavfsizlik: davomat hisobot, masofaviy, Face, xodimlar, tarmoq, ariza, tuzilma, chat.

### Texnik / Ombor

Topshiriq, ehtiyoj, ariza, xodimlar, Face, chat. To‘liq tarmoq paneli yo‘q.

---

## 4. Oylik KPI qisqa formula

```
KPI% = (davomat% × og‘irlik) + (topshiriq% × og‘irlik) + (checklist% × og‘irlik)
       (yo‘q bo‘lgan qism tashlanadi)

Maks bonus = fiks × bonus_foizi
Bonus     = maks bonus × KPI%
Jami      = fiks + bonus
```

Davomat: o‘z vaqtida 1 ball, 5–30 daqiqa 0.7, 30+ 0.3, sababsiz 0; ta’til hisobga olinmaydi.

---

## 5. Hisob-kitob qisqa formula

```
Oylik_foiz = savdo × protsent          // faqat shu xodim savdosi
Jami       = Oylik_foiz + fiksa + reja_bonusi
             − avans − pereuchyot − vaqt_jarima − muddat
Karta      ≈ Jami
Gross      = Karta / 0.88
```

---

## 6. Face ID

- Ro‘yxat: bir necha aniq kadr → vektor + **rasm saqlanadi**
- Boshqa xodim yuziga o‘xshasa — rad etiladi
- Login va davomatda taniladi
- Rasm: akkaunt avatari; admin Face ID bo‘limida ham

---

## 7. Texnik eslatma

Baza sekin / uxlab qolsa (Neon) butun sayt “qotadi”. Batafsil: `PLATFORM-QOTISH.md`.
