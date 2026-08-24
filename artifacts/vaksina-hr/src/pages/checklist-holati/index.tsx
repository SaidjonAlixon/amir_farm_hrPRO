import React, { useMemo, useState } from "react";
import {
  ClipboardCheck,
  Download,
  LayoutDashboard,
  MapPin,
  Search,
  Store,
  Trophy,
  User,
  CalendarDays,
  Check,
  X,
  Info,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { canExportChecklistStatus, canViewChecklistStatus, canViewCoordinatorRanking } from "@/lib/roles";
import {
  downloadBranchAuditsExcel,
  useBranchAuditsList,
  type BranchAudit,
} from "@/lib/branch-audits-api";
import { CoveragePanel } from "./coverage-panel";
import { ChecklistDashboard, type ChecklistDashNav } from "./dashboard-panel";
import { CoordinatorRankingBoard } from "./ranking-panel";

function scoreTone(pct: number) {
  if (pct >= 85) return "text-emerald-600";
  if (pct >= 70) return "text-amber-600";
  return "text-rose-600";
}

function scoreBadge(pct: number) {
  if (pct >= 85) return "bg-emerald-100 text-emerald-800";
  if (pct >= 70) return "bg-amber-100 text-amber-900";
  return "bg-rose-100 text-rose-800";
}

function formatWhen(visitDate: string, createdAt?: string) {
  const time = createdAt
    ? new Date(createdAt).toLocaleTimeString("uz-UZ", {
        timeZone: "Asia/Tashkent",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const [y, m, d] = visitDate.split("-");
  const date = y && m && d ? `${d}.${m}.${y}` : visitDate;
  return time ? `${date} · ${time}` : date;
}

function mapsUrl(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

const DATE_CHIP = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-900",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-cyan-100 text-cyan-800",
  "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800",
] as const;

function dateChipClass(ymd: string) {
  let n = 0;
  for (let i = 0; i < ymd.length; i++) n = (n + ymd.charCodeAt(i) * (i + 1)) % DATE_CHIP.length;
  return DATE_CHIP[n];
}

function visitLabel(count: number) {
  return `${count} tashrif`;
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-end gap-1">
      <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </Label>
      {children}
    </div>
  );
}

export default function ChecklistHolatiPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const allowedFull = canViewChecklistStatus(user?.role);
  const allowedRanking = canViewCoordinatorRanking(user?.role);
  const isCoordOnly = user?.role === "koordinator";

  const [q, setQ] = useState("");
  const [coordinatorId, setCoordinatorId] = useState<string>("all");
  const [branchKey, setBranchKey] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scoreBand, setScoreBand] = useState<"all" | "excellent" | "mid" | "low">("all");
  const [gpsFilter, setGpsFilter] = useState<"all" | "yes" | "no">("all");
  const [coverageFocus, setCoverageFocus] = useState<string | undefined>();
  const [viewing, setViewing] = useState<BranchAudit | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState("dashboard");

  const { data: audits = [], isLoading } = useBranchAuditsList(
    {
      from: from || undefined,
      to: to || undefined,
    },
    allowedFull && !isCoordOnly,
  );

  const coordinators = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of audits) {
      if (!map.has(a.coordinatorId)) {
        map.set(a.coordinatorId, a.coordinatorName || `Koordinator #${a.coordinatorId}`);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "uz"));
  }, [audits]);

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of audits) {
      if (coordinatorId !== "all" && String(a.coordinatorId) !== coordinatorId) continue;
      const key = String(a.managerEmployeeId);
      const label = a.branchLocation || a.managerName || "Filial";
      if (!map.has(key)) map.set(key, label);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "uz"));
  }, [audits, coordinatorId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return audits.filter((a) => {
      if (coordinatorId !== "all" && String(a.coordinatorId) !== coordinatorId) return false;
      if (branchKey !== "all" && String(a.managerEmployeeId) !== branchKey) return false;
      if (scoreBand === "excellent" && a.scorePercent < 85) return false;
      if (scoreBand === "mid" && (a.scorePercent < 70 || a.scorePercent >= 85)) return false;
      if (scoreBand === "low" && a.scorePercent >= 70) return false;
      if (gpsFilter === "yes" && (a.checkLatitude == null || a.checkLongitude == null)) return false;
      if (gpsFilter === "no" && a.checkLatitude != null && a.checkLongitude != null) return false;
      if (!needle) return true;
      return (
        String(a.branchLocation || "").toLowerCase().includes(needle) ||
        String(a.managerName || "").toLowerCase().includes(needle) ||
        String(a.coordinatorName || "").toLowerCase().includes(needle) ||
        String(a.visitName || "").toLowerCase().includes(needle)
      );
    });
  }, [audits, coordinatorId, branchKey, q, scoreBand, gpsFilter]);

  const stats = useMemo(() => {
    const branchSet = new Set(filtered.map((a) => a.managerEmployeeId));
    const coordSet = new Set(filtered.map((a) => a.coordinatorId));
    const avg =
      filtered.length === 0
        ? 0
        : Math.round(filtered.reduce((s, a) => s + a.scorePercent, 0) / filtered.length);
    return {
      visits: filtered.length,
      branches: branchSet.size,
      coordinators: coordSet.size,
      avg,
    };
  }, [filtered]);

  const byCoordinator = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; visits: number; avg: number; last: string; scores: number[] }
    >();
    for (const a of filtered) {
      const key = String(a.coordinatorId);
      const cur = map.get(key) ?? {
        id: key,
        name: a.coordinatorName || "Koordinator",
        visits: 0,
        avg: 0,
        last: a.visitDate,
        scores: [],
      };
      cur.visits += 1;
      cur.scores.push(a.scorePercent);
      if (a.visitDate > cur.last) cur.last = a.visitDate;
      map.set(key, cur);
    }
    return [...map.values()]
      .map((v) => ({
        ...v,
        avg: Math.round(v.scores.reduce((s, n) => s + n, 0) / v.scores.length),
      }))
      .sort((a, b) => b.visits - a.visits);
  }, [filtered]);

  const byBranch = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        manager: string;
        visits: number;
        stamps: { id: number; visitDate: string; createdAt?: string }[];
        avg: number;
        scores: number[];
      }
    >();
    for (const a of filtered) {
      const key = String(a.managerEmployeeId);
      const cur = map.get(key) ?? {
        id: key,
        name: a.branchLocation || "Filial",
        manager: a.managerName || "—",
        visits: 0,
        stamps: [],
        avg: 0,
        scores: [],
      };
      cur.visits += 1;
      cur.stamps.push({ id: a.id, visitDate: a.visitDate, createdAt: a.createdAt });
      cur.scores.push(a.scorePercent);
      map.set(key, cur);
    }
    return [...map.values()]
      .map((v) => ({
        ...v,
        avg: Math.round(v.scores.reduce((s, n) => s + n, 0) / v.scores.length),
        stamps: [...v.stamps].sort((a, b) =>
          String(b.createdAt || b.visitDate).localeCompare(String(a.createdAt || a.visitDate)),
        ),
      }))
      .sort((a, b) => b.visits - a.visits);
  }, [filtered]);

  function openVisits(nav: ChecklistDashNav = {}) {
    setCoordinatorId(nav.coordinatorId ?? "all");
    setBranchKey(nav.branchKey ?? "all");
    setFrom(nav.from ?? "");
    setTo(nav.to ?? "");
    setScoreBand(nav.scoreBand ?? "all");
    setGpsFilter(nav.gps ?? "all");
    setTab("tashriflar");
  }

  function openCoverage(coordinatorId?: string) {
    setCoverageFocus(coordinatorId);
    setTab("qamrov");
  }

  async function handleExcel() {
    setExporting(true);
    try {
      await downloadBranchAuditsExcel({
        coordinatorId: coordinatorId !== "all" ? Number(coordinatorId) : null,
        managerId: branchKey !== "all" ? Number(branchKey) : null,
        from: from || undefined,
        to: to || undefined,
        q: q.trim() || undefined,
      });
    } catch (e: any) {
      toast({ title: "Excel yuklanmadi", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  if (!allowedFull && !allowedRanking) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <Info className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-3 text-lg font-semibold">Ruxsat yo‘q</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cheklist holatini admin, direktor, HR direktor va HR menejer ko‘radi.
        </p>
      </div>
    );
  }

  if (isCoordOnly) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-10 sm:space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2e] px-4 py-5 text-white shadow-lg sm:px-6 sm:py-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-2xl" />
          <div className="relative">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Koordinatorlar
            </div>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Reyting</h1>
            <p className="mt-1.5 max-w-xl text-xs text-slate-300 sm:text-sm">
              Kunlik, haftalik va oylik natija — tashrif, ball, qamrov va GPS asosida.
            </p>
          </div>
        </div>
        <CoordinatorRankingBoard enabled={allowedRanking} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2e] px-4 py-5 text-white shadow-lg sm:px-6 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Nazorat · Tashriflar
            </div>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Cheklist holati</h1>
            <p className="mt-1.5 max-w-xl text-xs text-slate-300 sm:text-sm">
              Dashboard, tashriflar, reyting va har bir koordinatorning filial qamrovi.
            </p>
          </div>
          {tab === "tashriflar" && canExportChecklistStatus(user?.role) && (
            <Button
              variant="secondary"
              className="w-full bg-white/10 text-white hover:bg-white/20 sm:w-auto"
              onClick={() => void handleExcel()}
              disabled={exporting || filtered.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {exporting ? "Yuklanmoqda…" : "Excel eksport"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 sm:max-w-3xl">
          <TabsTrigger value="dashboard" className="h-11 px-2 text-xs sm:h-10 sm:text-sm">
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="reyting" className="h-11 px-2 text-xs sm:h-10 sm:text-sm">
            <Trophy className="h-3.5 w-3.5 shrink-0" />
            Reyting
          </TabsTrigger>
          <TabsTrigger value="tashriflar" className="h-11 px-2 text-xs sm:h-10 sm:text-sm">
            <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
            Tashriflar
          </TabsTrigger>
          <TabsTrigger value="qamrov" className="h-11 px-2 text-xs sm:h-10 sm:text-sm">
            <Store className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">Qamrov</span>
            <span className="hidden sm:inline">Filial qamrovi</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-0">
          <ChecklistDashboard
            enabled={allowedFull}
            onOpenVisits={openVisits}
            onOpenCoverage={openCoverage}
            onOpenVisit={(a) => setViewing(a)}
          />
        </TabsContent>
        <TabsContent value="reyting" className="mt-0">
          <CoordinatorRankingBoard
            enabled={allowedRanking}
            onOpenCoordinator={(id) => {
              setCoordinatorId(id);
              setBranchKey("all");
              setTab("tashriflar");
            }}
          />
        </TabsContent>
        <TabsContent value="tashriflar" className="mt-0 space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Tashriflar" value={String(stats.visits)} />
        <Stat label="Filiallar" value={String(stats.branches)} />
        <Stat label="Koordinatorlar" value={String(stats.coordinators)} />
        <Stat label="O‘rtacha ball" value={`${stats.avg}%`} valueClass={scoreTone(stats.avg)} />
      </div>

      <div className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Filter className="h-3.5 w-3.5" />
          Filter
        </div>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <FilterField label="Qidiruv">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Qidirish…"
                className="h-11 pl-9"
              />
            </div>
          </FilterField>
          <FilterField label="Koordinator">
            <Select
              value={coordinatorId}
              onValueChange={(v) => {
                setCoordinatorId(v);
                setBranchKey("all");
              }}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Koordinator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha koordinatorlar</SelectItem>
                {coordinators.map(([id, name]) => (
                  <SelectItem key={id} value={String(id)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Filial">
            <Select value={branchKey} onValueChange={setBranchKey}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha filiallar</SelectItem>
                {branches.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Dan">
            <Input type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FilterField>
          <FilterField label="Gacha">
            <Input type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} />
          </FilterField>
          <FilterField label="Ball">
            <Select value={scoreBand} onValueChange={(v) => setScoreBand(v as typeof scoreBand)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Ball" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha ball</SelectItem>
                <SelectItem value="excellent">A’lo ≥85%</SelectItem>
                <SelectItem value="mid">O‘rtacha 70–84%</SelectItem>
                <SelectItem value="low">Past &lt;70%</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="GPS">
            <Select value={gpsFilter} onValueChange={(v) => setGpsFilter(v as typeof gpsFilter)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="GPS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="yes">GPS bor</SelectItem>
                <SelectItem value="no">GPS yo‘q</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Koordinatorlar bo‘yicha</h2>
            <p className="text-[11px] text-slate-500">Tashrif soni · o‘rtacha ball</p>
          </div>
          <ul className="max-h-64 divide-y overflow-y-auto">
            {byCoordinator.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-400">Ma’lumot yo‘q</li>
            ) : (
              byCoordinator.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCoordinatorId(c.id);
                      setBranchKey("all");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50",
                      coordinatorId === c.id && "bg-cyan-50",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-[11px] text-slate-500">Oxirgi: {formatWhen(c.last)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums">{visitLabel(c.visits)}</p>
                      <p className={cn("text-[11px] font-semibold", scoreTone(c.avg))}>{c.avg}%</p>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Filiallar bo‘yicha</h2>
            <p className="text-[11px] text-slate-500">Tashrif soni va sanalar</p>
          </div>
          <ul className="max-h-64 divide-y overflow-y-auto">
            {byBranch.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-400">Ma’lumot yo‘q</li>
            ) : (
              byBranch.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setBranchKey(b.id)}
                    className={cn(
                      "w-full px-4 py-2.5 text-left hover:bg-slate-50",
                      branchKey === b.id && "bg-cyan-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.name}</p>
                        <p className="truncate text-[11px] text-slate-500">{b.manager}</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums">{visitLabel(b.visits)}</p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {b.stamps.slice(0, 8).map((s) => (
                        <span
                          key={s.id}
                          className={cn(
                            "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                            dateChipClass(s.visitDate),
                          )}
                        >
                          {formatWhen(s.visitDate, s.createdAt)}
                        </span>
                      ))}
                      {b.stamps.length > 8 ? (
                        <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          +{b.stamps.length - 8}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold sm:text-base">Barcha tashriflar</h2>
        </div>
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Yuklanmoqda…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">Hali cheklist yo‘q</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((a) => {
              const map = mapsUrl(a.checkLatitude, a.checkLongitude);
              return (
                <li key={a.id} className="px-3 py-3 sm:px-4">
                  <button
                    type="button"
                    onClick={() => setViewing(a)}
                    className="w-full rounded-xl text-left transition hover:bg-slate-50"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {a.branchLocation || "Filial"}
                          </p>
                          <Badge className={cn("font-bold", scoreBadge(a.scorePercent))}>
                            {a.scorePercent}%
                          </Badge>
                          <Badge variant="secondary" className="font-normal">
                            {a.visitName}
                          </Badge>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatWhen(a.visitDate, a.createdAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Store className="h-3.5 w-3.5" />
                            Mudir: {a.managerName || "—"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {a.coordinatorName || "Koordinator"}
                          </span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-emerald-700">Ha {a.yesCount}</span>
                          <span className="text-rose-700">Yo‘q {a.noCount}</span>
                          {map ? (
                            <a
                              href={map}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 font-medium text-sky-700 underline-offset-2 hover:underline"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              Lokatsiya
                              {a.distanceMeters != null ? ` · ${a.distanceMeters} m` : ""}
                            </a>
                          ) : (
                            <span className="text-slate-400">GPS yo‘q</span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-slate-400 sm:pt-1">Batafsil →</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
        </TabsContent>
        <TabsContent value="qamrov" className="mt-0">
          <CoveragePanel enabled={allowedFull} focusCoordinator={coverageFocus} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[88vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug sm:text-lg">
              {viewing?.branchLocation} — {viewing?.scorePercent}%
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <Progress value={viewing.scorePercent} className="h-2" />
              <div className="grid gap-2 rounded-xl border bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-slate-800">Sana / vaqt:</span>{" "}
                  {formatWhen(viewing.visitDate, viewing.createdAt)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Tashrif:</span> {viewing.visitName}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Mudir:</span> {viewing.managerName}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Koordinator:</span>{" "}
                  {viewing.coordinatorName}
                </p>
                {viewing.checkLatitude != null && viewing.checkLongitude != null ? (
                  <p className="sm:col-span-2">
                    <span className="font-semibold text-slate-800">Lokatsiya:</span>{" "}
                    <a
                      href={mapsUrl(viewing.checkLatitude, viewing.checkLongitude)!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-700 underline"
                    >
                      {Number(viewing.checkLatitude).toFixed(5)}, {Number(viewing.checkLongitude).toFixed(5)}
                    </a>
                    {viewing.distanceMeters != null ? ` · ${viewing.distanceMeters} m` : ""}
                  </p>
                ) : null}
              </div>
              {viewing.generalNote ? (
                <p className="rounded-lg bg-amber-50 p-3 text-amber-950">{viewing.generalNote}</p>
              ) : null}
              {viewing.categories?.map((cat) => (
                <div key={cat.id}>
                  <p className="mb-1.5 font-semibold text-slate-800">{cat.title}</p>
                  <ul className="space-y-1.5">
                    {cat.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2"
                      >
                        <span className="min-w-0 leading-snug">
                          {it.label}
                          {it.note ? (
                            <span className="mt-0.5 block text-[11px] text-slate-500">{it.note}</span>
                          ) : null}
                        </span>
                        <Badge
                          variant="secondary"
                          className={
                            it.answer === "yes"
                              ? "shrink-0 bg-emerald-100 text-emerald-800"
                              : it.answer === "no"
                                ? "shrink-0 bg-rose-100 text-rose-800"
                                : "shrink-0"
                          }
                        >
                          {it.answer === "yes" ? (
                            <span className="inline-flex items-center gap-1">
                              <Check className="h-3 w-3" /> Ha
                            </span>
                          ) : it.answer === "no" ? (
                            <span className="inline-flex items-center gap-1">
                              <X className="h-3 w-3" /> Yo‘q
                            </span>
                          ) : (
                            "—"
                          )}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
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
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
        {label}
      </p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl", valueClass)}>
        {value}
      </p>
    </div>
  );
}
