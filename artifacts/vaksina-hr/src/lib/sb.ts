export const SB_TASK_TEMPLATES: Array<{
  group: string;
  title: string;
  description: string;
}> = [
  {
    group: "Kunlik",
    title: "Navbatchilikni qabul qilish",
    description:
      "Navbatchilikni qabul qilish, smena holatini yozish. Eskalatsiya: SB operatori → SB boshlig‘i → Direktor.",
  },
  {
    group: "Kunlik",
    title: "Kamera holatini tekshirish",
    description: "Barcha ob’ekt kameralari live/arxiv holatini tekshirish, ishlamayotganlarini qayd etish (KPI: kamera ishlashi %).",
  },
  {
    group: "Kunlik",
    title: "Dorixona ochilishini nazorat qilish",
    description: "Filiallar o‘z vaqtida ochilganini kuzatish. Kechikkanlarni davomat/jurnalga kiritish.",
  },
  {
    group: "Kunlik",
    title: "Kechikkanlar ro‘yxati",
    description: "Bugungi kechikkan xodimlar ro‘yxatini tuzish va davomatni yangilash.",
  },
  {
    group: "Kunlik",
    title: "Davomatni yangilash",
    description: "Kirish-chiqish jurnalini tekshirish va kerak bo‘lsa tahrirlash.",
  },
  {
    group: "Hodisa",
    title: "Xavfsizlik hodisasi qaydi",
    description:
      "Hodisa vaqti, joyi, ishtirokchilar, chora. Yopilmaguncha SB boshlig‘iga eskalatsiya.",
  },
  {
    group: "Hodisa",
    title: "Favqulodda vaziyat protokoli",
    description:
      "7-bosqich checklist: xavfsizlik, ogohlantirish, tezkor xizmatlar, SB boshlig‘i, direktor, hujjat, yakun.",
  },
  {
    group: "Oylik",
    title: "Kamchiliklar tahlili",
    description: "Oy davomidagi kamchiliklar, bartaraf etilgan foiz (KPI).",
  },
  {
    group: "Oylik",
    title: "SB operatorlari baholovi",
    description: "Operatorlar ish sifati, navbatchilik va qamrov bahosi.",
  },
  {
    group: "Oylik",
    title: "Oylik hisobot",
    description: "Kamera, ochilish, hodisalar, davomat — rahbariyatga taqdim.",
  },
  {
    group: "Oylik",
    title: "Jarima va davomat ro‘yxatlari",
    description: "Jarima ro‘yxatini ko‘rish/shakllantirish va davomatni taqdim etish (operator — ko‘rish, boshliq — tahrirlash).",
  },
];

export const SB_KPI_HINTS = [
  "Kamera ishlashi (%)",
  "Dorixonalar o‘z vaqtida ochilishi (soni/holati)",
  "Qayd etilgan hodisalar soni",
  "Bartaraf etilgan kamchiliklar foizi",
];
