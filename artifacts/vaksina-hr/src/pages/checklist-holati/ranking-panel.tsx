import React, { useMemo, useState } from "react";
import { Medal, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useGetUsers } from "@workspace/api-client-react";
import {
  useCoordinatorRanking,
  type CoordinatorRankRow,
  type RankingPeriod,
} from "@/lib/branch-audits-api";

const PERIOD_LABEL: Record<RankingPeriod, string> = {
  day: "Kunlik",
  week: "Haftalik",
  month: "Oylik",
};

function formatDate(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}.${m}.${y}` : ymd;
}

function medalClass(rank: number) {
  if (rank === 1) return "bg-amber-100 text-amber-800 ring-amber-200";
  if (rank === 2) return "bg-slate-100 text-slate-700 ring-slate-200";
  if (rank === 3) return "bg-orange-100 text-orange-800 ring-orange-200";
  return "bg-white text-slate-500 ring-slate-200";
}

function ratingTone(n: number) {
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-amber-600";
  return "text-rose-600";
}

function Factor({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xs font-semibold tabular-nums text-slate-800">{value}</p>
    </div>
  );
}

function RankRow({
  row,
  mine,
  compact,
  onOpen,
}: {
  row: CoordinatorRankRow;
  mine: boolean;
  compact: boolean;
  onOpen?: (coordinatorId: string) => void;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1",
            medalClass(row.rank),
          )}
        >
          {row.rank <= 3 ? <Medal className="h-4 w-4" /> : row.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
              {row.name}
              {mine ? (
                <span className="ml-1.5 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
                  Siz
                </span>
              ) : null}
            </p>
            <p className={cn("shrink-0 text-lg font-bold tabular-nums", ratingTone(row.rating))}>
              {row.rating}
            </p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {row.visits} tashrif · {row.uniqueBranches} filial · ball {row.avgScore}%
            {row.lastVisit ? ` · ${formatDate(row.lastVisit)}` : ""}
          </p>
          {!compact ? (
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              <Factor label="Tashrif" value={String(row.visits)} />
              <Factor label="Ball" value={`${row.avgScore}%`} />
              <Factor label="Qamrov" value={`${row.coveragePct}%`} />
              <Factor label="GPS" value={`${row.gpsPct}%`} />
              <Factor label="A’lo" value={`${row.excellentPct}%`} />
              <Factor
                label="Filial"
                value={
                  row.assignedBranches > 0
                    ? `${row.coveredBranches}/${row.assignedBranches}`
                    : String(row.uniqueBranches)
                }
              />
            </div>
          ) : (
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                style={{ width: `${Math.max(4, Math.min(100, row.rating))}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (!onOpen) {
    return <div className={cn("px-4 py-3", mine && "bg-cyan-50/60")}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(String(row.coordinatorId))}
      className={cn("w-full px-4 py-3 text-left hover:bg-slate-50", mine && "bg-cyan-50/60")}
    >
      {body}
    </button>
  );
}

export function CoordinatorRankingBoard({
  enabled,
  compact = false,
  onOpenCoordinator,
}: {
  enabled: boolean;
  compact?: boolean;
  onOpenCoordinator?: (coordinatorId: string) => void;
}) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const { data, isLoading } = useCoordinatorRanking(period, enabled);
  const { data: coordUsers } = useGetUsers({ role: "koordinator" }, { query: { enabled } });
  const myId = user?.id;

  const rankings = useMemo(() => {
    const allowed = new Set(
      (coordUsers ?? [])
        .filter((u) => u.status === "active" || u.status === "on_leave")
        .map((u) => u.id),
    );
    const rows = (data?.rankings ?? []).filter((r) => allowed.has(r.coordinatorId));
    return rows.map((row, i) => ({ ...row, rank: i + 1 }));
  }, [coordUsers, data?.rankings]);

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-white shadow-sm", !compact && "shadow-sm")}>
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Koordinatorlar reytingi</h3>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Tashrif soni, o‘rtacha ball, filial qamrovi, GPS va a’lo natijalar asosida.
            {data ? ` ${formatDate(data.from)} — ${formatDate(data.to)}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {(Object.keys(PERIOD_LABEL) as RankingPeriod[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={cn(
                "h-9 rounded-lg px-2 text-xs font-semibold transition-colors",
                period === key
                  ? "bg-[#0b3a5c] text-white shadow-sm"
                  : "text-slate-600 hover:bg-white/80 hover:text-slate-900",
              )}
            >
              {PERIOD_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">Reyting yuklanmoqda…</p>
      ) : !rankings.length ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">Koordinator topilmadi</p>
      ) : (
        <ul className={cn("divide-y", compact && "max-h-[28rem] overflow-y-auto")}>
          {rankings.map((row) => (
            <li key={row.coordinatorId}>
              <RankRow
                row={row}
                mine={myId === row.coordinatorId}
                compact={compact}
                onOpen={onOpenCoordinator}
              />
            </li>
          ))}
        </ul>
      )}

      {!compact ? (
        <div className="border-t bg-slate-50/80 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          Ball: tashrif hajmi 25% · cheklist balli 25% · qamrov 20% · GPS 15% · a’lo tashriflar 10% · filial
          xilma-xilligi 5%. Tashrifi yo‘q koordinatorlar 0 ball.
        </div>
      ) : null}
    </div>
  );
}
