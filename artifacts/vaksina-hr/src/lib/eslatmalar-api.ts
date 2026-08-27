import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

export type ReminderAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "file";
  url: string;
  size?: number;
};

export type ReminderStatus = "active" | "completed" | "missed";

export type ReminderEvent = {
  id: number;
  reminderId: number;
  eventType: string;
  note: string | null;
  fromDueAt: string | null;
  toDueAt: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdById: number | null;
  createdAt: string;
};

export type Reminder = {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  dueAt: string;
  notifyAt: string | null;
  remindIntervalMinutes: number | null;
  lastNotifiedAt: string | null;
  attachments: ReminderAttachment[];
  status: ReminderStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  remainingMs: number;
  remainingLabel: string;
  events?: ReminderEvent[];
};

export type ReminderInput = {
  title: string;
  description?: string | null;
  dueAt: string;
  notifyAt?: string | null;
  remindIntervalMinutes?: number | null;
  attachments?: ReminderAttachment[];
};

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
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message || `Xato ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const remindersQueryKey = ["reminders"] as const;

export function useGetReminders(options?: {
  query?: Partial<UseQueryOptions<Reminder[]>>;
}) {
  return useQuery({
    queryKey: remindersQueryKey,
    queryFn: () => apiFetch<Reminder[]>("/reminders"),
    refetchInterval: 60_000,
    ...options?.query,
  });
}

export function useGetReminder(id: number | null) {
  return useQuery({
    queryKey: ["reminders", id],
    queryFn: () => apiFetch<Reminder>(`/reminders/${id}`),
    enabled: id != null,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReminderInput) =>
      apiFetch<Reminder>("/reminders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersQueryKey }),
  });
}

export function usePostponeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      dueAt,
      note,
    }: {
      id: number;
      dueAt: string;
      note?: string;
    }) =>
      apiFetch<Reminder>(`/reminders/${id}/postpone`, {
        method: "POST",
        body: JSON.stringify({ dueAt, note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: remindersQueryKey });
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function useCompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<Reminder>(`/reminders/${id}/complete`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersQueryKey }),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/reminders/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersQueryKey }),
  });
}
