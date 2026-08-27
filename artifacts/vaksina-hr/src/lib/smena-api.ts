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
  position?: string;
  orgRole: string | null;
  shiftType: string;
  shiftLabel?: string;
  shiftStart?: string | null;
  shiftEnd?: string | null;
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
  shiftLabel?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
};

export type ShiftTemplate = {
  key: ShiftTypeKey;
  label: string;
  hint: string;
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
  canEditShiftTemplates?: boolean;
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

export function fetchShiftTemplates(): Promise<{ shifts: ShiftTemplate[] }> {
  return apiJson<{ shifts: ShiftTemplate[] }>("/shift-templates");
}

export function saveShiftTemplate(
  key: string,
  body: Partial<{ label: string; hint: string; start: string; end: string; warnHm: string; warnText: string }>,
) {
  return apiJson<{ ok: boolean; shift: ShiftTemplate }>(`/shift-templates/${key}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function saveMySmena(body: {
  shiftType?: ShiftTypeKey;
  assignedBranchId?: number | null;
  shiftLabel?: string;
  shiftStart?: string;
  shiftEnd?: string;
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
  opts?: { shiftOnly?: boolean; shiftLabel?: string; shiftStart?: string; shiftEnd?: string },
) {
  return apiJson<{ ok: boolean; assignedBranchName: string }>(`/smena/assign/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify({
      assignedBranchId,
      shiftType,
      shiftOnly: opts?.shiftOnly,
      shiftLabel: opts?.shiftLabel,
      shiftStart: opts?.shiftStart,
      shiftEnd: opts?.shiftEnd,
    }),
  });
}

export type DayBranchOverrideItem = {
  id: number;
  employeeId: number;
  branchId: number;
  workDate: string;
  note: string | null;
  branchName: string;
};

export function fetchDayBranchOverrides(employeeId: number) {
  return apiJson<{
    employeeId: number;
    homeBranchId: number | null;
    homeBranchName: string | null;
    items: DayBranchOverrideItem[];
  }>(`/smena/day-branch/${employeeId}`);
}

export function saveDayBranchOverride(
  employeeId: number,
  body: { workDate: string; branchId: number; note?: string },
) {
  return apiJson<{
    ok: boolean;
    workDate: string;
    branchId: number;
    branchName: string;
    message: string;
  }>(`/smena/day-branch/${employeeId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteDayBranchOverride(employeeId: number, workDate: string) {
  return apiJson<{ ok: boolean }>(
    `/smena/day-branch/${employeeId}?workDate=${encodeURIComponent(workDate)}`,
    { method: "DELETE" },
  );
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
