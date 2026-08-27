export function canViewHisobkitob(role?: string | null) {
  return role === "admin" || role === "director" || role === "moliya";
}

export function canEditHisobkitob(role?: string | null) {
  return role === "admin" || role === "director" || role === "moliya";
}

export function canAdminHisobkitob(role?: string | null) {
  return role === "admin";
}

export function roundMoney(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pos(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/** 0.006 → 0.6% (eski yozuv); 1 → 1% (yangi yozuv). */
export function asSalesRate(percent: number) {
  const p = pos(percent);
  if (p === 0) return 0;
  if (p > 1) return p / 100;
  return p;
}

export type SettlementInputs = {
  sales: number;
  percent: number;
  fiksa: number;
  planBonus: number;
  extraBonus?: number;
  avans: number;
  inventoryFine: number;
  timeFine: number;
  expiryHold: number;
  cardAmount: number | null;
  planCurrent?: number;
  planPrev?: number;
};

export type SettlementComputed = {
  oylikPct: number;
  overPlan: number;
  planPct: number;
  vsPrevPct: number;
  earnedPlanBonus: number;
  extraBonus: number;
  grossPay: number;
  finesTotal: number;
  net: number;
  card: number;
  diff: number;
  gross: number;
};

export function computeLine(
  input: SettlementInputs,
  taxNetRate = 0.88,
  sheetPlanCurrent = 0,
  sheetPlanPrev = 0,
): SettlementComputed {
  const sales = pos(input.sales);
  const linePlan = pos(input.planCurrent);
  const linePrev = pos(input.planPrev);
  const plan = linePlan > 0 ? linePlan : sales > 0 ? pos(sheetPlanCurrent) : 0;
  const prevPlan = linePrev > 0 ? linePrev : pos(sheetPlanPrev);
  const overPlan = roundMoney(Math.max(0, sales - plan));
  const planPct = plan > 0 ? roundMoney((sales * 100) / plan) : 0;
  const vsPrevPct = prevPlan > 0 ? roundMoney((sales * 100) / prevPlan) : 0;
  const oylikPct = roundMoney(sales * asSalesRate(input.percent));
  const listedBonus = pos(input.planBonus);
  const earnedPlanBonus = plan > 0 ? (sales + 1e-9 >= plan ? listedBonus : 0) : listedBonus;
  const extraBonus = pos(input.extraBonus);
  const fiksa = pos(input.fiksa);
  const grossPay = roundMoney(fiksa + oylikPct + earnedPlanBonus + extraBonus);
  const avans = pos(input.avans);
  const inventoryFine = pos(input.inventoryFine);
  const timeFine = pos(input.timeFine);
  const expiryHold = pos(input.expiryHold);
  const finesTotal = roundMoney(inventoryFine + timeFine + expiryHold);
  const net = roundMoney(Math.max(0, grossPay - avans - finesTotal));
  const card = input.cardAmount == null ? net : roundMoney(Math.max(0, Number(input.cardAmount) || 0));
  const rate = taxNetRate > 0 ? taxNetRate : 0.88;
  return {
    oylikPct,
    overPlan,
    planPct,
    vsPrevPct,
    earnedPlanBonus,
    extraBonus,
    grossPay,
    finesTotal,
    net,
    card,
    diff: roundMoney(net - card),
    gross: roundMoney(card / rate),
  };
}

export function computeSheetTotals(
  lines: Array<SettlementInputs & SettlementComputed>,
  planCurrent: number,
  planPrev: number,
) {
  const salesTotal = roundMoney(lines.reduce((s, r) => s + pos(r.sales), 0));
  const overPrev = roundMoney(Math.max(0, salesTotal - pos(planPrev)));
  const vsPrevPct = planPrev > 0 ? roundMoney((salesTotal * 100) / planPrev) : 0;
  const vsCurrentPct = planCurrent > 0 ? roundMoney((salesTotal * 100) / planCurrent) : 0;
  return {
    salesTotal,
    overPlanTotal: roundMoney(lines.reduce((s, r) => s + r.overPlan, 0)),
    overPrev,
    vsPrevPct,
    vsCurrentPct,
    netTotal: roundMoney(lines.reduce((s, r) => s + r.net, 0)),
    cardTotal: roundMoney(lines.reduce((s, r) => s + r.card, 0)),
    grossTotal: roundMoney(lines.reduce((s, r) => s + r.gross, 0)),
    oylikPctTotal: roundMoney(lines.reduce((s, r) => s + r.oylikPct, 0)),
    fiksaTotal: roundMoney(lines.reduce((s, r) => s + pos(r.fiksa), 0)),
    bonusTotal: roundMoney(lines.reduce((s, r) => s + r.earnedPlanBonus + r.extraBonus, 0)),
    finesTotal: roundMoney(lines.reduce((s, r) => s + r.finesTotal, 0)),
    avansTotal: roundMoney(lines.reduce((s, r) => s + pos(r.avans), 0)),
    grossPayTotal: roundMoney(lines.reduce((s, r) => s + r.grossPay, 0)),
    diffTotal: roundMoney(lines.reduce((s, r) => s + r.diff, 0)),
  };
}
