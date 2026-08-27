import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { ClipboardCheck, Info, MapPin, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  canViewCoordinatorRanking,
  canViewPharmacyReyting,
  isPharmacyBranchRole,
} from "@/lib/roles";
import { useBranchAuditsList, type BranchAudit } from "@/lib/branch-audits-api";
import { CoordinatorRankingBoard } from "@/pages/checklist-holati/ranking-panel";

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

export default function ReytingPage() {
  const { user } = useAuth();
  const role = user?.role;
  const pharmacyView = canViewPharmacyReyting(role);
  const coordView = canViewCoordinatorRanking(role);
  const [viewing, setViewing] = useState<BranchAudit | null>(null);

  const { data: audits = [], isLoading } = useBranchAuditsList({}, pharmacyView);

  const stats = useMemo(() => {
    if (!audits.length) {
      return { visits: 0, avg: 0, branch: audits[0]?.branchLocation ?? null };
    }
    const avg = Math.round(audits.reduce((s, a) => s + a.scorePercent, 0) / audits.length);
    return {
      visits: audits.length,
      avg,
      branch: audits[0]?.branchLocation || audits[0]?.managerName || "Filial",
    };
  }, [audits]);

  if (coordView && !isPharmacyBranchRole(role)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-10">
        <Header
          title="Reyting"
          subtitle="Koordinatorlar reytingi — kunlik, haftalik va oylik natija."
        />
        <CoordinatorRankingBoard enabled={coordView} />
        <p className="text-center text-xs text-muted-foreground">
          Batafsil:{" "}
          <Link href="/checklist-holati" className="font-medium text-[#0b3a5c] hover:underline">
            Cheklist holati
          </Link>
        </p>
      </div>
    );
  }

  if (!pharmacyView) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <Info className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-3 text-lg font-semibold">Reyting mavjud emas</h2>
        <p className="mt-1 text-sm text-slate-500">
          Filial reytingi mudir, farmasevt va stajyorlar uchun ko‘rsatiladi.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <Header
        title="Filial reytingi"
        subtitle="Koordinator tashriflari bo‘yicha filial ballari — faqat sizning filialingiz."
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-[11px] text-muted-foreground">Filial</p>
          <p className="mt-1 truncate text-sm font-semibold">{stats.branch || "—"}</p>
        </div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-[11px] text-muted-foreground">Tashriflar</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{stats.visits}</p>
        </div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-[11px] text-muted-foreground">O‘rtacha ball</p>
          <p className={cn("mt-1 text-2xl font-bold tabular-nums", scoreTone(stats.avg))}>
            {stats.avg}%
          </p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : audits.length ? (
        <div className="space-y-2">
          {audits.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setViewing(a)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left transition hover:border-[#0b3a5c]/30 hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{a.visitName || "Cheklist tashrifi"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatWhen(a.visitDate, a.createdAt)}
                  {a.coordinatorName ? ` · ${a.coordinatorName}` : ""}
                </p>
              </div>
              <Badge className={cn("shrink-0 tabular-nums", scoreBadge(a.scorePercent))}>
                {a.scorePercent}%
              </Badge>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-slate-50 p-8 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-700">Hali tashrif natijasi yo‘q</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Koordinator filialga cheklist topshirgach, ball shu yerda ko‘rinadi.
          </p>
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.visitName || "Tashrif tafsiloti"}</DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge className={scoreBadge(viewing.scorePercent)}>{viewing.scorePercent}%</Badge>
                <Badge variant="outline">{formatWhen(viewing.visitDate, viewing.createdAt)}</Badge>
              </div>
              <p className="text-muted-foreground">
                {viewing.branchLocation || viewing.managerName}
                {viewing.coordinatorName ? ` · ${viewing.coordinatorName}` : ""}
              </p>
              {viewing.checkLatitude != null && viewing.checkLongitude != null ? (
                <a
                  href={`https://www.google.com/maps?q=${viewing.checkLatitude},${viewing.checkLongitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#0b3a5c] hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" /> GPS nuqtasi
                </a>
              ) : null}
              {viewing.generalNote ? (
                <p className="rounded-lg bg-slate-50 p-3 text-slate-700">{viewing.generalNote}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Ha: {viewing.yesCount} · Yo‘q: {viewing.noCount} · Jami: {viewing.totalCount}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2e] px-5 py-6 text-white shadow-lg">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="relative">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
          <Trophy className="h-3.5 w-3.5" />
          Reyting
        </div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
      </div>
    </div>
  );
}
