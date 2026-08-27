import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { canViewHolat } from "../../lib/roles";
import { downloadHolatExcel, useHolat } from "../../lib/holat-api";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { HolatDashboardPanel } from "./holat-dashboard";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { useToast } from "../../hooks/use-toast";

export default function AdminHolatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const allowed = canViewHolat(user?.role);
  const { data, isLoading, error, refetch } = useHolat(allowed);
  const [exporting, setExporting] = useState(false);
  const [dashCoordKey, setDashCoordKey] = useState<string>("");

  async function onExport() {
    if (!data) return;
    setExporting(true);
    await new Promise((r) => window.setTimeout(r, 40));
    try {
      const coordId =
        dashCoordKey && dashCoordKey !== "all"
          ? Number(dashCoordKey)
          : data.scoped && data.coordinators[0]?.employeeId
            ? data.coordinators[0].employeeId
            : null;
      await downloadHolatExcel(
        data,
        "sonlar",
        coordId != null && Number.isFinite(coordId) ? coordId : null,
      );
      toast({
        title: "Excel yuklandi",
        description: coordId
          ? "Tanlangan koordinator: filial, mudir va ichidagi xodimlar"
          : "Barcha koordinatorlar: filial, mudir va ichidagi xodimlar",
      });
    } catch (e: any) {
      toast({ title: "Excel xato", description: e.message || String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  if (!allowed) {
    return <p className="p-6 text-sm text-slate-500">Holat faqat admin, direktor, HR, koordinator va mudir uchun.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {(error as Error)?.message || "Holat yuklanmadi"}
        <Button className="ml-3" size="sm" variant="outline" onClick={() => void refetch()}>
          Qayta
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0b3a5c] via-[#0f4a73] to-[#163a55] p-5 text-white shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white/15 p-2.5 ring-1 ring-white/20">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100/90">Sozlamalar</p>
              <h1 className="text-2xl font-semibold">Holat</h1>
              <p className="mt-1 max-w-2xl text-sm text-sky-50/90">
                Koordinatorni tanlang — filiallar ochiladi. Filialni bosing — mudir, farmasevt va stajyor chiqadi.
                {data.scoped ? " Hozir faqat sizning tarmog‘ingiz." : " To‘liq tizim."} Yangilangan: {data.generatedAt}
              </p>
            </div>
          </div>
          <Button
            type="button"
            disabled={exporting}
            onClick={() => void onExport()}
            className="h-11 shrink-0 gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#0b3a5c] shadow-sm hover:bg-sky-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Excel yuklash
          </Button>
        </div>
      </div>

      <HolatDashboardPanel data={data} coordKey={dashCoordKey} onCoordKey={setDashCoordKey} />
    </div>
  );
}
