import React, { useMemo, useState } from "react";
import {
  useGetEmployees,
  useGetDepartments,
  useUpdateEmployee,
  getGetEmployeesQueryKey,
  type Employee,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Search, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { useToast } from "../../hooks/use-toast";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import { EmployeesTabs } from "./employees-tabs";

const ORG_ROLE_UZ: Record<string, string> = {
  coordinator: "Koordinator",
  manager: "Mudir",
  pharmacist: "Farmasevt",
  intern: "Stajyor",
  supervisor: "Nazoratchi",
};

/** Jadvalda tanlanadigan asosiy holatlar */
const STAFF_STATUSES = [
  { value: "working", label: "Ishlayapti" },
  { value: "dismissed", label: "Bo‘shatilgan" },
  { value: "on_leave", label: "Ta’tilda" },
] as const;

const STATUS_UZ: Record<string, string> = {
  working: "Ishlayapti",
  new: "Yangi",
  dismissed: "Bo‘shatilgan",
  on_leave: "Ta’tilda",
  need_hire: "Yollash kerak",
  searching: "Qidiruvda",
  no_manager: "Mudir yo‘q",
  closed: "Yopilgan",
};

const STATUS_STYLE: Record<string, string> = {
  working: "border-emerald-200 bg-emerald-50 text-emerald-800",
  new: "border-sky-200 bg-sky-50 text-sky-800",
  dismissed: "border-rose-200 bg-rose-50 text-rose-800",
  on_leave: "border-amber-200 bg-amber-50 text-amber-900",
  need_hire: "border-amber-200 bg-amber-50 text-amber-800",
  searching: "border-violet-200 bg-violet-50 text-violet-800",
  no_manager: "border-amber-300 bg-amber-50 text-amber-900",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
};

function canCleanupDuplicates(role?: string | null) {
  return ["admin", "hr", "hr_direktor", "hr_menejer", "hr_auditor"].includes(role || "");
}

function canEditEmploymentStatus(role?: string | null) {
  return [
    "admin",
    "director",
    "hr_direktor",
    "hr_menejer",
    "hr",
    "moliya",
    "koordinator",
    "mudir",
  ].includes(role || "");
}

function shiftLabel(e: Employee): string {
  if (e.shiftType === "custom" && e.shiftLabel) return e.shiftLabel;
  if (e.shiftType === "one") return "1 smena";
  if (e.shiftType === "two") return "2 smena";
  return e.shiftType || "—";
}

function formatHired(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusControl({
  employee,
  canEdit,
  pendingId,
  onChange,
}: {
  employee: Employee;
  canEdit: boolean;
  pendingId: number | null;
  onChange: (id: number, status: string) => void;
}) {
  const st = employee.employmentStatus || "working";
  const known = STAFF_STATUSES.some((s) => s.value === st);
  if (!canEdit) {
    return (
      <span
        className={cn(
          "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
          STATUS_STYLE[st] || "border-slate-200 bg-slate-50 text-slate-700",
        )}
      >
        {STATUS_UZ[st] || st}
      </span>
    );
  }
  return (
    <Select
      value={known ? st : st}
      disabled={pendingId === employee.id}
      onValueChange={(v) => onChange(employee.id, v)}
    >
      <SelectTrigger
        className={cn(
          "h-8 w-[148px] rounded-full border text-[11px] font-semibold shadow-none",
          STATUS_STYLE[st] || "border-slate-200",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
        {!known ? <SelectItem value={st}>{STATUS_UZ[st] || st}</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}

export default function EmployeesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = canEditEmploymentStatus(user?.role);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const { data: employees, isLoading, isError, error, refetch, isFetching } = useGetEmployees();
  const { data: departments } = useGetDepartments();
  const updateEmp = useUpdateEmployee();

  const counts = useMemo(() => {
    const all = employees ?? [];
    return {
      total: all.length,
      working: all.filter((e) => (e.employmentStatus || "working") === "working").length,
      on_leave: all.filter((e) => e.employmentStatus === "on_leave").length,
      dismissed: all.filter((e) => e.employmentStatus === "dismissed").length,
    };
  }, [employees]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(employees ?? [])]
      .filter((e) => {
        if (deptFilter !== "all" && e.departmentId !== Number(deptFilter)) return false;
        if (statusFilter !== "all" && (e.employmentStatus || "working") !== statusFilter) return false;
        if (!q) return true;
        const hay = [
          e.fullName,
          e.position,
          e.departmentName,
          e.location,
          e.mentorName,
          e.orgRole && ORG_ROLE_UZ[e.orgRole],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
  }, [employees, search, deptFilter, statusFilter]);

  const setStatus = (id: number, employmentStatus: string) => {
    setPendingId(id);
    updateEmp.mutate(
      { id, data: { employmentStatus: employmentStatus as Employee["employmentStatus"] } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getGetEmployeesQueryKey() });
          toast({ title: "Holat saqlandi" });
        },
        onError: (err) => {
          toast({
            title: "Holat o‘zgarmadi",
            description: (err as Error)?.message || "Qayta urinib ko‘ring",
            variant: "destructive",
          });
        },
        onSettled: () => setPendingId(null),
      },
    );
  };

  const onExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (deptFilter !== "all") params.set("departmentId", deptFilter);
      const qs = params.toString();
      const res = await fetch(`/api/employees/export${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Excel yuklanmadi");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xodimlar_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Excel yuklandi", description: "Xodimlar to‘liq ro‘yxati" });
    } catch (err) {
      toast({
        title: "Excel yuklanmadi",
        description: (err as Error)?.message || "Qayta urinib ko‘ring",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl bg-[#0b3a5c] px-4 py-4 text-white shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <Users className="h-6 w-6 opacity-90" />
            Xodimlar
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Barcha xodimlar ro‘yxati · {isLoading ? "…" : `${list.length} ta ko‘rsatilmoqda`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <EmployeesTabs />
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-white text-[#0b3a5c] hover:bg-white/90"
            disabled={exporting || isLoading || list.length === 0}
            onClick={() => void onExportExcel()}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Excel yuklash
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { l: "Jami", n: counts.total, cls: "bg-white text-[#0b3a5c]" },
          { l: "Ishlayapti", n: counts.working, cls: "bg-emerald-50 text-emerald-800" },
          { l: "Ta’tilda", n: counts.on_leave, cls: "bg-amber-50 text-amber-900" },
          { l: "Bo‘shatilgan", n: counts.dismissed, cls: "bg-rose-50 text-rose-800" },
        ].map((c) => (
          <button
            key={c.l}
            type="button"
            onClick={() =>
              setStatusFilter(
                c.l === "Jami"
                  ? "all"
                  : c.l === "Ishlayapti"
                    ? "working"
                    : c.l === "Ta’tilda"
                      ? "on_leave"
                      : "dismissed",
              )
            }
            className={cn("rounded-xl border px-3 py-2.5 text-left shadow-sm transition hover:ring-2 hover:ring-[#0b3a5c]/20", c.cls)}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{c.l}</p>
            <p className="text-xl font-bold tabular-nums">{isLoading ? "…" : c.n}</p>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="space-y-3 border-b bg-slate-50/80 px-3 py-3 sm:px-5">
          <CardTitle className="text-sm font-semibold text-slate-800">Ro‘yxat</CardTitle>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ism, lavozim, filial…"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 w-full text-sm lg:w-[200px]">
                <SelectValue placeholder="Bo‘lim" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha bo‘limlar</SelectItem>
                {(departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full text-sm lg:w-[180px]">
                <SelectValue placeholder="Holat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha holat</SelectItem>
                {STAFF_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="space-y-3 px-4 py-10 text-center">
              <p className="text-sm text-red-600">{(error as Error)?.message || "Xodimlar yuklanmadi"}</p>
              <Button type="button" size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
                {isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Qayta urinish
              </Button>
            </div>
          ) : list.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">Xodimlar topilmadi</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead>
                    <tr className="border-b bg-[#0b3a5c] text-[11px] uppercase tracking-wide text-white">
                      <th className="w-10 px-3 py-3 font-medium">№</th>
                      <th className="px-3 py-3 font-medium">F.I.Sh.</th>
                      <th className="px-3 py-3 font-medium">Lavozim</th>
                      <th className="px-3 py-3 font-medium">Rol</th>
                      <th className="px-3 py-3 font-medium">Bo‘lim</th>
                      <th className="px-3 py-3 font-medium">Filial</th>
                      <th className="px-3 py-3 font-medium">Holat</th>
                      <th className="px-3 py-3 font-medium">Smena</th>
                      <th className="px-3 py-3 font-medium">Ishga olingan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e, i) => (
                      <tr
                        key={e.id}
                        className={cn(
                          "border-b border-slate-100 transition hover:bg-sky-50/70",
                          i % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                        )}
                      >
                        <td className="px-3 py-2.5 text-xs text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{e.fullName}</td>
                        <td className="px-3 py-2.5 text-slate-700">{e.position}</td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {(e.orgRole && ORG_ROLE_UZ[e.orgRole]) || e.orgRole || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{e.departmentName || "—"}</td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-600">{e.location || "—"}</td>
                        <td className="px-3 py-2">
                          <StatusControl employee={e} canEdit={canEdit} pendingId={pendingId} onChange={setStatus} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{shiftLabel(e)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{formatHired(e.hiredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y md:hidden">
                {list.map((e, i) => (
                  <div key={e.id} className="space-y-2 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-400">#{i + 1}</p>
                        <p className="truncate font-semibold text-slate-900">{e.fullName}</p>
                        <p className="text-xs text-slate-600">{e.position}</p>
                      </div>
                      <StatusControl employee={e} canEdit={canEdit} pendingId={pendingId} onChange={setStatus} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      <span>Rol: {(e.orgRole && ORG_ROLE_UZ[e.orgRole]) || "—"}</span>
                      <span>Smena: {shiftLabel(e)}</span>
                      <span className="truncate">Bo‘lim: {e.departmentName || "—"}</span>
                      <span>Ishga: {formatHired(e.hiredAt)}</span>
                      <span className="col-span-2 truncate">Filial: {e.location || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
