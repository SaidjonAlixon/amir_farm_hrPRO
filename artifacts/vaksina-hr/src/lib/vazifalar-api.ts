import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

export type TaskAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "file" | "audio" | "video";
  url: string;
  size?: number;
};

export type Vazifa = {
  id: number;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done" | "verified" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  dueAt: string | null;
  assigneeKind: "user" | "employee";
  assigneeId: number;
  assigneeName: string | null;
  createdById: number;
  createdByName: string | null;
  attachments: TaskAttachment[];
  completionNote: string | null;
  completionAttachments: TaskAttachment[];
  completedAt: string | null;
  acceptedAt: string | null;
  extensionRequestedDueAt: string | null;
  extensionNote: string | null;
  extensionStatus: "pending" | "approved" | "rejected" | null;
  candidateId?: number | null;
  pipelineStage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VazifaInput = {
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  assigneeKind: "user" | "employee";
  assigneeId: number;
  attachments?: TaskAttachment[];
};

export type VazifaUpdate = Partial<VazifaInput>;

export type GetTasksParams = {
  status?: string;
  board?: "active" | "all";
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

function toQuery(params?: GetTasksParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.board) q.set("board", params.board);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const tasksQueryKey = (params?: GetTasksParams) =>
  ["tasks", params ?? {}] as const;

export function useGetTasks(
  params?: GetTasksParams,
  options?: { query?: Partial<UseQueryOptions<Vazifa[]>> },
) {
  return useQuery({
    queryKey: tasksQueryKey(params),
    queryFn: () => apiFetch<Vazifa[]>(`/tasks${toQuery(params)}`),
    ...options?.query,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VazifaInput) =>
      apiFetch<Vazifa>("/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VazifaUpdate }) =>
      apiFetch<Vazifa>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      completionNote,
      completionAttachments,
    }: {
      id: number;
      completionNote?: string | null;
      completionAttachments?: TaskAttachment[];
    }) =>
      apiFetch<Vazifa>(`/tasks/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ completionNote, completionAttachments }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useAcceptTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<Vazifa>(`/tasks/${id}/accept`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useVerifyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: number;
      action: "approve" | "rework";
      note?: string;
    }) =>
      apiFetch<Vazifa>(`/tasks/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ action, note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useRequestExtension() {
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
      apiFetch<Vazifa>(`/tasks/${id}/request-extension`, {
        method: "POST",
        body: JSON.stringify({ dueAt, note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useResolveExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: number;
      action: "approve" | "reject";
    }) =>
      apiFetch<Vazifa>(`/tasks/${id}/extension`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** Faylni blob / server uploads ga yuklash (maks 10 MB) */
export async function fileToAttachment(file: File): Promise<TaskAttachment> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(`«${file.name}» 10 MB dan katta`);
  }

  const res = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message || `Yuklash xatosi ${res.status}`);
  }

  return res.json() as Promise<TaskAttachment>;
}
