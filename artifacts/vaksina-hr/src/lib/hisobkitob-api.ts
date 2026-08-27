import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatMoney } from "./money-format";

export function canViewHisobkitob(role?: string | null) {
  return role === "admin" || role === "director" || role === "moliya";
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let message = "Xatolik";
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* */
    }
    throw new Error(message);
  }
  return res.json();
}

export type SheetListItem = {
  id: number;
  branchName: string;
  month: string;
  planCurrent: number;
  planPrev: number;
  taxNetRate: number;
  status: string;
};

export type SettlementLine = {
  id: number;
  sheetId: number;
  employeeId: number | null;
  fullName: string;
  phone: string | null;
  sales: number;
  percent: number;
  fiksa: number;
  planBonus: number;
  avans: number;
  inventoryFine: number;
  timeFine: number;
  expiryHold: number;
  cardAmount: number | null;
  oylikPct: number;
  net: number;
  card: number;
  diff: number;
  gross: number;
  extraBonus?: number;
  position?: string | null;
  planCurrent?: number;
  planPrev?: number;
  overPlan?: number;
  planPct?: number;
  earnedPlanBonus?: number;
  extraBonus?: number;
  grossPay?: number;
  finesTotal?: number;
  fineNote?: string | null;
};

export type SheetDetail = {
  id: number;
  branchName: string;
  month: string;
  planCurrent: number;
  planPrev: number;
  taxNetRate: number;
  status: string;
  lines: SettlementLine[];
  totals: {
    salesTotal: number;
    overPrev: number;
    vsPrevPct: number;
    vsCurrentPct: number;
    netTotal: number;
    cardTotal: number;
    grossTotal: number;
    oylikPctTotal: number;
    diffTotal: number;
  };
  canEdit: boolean;
  canAdmin: boolean;
  locked: boolean;
};

export function useHisobSheets(month: string) {
  return useQuery({
    queryKey: ["hisob", "sheets", month],
    queryFn: () => json<{ items: SheetListItem[] }>(`/api/hisobkitob/sheets?month=${encodeURIComponent(month)}`),
  });
}

export function useHisobSheet(id: number | null) {
  return useQuery({
    queryKey: ["hisob", "sheet", id],
    queryFn: () => json<SheetDetail>(`/api/hisobkitob/sheets/${id}`),
    enabled: id != null,
  });
}

export function useHisobMutations() {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["hisob"] });
  return {
    create: useMutation({
      mutationFn: (body: { branchName: string; month: string; planCurrent?: number; planPrev?: number }) =>
        json<SheetListItem>("/api/hisobkitob/sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      onSuccess: inv,
    }),
    patchSheet: useMutation({
      mutationFn: (p: { id: number; body: Record<string, unknown> }) =>
        json(`/api/hisobkitob/sheets/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
      onSuccess: inv,
    }),
    patchLine: useMutation({
      mutationFn: (p: { id: number; body: Record<string, unknown> }) =>
        json<SheetDetail>(`/api/hisobkitob/lines/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
      onSuccess: inv,
    }),
    addLine: useMutation({
      mutationFn: (p: { sheetId: number; body: Record<string, unknown> }) =>
        json(`/api/hisobkitob/sheets/${p.sheetId}/lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
      onSuccess: inv,
    }),
    delLine: useMutation({
      mutationFn: (id: number) => json(`/api/hisobkitob/lines/${id}`, { method: "DELETE" }),
      onSuccess: inv,
    }),
    delSheet: useMutation({
      mutationFn: (id: number) => json(`/api/hisobkitob/sheets/${id}`, { method: "DELETE" }),
      onSuccess: inv,
    }),
    approve: useMutation({
      mutationFn: (id: number) => json(`/api/hisobkitob/sheets/${id}/approve`, { method: "POST" }),
      onSuccess: inv,
    }),
    unlock: useMutation({
      mutationFn: (id: number) => json(`/api/hisobkitob/sheets/${id}/unlock`, { method: "POST" }),
      onSuccess: inv,
    }),
    applyPosition: useMutation({
      mutationFn: (p: { id: number; position: string; fiksa: number; bonusPercent: number }) =>
        json(`/api/hisobkitob/sheets/${p.id}/apply-position`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: p.position, fiksa: p.fiksa, bonusPercent: p.bonusPercent }),
        }),
      onSuccess: inv,
    }),
  };
}

export function formatSom(n: number) {
  return formatMoney(n);
}

export function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

export function monthLabelUz(ym: string) {
  const names = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return ym;
  return `${names[m - 1]} ${y}`;
}

export function shiftMonthKey(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
