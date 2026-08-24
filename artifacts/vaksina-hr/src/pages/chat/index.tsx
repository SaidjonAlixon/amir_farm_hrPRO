import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAddChatMembers,
  useChatList,
  useChatMessages,
  useChatUsers,
  useCreateChat,
  useDeleteChat,
  useDeleteMessage,
  useEditMessage,
  useMarkChatRead,
  useRemoveChatMember,
  useSendMessage,
  chatAttachmentLabel,
  type ChatAttachment,
  type ChatListItem,
  type ChatMessage,
  type ChatUser,
} from "@/lib/chat-api";
import { fileToAttachment } from "@/lib/vazifalar-api";
import {
  VoiceBubble,
  VideoNoteBubble,
  formatRecSec,
  isMediaPlaceholder,
  pickRecorderMime,
} from "@/components/chat-media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileText,
  MessageCircle,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Search,
  Send,
  Square,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  hr: "HR",
  hr_direktor: "HR Direktor",
  hr_auditor: "HR Auditor",
  hr_menejer: "HR Menejer",
  recruiter: "Rekruter",
  trainer: "Trener",
  mentor: "Mentor",
  director: "Direktor",
  department_head: "Bo‘lim boshlig‘i",
  mudir: "Mudir",
  koordinator: "Koordinator",
  texnik: "Texnik",
  ombor: "Ombor",
  sb: "SB operatori",
  sb_boshliq: "SB bo‘limi boshlig‘i",
  farmasevt: "Farmasevt",
  stajyor: "Stajyor",
  moliya: "Moliyachi",
};

type ListFilter = "all" | "direct" | "group";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AvatarBubble({
  name,
  size = "md",
  tint,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  tint?: string;
}) {
  const dim =
    size === "sm" ? "h-9 w-9 text-xs" : size === "lg" ? "h-12 w-12 text-base" : "h-11 w-11 text-sm";
  return (
    <div
      className={cn(
        "shrink-0 rounded-full flex items-center justify-center font-semibold text-white shadow-sm",
        dim,
      )}
      style={{ background: tint || "#2AABEE" }}
    >
      {initials(name)}
    </div>
  );
}

function GroupAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  return (
    <div
      className={cn(
        "shrink-0 rounded-full flex items-center justify-center text-white shadow-sm",
        "bg-gradient-to-br from-[#6C5CE7] to-[#A29BFE]",
        dim,
      )}
    >
      <Users className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </div>
  );
}

function tintForId(id: number) {
  const colors = [
    "#2AABEE",
    "#00B894",
    "#E17055",
    "#0984E3",
    "#D63031",
    "#00CEC9",
    "#FD79A8",
    "#FDCB6E",
  ];
  return colors[id % colors.length]!;
}

function TypeBadge({ type }: { type: string }) {
  const isGroup = type === "group";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0",
        isGroup
          ? "bg-[#6C5CE7]/25 text-[#C4B5FD]"
          : "bg-[#2AABEE]/20 text-[#7DD3FC]",
      )}
    >
      {isGroup ? (
        <>
          <Users className="h-2.5 w-2.5" /> Guruh
        </>
      ) : (
        <>
          <User className="h-2.5 w-2.5" /> Shaxsiy
        </>
      )}
    </span>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [urlChatId, setUrlChatId] = useState<number | null>(() => {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    return Number.isFinite(id) && id > 0 ? id : null;
  });

  const [selectedId, setSelectedId] = useState<number | null>(urlChatId);
  const [listQuery, setListQuery] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [mobileShowChat, setMobileShowChat] = useState(!!urlChatId);
  const [newOpen, setNewOpen] = useState(false);
  const [newMode, setNewMode] = useState<"direct" | "group">("direct");
  const [userQuery, setUserQuery] = useState("");
  const [picked, setPicked] = useState<ChatUser[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recMode, setRecMode] = useState<"voice" | "video_note" | null>(null);
  const [recSec, setRecSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartedAtRef = useRef(0);
  const recTimerRef = useRef<number | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const recCancelRef = useRef(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addPicked, setAddPicked] = useState<ChatUser[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const list = useChatList();
  const messages = useChatMessages(selectedId);
  const createChat = useCreateChat();
  const sendMessage = useSendMessage(
    selectedId,
    user ? { id: user.id, fullName: user.fullName } : null,
  );
  const editMessage = useEditMessage(selectedId);
  const deleteMessage = useDeleteMessage(selectedId);
  const markRead = useMarkChatRead();
  const addMembers = useAddChatMembers(selectedId);
  const removeMember = useRemoveChatMember(selectedId);
  const deleteChat = useDeleteChat();
  const chatUsers = useChatUsers(userQuery, newOpen);
  const addUsers = useChatUsers(addQuery, addOpen);

  useEffect(() => {
    if (urlChatId) {
      setSelectedId(urlChatId);
      setMobileShowChat(true);
    }
  }, [urlChatId]);

  useEffect(() => {
    const onPop = () => {
      const id = Number(new URLSearchParams(window.location.search).get("id"));
      setUrlChatId(Number.isFinite(id) && id > 0 ? id : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    markRead.mutate(selectedId);
  }, [selectedId, messages.data?.messages?.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.messages?.length, selectedId]);

  // URL dagi chat sizga tegishli emas bo‘lsa — tozalash
  useEffect(() => {
    if (!list.data || !selectedId) return;
    const found = list.data.chats.some((c) => c.id === selectedId);
    if (!found && !list.isLoading) {
      setSelectedId(null);
      setMobileShowChat(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("id");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
  }, [list.data, list.isLoading, selectedId]);

  const chats = list.data?.chats ?? [];
  const filteredChats = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return chats.filter((c) => {
      if (listFilter === "direct" && c.type !== "direct") return false;
      if (listFilter === "group" && c.type !== "group") return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.lastMessage?.content || "").toLowerCase().includes(q) ||
        c.members.some((m) => m.fullName.toLowerCase().includes(q))
      );
    });
  }, [chats, listQuery, listFilter]);

  const activeChat: ChatListItem | undefined = chats.find((c) => c.id === selectedId);

  const addableUsers = useMemo(() => {
    const memberIds = new Set(activeChat?.members.map((m) => m.id) ?? []);
    return (addUsers.data?.users ?? []).filter((u) => !memberIds.has(u.id));
  }, [addUsers.data?.users, activeChat?.members]);

  const openChat = (id: number) => {
    if (recMode) stopRecording(true);
    setSelectedId(id);
    setMobileShowChat(true);
    setReplyTo(null);
    setEditingId(null);
    setPendingFiles([]);
    setDraft("");
    const url = new URL(window.location.href);
    url.searchParams.set("id", String(id));
    window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
  };

  const backToList = () => {
    setMobileShowChat(false);
  };

  const togglePick = (u: ChatUser) => {
    setPicked((prev) => {
      if (newMode === "direct") return [u];
      if (prev.some((p) => p.id === u.id)) return prev.filter((p) => p.id !== u.id);
      return [...prev, u];
    });
  };

  const toggleAddPick = (u: ChatUser) => {
    setAddPicked((prev) => {
      if (prev.some((p) => p.id === u.id)) return prev.filter((p) => p.id !== u.id);
      return [...prev, u];
    });
  };

  const submitNewChat = async () => {
    if (!picked.length) return;
    try {
      if (newMode === "direct") {
        const res = await createChat.mutateAsync({
          type: "direct",
          userId: picked[0]!.id,
        });
        setNewOpen(false);
        setPicked([]);
        setUserQuery("");
        openChat(res.chat.id);
        toast({
          title: res.chat.existing ? "Shaxsiy chat" : "Yangi shaxsiy chat",
          description: "Faqat ikkingiz ko‘rasiz",
        });
      } else {
        if (!groupTitle.trim()) return;
        const res = await createChat.mutateAsync({
          type: "group",
          title: groupTitle.trim(),
          memberIds: picked.map((p) => p.id),
        });
        setNewOpen(false);
        setPicked([]);
        setGroupTitle("");
        setUserQuery("");
        openChat(res.chat.id);
        toast({
          title: "Guruh ochildi",
          description: "Faqat qo‘shilgan a’zolar ko‘radi",
        });
      }
    } catch (e) {
      toast({
        title: "Xatolik",
        description: e instanceof Error ? e.message : "Chat ochilmadi",
        variant: "destructive",
      });
    }
  };

  const submitAddMembers = async () => {
    if (!addPicked.length || !selectedId) return;
    try {
      await addMembers.mutateAsync(addPicked.map((p) => p.id));
      setAddOpen(false);
      setAddPicked([]);
      setAddQuery("");
      toast({
        title: "A’zolar qo‘shildi",
        description: `${addPicked.length} kishi guruhga qo‘shildi`,
      });
      void list.refetch();
    } catch (e) {
      toast({
        title: "Xatolik",
        description: e instanceof Error ? e.message : "Qo‘shib bo‘lmadi",
        variant: "destructive",
      });
    }
  };

  const meId = user?.id;

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (recTimerRef.current != null) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      recCancelRef.current = true;
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopMediaTracks();
    };
  }, []);

  useEffect(() => {
    if (recMode !== "video_note") return;
    const el = videoPreviewRef.current;
    const stream = mediaStreamRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [recMode]);

  const sendAttachmentsNow = (
    files: ChatAttachment[],
    text = "",
    replyId: number | null = replyTo?.id ?? null,
  ) => {
    if (!selectedId || (!text.trim() && files.length === 0)) return;
    const content =
      text.trim() || (files.length ? chatAttachmentLabel(files) : "");
    setDraft("");
    setPendingFiles([]);
    setReplyTo(null);
    sendMessage.mutate(
      { content, replyToId: replyId, attachments: files },
      {
        onError: (e) => {
          setDraft((prev) => prev || text);
          setPendingFiles(files);
          if (replyId) {
            const parent = messages.data?.messages.find((m) => m.id === replyId);
            if (parent) setReplyTo(parent);
          }
          toast({
            title: "Yuborilmadi",
            description: e instanceof Error ? e.message : "Xato",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onPickChatFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingFile(true);
    try {
      const next: ChatAttachment[] = [];
      for (const file of Array.from(files)) {
        if (pendingFiles.length + next.length >= 5) break;
        const att = await fileToAttachment(file);
        const mime = att.mimeType || file.type || "";
        let kind: ChatAttachment["kind"] = att.kind;
        if (mime.startsWith("audio/")) kind = "audio";
        else if (mime.startsWith("video/")) kind = "video";
        else if (mime.startsWith("image/")) kind = "image";
        next.push({
          id: att.id,
          name: att.name,
          mimeType: mime || att.mimeType,
          kind,
          url: att.url,
          size: att.size,
        });
      }
      setPendingFiles((prev) => [...prev, ...next].slice(0, 5));
      toast({
        title: "Fayl qo‘shildi",
        description: `${next.length} ta — matn shart emas, yuborishingiz mumkin (max 10 MB)`,
      });
    } catch (e) {
      toast({
        title: "Fayl yuklanmadi",
        description: e instanceof Error ? e.message : "Xato",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const finishRecording = async (blob: Blob, mode: "voice" | "video_note") => {
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - recStartedAtRef.current) / 1000),
    );
    if (recCancelRef.current) return;
    if (durationSec < 1 || blob.size < 200) {
      toast({
        title: "Juda qisqa",
        description: "Kamida 1 soniya yozing",
        variant: "destructive",
      });
      return;
    }
    setUploadingFile(true);
    try {
      const ext = blob.type.includes("mp4")
        ? "mp4"
        : blob.type.includes("ogg")
          ? "ogg"
          : "webm";
      const file = new File(
        [blob],
        mode === "voice" ? `voice-${Date.now()}.${ext}` : `video-note-${Date.now()}.${ext}`,
        { type: blob.type || (mode === "voice" ? "audio/webm" : "video/webm") },
      );
      const att = await fileToAttachment(file);
      const chatAtt: ChatAttachment = {
        id: att.id,
        name: att.name,
        mimeType: att.mimeType || file.type,
        kind: mode === "voice" ? "audio" : "video_note",
        url: att.url,
        size: att.size,
        durationSec,
      };
      sendAttachmentsNow([chatAtt], "");
    } catch (e) {
      toast({
        title: "Yuborilmadi",
        description: e instanceof Error ? e.message : "Xato",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const startRecording = async (mode: "voice" | "video_note") => {
    if (!selectedId || uploadingFile || editingId) return;
    if (typeof MediaRecorder === "undefined") {
      toast({
        title: "Qo‘llab-quvvatlanmaydi",
        description: "Brauzeringiz yozishni qo‘llab-quvvatlamaydi",
        variant: "destructive",
      });
      return;
    }
    try {
      recCancelRef.current = false;
      const stream =
        mode === "voice"
          ? await navigator.mediaDevices.getUserMedia({ audio: true })
          : await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: {
                facingMode: "user",
                width: { ideal: 480 },
                height: { ideal: 480 },
              },
            });
      mediaStreamRef.current = stream;
      const mime =
        mode === "voice"
          ? pickRecorderMime([
              "audio/webm;codecs=opus",
              "audio/webm",
              "audio/ogg;codecs=opus",
              "audio/mp4",
            ])
          : pickRecorderMime([
              "video/webm;codecs=vp9,opus",
              "video/webm;codecs=vp8,opus",
              "video/webm",
              "video/mp4",
            ]);
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const chunks = recChunksRef.current;
        const type = recorder.mimeType || mime || (mode === "voice" ? "audio/webm" : "video/webm");
        const blob = new Blob(chunks, { type });
        stopMediaTracks();
        setRecMode(null);
        setRecSec(0);
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
        void finishRecording(blob, mode);
      };
      mediaRecorderRef.current = recorder;
      recStartedAtRef.current = Date.now();
      setRecSec(0);
      setRecMode(mode);
      recorder.start(250);
      recTimerRef.current = window.setInterval(() => {
        const sec = Math.round((Date.now() - recStartedAtRef.current) / 1000);
        setRecSec(sec);
        const max = mode === "voice" ? 120 : 60;
        if (sec >= max) {
          try {
            mediaRecorderRef.current?.stop();
          } catch {
            /* ignore */
          }
        }
      }, 250);
    } catch {
      stopMediaTracks();
      setRecMode(null);
      toast({
        title: "Ruxsat kerak",
        description:
          mode === "voice"
            ? "Mikrofon ruxsatini bering"
            : "Kamera va mikrofon ruxsatini bering",
        variant: "destructive",
      });
    }
  };

  const stopRecording = (cancel = false) => {
    recCancelRef.current = cancel;
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      stopMediaTracks();
      setRecMode(null);
      setRecSec(0);
      return;
    }
    try {
      rec.stop();
    } catch {
      stopMediaTracks();
      setRecMode(null);
    }
  };

  const onSend = () => {
    const text = draft.trim();
    if ((!text && pendingFiles.length === 0) || !selectedId) return;
    if (editingId) {
      if (!text) return;
      const id = editingId;
      setEditingId(null);
      setEditDraft("");
      setDraft("");
      setReplyTo(null);
      editMessage.mutate(
        { messageId: id, content: text },
        {
          onError: (e) => {
            setEditingId(id);
            setDraft(text);
            setEditDraft(text);
            toast({
              title: "Tahrirlanmadi",
              description: e instanceof Error ? e.message : "Xato",
              variant: "destructive",
            });
          },
        },
      );
      return;
    }
    sendAttachmentsNow(pendingFiles, text);
  };

  const startEdit = (m: ChatMessage) => {
    if (m.deleted || m.id < 0) return;
    setEditingId(m.id);
    setEditDraft(m.content);
    setDraft(m.content);
    setReplyTo(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
    setDraft("");
  };

  const handleDeleteMsg = (messageId: number) => {
    deleteMessage.mutate(messageId, {
      onError: (e) => {
        toast({
          title: "O‘chirilmadi",
          description: e instanceof Error ? e.message : "Xato",
          variant: "destructive",
        });
      },
    });
  };

  const handleRemoveMember = (userId: number, name: string) => {
    if (!selectedId) return;
    removeMember.mutate(userId, {
      onSuccess: (res) => {
        toast({
          title: userId === meId ? "Guruhdan chiqdingiz" : "A’zo chiqarildi",
          description: name,
        });
        if (res.deletedChat || userId === meId) {
          setMembersOpen(false);
          setSelectedId(null);
          setMobileShowChat(false);
          const url = new URL(window.location.href);
          url.searchParams.delete("id");
          window.history.replaceState({}, "", url.pathname + (url.search || ""));
        }
        void list.refetch();
      },
      onError: (e) => {
        toast({
          title: "Xatolik",
          description: e instanceof Error ? e.message : "Chiqarib bo‘lmadi",
          variant: "destructive",
        });
      },
    });
  };

  const handleDeleteGroup = () => {
    if (!selectedId) return;
    deleteChat.mutate(selectedId, {
      onSuccess: () => {
        toast({ title: "Guruh o‘chirildi" });
        setMembersOpen(false);
        setSelectedId(null);
        setMobileShowChat(false);
        const url = new URL(window.location.href);
        url.searchParams.delete("id");
        window.history.replaceState({}, "", url.pathname + (url.search || ""));
        void list.refetch();
      },
      onError: (e) => {
        toast({
          title: "Xatolik",
          description: e instanceof Error ? e.message : "O‘chirib bo‘lmadi",
          variant: "destructive",
        });
      },
    });
  };

  const directCount = chats.filter((c) => c.type === "direct").length;
  const groupCount = chats.filter((c) => c.type === "group").length;

  return (
    <div className="h-full min-h-0 flex bg-[#0e1621] text-white overflow-hidden rounded-none sm:rounded-xl border border-[#1c2733]">
      {/* Chat list */}
      <aside
        className={cn(
          "w-full sm:w-[340px] lg:w-[380px] shrink-0 flex flex-col border-r border-[#1c2733] bg-[#17212b]",
          mobileShowChat ? "hidden sm:flex" : "flex",
        )}
      >
        <div className="px-4 pt-4 pb-3 border-b border-[#1c2733]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#2AABEE]" />
              Chat
            </h1>
            <Button
              size="sm"
              className="bg-[#2AABEE] hover:bg-[#229ED9] text-white h-9 gap-1"
              onClick={() => {
                setNewMode("direct");
                setPicked([]);
                setGroupTitle("");
                setNewOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Yangi
            </Button>
          </div>

          <div className="flex gap-1.5 mb-3">
            {(
              [
                { id: "all", label: "Barchasi", count: chats.length },
                { id: "direct", label: "Shaxsiy", count: directCount },
                { id: "group", label: "Guruh", count: groupCount },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setListFilter(tab.id)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                  listFilter === tab.id
                    ? tab.id === "group"
                      ? "bg-[#6C5CE7] text-white"
                      : "bg-[#2AABEE] text-white"
                    : "bg-[#242f3d] text-[#8b9aab] hover:text-white",
                )}
              >
                {tab.label}
                <span className="ml-1 opacity-80">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6c7a89]" />
            <Input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Qidirish..."
              className="pl-9 bg-[#242f3d] border-transparent text-white placeholder:text-[#6c7a89] focus-visible:ring-[#2AABEE]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {list.isLoading && (
            <p className="text-sm text-[#6c7a89] p-4">Yuklanmoqda...</p>
          )}
          {!list.isLoading && filteredChats.length === 0 && (
            <div className="p-6 text-center text-[#6c7a89]">
              <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Hali chat yo‘q</p>
              <p className="text-xs mt-1">
                Shaxsiy suhbat yoki guruh oching — faqat a’zolar ko‘radi
              </p>
            </div>
          )}
          {filteredChats.map((c) => {
            const active = c.id === selectedId;
            const isGroup = c.type === "group";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => openChat(c.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-[#1c2733]/60",
                  active ? "bg-[#2b5278]/50" : "hover:bg-[#202b36]",
                  isGroup && "border-l-2 border-l-[#6C5CE7]",
                  !isGroup && "border-l-2 border-l-transparent",
                )}
              >
                {isGroup ? (
                  <GroupAvatar />
                ) : (
                  <AvatarBubble name={c.title} tint={tintForId(c.peer?.id || c.id)} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium truncate">{c.title}</span>
                      <TypeBadge type={c.type} />
                    </div>
                    <span className="text-[11px] text-[#6c7a89] shrink-0">
                      {formatTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-[#8b9aab] truncate">
                      {isGroup
                        ? c.lastMessage?.content ||
                          `${c.memberCount ?? c.members.length} a’zo · faqat guruh`
                        : c.lastMessage?.content || "Shaxsiy suhbat · faqat ikkingiz"}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2AABEE] text-[10px] font-semibold flex items-center justify-center">
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Conversation */}
      <section
        className={cn(
          "flex-1 min-w-0 flex flex-col bg-[#0e1621]",
          !mobileShowChat ? "hidden sm:flex" : "flex",
        )}
        style={{
          backgroundImage:
            "radial-gradient(ellipse at top, rgba(42,171,238,0.06), transparent 55%), linear-gradient(180deg,#0e1621,#0b1219)",
        }}
      >
        {!selectedId || !activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#6c7a89] p-6">
            <MessageCircle className="h-16 w-16 mb-3 opacity-30" />
            <p className="text-base">Chatni tanlang yoki yangi suhbat boshlang</p>
            <p className="text-xs mt-2 max-w-sm text-center">
              Shaxsiy chat — faqat 2 kishi. Guruh — faqat qo‘shilgan a’zolar.
            </p>
          </div>
        ) : (
          <>
            <header className="h-14 shrink-0 flex items-center gap-3 px-3 sm:px-4 border-b border-[#1c2733] bg-[#17212b]">
              <button
                type="button"
                className="sm:hidden p-2 -ml-1 rounded-md hover:bg-[#242f3d]"
                onClick={backToList}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              {activeChat.type === "group" ? (
                <GroupAvatar size="sm" />
              ) : (
                <AvatarBubble
                  name={activeChat.title}
                  size="sm"
                  tint={tintForId(activeChat.peer?.id || activeChat.id)}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate leading-tight">{activeChat.title}</p>
                  <TypeBadge type={activeChat.type} />
                </div>
                <button
                  type="button"
                  className="text-[11px] text-[#8b9aab] truncate hover:text-[#2AABEE]"
                  onClick={() => {
                    if (activeChat.type === "group") setMembersOpen(true);
                  }}
                >
                  {activeChat.type === "group"
                    ? `${activeChat.members.length} a’zo · faqat guruh a’zolari`
                    : `${ROLE_LABELS[activeChat.peer?.role || ""] || activeChat.peer?.role || ""} · faqat ikkingiz`}
                </button>
              </div>
              {activeChat.type === "group" && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 border-[#6C5CE7]/50 bg-transparent text-[#C4B5FD] hover:bg-[#6C5CE7]/20"
                    onClick={() => {
                      setAddPicked([]);
                      setAddQuery("");
                      setAddOpen(true);
                    }}
                  >
                    <UserPlus className="h-4 w-4" />
                    <span className="hidden sm:inline">A’zo</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1 border-rose-500/40 bg-transparent text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#17212b] text-white border-[#1c2733]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Guruhni o‘chirish?</AlertDialogTitle>
                        <AlertDialogDescription className="text-[#8b9aab]">
                          «{activeChat.title}» to‘liq o‘chadi — barcha xabarlar va a’zolar.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-[#2b3a4a] bg-transparent text-white hover:bg-[#242f3d]">
                          Bekor
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-rose-600 hover:bg-rose-700"
                          onClick={handleDeleteGroup}
                        >
                          O‘chirish
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2">
              {(messages.data?.messages ?? []).map((m, idx, arr) => {
                const mine = m.senderId === meId;
                const prev = arr[idx - 1];
                const showName =
                  activeChat.type === "group" &&
                  !mine &&
                  (!prev || prev.senderId !== m.senderId);
                const deleted = !!m.deleted;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "group/msg flex",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm",
                        mine
                          ? "bg-[#2b5278] rounded-br-md"
                          : "bg-[#182533] rounded-bl-md",
                        m.pending && "opacity-70",
                        deleted && "opacity-80",
                      )}
                    >
                      {showName && !deleted && (
                        <p
                          className="text-[11px] font-semibold mb-0.5"
                          style={{ color: tintForId(m.senderId) }}
                        >
                          {m.senderName}
                        </p>
                      )}
                      {m.replyTo && !deleted && (
                        <div className="mb-1.5 rounded-lg border-l-2 border-[#2AABEE] bg-black/20 px-2 py-1">
                          <p className="text-[10px] font-semibold text-[#2AABEE] truncate">
                            {m.replyTo.senderName}
                          </p>
                          <p className="text-[11px] text-[#8b9aab] truncate">
                            {m.replyTo.deleted
                              ? "Xabar o‘chirilgan"
                              : m.replyTo.content || "…"}
                          </p>
                        </div>
                      )}
                      {deleted ? (
                        <p className="text-[14px] italic text-[#8b9aab]">
                          Xabar o‘chirildi
                        </p>
                      ) : (
                        <>
                          {(m.attachments?.length ?? 0) > 0 && (
                            <div className="mb-1.5 space-y-1.5">
                              {m.attachments!.map((a) => {
                                if (a.kind === "audio") {
                                  return (
                                    <VoiceBubble
                                      key={a.id}
                                      attachment={a}
                                      mine={mine}
                                    />
                                  );
                                }
                                if (a.kind === "video_note") {
                                  return (
                                    <VideoNoteBubble key={a.id} attachment={a} />
                                  );
                                }
                                if (a.kind === "video") {
                                  return (
                                    <video
                                      key={a.id}
                                      src={a.url}
                                      controls
                                      playsInline
                                      className="max-h-56 max-w-full rounded-lg"
                                    />
                                  );
                                }
                                if (a.kind === "image") {
                                  return (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block"
                                    >
                                      <img
                                        src={a.url}
                                        alt={a.name}
                                        className="max-h-48 max-w-full rounded-lg object-cover"
                                      />
                                    </a>
                                  );
                                }
                                return (
                                  <a
                                    key={a.id}
                                    href={
                                      a.url.startsWith("/api/uploads/")
                                        ? `${a.url}${a.url.includes("?") ? "&" : "?"}download=1`
                                        : a.url
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    download={a.name}
                                    className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5 text-xs hover:bg-black/30"
                                  >
                                    <FileText className="h-4 w-4 shrink-0 text-[#8b9aab]" />
                                    <span className="truncate">{a.name}</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                          {m.content &&
                            !isMediaPlaceholder(m.content, m.attachments) && (
                              <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                                {m.content}
                              </p>
                            )}
                          {(!m.content ||
                            isMediaPlaceholder(m.content, m.attachments)) &&
                            !(m.attachments?.length) && (
                              <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                                {m.content}
                              </p>
                            )}
                        </>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        {m.editedAt && !deleted && (
                          <span className="text-[10px] text-[#6c7a89]">tahrirlangan</span>
                        )}
                        <span className="text-[10px] text-[#8b9aab]">
                          {formatMsgTime(m.createdAt)}
                        </span>
                        {mine && !deleted && (
                          m.read ? (
                            <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-[#8b9aab]" />
                          )
                        )}
                      </div>

                      {!deleted && m.id > 0 && (
                        <div
                          className={cn(
                            "absolute -top-3 flex gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity",
                            mine ? "right-1" : "left-1",
                          )}
                        >
                          <button
                            type="button"
                            className="h-6 w-6 rounded-full bg-[#242f3d] border border-[#1c2733] flex items-center justify-center text-[#8b9aab] hover:text-white"
                            title="Javob"
                            onClick={() => {
                              setReplyTo(m);
                              setEditingId(null);
                              setDraft("");
                            }}
                          >
                            <Reply className="h-3 w-3" />
                          </button>
                          {mine && (
                            <>
                              <button
                                type="button"
                                className="h-6 w-6 rounded-full bg-[#242f3d] border border-[#1c2733] flex items-center justify-center text-[#8b9aab] hover:text-white"
                                title="Tahrirlash"
                                onClick={() => startEdit(m)}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                className="h-6 w-6 rounded-full bg-[#242f3d] border border-[#1c2733] flex items-center justify-center text-[#8b9aab] hover:text-rose-300"
                                title="O‘chirish"
                                onClick={() => handleDeleteMsg(m.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <footer className="shrink-0 border-t border-[#1c2733] bg-[#17212b]">
              {(replyTo || editingId) && (
                <div className="flex items-center gap-2 px-3 pt-2 sm:px-4">
                  <div className="flex-1 min-w-0 rounded-lg border-l-2 border-[#2AABEE] bg-[#242f3d] px-2.5 py-1.5">
                    <p className="text-[10px] font-semibold text-[#2AABEE]">
                      {editingId
                        ? "Tahrirlash"
                        : `Javob: ${replyTo?.senderName || ""}`}
                    </p>
                    <p className="text-xs text-[#8b9aab] truncate">
                      {editingId ? editDraft : replyTo?.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-[#8b9aab] hover:text-white hover:bg-[#242f3d]"
                    onClick={() => {
                      if (editingId) cancelEdit();
                      else setReplyTo(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {pendingFiles.length > 0 && !editingId && !recMode && (
                <div className="flex flex-wrap gap-2 px-3 pt-2 sm:px-4">
                  {pendingFiles.map((a) => (
                    <div
                      key={a.id}
                      className="relative flex items-center gap-1.5 rounded-lg border border-[#2b3a4a] bg-[#242f3d] px-2 py-1 text-xs text-[#c5d0db]"
                    >
                      {a.kind === "image" ? (
                        <img src={a.url} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : a.kind === "audio" ? (
                        <Mic className="h-4 w-4 text-[#2AABEE]" />
                      ) : a.kind === "video_note" || a.kind === "video" ? (
                        <Video className="h-4 w-4 text-[#2AABEE]" />
                      ) : (
                        <FileText className="h-4 w-4 text-[#8b9aab]" />
                      )}
                      <span className="max-w-[120px] truncate">
                        {a.kind === "audio"
                          ? chatAttachmentLabel([a])
                          : a.kind === "video_note"
                            ? chatAttachmentLabel([a])
                            : a.name}
                      </span>
                      <button
                        type="button"
                        className="text-[#8b9aab] hover:text-rose-300"
                        onClick={() =>
                          setPendingFiles((prev) => prev.filter((x) => x.id !== a.id))
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {recMode && (
                <div className="flex flex-col items-center gap-3 px-3 pt-3 sm:px-4">
                  {recMode === "video_note" && (
                    <div className="relative h-44 w-44 overflow-hidden rounded-full ring-4 ring-rose-500/80 shadow-xl">
                      <video
                        ref={videoPreviewRef}
                        className="h-full w-full object-cover scale-x-[-1]"
                        muted
                        playsInline
                        autoPlay
                      />
                      <span className="absolute inset-0 rounded-full ring-2 ring-white/30 pointer-events-none" />
                    </div>
                  )}
                  <div className="flex w-full items-center gap-3">
                    <button
                      type="button"
                      className="text-sm text-[#8b9aab] hover:text-rose-300 px-2"
                      onClick={() => stopRecording(true)}
                    >
                      Bekor
                    </button>
                    <div className="flex-1 flex items-center justify-center gap-2 text-rose-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                      <span className="tabular-nums font-medium">
                        {formatRecSec(recSec)}
                      </span>
                      <span className="text-xs text-[#8b9aab]">
                        {recMode === "voice" ? "Ovoz yozilmoqda" : "Video yozilmoqda"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      className="h-11 w-11 rounded-full bg-rose-500 hover:bg-rose-600 p-0 shrink-0"
                      title="To‘xtatib yuborish"
                      onClick={() => stopRecording(false)}
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </Button>
                  </div>
                </div>
              )}
              <form
                className={cn(
                  "flex items-end gap-1.5 p-3 sm:p-4 pt-2",
                  recMode && "hidden",
                )}
                onSubmit={(e) => {
                  e.preventDefault();
                  onSend();
                }}
              >
                {!editingId && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.webm,.ogg,.mp3,.m4a,.mp4,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        void onPickChatFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={uploadingFile || pendingFiles.length >= 5}
                      className="h-11 w-11 shrink-0 rounded-full text-[#8b9aab] hover:bg-[#242f3d] hover:text-white p-0"
                      title="Rasm yoki fayl (matnsiz ham, 10 MB)"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={uploadingFile}
                      className="h-11 w-11 shrink-0 rounded-full text-[#8b9aab] hover:bg-[#242f3d] hover:text-white p-0"
                      title="Dumaloq video (Telegram uslubida)"
                      onClick={() => void startRecording("video_note")}
                    >
                      <Video className="h-5 w-5" />
                    </Button>
                  </>
                )}
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    editingId
                      ? "Tahrirlangan matn..."
                      : replyTo
                        ? "Javob yozing..."
                        : uploadingFile
                          ? "Fayl yuklanmoqda..."
                          : "Xabar yoki fayl..."
                  }
                  className="min-h-11 bg-[#242f3d] border-transparent text-white placeholder:text-[#6c7a89] focus-visible:ring-[#2AABEE]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                    if (e.key === "Escape") {
                      if (editingId) cancelEdit();
                      else if (replyTo) setReplyTo(null);
                    }
                  }}
                />
                {!editingId &&
                !draft.trim() &&
                pendingFiles.length === 0 &&
                !uploadingFile ? (
                  <Button
                    type="button"
                    className="h-11 w-11 rounded-full bg-[#2AABEE] hover:bg-[#229ED9] p-0 shrink-0"
                    title="Ovozli xabar"
                    onClick={() => void startRecording("voice")}
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      uploadingFile ||
                      (!draft.trim() && pendingFiles.length === 0)
                    }
                    className="h-11 w-11 rounded-full bg-[#2AABEE] hover:bg-[#229ED9] p-0 shrink-0"
                  >
                    {editingId ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </Button>
                )}
              </form>
            </footer>
          </>
        )}
      </section>

      {/* New chat dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md bg-[#17212b] text-white border-[#1c2733]">
          <DialogHeader>
            <DialogTitle>Yangi chat</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-2">
            <Button
              type="button"
              className={cn(
                "flex-1 gap-1.5",
                newMode === "direct"
                  ? "bg-[#2AABEE] hover:bg-[#229ED9]"
                  : "border border-[#2b3a4a] bg-transparent text-white hover:bg-[#242f3d]",
              )}
              onClick={() => {
                setNewMode("direct");
                setPicked((p) => (p[0] ? [p[0]] : []));
              }}
            >
              <User className="h-4 w-4" />
              Shaxsiy
            </Button>
            <Button
              type="button"
              className={cn(
                "flex-1 gap-1.5",
                newMode === "group"
                  ? "bg-[#6C5CE7] hover:bg-[#5A4BD1]"
                  : "border border-[#2b3a4a] bg-transparent text-white hover:bg-[#242f3d]",
              )}
              onClick={() => setNewMode("group")}
            >
              <Users className="h-4 w-4" />
              Guruh
            </Button>
          </div>

          <p className="text-xs text-[#8b9aab] mb-3">
            {newMode === "direct"
              ? "Faqat siz va tanlangan xodim ko‘radi. Boshqalar bu suhbatni ko‘rmaydi."
              : "Faqat guruhga qo‘shilgan a’zolar ko‘radi. Keyin ham a’zo qo‘shish mumkin."}
          </p>

          {newMode === "group" && (
            <Input
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="Guruh nomi *"
              className="mb-3 bg-[#242f3d] border-transparent text-white placeholder:text-[#6c7a89]"
            />
          )}

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6c7a89]" />
            <Input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder={
                newMode === "direct" ? "Xodim tanlang..." : "A’zolarni tanlang..."
              }
              className="pl-9 bg-[#242f3d] border-transparent text-white placeholder:text-[#6c7a89]"
            />
          </div>

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {picked.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePick(p)}
                  className={cn(
                    "text-xs px-2 py-1 rounded-full border",
                    newMode === "group"
                      ? "bg-[#6C5CE7]/20 text-[#C4B5FD] border-[#6C5CE7]/40"
                      : "bg-[#2AABEE]/20 text-[#2AABEE] border-[#2AABEE]/40",
                  )}
                >
                  {p.fullName} ×
                </button>
              ))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-[#1c2733] divide-y divide-[#1c2733]">
            {(chatUsers.data?.users ?? []).map((u) => {
              const selected = picked.some((p) => p.id === u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => togglePick(u)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#242f3d]",
                    selected && "bg-[#2b5278]/40",
                  )}
                >
                  <AvatarBubble name={u.fullName} size="sm" tint={tintForId(u.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{u.fullName}</p>
                    <p className="text-[11px] text-[#8b9aab]">
                      {ROLE_LABELS[u.role] || u.role}
                    </p>
                  </div>
                  {selected && <Check className="h-4 w-4 text-[#2AABEE]" />}
                </button>
              );
            })}
            {!chatUsers.isLoading && (chatUsers.data?.users?.length ?? 0) === 0 && (
              <p className="p-4 text-sm text-[#6c7a89] text-center">Xodim topilmadi</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-[#2b3a4a] bg-transparent text-white hover:bg-[#242f3d]"
              onClick={() => setNewOpen(false)}
            >
              Bekor
            </Button>
            <Button
              type="button"
              className={
                newMode === "group"
                  ? "bg-[#6C5CE7] hover:bg-[#5A4BD1]"
                  : "bg-[#2AABEE] hover:bg-[#229ED9]"
              }
              disabled={
                createChat.isPending ||
                !picked.length ||
                (newMode === "group" && !groupTitle.trim())
              }
              onClick={() => void submitNewChat()}
            >
              {createChat.isPending
                ? "..."
                : newMode === "group"
                  ? "Guruh ochish"
                  : "Suhbat boshlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add members to group */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md bg-[#17212b] text-white border-[#1c2733]">
          <DialogHeader>
            <DialogTitle>Guruhga a’zo qo‘shish</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[#8b9aab] mb-3">
            Yangi a’zolar faqat shu guruhni ko‘radi. Shaxsiy chatlarga ta’sir qilmaydi.
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6c7a89]" />
            <Input
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              placeholder="Xodim qidirish..."
              className="pl-9 bg-[#242f3d] border-transparent text-white placeholder:text-[#6c7a89]"
            />
          </div>
          {addPicked.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {addPicked.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleAddPick(p)}
                  className="text-xs px-2 py-1 rounded-full bg-[#6C5CE7]/20 text-[#C4B5FD] border border-[#6C5CE7]/40"
                >
                  {p.fullName} ×
                </button>
              ))}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[#1c2733] divide-y divide-[#1c2733]">
            {addableUsers.map((u) => {
              const selected = addPicked.some((p) => p.id === u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleAddPick(u)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#242f3d]",
                    selected && "bg-[#2b5278]/40",
                  )}
                >
                  <AvatarBubble name={u.fullName} size="sm" tint={tintForId(u.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{u.fullName}</p>
                    <p className="text-[11px] text-[#8b9aab]">
                      {ROLE_LABELS[u.role] || u.role}
                    </p>
                  </div>
                  {selected && <Check className="h-4 w-4 text-[#6C5CE7]" />}
                </button>
              );
            })}
            {!addUsers.isLoading && addableUsers.length === 0 && (
              <p className="p-4 text-sm text-[#6c7a89] text-center">
                Qo‘shish uchun xodim qolmadi
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#2b3a4a] bg-transparent text-white hover:bg-[#242f3d]"
              onClick={() => setAddOpen(false)}
            >
              Bekor
            </Button>
            <Button
              type="button"
              className="bg-[#6C5CE7] hover:bg-[#5A4BD1]"
              disabled={!addPicked.length || addMembers.isPending}
              onClick={() => void submitAddMembers()}
            >
              {addMembers.isPending ? "..." : "Qo‘shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members list */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="sm:max-w-sm bg-[#17212b] text-white border-[#1c2733]">
          <DialogHeader>
            <DialogTitle>Guruh a’zolari</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[#8b9aab] -mt-1 mb-2">
            Istalgan a’zoni chiqarishingiz mumkin
          </p>
          <div className="max-h-80 overflow-y-auto divide-y divide-[#1c2733]">
            {(activeChat?.members ?? []).map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <AvatarBubble name={m.fullName} size="sm" tint={tintForId(m.id)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.fullName}
                    {m.id === meId ? " (siz)" : ""}
                  </p>
                  <p className="text-[11px] text-[#8b9aab]">
                    {ROLE_LABELS[m.role] || m.role}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 h-8 gap-1 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15"
                  disabled={removeMember.isPending}
                  onClick={() => handleRemoveMember(m.id, m.fullName)}
                  title={m.id === meId ? "Chiqish" : "Chiqarish"}
                >
                  <UserMinus className="h-4 w-4" />
                  <span className="text-xs">{m.id === meId ? "Chiqish" : "Chiqarish"}</span>
                </Button>
              </div>
            ))}
          </div>
          {activeChat?.type === "group" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-3 gap-2 border-rose-500/40 text-rose-300 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  Guruhni to‘liq o‘chirish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#17212b] text-white border-[#1c2733]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Guruhni o‘chirish?</AlertDialogTitle>
                  <AlertDialogDescription className="text-[#8b9aab]">
                    Barcha xabarlar o‘chadi. Bu amalni qaytarib bo‘lmaydi.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-[#2b3a4a] bg-transparent text-white hover:bg-[#242f3d]">
                    Bekor
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 hover:bg-rose-700"
                    onClick={handleDeleteGroup}
                  >
                    O‘chirish
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
