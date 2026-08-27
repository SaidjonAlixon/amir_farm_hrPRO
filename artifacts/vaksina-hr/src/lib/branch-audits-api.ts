import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AuditAnswer = "yes" | "no" | null;

export type AuditChecklistItem = {
  id: string;
  label: string;
  answer: AuditAnswer;
  note?: string | null;
};

export type AuditCategory = {
  id: string;
  title: string;
  items: AuditChecklistItem[];
};

export type BranchAudit = {
  id: number;
  managerEmployeeId: number;
  branchLocation: string | null;
  managerName: string | null;
  visitDate: string;
  visitName: string;
  monthLabel: string | null;
  coordinatorId: number;
  coordinatorName: string | null;
  generalNote: string | null;
  categories: AuditCategory[];
  scorePercent: number;
  answeredCount: number;
  yesCount: number;
  noCount: number;
  totalCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  checkLatitude?: number | null;
  checkLongitude?: number | null;
  distanceMeters?: number | null;
};

export type AuditBranchOption = {
  id: number;
  managerName: string;
  branchLocation: string;
  latitude: number | null;
  longitude: number | null;
};

export type BranchAuditInput = {
  managerEmployeeId: number;
  visitDate: string;
  visitName: string;
  monthLabel?: string | null;
  generalNote?: string | null;
  categories: AuditCategory[];
  checkLatitude?: number;
  checkLongitude?: number;
};

export const AUDIT_GEOFENCE_METERS = 50;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message || `Xato ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Standart filial audit shabloni — barcha javoblar boshida tanlanmagan */
export function createEmptyAuditTemplate(): AuditCategory[] {
  const mk = (id: string, label: string): AuditChecklistItem => ({
    id,
    label,
    answer: null,
    note: null,
  });

  return [
    {
      id: "tashqi",
      title: "Tashqi hududni tekshirish",
      items: [
        mk("t1", "Jaluzi (pardalar) ochilganligi"),
        mk("t2", "Eshik ochiq/yopiqligi tartibda ekanligi"),
        mk("t3", "Tashqi hudud tozalanganligi"),
        mk("t4", "Reklama peshtoqi (banner/lightbox) yoqilgan/ishlab turganligi"),
        mk("t5", "Kirish oldi toza, reklama materiallari joyida"),
      ],
    },
    {
      id: "ichki",
      title: "Ichki hududni tekshirish",
      items: [
        mk("i1", "Zal toza va tartibli"),
        mk("i2", "Vitrinalar toza, mahsulotlar tartibda joylashgan"),
        mk("i3", "Yoritish yetarli va ishlayotgan"),
        mk("i4", "Konditsioner / harorat normal"),
        mk("i5", "Savdo zonasi toza, axlat qutilari joyida"),
      ],
    },
    {
      id: "xodim",
      title: "Xodimlar va ko‘rinish",
      items: [
        mk("x1", "Xodimlar forma kiygan"),
        mk("x2", "Beyjik / ism yozuvi ko‘rinadi"),
        mk("x3", "Mijozlarga xushmuomalalik"),
        mk("x4", "Ish stoli / kassa zonasi tartibli"),
      ],
    },
    {
      id: "dori",
      title: "Dori va saqlash",
      items: [
        mk("d1", "Muddati o‘tgan dorilar alohida ajratilgan"),
        mk("d2", "Sovuq zanjir (muzlatgich) harorati nazoratda"),
        mk("d3", "Retseptli dorilar tartibda saqlanadi"),
        mk("d4", "Ombor / javonlar tartibli va belgilangan"),
      ],
    },
    {
      id: "hujjat",
      title: "Hujjatlar va nazorat",
      items: [
        mk("h1", "Litsenziya / ruxsatnomalar joyida"),
        mk("h2", "Kunlik hisobot / kassa yozuvlari yuritiladi"),
        mk("h3", "Nazorat daftarlarida yozuvlar mavjud"),
        mk("h4", "Yong‘in xavfsizligi vositalari joyida"),
      ],
    },
  ];
}

export function scoreFromCategories(categories: AuditCategory[]) {
  const items = categories.flatMap((c) => c.items);
  const total = items.length;
  const yes = items.filter((i) => i.answer === "yes").length;
  const no = items.filter((i) => i.answer === "no").length;
  const answered = yes + no;
  const scorePercent = answered === 0 ? 0 : Math.round((yes / answered) * 100);
  return { total, yes, no, answered, scorePercent };
}

export function useAuditBranches() {
  return useQuery({
    queryKey: ["branch-audits", "branches"],
    queryFn: () => apiFetch<AuditBranchOption[]>("/branch-audits/branches"),
  });
}

export function useBranchAudits(managerId?: number | null) {
  const qs = managerId ? `?managerId=${managerId}` : "";
  return useQuery({
    queryKey: ["branch-audits", { managerId: managerId ?? null }],
    queryFn: () => apiFetch<BranchAudit[]>(`/branch-audits${qs}`),
  });
}

export type BranchAuditListParams = {
  managerId?: number | null;
  coordinatorId?: number | null;
  from?: string;
  to?: string;
  q?: string;
};

export function useBranchAuditsList(params: BranchAuditListParams, enabled = true) {
  const sp = new URLSearchParams();
  if (params.managerId) sp.set("managerId", String(params.managerId));
  if (params.coordinatorId) sp.set("coordinatorId", String(params.coordinatorId));
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.q) sp.set("q", params.q);
  const qs = sp.toString();
  return useQuery({
    queryKey: ["branch-audits", "list", params],
    queryFn: () => apiFetch<BranchAudit[]>(`/branch-audits${qs ? `?${qs}` : ""}`),
    enabled,
  });
}

export async function downloadBranchAuditsExcel(params: BranchAuditListParams) {
  const sp = new URLSearchParams();
  if (params.managerId) sp.set("managerId", String(params.managerId));
  if (params.coordinatorId) sp.set("coordinatorId", String(params.coordinatorId));
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.q) sp.set("q", params.q);
  const qs = sp.toString();
  const res = await fetch(`/api/branch-audits/export${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message || "Excel yuklanmadi");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cheklist-holati-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type CoverageBranch = {
  managerEmployeeId: number;
  managerName: string;
  branchLocation: string;
  filled: boolean;
  visitCount: number;
  lastVisitDate: string | null;
  lastScore: number | null;
  lastCoordinatorName: string | null;
};

export type CoordinatorCoverage = {
  employeeId: number;
  userId: number | null;
  name: string;
  dismissed: boolean;
  total: number;
  filled: number;
  missing: number;
  percent: number;
  branches: CoverageBranch[];
};

export type CoverageResponse = {
  totals: {
    coordinators: number;
    branches: number;
    filled: number;
    missing: number;
    unassigned: number;
  };
  coordinators: CoordinatorCoverage[];
  unassigned: CoverageBranch[];
};

export type RankingPeriod = "day" | "week" | "month";

export type CoordinatorRankRow = {
  coordinatorId: number;
  employeeId: number;
  name: string;
  rank: number;
  rating: number;
  visits: number;
  uniqueBranches: number;
  assignedBranches: number;
  coveredBranches: number;
  coveragePct: number;
  avgScore: number;
  gpsPct: number;
  excellentPct: number;
  yesCount: number;
  noCount: number;
  lastVisit: string | null;
};

export type CoordinatorRankingResponse = {
  period: RankingPeriod;
  from: string;
  to: string;
  maxVisits: number;
  rankings: CoordinatorRankRow[];
};

export function useCoordinatorRanking(period: RankingPeriod, enabled = true) {
  return useQuery({
    queryKey: ["branch-audits", "ranking", period],
    queryFn: () => apiFetch<CoordinatorRankingResponse>(`/branch-audits/ranking?period=${period}`),
    enabled,
  });
}

export function useAuditCoverage(
  params: { from?: string; to?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: ["branch-audits", "coverage", params],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params.from) sp.set("from", params.from);
      if (params.to) sp.set("to", params.to);
      const qs = sp.toString();
      return apiFetch<CoverageResponse>(`/branch-audits/coverage${qs ? `?${qs}` : ""}`);
    },
    enabled,
  });
}

export async function downloadCoverageExcel(params: { from?: string; to?: string }) {
  const sp = new URLSearchParams();
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  const qs = sp.toString();
  const res = await fetch(`/api/branch-audits/coverage/export${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message || "Excel yuklanmadi");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cheklist-qamrov-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useCreateBranchAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BranchAuditInput) =>
      apiFetch<BranchAudit>("/branch-audits", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branch-audits"] });
    },
  });
}

export function useDeleteBranchAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/branch-audits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branch-audits"] });
    },
  });
}
