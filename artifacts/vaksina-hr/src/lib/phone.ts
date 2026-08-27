/** O‘zbekiston mobil: +998 XX XXX XX XX (998 + 9 raqam = 12 raqam) */

const UZ_PREFIX = '998';
const UZ_TOTAL_DIGITS = 12; // 998 + 9

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Inputdan faqat o‘zbek formatiga mos maska */
export function formatUzPhoneInput(raw: string): string {
  let digits = digitsOnly(raw);

  // Agar 998 bilan boshlanmasa — avtomatik qo‘shamiz
  if (!digits.startsWith(UZ_PREFIX)) {
    // Foydalanuvchi 8... yoki to‘g‘ridan 90... yozishi mumkin
    if (digits.startsWith('8') && digits.length >= 1) {
      digits = UZ_PREFIX + digits.slice(1);
    } else {
      digits = UZ_PREFIX + digits;
    }
  }

  digits = digits.slice(0, UZ_TOTAL_DIGITS);

  const a = digits.slice(0, 3); // 998
  const b = digits.slice(3, 5);
  const c = digits.slice(5, 8);
  const d = digits.slice(8, 10);
  const e = digits.slice(10, 12);

  let out = `+${a}`;
  if (b) out += ` ${b}`;
  if (c) out += ` ${c}`;
  if (d) out += ` ${d}`;
  if (e) out += ` ${e}`;
  return out;
}

export function isCompleteUzPhone(value: string): boolean {
  const d = digitsOnly(value);
  return d.length === UZ_TOTAL_DIGITS && d.startsWith(UZ_PREFIX);
}

/** Bo‘sh yoki to‘liq raqam — ixtiyoriy maydonlar uchun */
export function isOptionalUzPhoneValid(value: string): boolean {
  const d = digitsOnly(value);
  if (!d || d === UZ_PREFIX) return true;
  return isCompleteUzPhone(value);
}

/** Saqlash uchun: +998901234567 yoki bo‘sh */
export function normalizeUzPhone(value: string): string {
  const d = digitsOnly(value);
  if (!d || d === UZ_PREFIX) return '';
  return `+${d.slice(0, UZ_TOTAL_DIGITS)}`;
}

export const UZ_PHONE_PLACEHOLDER = '+998 90 123 45 67';
export const UZ_PHONE_HINT = 'Format: +998 XX XXX XX XX (9 raqam)';
