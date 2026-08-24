/** Davomat API client */

import { compressFaceSnapshotAsync } from "./face-id";

export type DavomatDayMetrics = {
  date: string;
  status: string;
  checkIn: string;
  checkOut: string;
  workedMinutes: number;
  workedHours: string;
  earlyArrivalMin: number;
  lateArrivalMin: number;
  earlyLeaveMin: number;
  overtimeMin: number;
  earlyArrivalLabel: string;
  lateArrivalLabel: string;
  earlyLeaveLabel: string;
  overtimeLabel: string;
  source?: string | null;
  notes?: string | null;
  recordId?: number | null;
};

export type DavomatEmployee = {
  id: number;
  fullName: string;
  position: string;
  departmentId: number;
  departmentName: string | null;
  location: string | null;
  orgRole: string | null;
  days: DavomatDayMetrics[];
  totals: {
    present: number;
    absent: number;
    late: number;
    incomplete: number;
    leave: number;
    workedMinutes: number;
    workedHours: string;
    lateArrivalMin: number;
    earlyArrivalMin: number;
    earlyLeaveMin: number;
    overtimeMin: number;
    lateArrivalLabel: string;
    earlyArrivalLabel: string;
    earlyLeaveLabel: string;
    overtimeLabel: string;
  };
};

export type DavomatReport = {
  workStart: string;
  workEnd: string;
  from: string;
  to: string;
  dates: string[];
  summary: {
    employees: number;
    days: number;
    presentPersonDays: number;
    absentPersonDays: number;
    latePersonDays: number;
    totalWorkedHours: string;
    totalLateMinutes: number;
    totalLateLabel: string;
  };
  days: Array<{
    date: string;
    present: number;
    late: number;
    incomplete: number;
    leave: number;
    absent: number;
    presentList: string[];
    absentList: string[];
    lateList: string[];
    farFromOffice?: Array<{
      employeeId: number;
      fullName: string;
      position: string | null;
      departmentName: string | null;
      checkIn: string | null;
      officeDistanceMeters: number;
    }>;
  }>;
  employees: DavomatEmployee[];
};

export class DavomatApiError extends Error {
  code?: string;
  distanceMeters?: number;
  remainMeters?: number;
  allowedMeters?: number;
  fullName?: string;
  checkIn?: string;
  checkOut?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workplace?: {
    location?: string;
    latitude?: number;
    longitude?: number;
    kind?: "branch" | "office";
  };
  constructor(body: {
    error?: string;
    code?: string;
    distanceMeters?: number;
    remainMeters?: number;
    allowedMeters?: number;
    fullName?: string;
    checkIn?: string;
    checkOut?: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    workplace?: {
      location?: string;
      latitude?: number;
      longitude?: number;
      kind?: "branch" | "office";
    };
  }) {
    super(body.error || "Davomat xatosi");
    this.code = body.code;
    this.distanceMeters = body.distanceMeters;
    this.remainMeters = body.remainMeters;
    this.allowedMeters = body.allowedMeters;
    this.fullName = body.fullName;
    this.checkIn = body.checkIn;
    this.checkOut = body.checkOut;
    this.checkInAt = body.checkInAt;
    this.checkOutAt = body.checkOutAt;
    this.workplace = body.workplace;
  }
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DavomatApiError(body as { error?: string; code?: string });
  }
  return body as T;
}

export function fetchDavomat(params: {
  from: string;
  to: string;
  search?: string;
  departmentId?: string;
  location?: string;
  employeeId?: string;
}): Promise<DavomatReport> {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  if (params.search) q.set("search", params.search);
  if (params.departmentId) q.set("departmentId", params.departmentId);
  if (params.location) q.set("location", params.location);
  if (params.employeeId) q.set("employeeId", params.employeeId);
  return apiJson<DavomatReport>(`/davomat?${q}`);
}

export async function saveDavomatManual(payload: {
  employeeId: number;
  workDate: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status?: string;
  notes?: string;
}): Promise<void> {
  await apiJson("/davomat/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function faceVerifyDavomat(payload: {
  descriptor?: number[];
  descriptors?: number[][];
  latitude: number;
  longitude: number;
  accuracy?: number;
  snapshot?: string;
  liveness?: {
    blinked?: boolean;
    poses?: string[];
    steps?: string[];
    motion?: number;
    score?: number;
    challenge?: string;
  };
}): Promise<{
  ok: boolean;
  fullName: string;
  employeeId: number;
  distanceMeters: number;
  allowedMeters: number;
  workDate: string;
  nextAction: "in" | "out" | "done";
  checkIn: string;
  checkOut: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  employee?: DavomatEmployee | null;
  user?: {
    id: number;
    fullName: string;
    role: string;
    departmentId?: number | null;
    departmentName?: string | null;
    login?: string;
    phone?: string | null;
    status?: string;
    createdAt?: string;
  } | null;
  sessionSwitched?: boolean;
}> {
  const snapshot = payload.snapshot
    ? await compressFaceSnapshotAsync(payload.snapshot)
    : undefined;
  return apiJson("/davomat/face-verify", {
    method: "POST",
    body: JSON.stringify({ ...payload, snapshot }),
  });
}

export async function facePunchDavomat(payload: {
  descriptor: number[];
  latitude: number;
  longitude: number;
  accuracy?: number;
  action: "in" | "out";
  snapshot?: string;
  liveness?: {
    blinked?: boolean;
    poses?: string[];
    motion?: number;
    score?: number;
  };
}): Promise<{
  ok: boolean;
  action: "in" | "out";
  fullName: string;
  message?: string;
  checkIn: string;
  checkOut: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedHours: string;
  distanceMeters: number;
  location?: string | null;
  employee?: DavomatEmployee | null;
  user?: {
    id: number;
    fullName: string;
    role: string;
    departmentId?: number | null;
    departmentName?: string | null;
    login?: string;
    phone?: string | null;
    status?: string;
    createdAt?: string;
  } | null;
  sessionSwitched?: boolean;
}> {
  const snapshot = payload.snapshot
    ? await compressFaceSnapshotAsync(payload.snapshot)
    : undefined;
  return apiJson("/davomat/face-punch", {
    method: "POST",
    body: JSON.stringify({ ...payload, snapshot }),
  });
}

export type WorkplaceInfo = {
  allowedMeters: number;
  gpsReady?: boolean;
  gpsError?: string | null;
  workDate: string;
  site?: {
    label: string;
    latitude: number;
    longitude: number;
    kind?: "branch" | "office";
  };
  employee: {
    id: number;
    fullName: string;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    hasGps: boolean;
  };
  today: {
    checkIn: string;
    checkOut: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    status: string;
    complete: boolean;
    nextAction: "in" | "out" | "done";
  };
  shift?: {
    type: "one" | "two";
    label: string;
    start: string;
    end: string;
    warnHm: string;
    warnText: string;
  } | null;
};

export async function fetchMyWorkplace(): Promise<WorkplaceInfo> {
  return apiJson<WorkplaceInfo>("/davomat/me/workplace");
}

export async function fetchMyDavomat(): Promise<{
  from: string;
  to: string;
  fullName: string;
  employee: DavomatEmployee | null;
}> {
  return apiJson("/davomat/me");
}

export const DAVOMAT_GEOFENCE_METERS = 35;
/** 41°13'09.3"N 69°16'22.9"E */
export const DAVOMAT_SITE_LAT = 41 + 13 / 60 + 9.3 / 3600;
export const DAVOMAT_SITE_LNG = 69 + 16 / 60 + 22.9 / 3600;
export const DAVOMAT_SITE_LABEL = "41°13'09.3\"N 69°16'22.9\"E";

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export type DavomatSite = {
  allowedMeters: number;
  label: string;
  latitude: number;
  longitude: number;
};

export async function fetchDavomatSite(): Promise<DavomatSite> {
  try {
    const site = await apiJson<DavomatSite>("/davomat/site");
    return { ...site, allowedMeters: DAVOMAT_GEOFENCE_METERS };
  } catch {
    return {
      allowedMeters: DAVOMAT_GEOFENCE_METERS,
      label: DAVOMAT_SITE_LABEL,
      latitude: DAVOMAT_SITE_LAT,
      longitude: DAVOMAT_SITE_LNG,
    };
  }
}

export async function downloadDavomatExcel(params: {
  from: string;
  to: string;
  search?: string;
  departmentId?: string;
  location?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  if (params.search) q.set("search", params.search);
  if (params.departmentId) q.set("departmentId", params.departmentId);
  if (params.location) q.set("location", params.location);
  const res = await fetch(`/api/davomat/export?${q}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "Excel yuklanmadi");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `davomat_${params.from}_${params.to}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
