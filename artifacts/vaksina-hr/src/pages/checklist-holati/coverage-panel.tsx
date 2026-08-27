import React, { useEffect, useMemo, useState } from "react";
import { Check, Download, Search, Store, X } from "lucide-react";
import { useGetEmployees } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { canExportChecklistStatus } from "@/lib/roles";
import { displayBranchName } from "@/lib/pharmacy-staff-api";
import {
  downloadCoverageExcel,
  useBranchAuditsList,
  type CoverageBranch,
  type CoordinatorCoverage,
  type CoverageResponse,
} from "@/lib/branch-audits-api";

function formatDate(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}.${m}.${y}` : ymd;
}

type OrgPerson = {
  id: number;
  fullName: string;
  orgRole?: string | null;
  reportsToId?: number | null;
  location?: string | null;
  employmentStatus?: string | null;
  userId?: number | null;
};

function branchLabel(fullName: string, location?: string | null) {
  const loc = displayBranchName(location);
  const generic =
    !loc ||
    loc === "Filial" ||
    loc === fullName ||
    /\d+\s*°/.test(loc) ||
    /^-?\d+[.,]\d+\s*[,;]\s*-?\d+/.test(loc);
  return generic ? fullName : loc;
}

function isCoordinatorRole(role?: string | null) {
  return role === "coordinator" || role === "koordinator";
}

export function buildCoverage(
  people: OrgPerson[],
  audits: { managerEmployeeId: number; visitDate: string; scorePercent: number; coordinatorName?: string | null }[],
  from?: string,
  to?: string,
): CoverageResponse {
  const visits = new Map<
    number,
    { visitCount: number; lastVisitDate: string | null; lastScore: number | null; lastCoordinatorName: string | null }
  >();
  for (const a of audits) {
    if (from && a.visitDate < from) continue;
    if (to && a.visitDate > to) continue;
    const cur = visits.get(a.managerEmployeeId);
    if (!cur) {
      visits.set(a.managerEmployeeId, {
        visitCount: 1,
        lastVisitDate: a.visitDate,
        lastScore: a.scorePercent,
        lastCoordinatorName: a.coordinatorName ?? null,
      });
      continue;
    }
    cur.visitCount += 1;
    if (!cur.lastVisitDate || a.visitDate >= cur.lastVisitDate) {
      cur.lastVisitDate = a.visitDate;
      cur.lastScore = a.scorePercent;
      cur.lastCoordinatorName = a.coordinatorName ?? null;
    }
  }

  const toBranch = (m: OrgPerson): CoverageBranch => {
    const v = visits.get(m.id);
    const visitCount = v?.visitCount ?? 0;
    return {
      managerEmployeeId: m.id,
      managerName: m.fullName,
      branchLocation: branchLabel(m.fullName, m.location),
      filled: visitCount > 0,
      visitCount,
      lastVisitDate: v?.lastVisitDate ?? null,
      lastScore: v?.lastScore ?? null,
      lastCoordinatorName: v?.lastCoordinatorName ?? null,
    };
  };

  const coordinators = people.filter((p) => isCoordinatorRole(p.orgRole));
  const coordById = new Map(coordinators.map((c) => [c.id, c]));
  const branchesByCoord = new Map<number, CoverageBranch[]>();
  const unassigned: CoverageBranch[] = [];

  for (const m of people) {
    if (m.orgRole !== "manager" || m.employmentStatus === "dismissed") continue;
    const branch = toBranch(m);
    const coord = m.reportsToId != null ? coordById.get(m.reportsToId) : undefined;
    if (!coord) {
      unassigned.push(branch);
      continue;
    }
    const list = branchesByCoord.get(coord.id) ?? [];
    list.push(branch);
    branchesByCoord.set(coord.id, list);
  }

  const coordinatorRows: CoordinatorCoverage[] = coordinators
    .filter((c) => c.employmentStatus !== "dismissed" || (branchesByCoord.get(c.id)?.length ?? 0) > 0)
    .map((c) => {
      const branches = (branchesByCoord.get(c.id) ?? []).sort((a, b) =>
        a.branchLocation.localeCompare(b.branchLocation, "uz"),
      );
      const filled = branches.filter((b) => b.filled).length;
      const total = branches.length;
      const dismissed = c.employmentStatus === "dismissed";
      return {
        employeeId: c.id,
        userId: c.userId ?? null,
        name: dismissed ? `${c.fullName} (ishdan ketgan)` : c.fullName,
        dismissed,
        total,
        filled,
        missing: total - filled,
        percent: total === 0 ? 0 : Math.round((filled / total) * 100),
        branches,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "uz"));

  unassigned.sort((a, b) => a.branchLocation.localeCompare(b.branchLocation, "uz"));
  const assigned = coordinatorRows.reduce((s, c) => s + c.total, 0);
  const filled = coordinatorRows.reduce((s, c) => s + c.filled, 0) + unassigned.filter((b) => b.filled).length;
  const allBranches = assigned + unassigned.length;

  return {
    totals: {
      coordinators: coordinatorRows.filter((c) => !c.dismissed).length,
      branches: allBranches,
      filled,
      missing: allBranches - filled,
      unassigned: unassigned.length,
    },
    coordinators: coordinatorRows,
    unassigned,
  };
}

export function CoveragePanel({
  enabled,
  focusCoordinator,
}: {
  enabled: boolean;
  focusCoordinator?: string;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canExport = canExportChecklistStatus(user?.role);
  const [q, setQ] = useState("");
  const [coordKey, setCoordKey] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: employees, isLoading: empLoading } = useGetEmployees(undefined, {
    query: { enabled },
  });
  const { data: audits = [], isLoading: auditLoading } = useBranchAuditsList({}, enabled);
  const isLoading = empLoading || auditLoading;

  const data = useMemo(() => {
    if (!employees) return undefined;
    return buildCoverage(employees as OrgPerson[], audits, from || undefined, to || undefined);
  }, [employees, audits, from, to]);

  useEffect(() => {
    if (!focusCoordinator || !data) return;
    const match = data.coordinators.find(
      (c) => String(c.userId ?? "") === focusCoordinator || String(c.employeeId) === focusCoordinator,
    );
    if (match) setCoordKey(String(match.employeeId));
  }, [focusCoordinator, data]);

  const selected = useMemo(() => {
    if (!data) return null;
    if (coordKey === "unassigned") {
      return {
        employeeId: 0,
        userId: null,
        name: "Biriktirilmagan filiallar",
        dismissed: false,
        total: data.unassigned.length,
        filled: data.unassigned.filter((b) => b.filled).length,
        missing: data.unassigned.filter((b) => !b.filled).length,
        percent:
          data.unassigned.length === 0
            ? 0
            : Math.round(
                (data.unassigned.filter((b) => b.filled).length / data.unassigned.length) * 100,
              ),
        branches: data.unassigned,
      } satisfies CoordinatorCoverage;
    }
    if (coordKey === "all") return null;
    return data.coordinators.find((c) => String(c.employeeId) === coordKey) ?? null;
  }, [data, coordKey]);

  const needle = q.trim().toLowerCase();
  const detailBranches = useMemo(() => {
    const list = selected?.branches ?? [];
    if (!needle) return list;
    return list.filter(
      (b) =>
        b.branchLocation.toLowerCase().includes(needle) ||
        b.managerName.toLowerCase().includes(needle),
    );
  }, [selected, needle]);

  const filledList = detailBranches.filter((b) => b.filled);
  const missingList = detailBranches.filter((b) => !b.filled);

  async function handleExcel() {
    setExporting(true);
    try {
      await downloadCoverageExcel({ from: from || undefined, to: to || undefined });
    } catch (e: any) {
      toast({ title: "Excel yuklanmadi", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const totals = data?.totals;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-slate-600">
          Har bir koordinatorning barcha filiallari: cheklist kiritilgan va kiritilmagan.
        </p>
        {canExport ? (
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => void handleExcel()}
          disabled={exporting || !data}
        >
          <Download className="mr-1.5 h-4 w-4" />
          {exporting ? "Yuklanmoqda…" : "Excel eksport"}
        </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <MiniStat label="Koordinatorlar" value={String(totals?.coordinators ?? "—")} />
        <MiniStat label="Jami filial" value={String(totals?.branches ?? "—")} />
        <MiniStat
          label="Kiritilgan"
          value={String(totals?.filled ?? "—")}
          valueClass="text-emerald-600"
        />
        <MiniStat
          label="Kiritilmagan"
          value={String(totals?.missing ?? "—")}
          valueClass="text-rose-600"
        />
      </div>

      <div className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Koordinator
            </Label>
            <Select value={coordKey} onValueChange={setCoordKey}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Koordinator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha koordinatorlar</SelectItem>
                {(data?.coordinators ?? []).map((c) => (
                  <SelectItem key={c.employeeId} value={String(c.employeeId)}>
                    {c.name} · {c.filled}/{c.total}
                  </SelectItem>
                ))}
                {(data?.unassigned.length ?? 0) > 0 && (
                  <SelectItem value="unassigned">
                    Biriktirilmagan · {data?.unassigned.length}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Qidiruv
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filial / mudir…"
                className="h-11 pl-9"
                disabled={coordKey === "all"}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Dan</Label>
            <Input type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gacha</Label>
            <Input type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Sana bo‘sh — barcha vaqt. Sana qo‘ysangiz, shu davrdagi cheklist hisoblanadi.
        </p>
      </div>

      {isLoading ? (
        <p className="rounded-2xl border bg-white px-4 py-10 text-center text-sm text-slate-500">
          Yuklanmoqda…
        </p>
      ) : coordKey === "all" ? (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <ul className="divide-y">
            {(data?.coordinators ?? []).map((c) => (
              <li key={c.employeeId}>
                <button
                  type="button"
                  onClick={() => setCoordKey(String(c.employeeId))}
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{c.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {c.total} filial · kiritilgan {c.filled} · kiritilmagan {c.missing}
                    </p>
                  </div>
                  <div className="flex w-full items-center gap-3 sm:w-56">
                    <Progress value={c.percent} className="h-2 flex-1" />
                    <span
                      className={cn(
                        "w-12 shrink-0 text-right text-sm font-bold tabular-nums",
                        c.percent >= 80 ? "text-emerald-600" : c.percent >= 50 ? "text-amber-600" : "text-rose-600",
                      )}
                    >
                      {c.percent}%
                    </span>
                  </div>
                </button>
              </li>
            ))}
            {(data?.unassigned.length ?? 0) > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setCoordKey("unassigned")}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-50"
                >
                  <div>
                    <p className="font-semibold text-amber-900">Biriktirilmagan filiallar</p>
                    <p className="text-[11px] text-amber-800/80">{data?.unassigned.length} ta filial</p>
                  </div>
                  <Badge variant="secondary">Ko‘rish</Badge>
                </button>
              </li>
            )}
          </ul>
        </div>
      ) : selected ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{selected.name}</h3>
                <p className="text-sm text-slate-500">
                  {selected.total} filialdan {selected.filled} tasiga kiritilgan, {selected.missing} tasiga
                  kiritilmagan
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCoordKey("all")}>
                Barchasi
              </Button>
            </div>
            <Progress value={selected.percent} className="mt-3 h-2.5" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BranchColumn
              title="Kiritilgan"
              count={filledList.length}
              tone="ok"
              items={filledList}
            />
            <BranchColumn
              title="Kiritilmagan"
              count={missingList.length}
              tone="miss"
              items={missingList}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border bg-white px-4 py-10 text-center text-sm text-slate-400">
          Koordinator topilmadi
        </p>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border bg-white px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-4 sm:py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl", valueClass)}>
        {value}
      </p>
    </div>
  );
}

function BranchColumn({
  title,
  count,
  tone,
  items,
}: {
  title: string;
  count: number;
  tone: "ok" | "miss";
  items: CoverageBranch[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div
        className={cn(
          "flex items-center justify-between border-b px-4 py-3",
          tone === "ok" ? "bg-emerald-50/80" : "bg-rose-50/80",
        )}
      >
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          {tone === "ok" ? <Check className="h-4 w-4 text-emerald-700" /> : <X className="h-4 w-4 text-rose-700" />}
          {title}
        </h3>
        <Badge
          className={
            tone === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
          }
        >
          {count}
        </Badge>
      </div>
      <ul className="max-h-[28rem] divide-y overflow-y-auto">
        {items.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-400">Ro‘yxat bo‘sh</li>
        ) : (
          items.map((b) => (
            <li key={b.managerEmployeeId} className="px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {b.branchLocation}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Mudir: {b.managerName}</p>
              {b.filled ? (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {b.visitCount} tashrif · oxirgi {formatDate(b.lastVisitDate)}
                  {b.lastScore != null ? ` · ${b.lastScore}%` : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] font-medium text-rose-600">Cheklist yo‘q</p>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
