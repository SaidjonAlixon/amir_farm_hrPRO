import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Loader2, MapPin, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useToast } from "../../hooks/use-toast";
import { fetchDavomat } from "../../lib/davomat-api";
import { useAuth } from "../../contexts/AuthContext";
import { canViewDavomat } from "../../lib/roles";
import { cn } from "../../lib/utils";

function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return dt.toISOString().slice(0, 10);
}

function formatKm(meters: number): string {
  const km = meters / 1000;
  return km >= 10 ? km.toFixed(1) : km.toFixed(2);
}

export default function DavomatFarOfficePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const allowed = canViewDavomat(user?.role);

  const [selectedDay, setSelectedDay] = useState(() => todayYmd());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    Array<{
      employeeId: number;
      fullName: string;
      position: string | null;
      departmentName: string | null;
      checkIn: string | null;
      officeDistanceMeters: number;
    }>
  >([]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const report = await fetchDavomat({ from: selectedDay, to: selectedDay });
      const day = report.days.find((d) => d.date === selectedDay) ?? report.days[0];
      const list = [...(day?.farFromOffice ?? [])].sort(
        (a, b) => b.officeDistanceMeters - a.officeDistanceMeters,
      );
      setRows(list);
    } catch (err: unknown) {
      setRows([]);
      toast({
        title: "Yuklanmadi",
        description: err instanceof Error ? err.message : "Xatolik",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [allowed, selectedDay, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.fullName, r.position, r.departmentName].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">Masofaviy</h1>
        <p className="mt-2 text-muted-foreground">Bu bo‘lim uchun ruxsat yo‘q.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Link href="/davomat" className="hover:text-[#0b3a5c] hover:underline">
              Davomat hisobot
            </Link>
            <span>/</span>
            <span className="text-slate-700">Masofaviy</span>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-amber-950 sm:text-3xl">
            <MapPin className="h-7 w-7 text-amber-700" />
            Masofaviy
          </h1>
          <p className="mt-1 max-w-xl text-sm text-amber-900/80">
            Shu kuni Face ID/GPS bo‘yicha asosiy ofisdan 1 km dan uzoqda davomat qilganlar
          </p>
        </div>
        <Link href="/davomat">
          <Button type="button" variant="outline" size="sm">
            Hisobotga qaytish
          </Button>
        </Link>
      </div>

      <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-amber-900/70">Sana</p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-amber-200 bg-white"
                onClick={() => setSelectedDay((d) => addDaysYmd(d, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value || todayYmd())}
                className="h-9 w-[11.5rem] border-amber-200 bg-white"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-amber-200 bg-white"
                onClick={() => setSelectedDay((d) => addDaysYmd(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-amber-200 bg-white"
                onClick={() => setSelectedDay(todayYmd())}
              >
                Bugun
              </Button>
            </div>
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="mb-1.5 text-xs font-medium text-amber-900/70">Qidiruv</p>
            <Search className="pointer-events-none absolute left-3 top-[2.15rem] h-4 w-4 -translate-y-1/2 text-amber-800/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ism, lavozim, bo‘lim…"
              className="h-9 border-amber-200 bg-white pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-amber-200 bg-amber-50/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-amber-950">
            Asosiy ofisdan 1 km dan uzoq · {filtered.length}
            {search.trim() && filtered.length !== rows.length ? ` / ${rows.length}` : ""} kishi
          </CardTitle>
          <p className="text-xs text-amber-800">Sana: {selectedDay}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-amber-900/70">
              <Loader2 className="h-5 w-5 animate-spin" /> Yuklanmoqda…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-amber-900/60">
              Bu kunda ofisdan uzoqda davomat qilganlar yo‘q
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-amber-200/80 bg-white/70">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-amber-100 bg-amber-100/50 text-left text-xs text-amber-900/70">
                    <th className="px-3 py-2.5 font-semibold">№</th>
                    <th className="px-3 py-2.5 font-semibold">F.I.Sh.</th>
                    <th className="px-3 py-2.5 font-semibold">Lavozim</th>
                    <th className="px-3 py-2.5 font-semibold">Bo‘lim</th>
                    <th className="px-3 py-2.5 font-semibold">Kelish</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Masofa</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr
                      key={`${p.employeeId}-${p.fullName}`}
                      className={cn(
                        "border-b border-amber-50 text-amber-950",
                        i % 2 === 1 && "bg-amber-50/40",
                      )}
                    >
                      <td className="px-3 py-2.5 tabular-nums text-amber-800/60">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium">{p.fullName}</td>
                      <td className="px-3 py-2.5 text-amber-900/80">{p.position || "—"}</td>
                      <td className="px-3 py-2.5 text-amber-900/80">{p.departmentName || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.checkIn || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {formatKm(p.officeDistanceMeters)} km
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
