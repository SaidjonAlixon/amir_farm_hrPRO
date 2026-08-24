/** Apteka smenalari (Toshkent). Faqat mudir / farmasevt / stajyor. */

export const SHIFT_ONE = {
  key: "one" as const,
  label: "1-smena",
  start: "08:00",
  end: "17:00",
  warnHm: "07:45",
  warnText:
    "1-smenaga tezroq harakat qiling. 15 daqiqadan so‘ng ish vaqti boshlanadi (08:00). Ulgurmasangiz jarima qo‘llanadi.",
};

export const SHIFT_TWO = {
  key: "two" as const,
  label: "2-smena",
  start: "18:00",
  end: "23:45",
  warnHm: "17:45",
  warnText:
    "2-smenaga tezroq harakat qiling. 15 daqiqadan so‘ng ish vaqti boshlanadi (18:00). Ulgurmasangiz jarima qo‘llanadi.",
};

export const PHARMACY_SHIFT_USER_ROLES = new Set(["mudir", "farmasevt", "stajyor"]);
export const PHARMACY_SHIFT_ORG_ROLES = new Set(["manager", "pharmacist", "intern"]);

export function isPharmacyShiftStaff(userRole?: string | null, orgRole?: string | null): boolean {
  return PHARMACY_SHIFT_USER_ROLES.has(userRole || "") || PHARMACY_SHIFT_ORG_ROLES.has(orgRole || "");
}

export function normalizeShiftType(raw?: string | null): "one" | "two" {
  return raw === "two" ? "two" : "one";
}

export function shiftWindow(shiftType?: string | null): {
  key: "one" | "two";
  label: string;
  start: string;
  end: string;
  warnHm: string;
  warnText: string;
} {
  return normalizeShiftType(shiftType) === "two" ? SHIFT_TWO : SHIFT_ONE;
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Apteka smenasi yoki ofis 09:00–18:00 */
export function hoursForStaff(
  orgRole?: string | null,
  shiftType?: string | null,
): { start: string; end: string } {
  if (!PHARMACY_SHIFT_ORG_ROLES.has(orgRole || "")) {
    return { start: "09:00", end: "18:00" };
  }
  const w = shiftWindow(shiftType);
  return { start: w.start, end: w.end };
}
