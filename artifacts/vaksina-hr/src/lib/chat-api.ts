import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

export type ChatUser = {
  id: number;
  fullName: string;
  role: string;
  status: string;
  login?: string;
};

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "file" | "audio" | "video" | "video_note";
  url: string;
  size?: number;
  durationSec?: number;
};

export function chatAttachmentLabel(attachments?: ChatAttachment[]): string {
  if (!attachments?.length) return "📎 Fayl";
  if (attachments.length > 1) return `📎 ${attachments.length} ta fayl`;
  const a = attachments[0]!;
  if (a.kind === "audio") return "🎤 Ovozli xabar";
  if (a.kind === "video_note") return "🔵 Video xabar";
  if (a.kind === "video") return "🎬 Video";
  if (a.kind === "image") return "🖼 Rasm";
  return `📎 ${a.name || "Fayl"}`;
}

export type ChatReplyPreview = {
  id: number;
  content: string;
  senderName: string;
  deleted: boolean;
};

export type ChatMessage = {
  id: number;
  chatId: number;
  senderId: number;
  senderName: string;
  content: string;
  createdAt: string;
  deleted?: boolean;
  editedAt?: string | null;
  replyToId?: number | null;
  replyTo?: ChatReplyPreview | null;
  attachments?: ChatAttachment[];
  read?: boolean;
  pending?: boolean;
};

export type ChatListItem = {
  id: number;
  type: "direct" | "group" | string;
  title: string;
  members: ChatUser[];
  memberCount?: number;
  peer: ChatUser | null;
  lastMessage: {
    id: number;
    content: string;
    senderId: number;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
};

export type ChatDetail = {
  id: number;
  type: "direct" | "group" | string;
  title: string;
  members: ChatUser[];
  peer: ChatUser | null;
  createdAt: string;
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

export function useChatList(
  options?: Omit<UseQueryOptions<{ chats: ChatListItem[] }>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["chats"],
    queryFn: () => apiFetch<{ chats: ChatListItem[] }>("/chats"),
    refetchInterval: 45_000,
    ...options,
  });
}

export function useChatUsers(q: string, enabled = true) {
  return useQuery({
    queryKey: ["chats", "users", q],
    queryFn: () =>
      apiFetch<{ users: ChatUser[] }>(
        `/chats/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      ),
    enabled,
    staleTime: 10_000,
  });
}

export function useChatMessages(chatId: number | null) {
  return useQuery({
    queryKey: ["chats", chatId, "messages"],
    queryFn: () =>
      apiFetch<{ messages: ChatMessage[] }>(`/chats/${chatId}/messages?limit=80`),
    enabled: !!chatId,
    // Realtime sync yangilaydi — bu yerda sekin poll yetarli
    refetchInterval: false,
    staleTime: 5_000,
    structuralSharing: (oldData, newData) => {
      const old = oldData as { messages: ChatMessage[] } | undefined;
      const next = newData as { messages: ChatMessage[] } | undefined;
      if (!old?.messages?.length || !next?.messages) return newData;
      const pending = old.messages.filter((m) => m.pending || m.id < 0);
      if (!pending.length) return newData;
      const keep = pending.filter(
        (p) =>
          !next.messages.some(
            (n) =>
              n.id === p.id ||
              (n.senderId === p.senderId && n.content === p.content),
          ),
      );
      if (!keep.length) return newData;
      return {
        messages: [...next.messages, ...keep].sort((a, b) => {
          const ap = a.pending || a.id < 0 ? 1 : 0;
          const bp = b.pending || b.id < 0 ? 1 : 0;
          if (ap !== bp) return ap - bp;
          if (a.id > 0 && b.id > 0) return a.id - b.id;
          return String(a.createdAt).localeCompare(String(b.createdAt));
        }),
      };
    },
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      type: "direct" | "group";
      userId?: number;
      memberIds?: number[];
      title?: string;
    }) =>
      apiFetch<{ chat: ChatDetail & { existing?: boolean } }>("/chats", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useSendMessage(
  chatId: number | null,
  me?: { id: number; fullName: string } | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      content: string;
      replyToId?: number | null;
      attachments?: ChatAttachment[];
    }) => {
      const content =
        String(body.content || "").trim() ||
        (body.attachments?.length
          ? chatAttachmentLabel(body.attachments)
          : "");
      return apiFetch<{ message: ChatMessage }>(`/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ ...body, content }),
      });
    },
    onMutate: async (body) => {
      if (!chatId || !me) return { tempId: 0 };
      const tempId = -Date.now();
      const optimistic: ChatMessage = {
        id: tempId,
        chatId,
        senderId: me.id,
        senderName: me.fullName,
        content: body.content || (body.attachments?.length ? chatAttachmentLabel(body.attachments) : ""),
        createdAt: new Date().toISOString(),
        pending: true,
        read: false,
        replyToId: body.replyToId ?? null,
        attachments: body.attachments ?? [],
      };
      // Kutmasdan — darhol UI
      void qc.cancelQueries({ queryKey: ["chats", chatId, "messages"] });
      const prev = qc.getQueryData<{ messages: ChatMessage[] }>([
        "chats",
        chatId,
        "messages",
      ]);
      if (body.replyToId && prev?.messages) {
        const parent = prev.messages.find((m) => m.id === body.replyToId);
        if (parent) {
          optimistic.replyTo = {
            id: parent.id,
            content: parent.deleted ? "" : parent.content.slice(0, 120),
            senderName: parent.senderName,
            deleted: !!parent.deleted,
          };
        }
      }
      qc.setQueryData<{ messages: ChatMessage[] }>(
        ["chats", chatId, "messages"],
        (old) => ({
          messages: [...(old?.messages ?? []).filter((m) => m.id !== tempId), optimistic],
        }),
      );
      qc.setQueryData<{ chats: ChatListItem[] }>(["chats"], (old) => {
        if (!old?.chats) return old;
        return {
          chats: old.chats
            .map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    lastMessage: {
                      id: tempId,
                      content:
                        body.content ||
                        (body.attachments?.length
                          ? chatAttachmentLabel(body.attachments)
                          : ""),
                      senderId: me.id,
                      createdAt: optimistic.createdAt,
                    },
                    lastMessageAt: optimistic.createdAt,
                  }
                : c,
            )
            .sort(
              (a, b) =>
                new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
            ),
        };
      });
      return { prev, tempId };
    },
    onError: (_err, _body, ctx) => {
      if (!chatId || !ctx?.prev) return;
      qc.setQueryData(["chats", chatId, "messages"], ctx.prev);
    },
    onSuccess: (data, _body, ctx) => {
      if (!chatId) return;
      qc.setQueryData<{ messages: ChatMessage[] }>(
        ["chats", chatId, "messages"],
        (old) => {
          const prev = (old?.messages ?? []).filter(
            (m) => m.id !== ctx?.tempId && m.id !== data.message.id,
          );
          return { messages: [...prev, data.message] };
        },
      );
      qc.setQueryData<{ chats: ChatListItem[] }>(["chats"], (old) => {
        if (!old?.chats) return old;
        return {
          chats: old.chats
            .map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    lastMessage: {
                      id: data.message.id,
                      content: data.message.content,
                      senderId: data.message.senderId,
                      createdAt: data.message.createdAt,
                    },
                    lastMessageAt: data.message.createdAt,
                  }
                : c,
            )
            .sort(
              (a, b) =>
                new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
            ),
        };
      });
    },
  });
}

export function useEditMessage(chatId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { messageId: number; content: string }) =>
      apiFetch<{ message: ChatMessage }>(
        `/chats/${chatId}/messages/${body.messageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ content: body.content }),
        },
      ),
    onMutate: async (body) => {
      if (!chatId) return {};
      void qc.cancelQueries({ queryKey: ["chats", chatId, "messages"] });
      const prev = qc.getQueryData<{ messages: ChatMessage[] }>([
        "chats",
        chatId,
        "messages",
      ]);
      const editedAt = new Date().toISOString();
      qc.setQueryData<{ messages: ChatMessage[] }>(
        ["chats", chatId, "messages"],
        (old) => ({
          messages: (old?.messages ?? []).map((m) =>
            m.id === body.messageId
              ? { ...m, content: body.content, editedAt, pending: false }
              : m,
          ),
        }),
      );
      return { prev };
    },
    onError: (_e, _b, ctx) => {
      if (!chatId || !ctx?.prev) return;
      qc.setQueryData(["chats", chatId, "messages"], ctx.prev);
    },
    onSuccess: (data) => {
      if (!chatId) return;
      qc.setQueryData<{ messages: ChatMessage[] }>(
        ["chats", chatId, "messages"],
        (old) => ({
          messages: (old?.messages ?? []).map((m) =>
            m.id === data.message.id
              ? {
                  ...m,
                  content: data.message.content,
                  editedAt: data.message.editedAt,
                }
              : m,
          ),
        }),
      );
    },
  });
}

export function useDeleteMessage(chatId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) =>
      apiFetch<{ ok: boolean; id: number }>(
        `/chats/${chatId}/messages/${messageId}`,
        { method: "DELETE" },
      ),
    onMutate: async (messageId) => {
      if (!chatId) return {};
      void qc.cancelQueries({ queryKey: ["chats", chatId, "messages"] });
      const prev = qc.getQueryData<{ messages: ChatMessage[] }>([
        "chats",
        chatId,
        "messages",
      ]);
      qc.setQueryData<{ messages: ChatMessage[] }>(
        ["chats", chatId, "messages"],
        (old) => ({
          messages: (old?.messages ?? []).map((m) =>
            m.id === messageId
              ? { ...m, deleted: true, content: "", editedAt: null }
              : m,
          ),
        }),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (!chatId || !ctx?.prev) return;
      qc.setQueryData(["chats", chatId, "messages"], ctx.prev);
    },
    onSuccess: (data) => {
      if (!chatId) return;
      qc.setQueryData<{ messages: ChatMessage[] }>(
        ["chats", chatId, "messages"],
        (old) => ({
          messages: (old?.messages ?? []).map((m) =>
            m.id === data.id
              ? { ...m, deleted: true, content: "", editedAt: null }
              : m,
          ),
        }),
      );
    },
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiFetch<{ ok: boolean }>(`/chats/${chatId}/read`, { method: "POST" }),
    onSuccess: (_data, chatId) => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["chats", chatId, "messages"] });
    },
  });
}

export function useAddChatMembers(chatId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberIds: number[]) =>
      apiFetch<{ chat: ChatDetail; added: number[] }>(`/chats/${chatId}/members`, {
        method: "POST",
        body: JSON.stringify({ memberIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useRemoveChatMember(chatId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiFetch<{ ok: boolean; deletedChat?: boolean }>(
        `/chats/${chatId}/members/${userId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiFetch<void>(`/chats/${chatId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
