export function parseMoney(raw: string): number {
  const s = String(raw ?? "")
    .replace(/[\s\u00a0]/g, "")
    .replace(",", ".");
  if (!s || s === "-" || s === ".") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** 100, 1 000, 1 000 000 */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const int = String(Math.round(Math.abs(n)));
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatSom(n: number) {
  return `${formatMoney(n)} so‘m`;
}

export function formatMoneyInput(raw: string): string {
  const neg = /^\s*-/.test(raw);
  const digits = String(raw).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return neg ? "-" : "";
  return (neg ? "-" : "") + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatPercentInput(raw: string): string {
  let s = String(raw).replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot >= 0) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  const [intRaw = "", frac = ""] = s.split(".");
  const int = intRaw.replace(/^0+(?=\d)/, "") || (s.includes(".") ? "0" : "");
  if (s.includes(".")) return `${int}.${frac.slice(0, 4)}`;
  return int;
}
