import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

export type EmploymentStatus =
  | "working"
  | "new"
  | "dismissed"
  | "need_hire"
  | "searching"
  | "no_manager"
  | "closed";

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  working: "Ishlamoqda",
  new: "Yangi",
  dismissed: "Bo'shatilgan",
  need_hire: "Xodim kerak",
  searching: "Qidirilmoqda",
  no_manager: "Mudir yo‘q",
  closed: "Yopilgan",
};

export const PIPELINE_STEPS = [
  { key: "normal", label: "Ishlamoqda", step: 0 },
  { key: "pending", label: "Ogohlantirish", step: 1 },
  { key: "confirmed", label: "Ariza", step: 2 },
  { key: "assigned", label: "Rekruter", step: 3 },
  { key: "published", label: "E'lon", step: 4 },
  { key: "searching", label: "Qidirilmoqda", step: 5 },
] as const;

export type StaffingAlert = {
  id: number;
  employeeId: number;
  managerEmployeeId: number | null;
  branchLocation: string | null;
  shiftType: string | null;
  shiftLabel: string | null;
  employmentStatus: EmploymentStatus;
  employmentStatusLabel: string;
  workflowStatus: "pending" | "confirmed" | "cancelled" | "closed";
  note: string | null;
  createdById: number | null;
  confirmedById: number | null;
  confirmedAt: string | null;
  requestId: number | null;
  createdAt: string;
  updatedAt: string;
  employeeName: string | null;
  employeePosition: string | null;
  managerName: string | null;
  createdByName: string | null;
  confirmedByName: string | null;
  requestDeadline?: string | null;
  vacancyId?: number | null;
  vacancyDeadline?: string | null;
  vacancyStatus?: string | null;
  vacancyTitle?: string | null;
  confirmDeadline?: string | null;
  displayDeadline?: string | null;
  deadlineKind?: "vacancy" | "request" | "confirm" | null;
  pipelineKey?: string;
  pipelineLabel?: string;
  pipelineStep?: number;
};

export type RequestClaim = {
  id: number;
  requestId: number;
  recruiterId: number;
  recruiterName: string | null;
  note: string | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let message = "Xatolik";
    try {
      const body = await res.json();
      message = body?.error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function useStaffingAlerts(
  status?: string,
  options?: Omit<UseQueryOptions<StaffingAlert[]>, "queryKey" | "queryFn">,
) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: ["staffing-alerts", status ?? "all"],
    queryFn: () => apiFetch<StaffingAlert[]>(`/staffing-alerts${qs}`),
    ...options,
  });
}

export function useConfirmStaffingAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ alert: StaffingAlert; requestId: number }>(`/staffing-alerts/${id}/confirm`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staffing-alerts"] });
    },
  });
}

export function useCancelStaffingAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<StaffingAlert>(`/staffing-alerts/${id}/cancel`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staffing-alerts"] });
    },
  });
}

export function useRequestClaims(
  requestId: number,
  options?: Omit<UseQueryOptions<RequestClaim[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["request-claims", requestId],
    queryFn: () => apiFetch<RequestClaim[]>(`/requests/${requestId}/claims`),
    enabled: !!requestId,
    ...options,
  });
}

export function useCreateRequestClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiFetch<RequestClaim>(`/requests/${id}/claims`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["request-claims", vars.id] });
    },
  });
}
