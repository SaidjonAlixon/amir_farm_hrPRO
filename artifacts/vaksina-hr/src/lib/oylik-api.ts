import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PayrollReport = {
  userId: number;
  employeeId: number | null;
  month: string;
  monthLabel: string;
  from: string;
  to: string;
  fullName: string;
  role: string;
  roleLabel: string;
  position: string | null;
  branch: string | null;
  fixedSalary: number;
  bonusPercent: number;
  attendance: {
    available: boolean;
    complete?: boolean;
    percent: number;
    baseWeight: number;
    effectiveWeight: number;
    points: number;
    countedDays: number;
    expectedDays?: number;
    closedDays?: number;
    days: Array<{ date: string; status: string; lateMinutes: number | null; counted: boolean; points: number; note: string }>;
  };
  tasks: {
    available: boolean;
    percent: number;
    baseWeight: number;
    effectiveWeight: number;
    points: number;
    total: number;
    items: Array<{ id: number; title: string; points: number; label: string }>;
  };
  checklist: {
    available: boolean;
    percent: number;
    baseWeight: number;
    effectiveWeight: number;
    items: Array<{ id: number; visitDate: string; visitName: string; percent: number; yesCount: number; totalCount: number }>;
  };
  kpiPercent: number;
  maxBonus: number;
  bonusAmount: number;
  totalAmount: number;
  status?: "draft" | "approved";
};

export type PayrollRow = {
  employeeId?: number;
  userId: number | null;
  fullName: string;
  roleLabel: string;
  position: string | null;
  branch: string | null;
  fixedSalary: number;
  bonusPercent: number;
  kpiPercent: number;
  bonusAmount: number;
  totalAmount: number;
  status: string;
  attendance: number;
  tasks: number;
  checklist: number;
  attendanceAvailable: boolean;
  attendanceComplete?: boolean;
  expectedWorkDays?: number;
  closedWorkDays?: number;
  tasksAvailable: boolean;
  checklistAvailable: boolean;
};

export function payrollRowKey(r: { employeeId?: number | null; userId?: number | null }) {
  return r.employeeId || r.userId || 0;
}

function emptyPart() {
  return {
    available: false,
    percent: 0,
    baseWeight: 0,
    effectiveWeight: 0,
    points: 0,
    countedDays: 0,
    total: 0,
    days: [] as PayrollReport["attendance"]["days"],
    items: [] as never[],
  };
}

function normalizeReport(raw: Record<string, unknown>): PayrollReport {
  const att = (raw.attendance as PayrollReport["attendance"] | undefined) ?? {
    ...emptyPart(),
    days: [],
  };
  const tasks = (raw.tasks as PayrollReport["tasks"] | undefined) ?? {
    available: false,
    percent: 0,
    baseWeight: 0,
    effectiveWeight: 0,
    points: 0,
    total: 0,
    items: [],
  };
  const checklist = (raw.checklist as PayrollReport["checklist"] | undefined) ?? {
    available: false,
    percent: 0,
    baseWeight: 0,
    effectiveWeight: 0,
    items: [],
  };
  return {
    userId: Number(raw.userId ?? 0),
    employeeId: (raw.employeeId as number | null) ?? null,
    month: String(raw.month ?? ""),
    monthLabel: String(raw.monthLabel ?? raw.month ?? ""),
    from: String(raw.from ?? ""),
    to: String(raw.to ?? ""),
    fullName: String(raw.fullName ?? ""),
    role: String(raw.role ?? ""),
    roleLabel: String(raw.roleLabel ?? ""),
    position: (raw.position as string | null) ?? null,
    branch: (raw.branch as string | null) ?? null,
    fixedSalary: Number(raw.fixedSalary ?? 0),
    bonusPercent: Number(raw.bonusPercent ?? 0),
    attendance: { ...att, days: att.days ?? [] },
    tasks: { ...tasks, items: tasks.items ?? [] },
    checklist: { ...checklist, items: checklist.items ?? [] },
    kpiPercent: Number(raw.kpiPercent ?? 0),
    maxBonus: Number(raw.maxBonus ?? 0),
    bonusAmount: Number(raw.bonusAmount ?? raw.bonus ?? 0),
    totalAmount: Number(raw.totalAmount ?? raw.netSalary ?? 0),
    status: (raw.status as "draft" | "approved") || "draft",
  };
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
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

export function useOylikMe(month?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return useQuery({
    queryKey: ["oylik", "me", month ?? "current"],
    queryFn: async () => normalizeReport(await json<Record<string, unknown>>(`/api/oylik/me${q}`)),
    staleTime: 30_000,
  });
}

export function useOylikSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["oylik", "settings"],
    queryFn: () =>
      json<{
        weights: { attendance: number; tasks: number; checklist: number; workStartHm: string };
        canEdit: boolean;
        canApprove: boolean;
      }>("/api/oylik/settings"),
    enabled,
  });
}

export function useOylikEmployees(month: string, q: string, enabled: boolean) {
  const qs = new URLSearchParams({ month });
  if (q.trim()) qs.set("q", q.trim());
  return useQuery({
    queryKey: ["oylik", "employees", month, q],
    queryFn: () => json<{ month: string; workDays?: string[]; items: PayrollRow[] }>(`/api/oylik/employees?${qs}`),
    enabled,
    staleTime: 20_000,
  });
}

export function useOylikEmployee(userId: number | null, month: string) {
  return useQuery({
    queryKey: ["oylik", "employee", userId, month],
    queryFn: async () =>
      normalizeReport(await json<Record<string, unknown>>(`/api/oylik/employees/${userId}?month=${encodeURIComponent(month)}`)),
    enabled: userId != null,
  });
}

export function useSaveOylikSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { attendance?: number; tasks?: number; checklist?: number }) =>
      json("/api/oylik/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["oylik"] });
    },
  });
}

export function useSaveSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { userId: number; employeeId?: number; month: string; fixedSalary?: number; bonusPercent?: number }) =>
      json(`/api/oylik/salary/${p.userId || p.employeeId || 0}?month=${encodeURIComponent(p.month)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: p.employeeId,
          fixedSalary: p.fixedSalary,
          bonusPercent: p.bonusPercent,
        }),
      }),
    onSuccess: (_data, p) => {
      void qc.invalidateQueries({ queryKey: ["oylik", "employees"], exact: false });
      void qc.invalidateQueries({ queryKey: ["oylik", "employee", p.userId, p.month] });
    },
  });
}

export function useSaveSalaryBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { month: string; position: string; fixedSalary?: number; bonusPercent?: number }) =>
      json("/api/oylik/salary-bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: p.month,
          position: p.position,
          fixedSalary: p.fixedSalary,
          bonusPercent: p.bonusPercent,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["oylik"] });
    },
  });
}

export function useRecalculateOylik() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { month: string; userId?: number }) =>
      json("/api/oylik/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["oylik"] });
    },
  });
}

export function useToggleWorkDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { day: string; isWork: boolean }) =>
      json<{ ok: boolean; day: string; isWork: boolean; workDays: string[] }>("/api/oylik/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["oylik"] });
    },
  });
}

export function useApproveOylik() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { userId?: number; month: string; all?: boolean; position?: string }) =>
      json("/api/oylik/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["oylik"] });
    },
  });
}

export async function downloadOylikExcel(month: string): Promise<void> {
  const res = await fetch(`/api/oylik/export?month=${encodeURIComponent(month)}`, {
    credentials: "include",
  });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || type.includes("application/json")) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "Excel yuklanmadi");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oylik-kpi-${month}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { formatSom } from "@/lib/money";

export function monthLabelUz(ym: string) {
  const names = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return ym;
  return `${names[m - 1]} ${y}`;
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

export function shiftMonthKey(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function canManagePayroll(role?: string | null) {
  return role === "admin" || role === "director" || role === "moliya" || role === "hr_direktor";
}

export function canApprovePayroll(role?: string | null) {
  return role === "admin" || role === "director" || role === "moliya";
}

export function canEditKpiSettings(role?: string | null) {
  return role === "admin" || role === "hr_direktor" || role === "director" || role === "moliya";
}
