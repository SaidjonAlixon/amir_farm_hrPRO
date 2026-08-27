import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck,
  CalendarDays,
  Store,
  User,
  RotateCcw,
  Check,
  X,
  Save,
  FolderOpen,
  TrendingUp,
  History,
  Trash2,
  Info,
  MapPin,
  Navigation,
  Crosshair,
  Search,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  createEmptyAuditTemplate,
  scoreFromCategories,
  useAuditBranches,
  useBranchAudits,
  useCreateBranchAudit,
  useDeleteBranchAudit,
  AUDIT_GEOFENCE_METERS,
  haversineMeters,
  type AuditAnswer,
  type AuditCategory,
  type BranchAudit,
  type AuditBranchOption,
} from "@/lib/branch-audits-api";
import {
  gpsFromLocationField,
  displayBranchName,
} from "@/lib/pharmacy-staff-api";

const VISIT_NAMES = [
  { value: "1-tashrif", label: "1-tashrif" },
  { value: "2-tashrif", label: "2-tashrif" },
  { value: "3-tashrif", label: "3-tashrif" },
  { value: "nazorat", label: "Nazorat tashrifi" },
  { value: "qayta-tekshiruv", label: "Qayta tekshiruv" },
];

const MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentMonthLabel() {
  return MONTHS[new Date().getMonth()];
}

function scoreTone(pct: number) {
  if (pct >= 85) return "text-emerald-600";
  if (pct >= 70) return "text-amber-600";
  return "text-rose-600";
}

function scoreBar(pct: number) {
  if (pct >= 85) return "bg-emerald-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters} m`;
}

type PickerBranch = AuditBranchOption & { hasGps: boolean; label: string };

function normalizeAuditBranches(list: AuditBranchOption[]): PickerBranch[] {
  const counts = new Map<string, number>();
  const cleaned = list.map((b) => {
    const fromField = gpsFromLocationField(b.branchLocation);
    const loc = displayBranchName(b.branchLocation);
    const generic = !loc || loc === "Filial" || loc === b.managerName;
    const label = generic ? b.managerName : loc;
    const lat = b.latitude ?? fromField?.lat ?? null;
    const lng = b.longitude ?? fromField?.lng ?? null;
    counts.set(label, (counts.get(label) || 0) + 1);
    return {
      ...b,
      branchLocation: label,
      latitude: lat,
      longitude: lng,
      hasGps: lat != null && lng != null,
      label,
    };
  });
  return cleaned.sort((a, b) => {
    if (a.hasGps !== b.hasGps) return a.hasGps ? -1 : 1;
    return a.label.localeCompare(b.label, "uz");
  });
}

function BranchPicker({
  branches,
  value,
  onChange,
  disabled,
}: {
  branches: PickerBranch[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = branches.find((b) => String(b.id) === value) || null;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return branches;
    return branches.filter(
      (b) =>
        b.label.toLowerCase().includes(s) ||
        b.managerName.toLowerCase().includes(s),
    );
  }, [branches, q]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-auto min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm shadow-sm disabled:opacity-50",
          selected?.hasGps
            ? "border-emerald-300 bg-emerald-50"
            : selected
              ? "border-rose-300 bg-rose-50"
              : "border-input bg-background",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 font-semibold leading-snug",
            selected?.hasGps
              ? "text-emerald-800"
              : selected
                ? "text-rose-800"
                : "text-muted-foreground font-normal",
          )}
        >
          {selected ? selected.label : "— Filialni tanlang —"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Filialni tanlang</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-slate-500">
            <span className="font-semibold text-emerald-700">Yashil</span> — GPS bor ·{" "}
            <span className="font-semibold text-rose-700">Qizil</span> — GPS yo‘q
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filial nomini qidiring…"
              className="h-11 pl-9"
              autoFocus
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">Topilmadi</p>
            ) : (
              <ul className="divide-y">
                {filtered.map((b) => {
                  const active = String(b.id) === value;
                  const dups = branches.filter((x) => x.label === b.label).length > 1;
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(String(b.id));
                          setOpen(false);
                          setQ("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-3 text-left active:opacity-90",
                          b.hasGps ? "bg-emerald-50/80" : "bg-rose-50/80",
                          active && "ring-inset ring-2 ring-slate-900/10",
                        )}
                      >
                        <MapPin
                          className={cn(
                            "h-4 w-4 shrink-0",
                            b.hasGps ? "text-emerald-600" : "text-rose-500",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-sm font-semibold leading-snug",
                              b.hasGps ? "text-emerald-800" : "text-rose-800",
                            )}
                          >
                            {b.label}
                          </span>
                          {dups ? (
                            <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                              {b.managerName}
                            </span>
                          ) : null}
                        </span>
                        {active ? <Check className="h-4 w-4 shrink-0 text-slate-700" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ChecklistPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: rawBranches = [], isLoading: branchesLoading } = useAuditBranches();
  const branches = useMemo(() => normalizeAuditBranches(rawBranches), [rawBranches]);
  const { data: history = [], isLoading: historyLoading } = useBranchAudits();
  const createAudit = useCreateBranchAudit();
  const deleteAudit = useDeleteBranchAudit();

  const [managerId, setManagerId] = useState<string>("");
  const [visitDate, setVisitDate] = useState(todayIso());
  const [visitName, setVisitName] = useState("1-tashrif");
  const [monthLabel, setMonthLabel] = useState(currentMonthLabel());
  const [generalNote, setGeneralNote] = useState("");
  const [categories, setCategories] = useState<AuditCategory[]>(() =>
    createEmptyAuditTemplate(),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewing, setViewing] = useState<BranchAudit | null>(null);
  const [gps, setGps] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsWatching, setGpsWatching] = useState(false);
  const [gpsAsking, setGpsAsking] = useState(false);
  const watchRef = useRef<number | null>(null);

  const canWrite = user?.role === "koordinator" || user?.role === "admin";

  const selectedBranch = useMemo(
    () => branches.find((b) => String(b.id) === managerId) || null,
    [branches, managerId],
  );

  useEffect(() => {
    setGpsError(null);
  }, [managerId]);

  const branchHasCoords =
    selectedBranch?.latitude != null && selectedBranch?.longitude != null;

  const distanceMeters =
    gps && branchHasCoords
      ? haversineMeters(
          gps.lat,
          gps.lng,
          selectedBranch!.latitude!,
          selectedBranch!.longitude!,
        )
      : null;

  const withinGeofence =
    distanceMeters != null && distanceMeters <= AUDIT_GEOFENCE_METERS;

  const canFillChecklist =
    user?.role === "admin" || (Boolean(selectedBranch) && withinGeofence);

  const remainMeters =
    distanceMeters != null
      ? Math.max(0, distanceMeters - AUDIT_GEOFENCE_METERS)
      : null;

  const applyGps = useCallback((pos: GeolocationPosition) => {
    setGps({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    });
    setGpsError(null);
  }, []);

  const stopWatch = useCallback(() => {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setGpsWatching(false);
  }, []);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Brauzer GPS ni qo‘llab-quvvatlamaydi");
      return;
    }
    stopWatch();
    setGpsWatching(true);
    watchRef.current = navigator.geolocation.watchPosition(
      applyGps,
      (err) => {
        setGpsError(
          err.code === 1
            ? "Joylashuv ruxsati berilmadi — «Lokatsiyani yoqish» ni bosing"
            : "GPS olinmadi — ochiq joyda qayta urinib ko‘ring",
        );
        setGpsWatching(false);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
  }, [applyGps, stopWatch]);

  const requestLiveGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Brauzer GPS ni qo‘llab-quvvatlamaydi");
      return;
    }
    setGpsAsking(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyGps(pos);
        setGpsAsking(false);
        startWatch();
      },
      (err) => {
        setGpsAsking(false);
        setGpsError(
          err.code === 1
            ? "Lokatsiyaga ruxsat berilmadi — brauzerda «Ruxsat» ni tanlang"
            : "GPS olinmadi — ochiq joyda qayta urinib ko‘ring",
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, [applyGps, startWatch]);

  useEffect(() => {
    if (!selectedBranch || !branchHasCoords || !canWrite) {
      stopWatch();
      return;
    }
    requestLiveGps();
    return () => stopWatch();
  }, [selectedBranch?.id, branchHasCoords, canWrite, requestLiveGps, stopWatch]);

  const live = useMemo(() => scoreFromCategories(categories), [categories]);

  function setAnswer(catId: string, itemId: string, answer: AuditAnswer) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              items: cat.items.map((it) =>
                it.id !== itemId
                  ? it
                  : {
                      ...it,
                      // Qayta bosilsa — tanlov bekor (null)
                      answer: it.answer === answer ? null : answer,
                      note: answer === "yes" ? null : it.note,
                    },
              ),
            },
      ),
    );
  }

  function setItemNote(catId: string, itemId: string, note: string) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              items: cat.items.map((it) =>
                it.id !== itemId ? it : { ...it, note },
              ),
            },
      ),
    );
  }

  function clearAnswers() {
    setCategories(createEmptyAuditTemplate());
    setGeneralNote("");
  }

  function resetForm() {
    setManagerId("");
    setVisitDate(todayIso());
    setVisitName("1-tashrif");
    setMonthLabel(currentMonthLabel());
    setGeneralNote("");
    setCategories(createEmptyAuditTemplate());
  }

  async function handleSave() {
    if (!canWrite) {
      toast({ title: "Ruxsat yo‘q", variant: "destructive" });
      return;
    }
    if (!managerId) {
      toast({ title: "Filialni tanlang", variant: "destructive" });
      return;
    }
    if (!visitDate) {
      toast({ title: "Sanani belgilang", variant: "destructive" });
      return;
    }
    if (live.answered === 0) {
      toast({
        title: "Javob belgilang",
        description: "Kamida bitta talabga Ha yoki Yo‘q tanlang",
        variant: "destructive",
      });
      return;
    }

    const mustGps = user?.role === "koordinator";
    if (mustGps) {
      if (!branchHasCoords) {
        toast({
          title: "Filial GPS yo‘q",
          description: "Avval Aptekalar tarmog‘ida shu mudirga koordinata saqlang",
          variant: "destructive",
        });
        return;
      }
      if (!gps) {
        toast({
          title: "Joylashuv kerak",
          description: "«Lokatsiyani yoqish» ni bosing — GPS so‘raladi",
          variant: "destructive",
        });
        return;
      }
      if (!withinGeofence) {
        toast({
          title: "Filialdan uzoqdasiz",
          description: `Hozir ${formatDistance(distanceMeters ?? 0)}. Cheklist faqat ${AUDIT_GEOFENCE_METERS} m ichida ochiladi.`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await createAudit.mutateAsync({
        managerEmployeeId: parseInt(managerId, 10),
        visitDate,
        visitName,
        monthLabel,
        generalNote: generalNote.trim() || null,
        categories,
        ...(gps
          ? { checkLatitude: gps.lat, checkLongitude: gps.lng }
          : {}),
      });
      toast({
        title: "Cheklist saqlandi",
        description: `Umumiy ball: ${live.scorePercent}% (${live.yes} Ha / ${live.no} Yo‘q)`,
      });
      resetForm();
    } catch (e: any) {
      toast({
        title: "Saqlanmadi",
        description: e?.message || "Xato",
        variant: "destructive",
      });
    }
  }

  if (user?.role !== "koordinator" && user?.role !== "admin") {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <Info className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-3 text-lg font-semibold">Faqat koordinatorlar uchun</h2>
        <p className="mt-1 text-sm text-slate-500">
          Filial audit cheklistini faqat koordinator to‘ldiradi.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28 sm:space-y-6 sm:pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2e] px-4 py-5 text-white shadow-lg sm:px-6 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-amber-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 sm:px-3 sm:text-xs">
              <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Koordinator · Filial nazorati</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">
              Audit cheklist
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300 sm:mt-2 sm:max-w-xl sm:text-sm">
              Har bir filialga borib belgilangan talablarni tekshiring:{" "}
              <span className="text-emerald-300">Ha</span> yoki{" "}
              <span className="text-rose-300">Yo‘q</span>. Natija foizda
              hisoblanadi va saqlanadi.
            </p>
          </div>
          <Button
            variant="secondary"
            className="w-full shrink-0 bg-white/10 text-white hover:bg-white/20 sm:w-auto"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="mr-1.5 h-4 w-4" />
            Tarix ({history.length})
          </Button>
        </div>
      </div>

      {/* Live score strip — 2x2 on mobile */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <ScoreCard
          icon={<TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          label="Umumiy foiz"
          value={`${live.scorePercent}%`}
          valueClass={scoreTone(live.scorePercent)}
        />
        <ScoreCard
          icon={<Check className="h-3.5 w-3.5 text-emerald-600 sm:h-4 sm:w-4" />}
          label="Ha"
          value={String(live.yes)}
        />
        <ScoreCard
          icon={<X className="h-3.5 w-3.5 text-rose-600 sm:h-4 sm:w-4" />}
          label="Yo‘q"
          value={String(live.no)}
        />
        <ScoreCard
          icon={<ClipboardCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          label="Javob"
          value={`${live.answered}/${live.total}`}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="h-1.5 w-full bg-slate-100">
          <div
            className={cn("h-full transition-all duration-500", scoreBar(live.scorePercent))}
            style={{
              width: `${live.answered === 0 ? 0 : live.scorePercent}%`,
            }}
          />
        </div>

        {/* Meta form */}
        <div className="border-b px-3 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white sm:h-9 sm:w-9">
                <Store className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold sm:text-base">Tashrif ma’lumotlari</h2>
                <p className="text-[11px] text-slate-500 sm:text-xs">
                  Filial tanlang — mudir avtomatik
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={resetForm}
            >
              <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Tozalash</span>
            </Button>
          </div>

          {!branchesLoading && branches.length === 0 && (
            <p className="mb-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              Sizga biriktirilgan filial topilmadi. Aptekalar tarmog‘ida mudirlar sizning
              koordinatoringizga bog‘langan bo‘lishi kerak.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                Filialni tanlang
              </Label>
              <BranchPicker
                branches={branches}
                value={managerId}
                onChange={setManagerId}
                disabled={branchesLoading || branches.length === 0}
              />
              <p className="text-[10px] text-slate-500">
                <span className="font-medium text-emerald-700">Yashil</span> — lokatsiya kiritilgan ·{" "}
                <span className="font-medium text-rose-700">Qizil</span> — GPS yo‘q
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                Filial mudiri
              </Label>
              <div className="flex h-11 items-center gap-2 rounded-md border bg-slate-50 px-3 text-sm">
                <User className="h-4 w-4 shrink-0 text-slate-400" />
                <span className={cn("truncate", !selectedBranch && "text-slate-400")}>
                  {selectedBranch?.managerName || "Avtomatik to‘ldiriladi…"}
                </span>
              </div>
            </div>

            {selectedBranch && (
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                  Jonli lokatsiya · {AUDIT_GEOFENCE_METERS} m
                </Label>

                {!branchHasCoords ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    Bu filialga GPS saqlanmagan. Aptekalar tarmog‘ida mudir kartasiga
                    koordinata kiriting — keyin masofa hisoblanadi.
                  </div>
                ) : withinGeofence ? (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Filial hududidasiz — cheklist ochiq</p>
                      <p className="mt-0.5 text-xs text-emerald-800/80">
                        {selectedBranch.branchLocation} · masofa{" "}
                        <strong className="tabular-nums">{formatDistance(distanceMeters!)}</strong>
                        {gps?.accuracy != null ? ` · aniqlik ±${Math.round(gps.accuracy)} m` : ""}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-900">
                    <div className="flex items-start gap-2">
                      <Navigation className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {gps
                            ? "Hali belgilangan filialga yetmadingiz"
                            : gpsAsking || gpsWatching
                              ? "Joylashuv olinmoqda…"
                              : "Filialga borgach lokatsiyaga ruxsat bering"}
                        </p>
                        {gpsError ? (
                          <p className="mt-1 text-xs text-rose-700">{gpsError}</p>
                        ) : distanceMeters != null ? (
                          <p className="mt-1 text-sm">
                            Sizdan filialgacha:{" "}
                            <strong className="text-base tabular-nums">
                              {formatDistance(distanceMeters)}
                            </strong>
                            {remainMeters != null && remainMeters > 0 ? (
                              <span className="ml-1 text-xs">
                                · yana {formatDistance(remainMeters)} yaqinlashish kerak
                              </span>
                            ) : null}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-rose-700">
                            Ruxsat bersangiz, jonli masofa shu yerda chiqadi.
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-rose-700/80">
                          Cheklist faqat {AUDIT_GEOFENCE_METERS} m ichida avtomatik ochiladi.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 border-rose-300 bg-white text-rose-900"
                            onClick={requestLiveGps}
                            disabled={gpsAsking}
                          >
                            <Crosshair className="mr-1.5 h-3.5 w-3.5" />
                            {gpsAsking ? "So‘ralmoqda…" : "Lokatsiyani yoqish"}
                          </Button>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${selectedBranch.latitude},${selectedBranch.longitude}&travelmode=driving`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 text-xs font-semibold text-rose-900"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Xaritada ochish
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                Tashrif sanasi
              </Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="date"
                  className="h-11 pl-9"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                Tashrif nomi
              </Label>
              <Select value={visitName} onValueChange={setVisitName}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_NAMES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                Koordinator F.I.Sh
              </Label>
              <div className="flex h-11 items-center rounded-md border bg-slate-50 px-3 text-sm font-medium">
                <span className="truncate">{user?.fullName || "—"}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                Oy
              </Label>
              <Select value={monthLabel} onValueChange={setMonthLabel}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">
                Umumiy izoh / eslatma
              </Label>
              <Textarea
                rows={3}
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
                placeholder="Masalan: Konditsionerdan suv oqyapti — ustalarga aytilgan"
                className="min-h-[80px] text-base sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="px-3 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white sm:h-9 sm:w-9">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold sm:text-base">Audit cheklist</h2>
                <p className="text-[11px] text-slate-500 sm:text-xs">
                  Har bir bandni tanlang — boshida tanlanmagan
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10"
              onClick={clearAnswers}
              disabled={!canFillChecklist}
            >
              Tozalash
            </Button>
          </div>

          {!canFillChecklist && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              {!selectedBranch
                ? "Avval o‘z filialingizni tanlang — keyin jonli lokatsiya so‘raladi."
                : !branchHasCoords
                  ? "Bu filialga GPS saqlanmagan — cheklist yopiq."
                  : gpsError
                    ? "Joylashuv ruxsati kerak — «Lokatsiyani yoqish» ni bosing."
                    : distanceMeters != null
                      ? `Cheklist yopiq: filialdan ${formatDistance(distanceMeters)}. ${AUDIT_GEOFENCE_METERS} m ichiga kirganda avtomatik ochiladi.`
                      : "Filialga boring va lokatsiyaga ruxsat bering — 50 m ichida cheklist ochiladi."}
            </div>
          )}

          <div
            className={cn(
              !canFillChecklist && "pointer-events-none select-none opacity-45",
            )}
          >
          <Accordion
            type="multiple"
            defaultValue={categories.map((c) => c.id)}
            className="space-y-2.5 sm:space-y-3"
          >
            {categories.map((cat) => {
              const catScore = scoreFromCategories([cat]);
              return (
                <AccordionItem
                  key={cat.id}
                  value={cat.id}
                  className="overflow-hidden rounded-xl border bg-slate-50/50 px-0"
                >
                  <AccordionTrigger className="px-3 py-3 hover:no-underline sm:px-4">
                    <div className="flex w-full items-center gap-2 pr-1 text-left sm:gap-3 sm:pr-2">
                      <FolderOpen className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800 sm:text-base">
                        {cat.title}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "shrink-0 font-semibold",
                          catScore.answered === 0
                            ? "bg-slate-200 text-slate-600"
                            : scoreTone(catScore.scorePercent),
                        )}
                      >
                        {catScore.answered === 0
                          ? `${cat.items.length}`
                          : `${catScore.scorePercent}%`}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pb-3 pt-0 sm:px-3">
                    <ul className="space-y-2">
                      {cat.items.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-xl border bg-white p-3 shadow-sm"
                        >
                          <p className="text-sm font-medium leading-snug text-slate-800">
                            {item.label}
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setAnswer(cat.id, item.id, "yes")}
                              className={cn(
                                "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-all active:scale-[0.98]",
                                item.answer === "yes"
                                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50",
                              )}
                            >
                              <Check className="h-4 w-4" />
                              Ha
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnswer(cat.id, item.id, "no")}
                              className={cn(
                                "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-all active:scale-[0.98]",
                                item.answer === "no"
                                  ? "border-rose-600 bg-rose-600 text-white shadow-sm"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50",
                              )}
                            >
                              <X className="h-4 w-4" />
                              Yo‘q
                            </button>
                          </div>
                          {item.answer === "no" && (
                            <Input
                              className="mt-2 h-11 text-base sm:text-sm"
                              placeholder="Kamchilik izohi (ixtiyoriy)…"
                              value={item.note || ""}
                              onChange={(e) =>
                                setItemNote(cat.id, item.id, e.target.value)
                              }
                            />
                          )}
                          {item.answer === null && (
                            <p className="mt-2 text-[11px] text-slate-400">
                              Hali tanlanmagan
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          </div>
        </div>

        {/* Desktop footer */}
        <div className="hidden border-t bg-slate-50/80 px-6 py-4 sm:flex sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            Joriy natija:{" "}
            <span className={cn("text-lg font-bold", scoreTone(live.scorePercent))}>
              {live.scorePercent}%
            </span>
            <span className="ml-2 text-xs text-slate-400">
              ({live.yes} Ha · {live.no} Yo‘q · {live.total - live.answered} kutilyapti)
            </span>
          </div>
          <Button
            size="lg"
            onClick={() => void handleSave()}
            disabled={
              createAudit.isPending ||
              !canWrite ||
              (user?.role === "koordinator" && !canFillChecklist)
            }
            className="min-w-[160px]"
          >
            <Save className="mr-1.5 h-4 w-4" />
            {createAudit.isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </div>
      </div>

      {/* Mobile sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            Natija:{" "}
            <span className={cn("text-base font-bold", scoreTone(live.scorePercent))}>
              {live.scorePercent}%
            </span>
          </span>
          {user?.role === "koordinator" && selectedBranch ? (
            <span
              className={cn(
                "font-medium",
                canFillChecklist
                  ? "text-emerald-600"
                  : "text-rose-600",
              )}
            >
              {canFillChecklist
                ? "Hududdasiz · ochiq"
                : distanceMeters != null
                  ? formatDistance(distanceMeters)
                  : "GPS kutilmoqda"}
            </span>
          ) : (
            <span>
              {live.yes} Ha · {live.no} Yo‘q · {live.total - live.answered} qoldi
            </span>
          )}
        </div>
        <Button
          size="lg"
          className="h-12 w-full text-base"
          onClick={() => void handleSave()}
          disabled={
            createAudit.isPending ||
            !canWrite ||
            (user?.role === "koordinator" && !canFillChecklist)
          }
        >
          <Save className="mr-1.5 h-4 w-4" />
          {createAudit.isPending ? "Saqlanmoqda…" : "Saqlash"}
        </Button>
      </div>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Saqlangan auditlar</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <p className="text-sm text-slate-500">Yuklanmoqda…</p>
          ) : history.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 sm:p-8">
              Hali saqlangan cheklist yo‘q
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {a.branchLocation || "Filial"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.visitDate} · {a.visitName} · {a.managerName} ·{" "}
                      {a.monthLabel || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "font-bold",
                        a.scorePercent >= 85
                          ? "bg-emerald-100 text-emerald-700"
                          : a.scorePercent >= 70
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700",
                      )}
                    >
                      {a.scorePercent}%
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewing(a)}
                    >
                      Ko‘rish
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600"
                      onClick={() => {
                        void deleteAudit.mutateAsync(a.id).then(() => {
                          toast({ title: "O‘chirildi" });
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Yopish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View saved */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug sm:text-lg">
              {viewing?.branchLocation} — {viewing?.scorePercent}%
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <Progress value={viewing.scorePercent} className="h-2" />
              <p className="text-slate-500">
                {viewing.visitDate} · {viewing.visitName} · Mudir:{" "}
                {viewing.managerName}
              </p>
              {viewing.generalNote && (
                <p className="rounded-lg bg-slate-50 p-3">{viewing.generalNote}</p>
              )}
              {viewing.categories?.map((cat) => (
                <div key={cat.id}>
                  <p className="mb-1 font-semibold">{cat.title}</p>
                  <ul className="space-y-1">
                    {cat.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-start justify-between gap-2 rounded-md border px-2 py-1.5"
                      >
                        <span className="min-w-0 leading-snug">{it.label}</span>
                        <Badge
                          variant="secondary"
                          className={
                            it.answer === "yes"
                              ? "shrink-0 bg-emerald-100 text-emerald-700"
                              : it.answer === "no"
                                ? "shrink-0 bg-rose-100 text-rose-700"
                                : "shrink-0"
                          }
                        >
                          {it.answer === "yes"
                            ? "Ha"
                            : it.answer === "no"
                              ? "Yo‘q"
                              : "—"}
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

function ScoreCard({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border bg-white px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-4 sm:py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:gap-2 sm:text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums text-slate-900 sm:mt-1 sm:text-2xl", valueClass)}>
        {value}
      </p>
    </div>
  );
}
