import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGetNotificationsQueryKey,
} from "@workspace/api-client-react";
import type { ChatMessage } from "@/lib/chat-api";

type SyncPayload = {
  serverTime: number;
  unreadNotifications: number;
  chatsVersion: string;
  messagesVersion: string;
  newMessages: ChatMessage[];
};

const POLL_CHAT_MS = 4_500;
const POLL_IDLE_MS = 20_000;
const BACKOFF_MAX_MS = 45_000;

function activeChatIdFromUrl(): number | null {
  try {
    const path = window.location.pathname;
    const onChat = path.includes("/chat");
    if (!onChat) return null;
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function lastPositiveMsgId(messages: ChatMessage[] | undefined): number {
  if (!messages?.length) return 0;
  let max = 0;
  for (const m of messages) {
    if (m.id > max) max = m.id;
  }
  return max;
}

function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => {
    const aPend = a.pending || a.id < 0 ? 1 : 0;
    const bPend = b.pending || b.id < 0 ? 1 : 0;
    if (aPend !== bPend) return aPend - bPend;
    if (a.id > 0 && b.id > 0) return a.id - b.id;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const m of prev) {
    if (m.id > 0) byId.set(m.id, m);
  }
  for (const m of incoming) {
    if (m.id > 0) {
      const prevMsg = byId.get(m.id);
      byId.set(m.id, {
        ...prevMsg,
        ...m,
        pending: false,
        attachments:
          m.attachments && m.attachments.length > 0
            ? m.attachments
            : prevMsg?.attachments ?? m.attachments ?? [],
        replyTo: m.replyTo ?? prevMsg?.replyTo ?? null,
      });
    }
  }
  const confirmed = [...byId.values()];
  const pending = prev.filter((m) => m.pending || m.id < 0).filter((p) => {
    return !confirmed.some(
      (n) =>
        n.senderId === p.senderId &&
        (n.content === p.content ||
          (Boolean(p.attachments?.length) &&
            Boolean(n.attachments?.length) &&
            p.attachments![0]?.url === n.attachments![0]?.url)),
    );
  });
  return sortMessages([...confirmed, ...pending]);
}

/**
 * Real-time sync — Vercel serverless uchun sekin poll + 503 backoff.
 * 400ms poll serverni 503 ga olib kelardi.
 */
export function RealtimeSync() {
  const { user, isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const chatsVersionRef = useRef("");
  const messagesVersionRef = useRef("");
  const unreadRef = useRef(-1);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 0;
    let abort: AbortController | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const nextDelay = () => {
      if (backoffMs > 0) return backoffMs;
      return activeChatIdFromUrl() ? POLL_CHAT_MS : POLL_IDLE_MS;
    };

    const schedule = () => {
      clearTimer();
      if (stopped || document.visibilityState === "hidden") return;
      timer = setTimeout(() => {
        void pollOnce();
      }, nextDelay());
    };

    const applyPayload = (payload: SyncPayload) => {
      if (stopped) return;
      const chatId = activeChatIdFromUrl();

      if (payload.unreadNotifications !== unreadRef.current) {
        unreadRef.current = payload.unreadNotifications;
        void qc.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
        void qc.invalidateQueries({
          queryKey: getGetNotificationsQueryKey({ unreadOnly: true }),
        });
        // dashboard/stats og‘ir — har unread o‘zgarishida chaqirmaymiz
      }

      if (payload.chatsVersion !== chatsVersionRef.current) {
        chatsVersionRef.current = payload.chatsVersion;
        void qc.invalidateQueries({ queryKey: ["chats"], exact: true });
      }

      if (!chatId) return;

      if (payload.newMessages?.length) {
        messagesVersionRef.current = payload.messagesVersion;
        qc.setQueryData<{ messages: ChatMessage[] }>(
          ["chats", chatId, "messages"],
          (old) => ({
            messages: mergeMessages(old?.messages ?? [], payload.newMessages),
          }),
        );
        return;
      }

      if (
        payload.messagesVersion &&
        payload.messagesVersion !== messagesVersionRef.current &&
        payload.messagesVersion !== "0"
      ) {
        messagesVersionRef.current = payload.messagesVersion;
        void (async () => {
          try {
            const res = await fetch(`/api/chats/${chatId}/messages?limit=80`, {
              credentials: "include",
              headers: { Accept: "application/json" },
            });
            if (!res.ok) return;
            const data = (await res.json()) as { messages: ChatMessage[] };
            qc.setQueryData<{ messages: ChatMessage[] }>(
              ["chats", chatId, "messages"],
              (old) => ({
                messages: mergeMessages(old?.messages ?? [], data.messages ?? []),
              }),
            );
          } catch {
            /* ignore */
          }
        })();
      }
    };

    const pollOnce = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      if (inFlight) {
        schedule();
        return;
      }
      inFlight = true;
      abort?.abort();
      abort = new AbortController();

      const chatId = activeChatIdFromUrl();
      const cached = chatId
        ? qc.getQueryData<{ messages: ChatMessage[] }>(["chats", chatId, "messages"])
        : undefined;
      const afterMsgId = lastPositiveMsgId(cached?.messages);

      const params = new URLSearchParams();
      if (chatId) {
        params.set("chatId", String(chatId));
        if (afterMsgId > 0) params.set("afterMsgId", String(afterMsgId));
      } else {
        params.set("light", "1");
      }

      try {
        const res = await fetch(`/api/realtime/sync?${params.toString()}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: abort.signal,
        });
        if (res.status === 429 || res.status === 503) {
          backoffMs = Math.min(
            BACKOFF_MAX_MS,
            Math.max(POLL_CHAT_MS * 2, (backoffMs || POLL_CHAT_MS) * 2),
          );
        } else if (!res.ok) {
          backoffMs = Math.min(BACKOFF_MAX_MS, Math.max(5_000, backoffMs || 5_000));
        } else {
          backoffMs = 0;
          applyPayload((await res.json()) as SyncPayload);
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          backoffMs = Math.min(
            BACKOFF_MAX_MS,
            Math.max(POLL_CHAT_MS * 2, (backoffMs || POLL_CHAT_MS) * 2),
          );
        }
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        backoffMs = 0;
        void pollOnce();
      } else {
        clearTimer();
        abort?.abort();
      }
    };

    const onNav = () => {
      backoffMs = 0;
      clearTimer();
      void pollOnce();
    };

    void pollOnce();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onNav);
    window.addEventListener("popstate", onNav);

    return () => {
      stopped = true;
      clearTimer();
      abort?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onNav);
      window.removeEventListener("popstate", onNav);
    };
  }, [isAuthenticated, user, qc]);

  return null;
}
