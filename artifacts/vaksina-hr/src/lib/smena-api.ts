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
  assignedBranchId: number | null;
  assignedBranchName: string | null;
};

export type SmenaMe = {
  pharmacyStaff: boolean;
  canPickShift: boolean;
  canPickOwnBranch: boolean;
  canAssignOthers: boolean;
  employee: {
    id: number;
    fullName: string;
    orgRole: string | null;
    assignedBranchId: number | null;
    assignedBranchName: string | null;
  } | null;
  shift: {
    type: "one" | "two";
    label: string;
    start: string;
    end: string;
    warnHm: string;
    warnText: string;
    hoursNote: string;
  };
  branches: SmenaBranch[];
  assignable: SmenaAssignable[];
  rules: { shift1: string; shift2: string; branch: string };
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

export function saveMySmena(body: { shiftType?: "one" | "two"; assignedBranchId?: number | null }) {
  return apiJson<{ ok: boolean }>("/smena/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function assignSmenaBranch(
  employeeId: number,
  assignedBranchId: number,
  shiftType?: "one" | "two",
) {
  return apiJson<{ ok: boolean; assignedBranchName: string }>(`/smena/assign/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify({ assignedBranchId, shiftType }),
  });
}
