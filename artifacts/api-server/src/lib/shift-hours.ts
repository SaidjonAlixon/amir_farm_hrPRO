/** Ish smenalari (Toshkent). */

export type ShiftTypeKey =
  | "one"
  | "two"
  | "three"
  | "remote"
  | "flexible"
  | "alternate"
  | "alternate_night"
  | "custom";

export type ShiftWindow = {
  key: ShiftTypeKey;
  label: string;
  /** Qisqa lavozim / ish turi izohi */
  hint: string;
  start: string;
  end: string;
  /** Overnight: tugash ertalab */
  overnight?: boolean;
  /** GPS/filial majburiy emas (masofa / erkin) */
  skipGeofence?: boolean;
  warnHm: string;
  warnText: string;
};

export const SHIFT_ONE: ShiftWindow = {
  key: "one",
  label: "1-smena",
  hint: "Kunduzgi smena",
  start: "08:00",
  end: "17:00",
  warnHm: "07:45",
  warnText:
    "1-smenaga tezroq harakat qiling. 15 daqiqadan so‘ng ish vaqti boshlanadi (08:00). Ulgurmasangiz jarima qo‘llanadi.",
};

export const SHIFT_TWO: ShiftWindow = {
  key: "two",
  label: "2-smena",
  hint: "Kechki smena",
  start: "18:00",
  end: "23:45",
  warnHm: "17:45",
  warnText:
    "2-smenaga tezroq harakat qiling. 15 daqiqadan so‘ng ish vaqti boshlanadi (18:00). Ulgurmasangiz jarima qo‘llanadi.",
};

export const SHIFT_THREE: ShiftWindow = {
  key: "three",
  label: "3-smena",
  hint: "Qo‘shimcha / maxsus vaqtli smena",
  start: "14:00",
  end: "22:00",
  warnHm: "13:45",
  warnText:
    "3-smenaga tezroq harakat qiling. 15 daqiqadan so‘ng ish vaqti boshlanadi. Ulgurmasangiz jarima qo‘llanadi.",
};

export const SHIFT_REMOTE: ShiftWindow = {
  key: "remote",
  label: "Masofadan",
  hint: "Masofadan ishlaydiganlar (buxgalter va boshqalar)",
  start: "09:00",
  end: "18:00",
  skipGeofence: true,
  warnHm: "08:45",
  warnText: "Masofadan ish: GPS majburiy emas. Face ID bilan kelish/ketishni belgilang.",
};

export const SHIFT_FLEXIBLE: ShiftWindow = {
  key: "flexible",
  label: "Erkin grafik",
  hint: "Erkin ish grafigi (dastavchik va boshqalar)",
  start: "09:00",
  end: "21:00",
  skipGeofence: true,
  warnHm: "08:45",
  warnText: "Erkin grafik: ish vaqti moslashuvchan. Face ID bilan belgilang.",
};

export const SHIFT_ALTERNATE: ShiftWindow = {
  key: "alternate",
  label: "Kun ora",
  hint: "Kun ora ishlaydigan xodimlar",
  start: "08:00",
  end: "17:00",
  warnHm: "07:45",
  warnText: "Kun ora smena: ish kuni 08:00–17:00. Kechiksa — jarima.",
};

export const SHIFT_ALTERNATE_NIGHT: ShiftWindow = {
  key: "alternate_night",
  label: "Kun ora (kechki)",
  hint: "Kun ora · kechki 17:00 dan ertalab 08:00 gacha",
  start: "17:00",
  end: "08:00",
  overnight: true,
  warnHm: "16:45",
  warnText: "Kun ora kechki smena: 17:00–08:00. Kechiksa — jarima.",
};

export const ALL_SHIFTS: ShiftWindow[] = [
  SHIFT_ONE,
  SHIFT_TWO,
  SHIFT_THREE,
  SHIFT_REMOTE,
  SHIFT_FLEXIBLE,
  SHIFT_ALTERNATE,
  SHIFT_ALTERNATE_NIGHT,
];

export const SHIFT_KEYS = ALL_SHIFTS.map((s) => s.key) as ShiftTypeKey[];

export const PHARMACY_SHIFT_USER_ROLES = new Set(["mudir", "farmasevt", "stajyor"]);
export const PHARMACY_SHIFT_ORG_ROLES = new Set(["manager", "pharmacist", "intern"]);

export function isPharmacyShiftStaff(userRole?: string | null, orgRole?: string | null): boolean {
  return PHARMACY_SHIFT_USER_ROLES.has(userRole || "") || PHARMACY_SHIFT_ORG_ROLES.has(orgRole || "");
}

export function isValidShiftType(raw?: string | null): raw is ShiftTypeKey {
  if (raw === "custom") return true;
  return ALL_SHIFTS.some((s) => s.key === raw);
}

export function normalizeShiftType(raw?: string | null): ShiftTypeKey {
  if (raw === "two") return "two";
  if (raw === "three") return "three";
  if (raw === "remote") return "remote";
  if (raw === "flexible") return "flexible";
  if (raw === "alternate") return "alternate";
  if (raw === "alternate_night") return "alternate_night";
  if (raw === "custom") return "custom";
  return "one";
}

export function shiftWindow(shiftType?: string | null): ShiftWindow {
  const key = normalizeShiftType(shiftType);
  if (key === "custom") {
    return {
      key: "custom",
      label: "Maxsus",
      hint: "Maxsus smena",
      start: "09:00",
      end: "18:00",
      warnHm: "08:45",
      warnText: "Maxsus smena — admin belgilagan vaqt.",
    };
  }
  try {
    const { getCachedShiftWindow } = require("./shift-catalog") as typeof import("./shift-catalog");
    return getCachedShiftWindow(key);
  } catch {
    if (key === "two") return SHIFT_TWO;
    if (key === "three") return SHIFT_THREE;
    if (key === "remote") return SHIFT_REMOTE;
    if (key === "flexible") return SHIFT_FLEXIBLE;
    if (key === "alternate") return SHIFT_ALTERNATE;
    if (key === "alternate_night") return SHIFT_ALTERNATE_NIGHT;
    return SHIFT_ONE;
  }
}

export function shiftHoursLabel(shiftType?: string | null, shiftLabel?: string | null): string {
  if (shiftType === "custom" && shiftLabel?.trim()) return shiftLabel.trim();
  const w = shiftWindow(shiftType);
  if (w.overnight) return `${w.label}: ${w.start}–${w.end} (ertalab)`;
  if (w.skipGeofence) return `${w.label}: ${w.start}–${w.end} · GPS majburiy emas`;
  return `${w.label}: ${w.start}–${w.end}`;
}

export function shiftSkipsGeofence(shiftType?: string | null): boolean {
  return Boolean(shiftWindow(shiftType).skipGeofence);
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Apteka smenasi yoki ofis / maxsus smena soatlari */
export function hoursForStaff(
  orgRole?: string | null,
  shiftType?: string | null,
): { start: string; end: string } {
  const key = normalizeShiftType(shiftType);
  if (
    key === "remote" ||
    key === "flexible" ||
    key === "alternate" ||
    key === "alternate_night" ||
    PHARMACY_SHIFT_ORG_ROLES.has(orgRole || "")
  ) {
    const w = shiftWindow(shiftType);
    return { start: w.start, end: w.end };
  }
  if (key === "two") return { start: SHIFT_TWO.start, end: SHIFT_TWO.end };
  if (key === "three") return { start: SHIFT_THREE.start, end: SHIFT_THREE.end };
  if (key === "one" && PHARMACY_SHIFT_ORG_ROLES.has(orgRole || "")) {
    return { start: SHIFT_ONE.start, end: SHIFT_ONE.end };
  }
  // Ofis / boshqa: agar smena belgilangan bo‘lsa — shu; aks holda 09–18
  if (key !== "one" && key !== "custom") {
    const w = shiftWindow(shiftType);
    return { start: w.start, end: w.end };
  }
  return { start: "09:00", end: "18:00" };
}
