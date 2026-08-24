import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PharmacyStaffRole = "mudir" | "farmasevt" | "stajyor";

export type PharmacyStaffInput = {
  firstName: string;
  lastName: string;
  phone: string;
  role: PharmacyStaffRole;
  location?: string;
  managerEmployeeId?: number;
};

export type PharmacyStaffResult = {
  id: number;
  fullName: string;
  role: string;
  login: string;
  phone: string | null;
  temporaryPassword: string;
  employeeId: number;
  orgRole: string | null;
  location: string | null;
};

export type BranchGpsResult = {
  id: number;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
};

function toNum(v: string): number {
  return Number(String(v).replace(",", "."));
}

function dmsToDecimal(deg: number, min: number, sec: number, hemi?: string): number {
  let v = Math.abs(deg) + min / 60 + sec / 3600;
  const h = (hemi || "").toUpperCase();
  if (h === "S" || h === "W" || h === "Ю" || h === "З") v = -v;
  if (deg < 0) v = -Math.abs(v);
  return v;
}

/** Namuna: 41°18'23.3"N 69°18'28.0"E */
export function parseGpsText(raw: string): { lat: number; lng: number } | null {
  const s = String(raw || "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/[′’ʻ`]/g, "'")
    .replace(/[″“”«»]/g, '"')
    .replace(/[˚º]/g, "°");
  if (!s) return null;

  const dms =
    /(\d{1,3})\s*°\s*(\d{1,2})\s*'?\s*(\d{1,2}(?:[.,]\d+)?)?\s*"?\s*([NSnsСсЮю])?[,;\s]+(\d{1,3})\s*°\s*(\d{1,2})\s*'?\s*(\d{1,2}(?:[.,]\d+)?)?\s*"?\s*([EWewВвЗз])?/;
  const m = s.match(dms);
  if (m) {
    const lat = dmsToDecimal(toNum(m[1]!), toNum(m[2]!), toNum(m[3] || "0"), m[4]);
    const lng = dmsToDecimal(toNum(m[5]!), toNum(m[6]!), toNum(m[7] || "0"), m[8]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  const dec = /(-?\d{1,3}(?:[.,]\d+))\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+))/;
  const d = s.match(dec);
  if (d) {
    const lat = toNum(d[1]!);
    const lng = toNum(d[2]!);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

const GPS_SUFFIX = /\s*\|gps:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s*$/i;

export function stripGpsSuffix(location: string | null | undefined): string {
  return String(location || "").replace(GPS_SUFFIX, "").trim();
}

const BRANCH_NAME_FIX: Record<string, string> = {
  азия: "ТАШСЕЛМАШ",
  азія: "ТАШСЕЛМАШ",
  azia: "ТАШСЕЛМАШ",
  asia: "ТАШСЕЛМАШ",
};

export function displayBranchName(location: string | null | undefined): string {
  const raw = stripGpsSuffix(location);
  return BRANCH_NAME_FIX[raw.toLowerCase()] || raw;
}

export function gpsFromLocationField(
  location: string | null | undefined,
): { lat: number; lng: number } | null {
  const m = String(location || "").match(GPS_SUFFIX);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return parseGpsText(stripGpsSuffix(location));
}

export function withGpsSuffix(
  name: string | null | undefined,
  lat: number,
  lng: number,
): string {
  const base = displayBranchName(name);
  const label = !base || base === "Filial" ? "Filial" : base;
  return `${label} |gps:${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function gpsInputError(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return `Koordinatani yozing: 41°18'23.3"N 69°18'28.0"E`;
  if (parseGpsText(s)) return null;
  const hasN = /[NnСс]/.test(s) || s.includes("°");
  const hasE = /[EeВв]/.test(s);
  if (hasN && !hasE) {
    return `Uzunlik ham kerak. To‘liq yozing: 41°18'23.3"N 69°18'28.0"E`;
  }
  return `Ikkala tomonni ham yozing: 41°18'23.3"N 69°18'28.0"E`;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body?.error) return String(body.error);
  } catch {
    /* ignore */
  }
  if (res.status === 404) return "Not Found";
  return res.statusText || `Xato ${res.status}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json() as Promise<T>;
}

export type EmployeeProfilePatch = {
  employeeId: number;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  shiftType?: string;
  shiftLabel?: string;
  employmentStatus?: string;
};

export function usePatchEmployeeProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: EmployeeProfilePatch) => {
      const { employeeId, ...body } = data;
      return apiFetch(`/employees/${employeeId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      qc.invalidateQueries({ queryKey: ["holat"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-mudirs"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-staff-logins"] });
      qc.invalidateQueries({
        predicate: (q) => JSON.stringify(q.queryKey).toLowerCase().includes("employee"),
      });
    },
  });
}

async function saveViaEmployeesPatch(
  employeeId: number,
  coordinates: string,
  keepLocation?: string | null,
): Promise<BranchGpsResult> {
  const parsed = parseGpsText(coordinates);
  if (!parsed) {
    throw new Error(gpsInputError(coordinates) || "Koordinata noto‘g‘ri");
  }
  const encoded = withGpsSuffix(keepLocation, parsed.lat, parsed.lng);
  const patch = async (body: Record<string, unknown>) =>
    fetch(`/api/employees/${employeeId}`, {
      credentials: "include",
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let res = await patch({
    location: encoded,
    latitude: parsed.lat,
    longitude: parsed.lng,
    coordinates,
  });
  if (!res.ok && (res.status === 400 || res.status === 403 || res.status === 404)) {
    res = await patch({ location: encoded });
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const emp = (await res.json()) as { id: number; location?: string | null };
  return {
    id: emp.id,
    location: stripGpsSuffix(emp.location ?? keepLocation) || null,
    latitude: parsed.lat,
    longitude: parsed.lng,
  };
}

export function useSaveManagerLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      employeeId: number;
      coordinates: string;
      branchName?: string | null;
      keepLocation?: string | null;
    }) => {
      const name = (data.branchName ?? data.keepLocation ?? "").trim();
      // Nom + mavjud GPS: koordinata bo‘sh bo‘lishi mumkin
      if (data.coordinates.trim()) {
        const bad = gpsInputError(data.coordinates);
        if (bad) throw new Error(bad);
      }

      const tryPost = async (path: string) =>
        fetch(`/api${path}`, {
          credentials: "include",
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employeeId: data.employeeId,
            coordinates: data.coordinates,
            branchName: name || null,
          }),
        });

      try {
        const first = await tryPost("/pharmacy-network/location");
        if (first.ok) return (await first.json()) as BranchGpsResult;
        if (first.status === 404) {
          const nested = await tryPost(`/pharmacy-network/managers/${data.employeeId}/location`);
          if (nested.ok) return (await nested.json()) as BranchGpsResult;
        }
        if (!first.ok) throw new Error(await readError(first));
      } catch (err) {
        if (err instanceof Error && err.message && !/fetch|network/i.test(err.message)) {
          throw err;
        }
      }

      return saveViaEmployeesPatch(
        data.employeeId,
        data.coordinates,
        name || data.keepLocation,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      qc.invalidateQueries({
        predicate: (q) => JSON.stringify(q.queryKey).toLowerCase().includes("employee"),
      });
    },
  });
}

export function useCreatePharmacyStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PharmacyStaffInput) =>
      apiFetch<PharmacyStaffResult>("/pharmacy-network/staff", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-mudirs"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-staff-logins"] });
      qc.invalidateQueries({
        predicate: (q) =>
          JSON.stringify(q.queryKey).toLowerCase().includes("employee"),
      });
    },
  });
}

export type HardDeletePharmacyResult = {
  ok: true;
  kind: "filial" | "staff";
  fullName: string;
  deletedEmployees: number;
  deletedUsers: number;
  message: string;
};

export function useHardDeletePharmacyEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      employeeId: number;
      userId?: number | null;
      fullName?: string | null;
    }) =>
      apiFetch<HardDeletePharmacyResult>(`/pharmacy-network/hard-delete`, {
        method: "POST",
        body: JSON.stringify({
          employeeId: data.employeeId,
          userId: data.userId ?? null,
          fullName: data.fullName ?? null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-mudirs"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-staff-logins"] });
      qc.invalidateQueries({ queryKey: ["/api/staffing/alerts"] });
      qc.invalidateQueries({
        predicate: (q) =>
          JSON.stringify(q.queryKey).toLowerCase().includes("employee"),
      });
    },
  });
}

export type MudirCredential = {
  employeeId: number;
  fullName: string;
  location: string;
  login: string;
  password: string;
};

export type StaffLoginCredential = MudirCredential & {
  userId?: number | null;
  roleLabel: string;
  mudirName: string;
};

export function useOwnMudirCredentials(enabled: boolean) {
  return useQuery({
    queryKey: ["pharmacy-mudirs"],
    queryFn: () => apiFetch<MudirCredential[]>("/pharmacy-network/mudirs"),
    enabled,
  });
}

export function useOwnStaffLogins(enabled: boolean) {
  return useQuery({
    queryKey: ["pharmacy-staff-logins"],
    queryFn: () => apiFetch<StaffLoginCredential[]>("/pharmacy-network/staff-logins"),
    enabled,
  });
}

export function usePatchNetworkCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { employeeId: number; login: string; password: string }) =>
      apiFetch<{ employeeId: number; userId: number; login: string; password: string }>(
        `/pharmacy-network/credentials/${data.employeeId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ login: data.login, password: data.password }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pharmacy-mudirs"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-staff-logins"] });
    },
  });
}

async function downloadExcel(path: string, fallbackName: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message || "Excel yuklanmadi");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = fallbackName.includes("DATE") ? fallbackName.replace("DATE", stamp) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadOwnMudirsExcel() {
  await downloadExcel("/pharmacy-network/mudirs/export", "tarmoq-login-DATE.xlsx");
}

export async function downloadOwnStaffExcel() {
  await downloadExcel("/pharmacy-network/staff-logins/export", "filial-xodimlar-login-DATE.xlsx");
}
