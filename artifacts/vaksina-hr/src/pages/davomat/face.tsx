import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  MapPin,
  ScanFace,
  Loader2,
  CheckCircle2,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  Clock3,
  CalendarDays,
  XCircle,
  History,
  ArrowDown,
  ArrowLeft,
  Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FaceScanDialog } from "@/components/FaceScanDialog";
import { useToast } from "@/hooks/use-toast";
import { enrollFace, fetchFaceIdStatus, isFaceIdSupported } from "@/lib/face-id";
import {
  DAVOMAT_GEOFENCE_METERS,
  DAVOMAT_SITE_LABEL,
  DAVOMAT_SITE_LAT,
  DAVOMAT_SITE_LNG,
  DavomatApiError,
  facePunchDavomat,
  faceVerifyDavomat,
  fetchDavomatSite,
  fetchMyDavomat,
  fetchMyWorkplace,
  haversineMeters,
  type DavomatDayMetrics,
  type DavomatEmployee,
  type DavomatSite,
  type WorkplaceInfo,
} from "@/lib/davomat-api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { User } from "@workspace/api-client-react";
import { canViewDavomat } from "@/lib/roles";
import { roleLabel } from "@/lib/candidate-access";
import { useTelegramMiniAppChrome } from "@/pages/tg-entry";
import { formatSom, useOylikMe } from "@/lib/oylik-api";

const FACE_SNAP_KEY = "davomat-face-snap";

type Gps = { lat: number; lng: number; accuracy: number };
type Verified = {
  descriptor: number[];
  fullName: string;
  nextAction: "in" | "out" | "done";
  checkIn: string;
  checkOut: string;
  checkInAt: string | null;
  checkOutAt?: string | null;
  faceImage?: string;
  liveness?: { blinked?: boolean; poses?: string[]; motion?: number; score?: number };
};

type GuideStep = "enroll" | "permission" | "zone" | "face" | "keldim" | "ketdim" | "done";

function tashkentHour(now: number): number {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "numeric",
    hour12: false,
  }).format(new Date(now));
  return Number(raw);
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHoursUz(mins: number): string {
  const n = Math.max(0, Math.round(mins));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} daq`;
  if (m === 0) return `${h} soat`;
  return `${h} soat ${m} daq`;
}

function hmToMinutes(hm: string): number | null {
  if (!hm || hm === "—") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function workedMinutesFromPunch(params: {
  checkIn: string;
  checkOut: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
}): number | null {
  if (params.checkInAt && params.checkOutAt) {
    return Math.max(
      0,
      Math.round(
        (new Date(params.checkOutAt).getTime() - new Date(params.checkInAt).getTime()) / 60000,
      ),
    );
  }
  const a = hmToMinutes(params.checkIn);
  const b = hmToMinutes(params.checkOut);
  if (a == null || b == null) return null;
  return Math.max(0, b - a);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const STATUS_UZ: Record<string, string> = {
  present: "Kelgan",
  late: "Kech",
  incomplete: "Ketish yo‘q",
  absent: "Kelmagan",
  leave: "Ta’til",
};

const STATUS_STYLE: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-800",
  late: "bg-amber-50 text-amber-900",
  incomplete: "bg-sky-50 text-sky-800",
  absent: "bg-rose-50 text-rose-800",
  leave: "bg-violet-50 text-violet-800",
};

const WEEKDAY_UZ = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const MONTH_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function weekdayIndex(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function splitDayUz(ymd: string): { date: string; weekday: string } {
  const p = parseYmd(ymd);
  if (!p) return { date: ymd, weekday: "" };
  const week = WEEKDAY_UZ[weekdayIndex(p.y, p.m, p.d)]!;
  return {
    date: `${p.d}-${MONTH_UZ[p.m - 1]}`,
    weekday: `${week[0]!.toUpperCase()}${week.slice(1)}`,
  };
}

function formatLongDateUz(ms: number): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const week = WEEKDAY_UZ[weekdayIndex(p.y, p.m, p.d)];
  return `${week[0]!.toUpperCase()}${week.slice(1)}, ${p.d}-${MONTH_UZ[p.m - 1]} ${p.y}`;
}

function formatDistanceParts(meters: number): { value: string; unit: string } {
  if (!Number.isFinite(meters)) return { value: "—", unit: "" };
  if (Math.abs(meters) >= 1000) {
    const km = meters / 1000;
    const raw = km >= 10 ? km.toFixed(1) : km.toFixed(2);
    const value = raw.replace(/\.0$/, "").replace(/(\.\d)0$/, "$1");
    return { value, unit: "km" };
  }
  const steps = Math.max(1, Math.round(Math.abs(meters) / 0.75));
  return { value: String(steps), unit: "qadam" };
}

function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  const p = formatDistanceParts(meters);
  return `${p.value} ${p.unit}`;
}

function formatApproach(remain: number | null | undefined): string {
  if (remain == null || !Number.isFinite(remain) || remain <= 0) return "Hududdasiz";
  if (remain >= 1000) return `yana ${formatDistance(remain)} yaqinlashishingiz kerak`;
  return `yana ${formatDistanceParts(remain).value} qadam bosing`;
}

function sortDaysDesc(days: DavomatDayMetrics[]): DavomatDayMetrics[] {
  return [...days].sort((a, b) => b.date.localeCompare(a.date));
}

function MobileStepHint({
  step,
  label,
  tone = "amber",
}: {
  step: number;
  label: string;
  tone?: "amber" | "rose" | "emerald";
}) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-2 rounded-xl border px-3 py-2.5 shadow-sm",
        tone === "amber" && "border-amber-300 bg-amber-50 text-amber-950",
        tone === "rose" && "border-rose-300 bg-rose-50 text-rose-950",
        tone === "emerald" && "border-emerald-300 bg-emerald-50 text-emerald-950",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
          tone === "amber" && "bg-amber-600",
          tone === "rose" && "bg-rose-600",
          tone === "emerald" && "bg-emerald-600",
        )}
      >
        {step}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{step}-qadam</p>
        <p className="text-sm font-semibold leading-snug">{label}</p>
      </div>
      <ArrowDown className="h-4 w-4 shrink-0 animate-bounce opacity-70" aria-hidden />
    </div>
  );
}

function GuideBoard({
  active,
  faceRegistered,
  inside,
  hasGps,
  hasIn,
  afterSix,
  done,
}: {
  active: GuideStep;
  faceRegistered: boolean | null;
  inside: boolean;
  hasGps: boolean;
  hasIn: boolean;
  afterSix: boolean;
  done: boolean;
}) {
  const items: Array<{
    id: GuideStep;
    n: number;
    title: string;
    detail: string;
  }> = [
    {
      id: "enroll",
      n: 0,
      title: "Yuzni ro‘yxatdan o‘tkazing",
      detail: "Davomatdan oldin Face ID bir marta ulanishi shart",
    },
    {
      id: "permission",
      n: 1,
      title: "Ruxsat berish",
      detail: "Lokatsiya ruxsatini yoqing",
    },
    {
      id: "zone",
      n: 1,
      title: "Yashil hududga kiring",
      detail: "Belgilangan zonaga kirmasangiz — kelmagan deb belgilanadi",
    },
    {
      id: "face",
      n: 2,
      title: "Face ID ni bosing",
      detail: "Yashil hududdasiz — yuzni tasdiqlang",
    },
    {
      id: "keldim",
      n: 3,
      title: "Keldim ni bosing",
      detail: "Yuz o‘tgach kelishni belgilang",
    },
    {
      id: "ketdim",
      n: 4,
      title: "Ketdim ni bosing",
      detail: "Ishdan chiqishni belgilang (tasdiq so‘raladi)",
    },
  ];

  const visible = items.filter((it) => {
    if (it.id === "enroll") return faceRegistered === false;
    if (it.id === "zone") return faceRegistered !== false && hasGps && !inside && !hasIn && !done;
    if (it.id === "permission") return faceRegistered !== false && (!hasGps || !inside) && !hasIn && !done;
    if (it.id === "face") return faceRegistered !== false;
    if (it.id === "keldim") return faceRegistered !== false;
    if (it.id === "ketdim") return faceRegistered !== false && (hasIn || afterSix || done);
    return true;
  });

  // Deduplicate permission/zone for board display as sequential unique steps
  const board = (() => {
    const out: typeof items = [];
    const seen = new Set<number>();
    for (const it of visible) {
      if (it.id === "enroll") {
        out.push(it);
        continue;
      }
      if (it.id === "permission" || it.id === "zone") {
        if (seen.has(1)) continue;
        seen.add(1);
        out.push(
          !hasGps
            ? items.find((x) => x.id === "permission")!
            : inside
              ? items.find((x) => x.id === "permission")!
              : items.find((x) => x.id === "zone")!,
        );
        continue;
      }
      if (seen.has(it.n)) continue;
      seen.add(it.n);
      out.push(it);
    }
    return out;
  })();

  return (
    <section className="rounded-[24px] border border-[#0b3a5c]/15 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0b3a5c]/70">
            Yo‘riqnoma
          </p>
          <h2 className="mt-0.5 text-base font-bold text-[#0b3a5c]">Davomat qadamlari</h2>
          <p className="mt-1 text-xs text-slate-500">
            Har kirganingizda shu tartibda boring — aniq va tartibli
          </p>
        </div>
        {done ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            Bugun yakunlandi
          </span>
        ) : null}
      </div>
      <ol className="space-y-2">
        {board.map((it) => {
          const isActive =
            active === it.id ||
            (active === "zone" && it.id === "zone") ||
            (active === "permission" && it.id === "permission");
          const passed =
            done ||
            (it.id === "enroll" && faceRegistered) ||
            (it.n === 1 && hasGps && inside) ||
            (it.id === "face" && (Boolean(hasIn) || active === "keldim" || active === "ketdim")) ||
            (it.id === "keldim" && hasIn) ||
            (it.id === "ketdim" && done);

          return (
            <li
              key={`${it.id}-${it.n}`}
              className={cn(
                "flex gap-3 rounded-2xl border px-3 py-2.5 transition-colors",
                isActive && !passed && "border-amber-300 bg-amber-50 shadow-sm",
                passed && "border-emerald-200 bg-emerald-50/70",
                !isActive && !passed && "border-slate-100 bg-slate-50/80",
                it.id === "zone" && isActive && "border-rose-300 bg-rose-50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  passed && "bg-emerald-600 text-white",
                  isActive && !passed && it.id === "zone" && "bg-rose-600 text-white",
                  isActive && !passed && it.id !== "zone" && "bg-amber-500 text-white",
                  !isActive && !passed && "bg-slate-200 text-slate-600",
                )}
              >
                {passed ? "✓" : it.n === 0 ? "!" : it.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {it.n === 0 ? "Avval" : `${it.n}-qadam`}: {it.title}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xs leading-snug",
                    it.id === "zone" && isActive ? "font-medium text-rose-700" : "text-slate-500",
                  )}
                >
                  {it.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {active === "zone" ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-semibold text-rose-800">
          Yashil hududga kirmasangiz — bugun kelmagan deb belgilanasiz
        </p>
      ) : null}
      {active === "ketdim" ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-semibold text-rose-800">
          4-qadam: «Ketdim» ni bosing — tasdiqlang
        </p>
      ) : null}
    </section>
  );
}

function isTelegramMiniAppContext(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Telegram?.WebApp) return true;
  try {
    return new URL(window.location.href).searchParams.get("tg") === "1";
  } catch {
    return false;
  }
}

export default function DavomatFacePage() {
  const { user, isAuthenticated, switchToUser } = useAuth();
  const [, setLocation] = useLocation();
  const oylikMe = useOylikMe();
  const isTgMiniApp = useMemo(() => isTelegramMiniAppContext(), []);
  useTelegramMiniAppChrome();
  const { toast } = useToast();
  const canReport = canViewDavomat(user?.role);
  const [gps, setGps] = useState<Gps | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsSharing, setGpsSharing] = useState(false);
  const [site, setSite] = useState<DavomatSite>({
    allowedMeters: DAVOMAT_GEOFENCE_METERS,
    label: DAVOMAT_SITE_LABEL,
    latitude: DAVOMAT_SITE_LAT,
    longitude: DAVOMAT_SITE_LNG,
  });
  const [workplace, setWorkplace] = useState<WorkplaceInfo | null>(null);
  const [historyDays, setHistoryDays] = useState<DavomatDayMetrics[]>([]);
  const [historyRange, setHistoryRange] = useState<"day" | "week" | "month">("week");
  const [faceRegistered, setFaceRegistered] = useState<boolean | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [faceImage, setFaceImage] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(FACE_SNAP_KEY);
    } catch {
      return null;
    }
  });
  const watchRef = useRef<number | null>(null);
  const punchLockRef = useRef(false);
  const tgBootRef = useRef(false);
  const tgScanRef = useRef(false);

  const applyHistory = useCallback((emp?: DavomatEmployee | null) => {
    if (!emp?.days?.length) return;
    setHistoryDays(sortDaysDesc(emp.days));
  }, []);

  const refreshFaceStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setFaceRegistered(null);
      return;
    }
    try {
      const s = await fetchFaceIdStatus();
      setFaceRegistered(s.registered);
    } catch {
      setFaceRegistered(null);
    }
  }, [isAuthenticated]);

  const loadWorkplace = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkplace(null);
      return;
    }
    try {
      const w = await fetchMyWorkplace();
      setWorkplace(w);
    } catch {
      setWorkplace(null);
    }
  }, [isAuthenticated]);

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const mine = await fetchMyDavomat();
      applyHistory(mine.employee);
    } catch {
      /* Face ID dan keyin ham keladi */
    }
  }, [isAuthenticated, applyHistory]);

  useEffect(() => {
    void fetchDavomatSite().then(setSite);
  }, []);

  useEffect(() => {
    if (!workplace?.site) return;
    if (
      typeof workplace.site.latitude !== "number" ||
      typeof workplace.site.longitude !== "number"
    ) {
      return;
    }
    setSite({
      allowedMeters: workplace.allowedMeters || DAVOMAT_GEOFENCE_METERS,
      label: workplace.site.label,
      latitude: workplace.site.latitude,
      longitude: workplace.site.longitude,
    });
  }, [workplace]);

  useEffect(() => {
    void loadWorkplace();
  }, [loadWorkplace]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    void refreshFaceStatus();
  }, [refreshFaceStatus]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const applyGps = (pos: GeolocationPosition) => {
    setGps({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy || 0),
    });
    setGpsError(null);
  };

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) return;
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      applyGps,
      (err) => {
        setGpsError(
          err.code === 1
            ? "Lokatsiyaga ruxsat berilmadi — tugmani bosing va Ruxsatni tanlang"
            : "GPS olinmadi — ochiq joyda qayta urinib ko‘ring",
        );
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Brauzer GPS ni qo‘llab-quvvatlamaydi");
    }
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  const requestLocationPermission = async () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS yo‘q", description: "Brauzer lokatsiyani qo‘llab-quvvatlamaydi", variant: "destructive" });
      return;
    }
    setGpsSharing(true);
    try {
      const permissions = navigator.permissions;
      if (permissions?.query) {
        const status = await permissions.query({ name: "geolocation" });
        if (status.state === "denied") {
          const msg =
            "Brauzer lokatsiyani bloklagan. Manzil qatoridagi qulfni bosing va «Joylashuv»ga ruxsat bering.";
          setGpsError(msg);
          toast({ title: "Ruxsat yo‘q", description: msg, variant: "destructive" });
          setGpsSharing(false);
          return;
        }
      }
    } catch {
      /* Permissions API yo‘q — getCurrentPosition o‘zi so‘raydi */
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyGps(pos);
        startWatch();
        setGpsSharing(false);
        toast({
          title: "Ruxsat berildi",
          description: `Lokatsiya ochiq · ±${Math.round(pos.coords.accuracy || 0)} m`,
        });
      },
      (err) => {
        setGpsSharing(false);
        const msg =
          err.code === 1
            ? "Lokatsiyaga ruxsat so‘raldi — brauzer oynasida «Ruxsat» ni bosing"
            : "GPS olinmadi — ochiq joyda qayta urinib ko‘ring";
        setGpsError(msg);
        toast({ title: "Ruxsat olinmadi", description: msg, variant: "destructive" });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  };

  const checkInAtIso = verified?.checkInAt || workplace?.today.checkInAt || null;
  const working = Boolean(checkInAtIso) && !(verified?.nextAction === "done" || workplace?.today.complete);

  const elapsedLabel = useMemo(() => {
    if (!checkInAtIso) return "0:00:00";
    return formatElapsed(nowTick - new Date(checkInAtIso).getTime());
  }, [checkInAtIso, nowTick]);

  const clockLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("uz-UZ", {
        timeZone: "Asia/Tashkent",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(nowTick),
    [nowTick],
  );

  const dateLabel = useMemo(() => formatLongDateUz(nowTick), [nowTick]);

  const distance = useMemo(() => {
    if (!gps) return null;
    return haversineMeters(gps.lat, gps.lng, site.latitude, site.longitude);
  }, [gps, site.latitude, site.longitude]);

  const allowedMeters = workplace?.allowedMeters || site.allowedMeters || DAVOMAT_GEOFENCE_METERS;
  const remain = distance != null ? Math.max(0, distance - allowedMeters) : null;
  /** Filial GPS yo‘q bo‘lsa ofis nuqtasiga tushib «Hududdasiz» deb yolg‘on yashil ko‘rsatilmasin */
  const workplaceGpsMissing = workplace?.employee.hasGps === false;
  const inside =
    !workplaceGpsMissing && distance != null ? distance <= allowedMeters : false;

  /**
   * Face ID skani login talab qilmaydi (yuz → profil).
   * faceRegistered === true kutish — login yo‘q / status 401 bo‘lsa tugma abadiy yopiq qolardi.
   */
  const canOpenFace =
    faceRegistered !== false &&
    Boolean(gps) &&
    !gpsError &&
    isFaceIdSupported() &&
    inside;

  const nextAction = verified?.nextAction || workplace?.today.nextAction || "in";
  const done = nextAction === "done" || workplace?.today.complete;
  const hasIn = nextAction === "out" || done || Boolean(checkInAtIso);
  const afterSix = tashkentHour(nowTick) >= 18;

  const guideStep = useMemo((): GuideStep => {
    if (done) return "done";
    if (faceRegistered === false) return "enroll";
    if (!gps || gpsError) return "permission";
    if (!inside) return "zone";
    if (!verified) return "face";
    if (!hasIn) return "keldim";
    return "ketdim";
  }, [done, faceRegistered, gps, gpsError, inside, verified, hasIn]);

  /** Mobil: doim aktiv qadamni ko‘rsat; desktopda ham panel ochiq */
  const showGuide = guideStep !== "done";

  const todayStatus = done
    ? "complete"
    : hasIn
      ? workplace?.today.status || "present"
      : gpsError
        ? "no_gps"
        : !gps
          ? "waiting_gps"
          : inside
            ? "inside"
            : "outside";

  const holatLabel =
    todayStatus === "complete"
      ? "Bugun yopilgan"
      : hasIn
        ? STATUS_UZ[workplace?.today.status || "present"] || "Ishda"
        : todayStatus === "inside"
          ? "Hududda"
          : todayStatus === "outside"
            ? "Hududdan tashqarida"
            : todayStatus === "no_gps"
              ? "Lokatsiya yo‘q"
              : "GPS kutilmoqda";

  const faceLockedReason = useMemo(() => {
    if (faceRegistered === false) return "Avval yuzni ro‘yxatdan o‘tkazing";
    if (gpsError) return gpsError;
    if (!gps) return "1-qadam: «Ruxsat berish» ni bosing";
    if (!isFaceIdSupported()) return "Face ID bu brauzerda ishlamaydi (HTTPS/localhost kerak)";
    if (workplaceGpsMissing) {
      return (
        workplace?.gpsError ||
        "Filial lokatsiyasi kiritilmagan. Koordinator avval GPS kiritsin."
      );
    }
    if (remain != null && remain > 0) {
      return `Yashil hududga kirmadingiz (${formatDistance(distance)}). Kelmagan deb belgilanasiz. ${formatApproach(remain)}.`;
    }
    return null;
  }, [faceRegistered, gps, gpsError, remain, distance, workplaceGpsMissing, workplace?.gpsError]);

  useEffect(() => {
    if (!isTgMiniApp || tgBootRef.current) return;
    tgBootRef.current = true;
    void requestLocationPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTgMiniApp]);

  useEffect(() => {
    if (!isTgMiniApp || tgScanRef.current || done || verified || faceRegistered === false) return;
    if (canOpenFace) {
      tgScanRef.current = true;
      setScanOpen(true);
    }
  }, [isTgMiniApp, canOpenFace, done, verified, faceRegistered]);

  const geoPayload = () => {
    if (!gps) throw new Error("GPS yo‘q");
    return { latitude: gps.lat, longitude: gps.lng, accuracy: gps.accuracy };
  };

  const saveFaceImage = (snap?: string) => {
    if (!snap) return;
    setFaceImage(snap);
    try {
      sessionStorage.setItem(FACE_SNAP_KEY, snap);
    } catch {
      /* ignore quota */
    }
  };

  const adoptRecognizedProfile = useCallback(
    (sessionUser: User | null | undefined, fullName: string) => {
      if (!sessionUser?.id) return;
      switchToUser(sessionUser as User);
      toast({
        title: fullName || sessionUser.fullName,
        description: "Yuz aniqlandi — tizim shu profilga o‘tdi",
      });
    },
    [switchToUser, toast],
  );

  const onCaptured = async (
    descriptor: number[] | number[][],
    snapshot?: string,
    liveness?: { blinked?: boolean; poses?: string[]; motion?: number; score?: number },
  ) => {
    if (!gps) throw new Error("GPS yo‘q");
    if (!inside) {
      throw new Error(`Hududdan tashqarida (${formatDistance(distance)}). Yana ${formatDistance(remain)} yaqinlashing.`);
    }
    try {
      const list = (Array.isArray(descriptor[0]) ? descriptor : [descriptor]) as number[][];
      const vec = list[0]!;
      const result = await faceVerifyDavomat({
        descriptor: vec,
        descriptors: list,
        snapshot,
        liveness,
        ...geoPayload(),
      });
      saveFaceImage(snapshot);
      setVerified({
        descriptor: vec,
        fullName: result.fullName,
        nextAction: result.nextAction,
        checkIn: result.checkIn,
        checkOut: result.checkOut,
        checkInAt: result.checkInAt,
        checkOutAt: result.checkOutAt,
        faceImage: snapshot,
        liveness,
      });
      applyHistory(result.employee);
      if (result.user) {
        adoptRecognizedProfile(result.user as User, result.fullName);
        // Yangi sessiya uchun ish joyi / tarix
        void loadWorkplace();
        void loadHistory();
      } else {
        toast({
          title: result.fullName,
          description:
            result.nextAction === "done"
              ? "Bugun Keldim va Ketdim allaqachon belgilangan"
              : result.nextAction === "out"
                ? "Bugun Keldim belgilangan — faqat Ketdim qolgan"
                : "Yuz tasdiqlandi — Keldim ni bosing",
        });
      }
      return { fullName: result.fullName };
    } catch (err) {
      if (err instanceof DavomatApiError && err.code === "outside_geofence") {
        if (
          err.workplace &&
          typeof err.workplace.latitude === "number" &&
          typeof err.workplace.longitude === "number"
        ) {
          setSite({
            allowedMeters: err.allowedMeters || DAVOMAT_GEOFENCE_METERS,
            label: err.workplace.location || site.label,
            latitude: err.workplace.latitude,
            longitude: err.workplace.longitude,
          });
        }
        const text =
          err.remainMeters != null && err.remainMeters < 1000
            ? formatApproach(err.remainMeters)
            : err.distanceMeters != null
              ? `Siz ${formatDistance(err.distanceMeters)} uzoqdasiz. ${formatApproach(err.remainMeters)}.`
              : err.message || "Hududdan tashqarida";
        toast({ title: "Hududdan tashqarida", description: text, variant: "destructive" });
        throw new Error(text);
      }
      if (err instanceof DavomatApiError && err.code === "branch_gps_missing") {
        toast({ title: "Filial GPS yo‘q", description: err.message, variant: "destructive" });
        throw err;
      }
      throw err;
    }
  };

  const punch = async (action: "in" | "out") => {
    if (!verified || !gps) return;
    if (punchLockRef.current || busy) return;
    punchLockRef.current = true;
    setBusy(true);
    try {
      const result = await facePunchDavomat({
        descriptor: verified.descriptor,
        ...geoPayload(),
        action,
        snapshot: verified.faceImage,
        liveness: verified.liveness,
      });
      setVerified({
        ...verified,
        nextAction: action === "in" ? "out" : "done",
        checkIn: result.checkIn,
        checkOut: result.checkOut,
        checkInAt: result.checkInAt ?? verified.checkInAt,
        checkOutAt: result.checkOutAt ?? verified.checkOutAt,
      });
      if (result.user) {
        adoptRecognizedProfile(result.user as User, result.fullName || verified.fullName);
      }
      toast({
        title: action === "in" ? "Keldim" : "Ketdi",
        description: result.message,
      });
      if (action === "in") {
        /* guide stays live for Ketdim */
      }
      applyHistory(result.employee);
      await loadWorkplace();
      await loadHistory();
    } catch (err) {
      if (
        err instanceof DavomatApiError &&
        (err.code === "already_in" || err.code === "already_complete")
      ) {
        setVerified({
          ...verified,
          nextAction: err.code === "already_complete" ? "done" : "out",
          checkIn: err.checkIn || verified.checkIn,
          checkOut: err.checkOut || verified.checkOut,
          checkInAt: err.checkInAt || verified.checkInAt,
          checkOutAt: err.checkOutAt || verified.checkOutAt,
        });
        toast({ title: "Allaqachon belgilangan", description: err.message });
        await loadWorkplace();
        await loadHistory();
        return;
      }
      toast({
        title: "Xatolik",
        description: (err as Error)?.message,
        variant: "destructive",
      });
    } finally {
      punchLockRef.current = false;
      setBusy(false);
      setConfirmOut(false);
    }
  };

  const displayName =
    verified?.fullName || workplace?.employee.fullName || user?.fullName || "Xodim";
  const position = roleLabel(user?.role) || "Xodim";
  const department = user?.departmentName;
  const phone = user?.phone;
  const shownFace = verified?.faceImage || faceImage;
  const dayComplete = !verified && Boolean(workplace?.today.complete);
  const checkInLabel = verified?.checkIn || workplace?.today.checkIn || "—";
  const checkOutLabel = verified?.checkOut || workplace?.today.checkOut || "—";
  const closedWork = done
    ? workedMinutesFromPunch({
        checkIn: checkInLabel,
        checkOut: checkOutLabel,
        checkInAt: verified?.checkInAt || workplace?.today.checkInAt,
        checkOutAt: verified?.checkOutAt || workplace?.today.checkOutAt,
      })
    : null;
  const todayStamp =
    workplace?.workDate ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(nowTick);

  const filteredHistoryDays = useMemo(() => {
    const sorted = sortDaysDesc(historyDays);
    if (historyRange === "day") {
      return sorted.filter((d) => d.date === todayStamp).slice(0, 1);
    }
    if (historyRange === "week") {
      return sorted.slice(0, 7);
    }
    return sorted.slice(0, 31);
  }, [historyDays, historyRange, todayStamp]);

  const historySummary = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let minutes = 0;
    for (const d of filteredHistoryDays) {
      if (d.status === "present") present += 1;
      else if (d.status === "late") late += 1;
      else if (d.status === "absent") absent += 1;
      const w =
        d.checkIn !== "—" && d.checkOut !== "—"
          ? workedMinutesFromPunch({ checkIn: d.checkIn, checkOut: d.checkOut })
          : null;
      if (w != null) minutes += w;
      else if (typeof d.workedMinutes === "number") minutes += d.workedMinutes;
    }
    return { present, late, absent, minutes, count: filteredHistoryDays.length };
  }, [filteredHistoryDays]);

  const ringClass = inside
    ? "ring-4 ring-emerald-400/80"
    : gps
      ? "ring-4 ring-rose-400/80"
      : "ring-4 ring-white/40";

  const locationReady = Boolean(gps) && inside && !gpsError && faceRegistered !== false;
  const showFaceStep =
    faceRegistered !== false &&
    (locationReady || Boolean(verified) || Boolean(gps) || (hasIn && !done));
  const showPunchStep = Boolean(verified) && !done && !dayComplete;
  const canPunchOut = hasIn && !done;

  const onEnrollCaptured = async (
    descriptor: number[] | number[][],
    snapshot?: string,
    liveness?: { blinked?: boolean; poses?: string[]; motion?: number; score?: number },
  ) => {
    await enrollFace(descriptor, snapshot, liveness);
    setFaceRegistered(true);
    saveFaceImage(snapshot);
    toast({
      title: "Yuz ro‘yxatdan o‘tdi",
      description: "Endi 1-qadamdan davomatni boshlang",
    });
    await refreshFaceStatus();
  };

  return (
    <div className="min-h-[100dvh] bg-[linear-gradient(180deg,#e8f1f7_0%,#f8fafc_42%,#ffffff_100%)]">
      <div className="mx-auto max-w-lg px-3 pb-10 pt-4 sm:px-4 md:max-w-3xl lg:max-w-4xl">
        <section className="overflow-hidden rounded-[28px] bg-[#0b3a5c] text-white shadow-[0_20px_50px_-24px_rgba(11,58,92,0.7)]">
          <div className="relative px-5 pb-6 pt-5">
            <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-sky-300/10" />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={user?.role === "stajyor" ? "/kirish" : "/dashboard"}
                  className="mb-2.5 inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/25"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Chiqish
                </Link>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sky-200/90">
                  {isTgMiniApp ? "Telegram · Davomat" : "Davomat"}
                </p>
                <div className="mt-1 flex items-center gap-2 text-sky-100/90">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span className="text-xs">{dateLabel}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-white/10 px-3 py-2 text-right backdrop-blur-sm">
                <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wide text-sky-200">
                  <Clock3 className="h-3 w-3" />
                  Ayni vaqt
                </div>
                <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums leading-none">{clockLabel}</div>
              </div>
            </div>

            <div className="relative mt-6 flex items-center gap-4">
              <div className={cn("relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full bg-white/15", ringClass)}>
                {shownFace ? (
                  <img src={shownFace} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white">
                    {initials(displayName)}
                  </div>
                )}
                <span
                  className={cn(
                    "absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-[#0b3a5c]",
                    inside ? "bg-emerald-400" : gps ? "bg-rose-500" : "bg-slate-300",
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-semibold leading-tight">{displayName}</h1>
                <p className="mt-0.5 truncate text-sm text-sky-100/90">{position}</p>
                {department ? <p className="truncate text-xs text-sky-200/80">{department}</p> : null}
                <div className="mt-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                      done || todayStatus === "complete"
                        ? "bg-white/15 text-white"
                        : hasIn
                          ? "bg-emerald-400/20 text-emerald-100"
                          : inside
                            ? "bg-emerald-400/20 text-emerald-100"
                            : "bg-rose-400/25 text-rose-100",
                    )}
                  >
                    Holat: {holatLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-2xl bg-emerald-500/20 px-3 py-2">
                <div className="text-emerald-200">Keldim</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-50">
                  {verified?.checkIn || workplace?.today.checkIn || "—"}
                </div>
              </div>
              <div className="rounded-2xl bg-rose-500/20 px-3 py-2">
                <div className="text-rose-200">Ketdim</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums text-rose-50">
                  {verified?.checkOut || workplace?.today.checkOut || "—"}
                </div>
              </div>
            </div>
            {phone ? (
              <p className="relative mt-2 text-[11px] text-sky-200/80">Tel: {phone}</p>
            ) : null}
          </div>
        </section>

        <div className="mt-4">
          <GuideBoard
            active={guideStep}
            faceRegistered={faceRegistered}
            inside={inside}
            hasGps={Boolean(gps) && !gpsError}
            hasIn={hasIn}
            afterSix={afterSix}
            done={Boolean(done)}
          />
        </div>

        {faceRegistered === false ? (
          <section className="mt-4 rounded-[24px] border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
                !
              </span>
              <h2 className="text-sm font-semibold text-amber-950">Avval yuzni ro‘yxatdan o‘tkazing</h2>
            </div>
            {showGuide && guideStep === "enroll" ? (
              <MobileStepHint step={0} label="Face ID ni ulashni bosing" tone="amber" />
            ) : null}
            <p className="mb-3 text-sm text-amber-900/80">
              Davomat qilishdan oldin bir marta Face ID ulashing. Keyin yo‘riqnoma 1–4 qadam bilan ochiladi.
            </p>
            <Button
              type="button"
              size="lg"
              className={cn(
                "h-14 w-full gap-2 rounded-2xl bg-[#0b3a5c] text-base hover:bg-[#0a314d]",
                showGuide && guideStep === "enroll" && "ring-2 ring-amber-400 ring-offset-2",
              )}
              disabled={!isFaceIdSupported()}
              onClick={() => setEnrollOpen(true)}
            >
              <ScanFace className="h-5 w-5" />
              Face ID ni ulash
            </Button>
            {!isFaceIdSupported() ? (
              <p className="mt-2 text-center text-xs text-amber-800">Kamera va HTTPS/localhost kerak</p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0b3a5c] text-[11px] font-bold text-white">
              1
            </span>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0b3a5c]">
                <MapPin className="h-4 w-4" />
                Joylashuv
              </div>
            <div className="relative shrink-0">
              {showGuide && guideStep === "permission" ? (
                <MobileStepHint step={1} label="Ruxsat berish ni bosing" tone="amber" />
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "h-9 gap-1.5 rounded-full border-[#0b3a5c]/20 text-[#0b3a5c]",
                  showGuide && guideStep === "permission" && "ring-2 ring-amber-400 ring-offset-2",
                )}
                disabled={gpsSharing || faceRegistered === false}
                onClick={() => void requestLocationPermission()}
              >
                {gpsSharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Ruxsat berish
              </Button>
            </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-3">
            <div
              className={cn(
                "flex h-16 w-16 flex-col items-center justify-center rounded-2xl text-center",
                inside ? "bg-emerald-50 text-emerald-800" : gps ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-500",
              )}
            >
              {gps && distance != null ? (
                <>
                  <span className="text-lg font-semibold tabular-nums leading-none">
                    {formatDistanceParts(distance).value}
                  </span>
                  <span className="text-[10px]">{formatDistanceParts(distance).unit}</span>
                </>
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
            </div>
            <div className="min-w-0 text-sm">
              {inside ? (
                <p className="font-medium text-emerald-800">
                  <CheckCircle2 className="mr-1 inline h-4 w-4" />
                  Hududdasiz
                </p>
              ) : gps && remain != null ? (
                <p className="font-medium text-rose-800">
                  <XCircle className="mr-1 inline h-4 w-4" />
                  Hududdan tashqarida
                </p>
              ) : (
                <p className="text-slate-500">«Ruxsat berish» ni bosing — lokatsiya so‘raladi</p>
              )}
              <p className="mt-0.5 text-xs text-slate-500">
                {workplace?.site?.kind === "branch" ? "Belgilangan filial" : "Asosiy ofis"} · ruxsat {allowedMeters} m
              </p>
              {workplace?.shift ? (
                <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-950">
                  {workplace.shift.label}: {workplace.shift.start}–{workplace.shift.end}. Kechikish — jarima.
                </p>
              ) : null}
              {site.label ? (
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{site.label}</p>
              ) : null}
              {gps ? (
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} · ±{gps.accuracy} m
                </p>
              ) : null}
            </div>
          </div>

          {workplace && workplace.employee.hasGps === false ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950">
              {workplace.gpsError ||
                "Filial lokatsiyasi kiritilmagan. Koordinator GPS kiritsin."}
            </p>
          ) : null}

          {gps && distance != null ? (
            <div
              className={cn(
                "mt-3 rounded-2xl border px-3 py-2.5 text-center text-sm font-medium",
                inside
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800",
              )}
            >
              {inside ? (
                <>
                  <CheckCircle2 className="mr-1 inline h-4 w-4" />
                  Hududdasiz · {formatDistance(distance)} (ruxsat {allowedMeters} m)
                </>
              ) : (
                <>
                  <XCircle className="mr-1 inline h-4 w-4" />
                  Siz {formatDistance(distance)} uzoqdasiz · {formatApproach(remain)}
                  <span className="mt-1 block text-sm font-semibold text-rose-800">
                    Yashil hududga kirmasangiz — kelmagan deb belgilanasiz
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-rose-700">
                    Davomat faqat {workplace?.site?.kind === "branch" ? "filial" : "asosiy ofis"}dan{" "}
                    {allowedMeters} m ichida
                  </span>
                </>
              )}
            </div>
          ) : null}

          {showGuide && guideStep === "zone" ? (
            <div className="mt-3">
              <MobileStepHint
                step={1}
                label="Yashil hududga kiring — aks holda kelmagan"
                tone="rose"
              />
            </div>
          ) : null}

          {gpsError ? <p className="mt-2 text-sm text-rose-600">{gpsError}</p> : null}
          {locationReady ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Joylashuv tasdiqlandi — keyingi qadam: Face ID
            </p>
          ) : null}
        </section>

        {showFaceStep ? (
          <section className="mt-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0b3a5c] text-[11px] font-bold text-white">
                2
              </span>
              <h2 className="text-sm font-semibold text-[#0b3a5c]">Face ID</h2>
            </div>
            {verified ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Yuz tasdiqlandi</p>
                    <p className="text-xs text-emerald-700">{verified.fullName}</p>
                    <p className="mt-0.5 text-[11px] text-emerald-600">
                      Tizim shu xodim profiliga o‘tdi
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2 rounded-2xl border-[#0b3a5c]/30 text-[#0b3a5c]"
                  onClick={() => {
                    const role = user?.role;
                    setLocation(role === "stajyor" ? "/kirish" : "/dashboard");
                  }}
                >
                  <LogIn className="h-4 w-4" />
                  {verified.fullName} profiliga o‘tish
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {showGuide && guideStep === "face" ? (
                  <MobileStepHint step={2} label="Face ID ni bosing" tone="amber" />
                ) : null}
                {guideStep === "zone" || (gps && !inside) ? (
                  <p className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-center text-sm font-semibold text-rose-800">
                    2-qadam yopiq: avval yashil hududga kiring. Aks holda kelmagan deb belgilanasiz.
                  </p>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  className={cn(
                    "h-14 w-full gap-2 rounded-2xl bg-[#0b3a5c] text-base hover:bg-[#0a314d]",
                    showGuide && guideStep === "face" && "ring-2 ring-amber-400 ring-offset-2",
                  )}
                  disabled={!canOpenFace}
                  onClick={() => setScanOpen(true)}
                >
                  {canOpenFace ? <ScanFace className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                  {canOpenFace ? "Face ID" : "Face ID yopiq"}
                </Button>
                {!canOpenFace && faceLockedReason ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm text-rose-800">
                    {faceLockedReason}
                  </p>
                ) : (
                  <p className="text-center text-xs text-slate-500">
                    3-qadam: yuz tasdiqlangach «Keldim» ni bosing
                  </p>
                )}
              </div>
            )}
          </section>
        ) : null}

        {showPunchStep ? (
          <section className="mt-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0b3a5c] text-[11px] font-bold text-white">
                {hasIn ? 4 : 3}
              </span>
              <h2 className="text-sm font-semibold text-[#0b3a5c]">
                {hasIn ? "Ketdim" : "Keldim"}
              </h2>
            </div>
            {hasIn ? (
              <div className="space-y-3">
                {showGuide && guideStep === "ketdim" ? (
                  <MobileStepHint step={4} label="Ketdim ni bosing" tone="rose" />
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  className={cn(
                    "h-14 w-full gap-2 rounded-2xl bg-red-600 text-base text-white hover:bg-red-700",
                    showGuide && guideStep === "ketdim" && "ring-2 ring-rose-400 ring-offset-2",
                  )}
                  disabled={busy || !canPunchOut}
                  onClick={() => setConfirmOut(true)}
                >
                  <LogOut className="h-5 w-5" />
                  Ketdim
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Bosilganda ketishni tasdiqlash so‘raladi. 18:00 dan oldin ham chiqish mumkin.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {showGuide && guideStep === "keldim" ? (
                  <MobileStepHint step={3} label="Keldim ni bosing" tone="emerald" />
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  className={cn(
                    "h-14 w-full gap-2 rounded-2xl bg-emerald-600 text-base text-white hover:bg-emerald-700",
                    showGuide && guideStep === "keldim" && "ring-2 ring-amber-400 ring-offset-2",
                  )}
                  disabled={busy}
                  onClick={() => void punch("in")}
                >
                  <LogIn className="h-5 w-5" />
                  Keldim
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Keldim dan keyin «Ketdim» ochiladi — tasdiqlab chiqishingiz mumkin
                </p>
              </div>
            )}
          </section>
        ) : null}

        {working ? (
          <section className="mt-4 rounded-[24px] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Ishlayotgan vaqt</p>
            <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-emerald-950">{elapsedLabel}</p>
            <p className="mt-1 text-xs text-emerald-700">Keldim: {verified?.checkIn || workplace?.today.checkIn}</p>
          </section>
        ) : null}

        <section className="mt-4 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[#0b3a5c]">Bugungi davomatim</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarDays className="h-3.5 w-3.5" />
                {dateLabel}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                done
                  ? "bg-slate-100 text-slate-600"
                  : hasIn
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-slate-50 text-slate-500",
              )}
            >
              {holatLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <LogIn className="h-3.5 w-3.5" />
                Keldim
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-950">
                {checkInLabel}
              </div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700">
                <LogOut className="h-3.5 w-3.5" />
                Ketdim
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-rose-950">
                {checkOutLabel}
              </div>
            </div>
          </div>
          {done && closedWork != null ? (
            <div className="mx-4 mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Ishlangan vaqt</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0b3a5c]">
                {formatHoursUz(closedWork)}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Kuniga faqat 1 marta Keldim va 1 marta Ketdim
              </p>
            </div>
          ) : done ? (
            <p className="px-4 pb-3 text-center text-xs text-slate-400">
              Kuniga faqat 1 marta Keldim va 1 marta Ketdim
            </p>
          ) : null}
        </section>

        <section className="mt-3 overflow-hidden rounded-xl border border-slate-300/80 bg-white shadow-sm md:rounded-lg">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/90 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0b3a5c]">
                <History className="h-3.5 w-3.5 shrink-0" />
                {isTgMiniApp ? "Davomat holati" : "Tarix"}
              </h2>
              <p className="mt-0.5 text-[10px] leading-tight text-slate-500 sm:text-[11px]">
                {historyRange === "day"
                  ? "Bugungi kun"
                  : historyRange === "week"
                    ? "So‘nggi 7 kun"
                    : "So‘nggi 31 kun"}
                {" · "}
                {historySummary.count} qator
                {historySummary.minutes > 0
                  ? ` · jami ${formatHoursUz(historySummary.minutes)}`
                  : ""}
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 sm:inline-flex sm:w-auto"
              role="tablist"
              aria-label="Davomat oralig‘i"
            >
              {(
                [
                  { id: "day" as const, label: "Kunlik" },
                  { id: "week" as const, label: "Haftalik" },
                  { id: "month" as const, label: "Oylik" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={historyRange === opt.id}
                  onClick={() => setHistoryRange(opt.id)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-xs",
                    historyRange === opt.id
                      ? "bg-[#0b3a5c] text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {historyDays.length === 0 ? (
            <p className="px-3 py-5 text-center text-xs text-slate-400 sm:text-sm">
              Hali yozuv yo‘q. Face ID bilan belgilang — tarix shu yerda chiqadi.
            </p>
          ) : filteredHistoryDays.length === 0 ? (
            <p className="px-3 py-5 text-center text-xs text-slate-400 sm:text-sm">
              Tanlangan oralikda yozuv yo‘q.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-2.5 py-1.5 text-[10px] sm:px-3 sm:text-[11px]">
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">
                  Kelgan {historySummary.present}
                </span>
                <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">
                  Kech {historySummary.late}
                </span>
                <span className="rounded bg-rose-50 px-1.5 py-0.5 font-medium text-rose-800">
                  Kelmagan {historySummary.absent}
                </span>
              </div>

              {/* Mobile: compact sheet rows */}
              <div
                className={cn(
                  "md:hidden overflow-y-auto overscroll-contain",
                  historyRange === "day" ? "max-h-[220px]" : "max-h-[280px]",
                )}
              >
                <table className="w-full border-collapse text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#eef2f6] shadow-[inset_0_-1px_0_#cbd5e1]">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      <th className="border-r border-slate-200 px-2 py-1.5">Sana</th>
                      <th className="border-r border-slate-200 px-1.5 py-1.5 text-center">Kel</th>
                      <th className="border-r border-slate-200 px-1.5 py-1.5 text-center">Ket</th>
                      <th className="border-r border-slate-200 px-1.5 py-1.5 text-center">Holat</th>
                      <th className="px-1.5 py-1.5 text-right">Vaqt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryDays.map((d, i) => {
                      const isToday = d.date === todayStamp;
                      const dayParts = splitDayUz(d.date);
                      const worked =
                        d.checkIn !== "—" && d.checkOut !== "—"
                          ? workedMinutesFromPunch({
                              checkIn: d.checkIn,
                              checkOut: d.checkOut,
                            })
                          : null;
                      return (
                        <tr
                          key={d.date}
                          className={cn(
                            "border-b border-slate-100",
                            isToday
                              ? "bg-sky-50"
                              : i % 2 === 1
                                ? "bg-slate-50/70"
                                : "bg-white",
                          )}
                        >
                          <td className="border-r border-slate-100 px-2 py-1.5">
                            <div className="leading-tight">
                              <span className="font-semibold text-slate-800">{dayParts.date}</span>
                              <span className="ml-1 text-[10px] text-slate-500">
                                {dayParts.weekday.slice(0, 2)}
                              </span>
                              {isToday ? (
                                <span className="ml-1 text-[9px] font-semibold text-emerald-700">
                                  bugun
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="border-r border-slate-100 px-1.5 py-1.5 text-center font-mono tabular-nums text-emerald-800">
                            {d.checkIn}
                          </td>
                          <td className="border-r border-slate-100 px-1.5 py-1.5 text-center font-mono tabular-nums text-rose-800">
                            {d.checkOut}
                          </td>
                          <td className="border-r border-slate-100 px-1.5 py-1.5 text-center">
                            <span
                              className={cn(
                                "inline-flex rounded px-1 py-0.5 text-[9px] font-semibold",
                                STATUS_STYLE[d.status] || "bg-slate-100 text-slate-600",
                              )}
                            >
                              {STATUS_UZ[d.status] || d.status}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 text-right font-medium tabular-nums text-slate-800">
                            {worked != null ? formatHoursUz(worked) : d.workedHours || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Desktop: wide spreadsheet */}
              <div
                className={cn(
                  "hidden md:block overflow-auto overscroll-contain",
                  historyRange === "day" ? "max-h-[260px]" : "max-h-[340px]",
                )}
              >
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[#e8eef4] shadow-[inset_0_-1px_0_#94a3b8]">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="sticky left-0 z-[1] border-r border-slate-300 bg-[#e8eef4] px-3 py-2">
                        Sana
                      </th>
                      <th className="border-r border-slate-200 px-3 py-2">Hafta kuni</th>
                      <th className="border-r border-slate-200 px-3 py-2 text-center">Keldim</th>
                      <th className="border-r border-slate-200 px-3 py-2 text-center">Ketdim</th>
                      <th className="border-r border-slate-200 px-3 py-2 text-center">Holat</th>
                      <th className="px-3 py-2 text-right">Ishlangan vaqt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryDays.map((d, i) => {
                      const isToday = d.date === todayStamp;
                      const dayParts = splitDayUz(d.date);
                      const worked =
                        d.checkIn !== "—" && d.checkOut !== "—"
                          ? workedMinutesFromPunch({
                              checkIn: d.checkIn,
                              checkOut: d.checkOut,
                            })
                          : null;
                      return (
                        <tr
                          key={d.date}
                          className={cn(
                            "border-b border-slate-200/80 hover:bg-sky-50/60",
                            isToday
                              ? "bg-sky-50"
                              : i % 2 === 1
                                ? "bg-slate-50/80"
                                : "bg-white",
                          )}
                        >
                          <td
                            className={cn(
                              "sticky left-0 z-[1] border-r border-slate-200 px-3 py-1.5 font-semibold tabular-nums text-slate-900",
                              isToday ? "bg-sky-50" : i % 2 === 1 ? "bg-slate-50/80" : "bg-white",
                            )}
                          >
                            {dayParts.date}
                            {isToday ? (
                              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                bugun
                              </span>
                            ) : null}
                          </td>
                          <td className="border-r border-slate-100 px-3 py-1.5 capitalize text-slate-600">
                            {dayParts.weekday}
                          </td>
                          <td className="border-r border-slate-100 px-3 py-1.5 text-center font-mono text-[13px] tabular-nums text-emerald-800">
                            {d.checkIn}
                          </td>
                          <td className="border-r border-slate-100 px-3 py-1.5 text-center font-mono text-[13px] tabular-nums text-rose-800">
                            {d.checkOut}
                          </td>
                          <td className="border-r border-slate-100 px-3 py-1.5 text-center">
                            <span
                              className={cn(
                                "inline-flex rounded px-2 py-0.5 text-[11px] font-semibold",
                                STATUS_STYLE[d.status] || "bg-slate-100 text-slate-600",
                              )}
                            >
                              {STATUS_UZ[d.status] || d.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-800">
                            {worked != null ? formatHoursUz(worked) : d.workedHours || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {isAuthenticated && oylikMe.data ? (
          <Link href="/oylik">
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0b3a5c]">
                <Banknote className="h-4 w-4" />
                Mening oyligim · {oylikMe.data.monthLabel}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Faqat o‘zingizning KPI. Batafsil — Oylik.</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <p>Fiks maosh: <span className="font-semibold">{formatSom(oylikMe.data.fixedSalary)}</span></p>
                <p>KPI: <span className="font-semibold">{oylikMe.data.kpiPercent}%</span></p>
                <p>Bonus: <span className="font-semibold">{formatSom(oylikMe.data.bonusAmount)}</span></p>
                <p>Jami: <span className="font-bold text-[#0b3a5c]">{formatSom(oylikMe.data.totalAmount)}</span></p>
              </div>
            </div>
          </Link>
        ) : null}

        <div className="mt-5 flex justify-center gap-4 text-sm">
          {!isTgMiniApp ? (
            <Link href="/login" className="text-[#0b3a5c] underline-offset-2 hover:underline">
              Login
            </Link>
          ) : null}
          {isAuthenticated && canReport ? (
            <Link href="/davomat" className="text-[#0b3a5c] underline-offset-2 hover:underline">
              Hisobot
            </Link>
          ) : null}
        </div>
      </div>

      <FaceScanDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        mode="enroll"
        title="Davomat · Yuzni ulash"
        description="Kameraga to‘g‘ri qarang — bir marta ro‘yxatdan o‘ting"
        onCaptured={onEnrollCaptured}
      />

      <FaceScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        mode="login"
        title="Davomat · Face ID"
        description="Lokatsiya tasdiqlangan. Yuzni oval ichiga tuting."
        onCaptured={onCaptured}
      />

      <AlertDialog open={confirmOut} onOpenChange={setConfirmOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ketishni tasdiqlaysizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {afterSix
                ? `${elapsedLabel} ishladingiz. Ha desangiz, bugungi ketish vaqti yoziladi.`
                : `Hozir 18:00 dan oldin. ${elapsedLabel} ishladingiz. Ha desangiz, erta ketish sifatida yoziladi.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Yo‘q</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void punch("out")}>
              Ha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
