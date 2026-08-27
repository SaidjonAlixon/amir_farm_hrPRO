import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Download,
  Lock,
  Search,
  Unlock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  canViewHisobkitob,
  currentMonthKey,
  formatSom,
  monthLabelUz,
  shiftMonthKey,
  useHisobMutations,
  useHisobSheet,
  useHisobSheets,
  type SettlementLine,
} from "@/lib/hisobkitob-api";
import { formatMoney, formatMoneyInput, parseMoney } from "@/lib/money-format";

function CellInput({
  value,
  disabled,
  className,
  onCommit,
  percent,
}: {
  value: number | string;
  disabled?: boolean;
  className?: string;
  percent?: boolean;
  onCommit: (n: number) => void;
}) {
  const show = (v: number | string) =>
    percent ? String(Number(v) * 100) : formatMoney(Number(v) || 0);
  const [txt, setTxt] = useState(show(value));
  useEffect(() => {
    setTxt(show(value));
  }, [value, percent]);
  return (
    <input
      inputMode="decimal"
      disabled={disabled}
      value={txt}
      onChange={(e) => setTxt(percent ? e.target.value : formatMoneyInput(e.target.value))}
      onBlur={() => {
        const n = parseMoney(txt);
        onCommit(percent ? n / 100 : n);
        setTxt(percent ? String(n) : formatMoney(n));
      }}
      className={cn(
        "h-6 w-full rounded-sm border-0 bg-transparent px-1 text-right text-[11px] leading-none tabular-nums outline-none focus:bg-white focus:ring-1 focus:ring-[#0b3a5c]/30 disabled:opacity-70",
        className,
      )}
    />
  );
}

function roleLabel(p?: string | null) {
  const s = (p || "").trim();
  if (!s) return "";
  return s.split("·")[0]!.trim();
}

function FormulaHint() {
  return (
    <div className="rounded-xl border bg-white p-3 text-[11px] leading-relaxed text-slate-600 shadow-sm">
      <p className="font-semibold text-[#0b3a5c]">Hisoblash (serverda, barcha lavozimlar)</p>
      <p className="mt-1">Rejadan ortiq = max(0, savdo − joriy reja). Reja % = savdo / reja × 100.</p>
      <p>Foiz summasi = savdo × savdo foizi. Reja bonusi faqat reja bajarilsa (aks holda 0).</p>
      <p>Hisoblangan = fiks + foiz + reja bonusi + KPI. Qo‘lga = max(0, hisoblangan − avans − jarimalar).</p>
      <p className="mt-1 text-[11px] text-slate-500">Fiks Oylikdan keladi va shu yerdan xodim kartochkasiga yoziladi. Savdo yo‘q lavozimda faqat fiks va KPI.</p>
    </div>
  );
}

export default function HisobkitobPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const allowed = canViewHisobkitob(user?.role);
  const [month, setMonth] = useState("2026-08");
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<"name" | "role">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [nameQuery, setNameQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [bulkFiks, setBulkFiks] = useState("0");
  const [bulkBonus, setBulkBonus] = useState("0");
  const sheets = useHisobSheets(month);
  const detail = useHisobSheet(sheetId);
  const mut = useHisobMutations();
  const creatingRef = React.useRef(false);

  useEffect(() => {
    const items = sheets.data?.items ?? [];
    if (sheets.isLoading || sheets.isFetching) return;
    if (!items.length) {
      setSheetId(null);
      if (!creatingRef.current && !mut.create.isPending) {
        creatingRef.current = true;
        mut.create.mutate(
          { branchName: "Oylik hisob", month },
          { onSettled: () => { creatingRef.current = false; } },
        );
      }
      return;
    }
    creatingRef.current = false;
    if (!sheetId || !items.some((s) => s.id === sheetId)) setSheetId(items[0]!.id);
  }, [sheets.data, sheets.isLoading, sheets.isFetching, sheetId, month, mut.create]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-xl font-bold">Hisob-kitob</h1>
        <p className="mt-2 text-sm text-slate-500">Faqat admin, direktor va moliyachi ko‘radi.</p>
      </div>
    );
  }

  const d = detail.data;
  const edit = Boolean(d?.canEdit);
  const admin = Boolean(d?.canAdmin);
  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const r of d?.lines ?? []) {
      const p = roleLabel(r.position);
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "uz"));
  }, [d?.lines]);
  const rows = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    let list = [...(d?.lines ?? [])];
    if (q) list = list.filter((r) => r.fullName.toLowerCase().includes(q));
    if (roleFilter) list = list.filter((r) => roleLabel(r.position) === roleFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = sortKey === "role" ? roleLabel(a.position) : a.fullName;
      const bv = sortKey === "role" ? roleLabel(b.position) : b.fullName;
      return dir * av.localeCompare(bv, "uz", { sensitivity: "base" });
    });
    return list;
  }, [d?.lines, sortKey, sortDir, nameQuery, roleFilter]);

  const toggleSort = (key: "name" | "role") => {
    if (sortKey === key) setSortDir((x) => (x === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const saveLine = (id: number, body: Record<string, unknown>) => {
    mut.patchLine.mutate(
      { id, body },
      { onError: (e) => toast({ title: "Saqlanmadi", description: (e as Error).message, variant: "destructive" }) },
    );
  };

  return (
    <div className="space-y-3 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#0b3a5c] px-4 py-3 text-white shadow">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Calculator className="h-5 w-5" /> Xodimlar oylik hisobi
          </h1>
          <p className="text-xs text-white/70">Savdo, reja, fiks, bonus va jarimalar — barcha lavozimlar. Oylik (KPI) bilan bog‘langan.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/10 p-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/15 hover:text-white" onClick={() => setMonth(shiftMonthKey(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[120px] text-center text-[13px] font-semibold">{monthLabelUz(month)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/15 hover:text-white" onClick={() => setMonth(shiftMonthKey(month, 1))} disabled={month >= currentMonthKey() && month >= "2026-08"}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sheets.isLoading || detail.isLoading || (!d && mut.create.isPending) ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : detail.error ? (
        <p className="text-sm text-rose-700">{(detail.error as Error).message}</p>
      ) : !d ? (
        <p className="rounded-xl border bg-white px-4 py-10 text-center text-sm text-slate-500">
          {monthLabelUz(month)} uchun ma’lumot yo‘q.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-7">
            {[
              { l: "Xodimlar", v: `${d.lines.length} ta` },
              { l: `${monthLabelUz(d.month)} reja`, v: formatSom(d.planCurrent) },
              { l: `${monthLabelUz(shiftMonthKey(d.month, -1))} reja`, v: formatSom(d.planPrev) },
              { l: "Bir oylik savdo", v: formatSom(d.totals.salesTotal) },
              { l: "Rejadan ortiq", v: formatSom((d.totals as { overPlanTotal?: number }).overPlanTotal ?? d.totals.overPrev) },
              { l: `${monthLabelUz(shiftMonthKey(d.month, -1))}ga %`, v: `${d.totals.vsPrevPct}%` },
              { l: "Qo‘lga / karta", v: formatSom(d.totals.cardTotal) },
            ].map((c) => (
              <div key={c.l} className="rounded-xl border bg-white px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{c.l}</p>
                <p className="text-sm font-bold tabular-nums text-[#0b3a5c]">{c.v}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Ism familiya"
                className="h-8 w-48 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-[#0b3a5c]/30"
              />
            </div>
            <select
              className="h-8 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">Barcha lavozimlar</option>
              {roles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {edit ? (
              <>
                <span className="text-xs text-slate-500">Fiksa</span>
                <input
                  inputMode="numeric"
                  value={bulkFiks}
                  onChange={(e) => setBulkFiks(formatMoneyInput(e.target.value) || "0")}
                  className="h-8 w-36 rounded-lg border border-slate-200 px-2 text-sm tabular-nums"
                />
                <span className="text-xs text-slate-500">Bonus %</span>
                <input
                  value={bulkBonus}
                  onChange={(e) => setBulkBonus(e.target.value)}
                  className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-sm tabular-nums"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-[#0b3a5c]"
                  disabled={mut.applyPosition.isPending || !roleFilter}
                  onClick={() => {
                    if (!roleFilter) {
                      toast({ title: "Avval lavozim tanlang", variant: "destructive" });
                      return;
                    }
                    mut.applyPosition.mutate(
                      {
                        id: d.id,
                        position: roleFilter,
                        fiksa: parseMoney(bulkFiks),
                        bonusPercent: parseMoney(bulkBonus),
                      },
                      {
                        onSuccess: () => toast({ title: `${roleFilter} uchun yozildi` }),
                        onError: (e) => toast({ title: "Yozilmadi", description: (e as Error).message, variant: "destructive" }),
                      },
                    );
                  }}
                >
                  Lavozimga yozish
                </Button>
              </>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button type="button" size="sm" className="h-8 bg-[#0b3a5c]" onClick={() => { window.location.href = `/api/hisobkitob/sheets/${d.id}/export`; }}>
                <Download className="mr-1 h-3.5 w-3.5" /> Excel
              </Button>
              {d.status !== "approved" ? (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => mut.approve.mutate(d.id, { onSuccess: () => toast({ title: "Tasdiqlandi" }) })}>
                  <Lock className="mr-1 h-3.5 w-3.5" /> Tasdiqlash
                </Button>
              ) : admin ? (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => mut.unlock.mutate(d.id)}>
                  <Unlock className="mr-1 h-3.5 w-3.5" /> Qayta ochish
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-300 bg-white shadow-sm">
            <div className="max-h-[min(72vh,760px)] overflow-auto">
              <table className="w-full min-w-[2100px] border-collapse text-[11px] leading-tight">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {[
                      { t: "№", a: "center", k: "num" },
                      { t: "Xodim", a: "left", k: "name" },
                      { t: "Lavozim", a: "left", k: "role" },
                      { t: "Telefon", a: "left", k: "phone" },
                      { t: "Joriy reja", a: "right" },
                      { t: "Oldingi reja", a: "right" },
                      { t: "Haqiqiy savdo", a: "right" },
                      { t: "Rejadan ortiq", a: "right" },
                      { t: "Reja %", a: "right" },
                      { t: "Savdo foizi", a: "right" },
                      { t: "Foiz summasi", a: "right" },
                      { t: "Fiks maosh", a: "right" },
                      { t: "Reja bonusi", a: "right" },
                      { t: "KPI bonus", a: "right" },
                      { t: "Avans", a: "right" },
                      { t: "Qayta hisob", a: "right" },
                      { t: "Vaqt jarimasi", a: "right" },
                      { t: "Muddat jarimasi", a: "right" },
                      { t: "Hisoblangan", a: "right" },
                      { t: "Qo‘lga / karta", a: "right", k: "card" },
                    ].map((h) => (
                      <th
                        key={h.k || h.t}
                        className={cn(
                          "whitespace-nowrap border border-slate-400 bg-[#0b3a5c] px-1.5 py-1 text-[10px] font-semibold leading-tight text-white",
                          h.a === "right" ? "text-right" : h.a === "center" ? "text-center" : "text-left",
                        )}
                      >
                        {h.k === "name" || h.k === "role" ? (
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(h.k as "name" | "role")}>
                            {h.t}
                            <ArrowUpDown className={cn("h-3 w-3 opacity-70", sortKey === h.k && "opacity-100")} />
                          </button>
                        ) : (
                          h.t
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: SettlementLine, idx) => (
                    <tr key={row.id} className="hover:bg-sky-50/60">
                      <td className="sticky left-0 z-[1] w-8 border border-slate-300 bg-slate-50 px-0.5 py-0 text-center text-[10px] tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="sticky left-8 z-[1] min-w-[220px] whitespace-nowrap border border-slate-300 bg-white px-1 py-0">
                        {edit ? (
                          <input
                            defaultValue={row.fullName}
                            className="h-6 w-full min-w-[200px] bg-transparent px-1 text-left text-[11px] font-semibold leading-none outline-none focus:bg-white"
                            onBlur={(e) => saveLine(row.id, { fullName: e.target.value })}
                          />
                        ) : (
                          <span className="block px-1 py-0 font-semibold whitespace-nowrap">{row.fullName}</span>
                        )}
                      </td>
                      <td className="min-w-[140px] whitespace-nowrap border border-slate-300 px-1 py-0">
                        {edit ? (
                          <input
                            defaultValue={roleLabel(row.position)}
                            className="h-6 w-full min-w-[120px] bg-transparent px-1 text-[11px] leading-none outline-none focus:bg-white"
                            onBlur={(e) => saveLine(row.id, { position: e.target.value })}
                          />
                        ) : (
                          <span className="block px-1 py-0 text-slate-700 whitespace-nowrap">{roleLabel(row.position) || "—"}</span>
                        )}
                      </td>
                      <td className="border border-slate-300 px-1 py-0">
                        {edit ? (
                          <input
                            defaultValue={row.phone || ""}
                            className="h-6 w-28 bg-transparent px-1 text-[11px] leading-none outline-none focus:bg-white"
                            onBlur={(e) => saveLine(row.id, { phone: e.target.value })}
                          />
                        ) : (
                          <span className="px-1 text-slate-600">{row.phone || "—"}</span>
                        )}
                      </td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.planCurrent ?? 0} disabled={!edit} onCommit={(n) => saveLine(row.id, { planCurrent: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.planPrev ?? 0} disabled={!edit} onCommit={(n) => saveLine(row.id, { planPrev: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.sales} disabled={!edit} onCommit={(n) => saveLine(row.id, { sales: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0 text-right tabular-nums text-emerald-800">{formatSom(row.overPlan ?? 0)}</td>
                      <td className="border border-slate-300 px-1 py-0 text-right tabular-nums">{row.planPct ?? 0}%</td>
                      <td className="border border-slate-300 px-1 py-0" title="0 = foiz yo‘q; 0.6 = 0.6%">
                        <CellInput value={row.percent} percent disabled={!edit} onCommit={(n) => saveLine(row.id, { percent: n })} />
                      </td>
                      <td className="border border-slate-300 px-1 py-0 text-right font-medium tabular-nums text-emerald-800">{formatSom(row.oylikPct)}</td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.fiksa} disabled={!edit} onCommit={(n) => saveLine(row.id, { fiksa: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.planBonus} disabled={!edit} onCommit={(n) => saveLine(row.id, { planBonus: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.extraBonus ?? 0} disabled={!edit} onCommit={(n) => saveLine(row.id, { extraBonus: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.avans} disabled={!edit} onCommit={(n) => saveLine(row.id, { avans: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.inventoryFine} disabled={!edit} onCommit={(n) => saveLine(row.id, { inventoryFine: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.timeFine} disabled={!edit} onCommit={(n) => saveLine(row.id, { timeFine: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0"><CellInput value={row.expiryHold} disabled={!edit} onCommit={(n) => saveLine(row.id, { expiryHold: n })} /></td>
                      <td className="border border-slate-300 px-1 py-0 text-right font-bold tabular-nums text-[#0b3a5c]">{formatSom(row.grossPay ?? row.net)}</td>
                      <td className="border border-slate-300 px-1 py-0 text-right font-bold tabular-nums">{formatSom(row.card)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr className="bg-slate-100 font-semibold">
                    <td className="border border-slate-400 px-1 py-0 text-center">—</td>
                    <td className="border border-slate-400 px-1 py-0">Jami</td>
                    <td className="border border-slate-400 px-1 py-0 text-[11px] text-slate-600">{rows.length} / {d.lines.length} xodim</td>
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400 px-1 py-0 text-right tabular-nums">{formatSom(d.totals.salesTotal)}</td>
                    <td className="border border-slate-400 px-1 py-0 text-right tabular-nums">{formatSom((d.totals as { overPlanTotal?: number }).overPlanTotal ?? 0)}</td>
                    <td className="border border-slate-400 px-1 py-0 text-right">{d.totals.vsCurrentPct}%</td>
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400 px-1 py-0 text-right tabular-nums">{formatSom(d.totals.oylikPctTotal)}</td>
                    <td className="border border-slate-400" colSpan={7} />
                    <td className="border border-slate-400 px-1 py-0 text-right tabular-nums">{formatSom((d.totals as { grossPayTotal?: number }).grossPayTotal ?? d.totals.netTotal)}</td>
                    <td className="border border-slate-400 px-1 py-0 text-right tabular-nums">{formatSom(d.totals.cardTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <FormulaHint />
        </>
      )}
    </div>
  );
}
