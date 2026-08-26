export type ShiftTypeKey =
  | "one"
  | "two"
  | "remote"
  | "flexible"
  | "alternate"
  | "alternate_night"
  | "custom";

export type SmenaBranch = {
  id: number;
  name: string;
  managerName: string;
  hasGps: boolean;
};

export type SmenaAssignable = {
  id: number;
  fullName: string;
  orgRole: string | null;
  shiftType: string;
  shiftLabel?: string;
  assignedBranchId: number | null;
  assignedBranchName: string | null;
};

export type SmenaShiftInfo = {
  type: ShiftTypeKey;
  label: string;
  hint?: string;
  start: string;
  end: string;
  overnight?: boolean;
  skipGeofence?: boolean;
  warnHm: string;
  warnText: string;
  hoursNote: string;
};

export type SmenaMe = {
  pharmacyStaff: boolean;
  canPickShift: boolean;
  canPickOwnBranch: boolean;
  canAssignOthers: boolean;
  canAssignAny?: boolean;
  employee: {
    id: number;
    fullName: string;
    orgRole: string | null;
    assignedBranchId: number | null;
    assignedBranchName: string | null;
  } | null;
  shift: SmenaShiftInfo;
  shifts?: Array<{
    type: ShiftTypeKey;
    label: string;
    hint: string;
    start: string;
    end: string;
    overnight?: boolean;
    skipGeofence?: boolean;
    hoursNote: string;
  }>;
  branches: SmenaBranch[];
  assignable: SmenaAssignable[];
  rules: Record<string, string>;
};

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
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || "So‘rov bajarilmadi");
  return body as T;
}

export function fetchSmenaMe(): Promise<SmenaMe> {
  return apiJson<SmenaMe>("/smena/me");
}

export function saveMySmena(body: {
  shiftType?: ShiftTypeKey;
  assignedBranchId?: number | null;
}) {
  return apiJson<{ ok: boolean }>("/smena/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function assignSmenaBranch(
  employeeId: number,
  assignedBranchId: number | null,
  shiftType?: ShiftTypeKey,
  opts?: { shiftOnly?: boolean },
) {
  return apiJson<{ ok: boolean; assignedBranchName: string }>(`/smena/assign/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify({
      assignedBranchId,
      shiftType,
      shiftOnly: opts?.shiftOnly,
    }),
  });
}

export function shiftTypeShort(type?: string | null): string {
  if (type === "two") return "2-smena";
  if (type === "remote") return "Masofadan";
  if (type === "flexible") return "Erkin";
  if (type === "alternate") return "Kun ora";
  if (type === "alternate_night") return "Kun ora kechki";
  if (type === "custom") return "Maxsus";
  return "1-smena";
}
