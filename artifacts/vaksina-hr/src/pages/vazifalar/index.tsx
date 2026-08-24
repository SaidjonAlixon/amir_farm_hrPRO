import React, { useMemo, useRef, useState } from "react";
import {
  useGetUsers,
  useGetEmployees,
} from "@workspace/api-client-react";
import {
  Plus,
  Calendar,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Trash2,
  CheckCircle2,
  X,
  User,
  Flag,
  Search,
  Check,
  ChevronsUpDown,
  Clock,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { CardStack } from "@/components/CardStack";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";
import {
  useGetTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCompleteTask,
  useAcceptTask,
  useRequestExtension,
  useResolveExtension,
  useVerifyTask,
  fileToAttachment,
  type Vazifa,
  type TaskAttachment,
} from "@/lib/vazifalar-api";

import { HR_ROLES, isSbRole } from "@/lib/roles";
import { SB_TASK_TEMPLATES } from "@/lib/sb";

type BoardCol = "past" | "today" | "tomorrow" | "week" | "completed";

const ASSIGNER_ROLES = new Set([
  "admin",
  ...HR_ROLES,
  "director",
  "department_head",
  "recruiter",
  "trainer",
  "mudir",
  "koordinator",
  "sb",
  "sb_boshliq",
]);

const COLUMNS: {
  id: BoardCol;
  label: string;
  hint: string;
  top: string;
  countBg: string;
  empty: string;
  allowCreate?: boolean;
}[] = [
  {
    id: "past",
    label: "O'tgan kunlar",
    hint: "Muddat o'tgan",
    top: "bg-rose-500",
    countBg: "bg-rose-100 text-rose-800",
    empty: "Kechikkan vazifa yo'q",
    allowCreate: true,
  },
  {
    id: "today",
    label: "Bugun",
    hint: "Shu kun",
    top: "bg-amber-500",
    countBg: "bg-amber-100 text-amber-900",
    empty: "Bugungi vazifa yo'q",
    allowCreate: true,
  },
  {
    id: "tomorrow",
    label: "Kelasi kun",
    hint: "Ertaga",
    top: "bg-sky-500",
    countBg: "bg-sky-100 text-sky-800",
    empty: "Ertangi vazifa yo'q",
    allowCreate: true,
  },
  {
    id: "week",
    label: "Kelasi hafta",
    hint: "2–7 kun ichida",
    top: "bg-emerald-500",
    countBg: "bg-emerald-100 text-emerald-800",
    empty: "Haftalik vazifa yo'q",
    allowCreate: true,
  },
  {
    id: "completed",
    label: "Bajarilgan",
    hint: "Tasdiqlangan vazifalar",
    top: "bg-violet-500",
    countBg: "bg-violet-100 text-violet-800",
    empty: "Bajarilgan vazifa yo'q",
    allowCreate: false,
  },
];

const PRIORITY: Record<string, { label: string; className: string }> = {
  low: { label: "Past", className: "bg-slate-100 text-slate-700" },
  normal: { label: "Oddiy", className: "bg-blue-50 text-blue-700" },
  high: { label: "Yuqori", className: "bg-orange-100 text-orange-800" },
  urgent: { label: "Shoshilinch", className: "bg-red-100 text-red-800" },
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function boardColumnFor(task: Vazifa, now = new Date()): BoardCol {
  if (task.status === "verified") return "completed";
  // Muddat yo‘q bo‘lsa — vazifa berilgan kun (ehtiyoj tasdig‘i) bo‘yicha
  const dueAt = task.dueAt || task.createdAt;
  if (!dueAt) return "week";
  const due = startOfDay(new Date(dueAt));
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  if (due.getTime() < today.getTime()) return "past";
  if (due.getTime() === today.getTime()) return "today";
  if (due.getTime() === tomorrow.getTime()) return "tomorrow";
  if (due.getTime() > tomorrow.getTime() && due.getTime() <= weekEnd.getTime()) {
    return "week";
  }
  return "week";
}

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VazifalarPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canAssign = !!user && ASSIGNER_ROLES.has(user.role);

  const { data: tasks = [], isLoading } = useGetTasks({ board: "active" });
  const { data: users = [] } = useGetUsers({ status: "active" } as any);
  const { data: employees = [] } = useGetEmployees(undefined as any);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const acceptTask = useAcceptTask();
  const requestExtension = useRequestExtension();
  const resolveExtension = useResolveExtension();
  const verifyTask = useVerifyTask();

  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editing, setEditing] = useState<Vazifa | null>(null);
  const [activeTask, setActiveTask] = useState<Vazifa | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [status, setStatus] = useState("todo");
  const [dueAt, setDueAt] = useState("");
  const [assigneeKey, setAssigneeKey] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachUploading, setAttachUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [completionNote, setCompletionNote] = useState("");
  const [completionFiles, setCompletionFiles] = useState<TaskAttachment[]>([]);
  const [completeUploading, setCompleteUploading] = useState(false);
  const completeFileRef = useRef<HTMLInputElement>(null);

  const [extendDue, setExtendDue] = useState("");
  const [extendNote, setExtendNote] = useState("");

  const assigneeOptions = useMemo(() => {
    const u = (users as any[])
      .filter((x) => x.status !== "inactive")
      .map((x) => ({
        key: `user:${x.id}`,
        label: `${x.fullName} · ${String(x.role).replace("_", " ")}`,
        kind: "user" as const,
        id: x.id as number,
      }));
    const e = (employees as any[]).map((x) => ({
      key: `employee:${x.id}`,
      label: `${x.fullName} · ${x.position}${x.location ? ` (${x.location})` : ""}`,
      kind: "employee" as const,
      id: x.id as number,
    }));
    return [...u, ...e];
  }, [users, employees]);

  const selectedAssignee = useMemo(
    () => assigneeOptions.find((o) => o.key === assigneeKey),
    [assigneeOptions, assigneeKey],
  );

  const isCreatorOf = (t: Vazifa) => !!user && t.createdById === user.id;
  const isAssigneeOf = (t: Vazifa) =>
    !!user && t.assigneeKind === "user" && t.assigneeId === user.id;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.assigneeName || "").toLowerCase().includes(q) ||
        (t.createdByName || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const byColumn = useMemo(() => {
    const map: Record<BoardCol, Vazifa[]> = {
      past: [],
      today: [],
      tomorrow: [],
      week: [],
      completed: [],
    };
    for (const t of filtered) {
      map[boardColumnFor(t)].push(t);
    }
    for (const k of Object.keys(map) as BoardCol[]) {
      map[k].sort((a, b) => {
        if (k === "completed") {
          const ca = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const cb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return cb - ca;
        }
        const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return da - db;
      });
    }
    return map;
  }, [filtered]);

  function openCreate(presetCol?: BoardCol) {
    setEditing(null);
    setTitle("");
    setDescription("");
    setPriority("normal");
    setStatus("todo");
    setAttachments([]);
    setAssigneeKey("");
    const base = startOfDay(new Date());
    let target = base;
    if (presetCol === "tomorrow") target = addDays(base, 1);
    if (presetCol === "week") target = addDays(base, 3);
    if (presetCol === "past") target = addDays(base, -1);
    target.setHours(18, 0, 0, 0);
    setDueAt(toDatetimeLocalValue(target.toISOString()));
    setEditOpen(true);
  }

  function openEdit(task: Vazifa) {
    if (!isCreatorOf(task) && user?.role !== "admin") {
      setActiveTask(task);
      setViewOpen(true);
      return;
    }
    setEditing(task);
    setTitle(task.title);
    setDescription(task.description || "");
    setPriority(task.priority);
    setStatus(task.status);
    setDueAt(toDatetimeLocalValue(task.dueAt));
    setAssigneeKey(`${task.assigneeKind}:${task.assigneeId}`);
    setAttachments(task.attachments || []);
    setEditOpen(true);
  }

  function openComplete(task: Vazifa) {
    setActiveTask(task);
    setCompletionNote("");
    setCompletionFiles([]);
    setCompleteOpen(true);
  }

  function openExtend(task: Vazifa) {
    setActiveTask(task);
    const base = task.dueAt ? new Date(task.dueAt) : new Date();
    base.setDate(base.getDate() + 1);
    setExtendDue(toDatetimeLocalValue(base.toISOString()));
    setExtendNote("");
    setExtendOpen(true);
  }

  async function onPickFiles(
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<TaskAttachment[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
  ) {
    if (!files?.length) return;
    const picked = Array.from(files);
    setUploading(true);
    try {
      const converted: TaskAttachment[] = [];
      for (const file of picked) {
        converted.push(await fileToAttachment(file));
      }
      setter((prev) => {
        const next = [...prev];
        for (const att of converted) {
          if (next.length >= 8) break;
          next.push(att);
        }
        return next;
      });
      toast({
        title: "Fayl yuklandi",
        description: `${picked.length} ta fayl qo‘shildi`,
      });
    } catch (e: any) {
      toast({
        title: "Fayl qo'shilmadi",
        description: e?.message || "Xato",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast({ title: "Sarlavha kiriting", variant: "destructive" });
      return;
    }
    if (!assigneeKey) {
      toast({ title: "Ijrochini tanlang", variant: "destructive" });
      return;
    }
    const [kind, idStr] = assigneeKey.split(":");
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      assigneeKind: kind as "user" | "employee",
      assigneeId: parseInt(idStr, 10),
      attachments,
    };

    try {
      if (editing) {
        await updateTask.mutateAsync({ id: editing.id, data: payload });
        toast({ title: "Vazifa yangilandi" });
      } else {
        await createTask.mutateAsync(payload);
        toast({ title: "Vazifa yaratildi" });
      }
      setEditOpen(false);
    } catch (e: any) {
      toast({
        title: "Saqlanmadi",
        description: e?.message || "Xato",
        variant: "destructive",
      });
    }
  }

  async function handleComplete() {
    if (!activeTask) return;
    if (!completionNote.trim() && completionFiles.length === 0) {
      toast({
        title: "Natija qo'shing",
        description: "Matn, rasm yoki fayl majburiy",
        variant: "destructive",
      });
      return;
    }
    try {
      await completeTask.mutateAsync({
        id: activeTask.id,
        completionNote: completionNote.trim() || null,
        completionAttachments: completionFiles,
      });
      toast({ title: "Bajarildi — belgilovchiga yuborildi" });
      setCompleteOpen(false);
    } catch (e: any) {
      toast({
        title: "Yuborilmadi",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  async function handleExtend() {
    if (!activeTask || !extendDue) return;
    try {
      await requestExtension.mutateAsync({
        id: activeTask.id,
        dueAt: new Date(extendDue).toISOString(),
        note: extendNote.trim() || undefined,
      });
      toast({ title: "Muddat so'rovi yuborildi" });
      setExtendOpen(false);
    } catch (e: any) {
      toast({
        title: "So'rov yuborilmadi",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  async function handleAccept(task: Vazifa) {
    try {
      await acceptTask.mutateAsync(task.id);
      toast({ title: "Vazifa qabul qilindi" });
    } catch (e: any) {
      toast({
        title: "Qabul qilinmadi",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  async function handleVerify(task: Vazifa, action: "approve" | "rework") {
    let note: string | undefined;
    if (action === "rework") {
      note =
        prompt("Qayta ishlash sababi (ixtiyoriy):") || undefined;
    }
    try {
      await verifyTask.mutateAsync({ id: task.id, action, note });
      toast({
        title:
          action === "approve"
            ? "Tasdiqlandi — vazifa yakunlandi"
            : "Qayta ishlashga qaytarildi",
      });
    } catch (e: any) {
      toast({
        title: "Xato",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  async function handleResolveExtension(
    task: Vazifa,
    action: "approve" | "reject",
  ) {
    try {
      await resolveExtension.mutateAsync({ id: task.id, action });
      toast({
        title: action === "approve" ? "Muddat uzaytirildi" : "So'rov rad etildi",
      });
    } catch (e: any) {
      toast({
        title: "Xato",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  async function removeTask(task: Vazifa) {
    if (!confirm(`«${task.title}» o'chirilsinmi?`)) return;
    try {
      await deleteTask.mutateAsync(task.id);
      toast({ title: "Vazifa o'chirildi" });
    } catch (e: any) {
      toast({
        title: "O'chirilmadi",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-gradient-to-br from-slate-50 via-white to-sky-50/40">
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200/80 bg-white/70 backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-sky-700/80 mb-1">
              Ish boshqaruvi
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Topshiriqlar
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Belgilagan va olgan tomonlar ko‘radi. Ijrochi faqat natija
              (matn/rasm/fayl) qo‘shib tasdiqlaydi yoki muddat so‘raydi.
            </p>
          </div>
          {canAssign && (
            <Button
              onClick={() => openCreate("today")}
              className="gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Yangi vazifa
            </Button>
          )}
        </div>

        <div className="mt-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qidiruv: sarlavha, ijrochi..."
            className="pl-9 bg-white"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Yuklanmoqda...
          </div>
        ) : (
          <div className="h-full flex gap-4 min-w-max">
            {COLUMNS.map((col) => (
              <section
                key={col.id}
                className="w-[280px] md:w-[300px] flex flex-col rounded-2xl bg-slate-100/80 border border-slate-200/80 overflow-hidden shadow-sm"
              >
                <header className="shrink-0">
                  <div className={cn("h-1.5", col.top)} />
                  <div className="px-3 py-3 flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-800 text-[15px]">
                        {col.label}
                      </h2>
                      <p className="text-xs text-slate-500">{col.hint}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full",
                          col.countBg,
                        )}
                      >
                        {byColumn[col.id].length}
                      </span>
                      {canAssign && col.allowCreate !== false && (
                        <button
                          type="button"
                          onClick={() => openCreate(col.id)}
                          className="p-1 rounded-md text-slate-500 hover:bg-white hover:text-slate-800 transition"
                          title="Ushbu ustunga qo'shish"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-2.5">
                  {byColumn[col.id].length === 0 ? (
                    <div className="mx-0.5 mt-1 rounded-xl border border-dashed border-slate-300 bg-white/50 px-3 py-8 text-center text-sm text-slate-400">
                      {col.empty}
                    </div>
                  ) : (
                    <CardStack
                      items={byColumn[col.id]}
                      stackSize={3}
                      getKey={(task) => task.id}
                      renderCard={(task) => (
                        <TaskCard
                          task={task}
                          overdue={col.id === "past"}
                          isCreator={isCreatorOf(task)}
                          isAssignee={isAssigneeOf(task)}
                          onOpen={() => openEdit(task)}
                          onComplete={() => openComplete(task)}
                          onExtend={() => openExtend(task)}
                          onDelete={() => removeTask(task)}
                          onApproveExt={() =>
                            void handleResolveExtension(task, "approve")
                          }
                          onRejectExt={() =>
                            void handleResolveExtension(task, "reject")
                          }
                          onVerify={() => void handleVerify(task, "approve")}
                          onRework={() => void handleVerify(task, "rework")}
                          onAccept={() => void handleAccept(task)}
                        />
                      )}
                    />
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Beruvchi: yaratish / tahrirlash */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Vazifani tahrirlash" : "Yangi vazifa"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {editing && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Kuzatuv
                  </p>
                  <span
                    className={cn(
                      "text-[11px] font-semibold rounded-full px-2.5 py-0.5",
                      editing.status === "todo" && "bg-sky-100 text-sky-800",
                      editing.status === "in_progress" &&
                        "bg-amber-100 text-amber-900",
                      editing.status === "done" &&
                        "bg-emerald-100 text-emerald-800",
                      editing.status === "verified" &&
                        "bg-violet-100 text-violet-800",
                      editing.status === "cancelled" &&
                        "bg-slate-200 text-slate-600",
                    )}
                  >
                    {editing.status === "todo"
                      ? "Qabul kutilmoqda"
                      : editing.status === "in_progress"
                        ? "Bajarilmoqda"
                        : editing.status === "done"
                          ? "Tasdiq kutilmoqda"
                          : editing.status === "verified"
                            ? "Tasdiqlangan"
                            : editing.status === "cancelled"
                              ? "Bekor"
                              : editing.status}
                  </span>
                </div>
                <div className="text-sm text-slate-600">
                  <span className="text-slate-500">Qabul qilingan: </span>
                  {editing.acceptedAt ? (
                    <span className="font-medium text-sky-800">
                      {formatDate(editing.acceptedAt)}
                    </span>
                  ) : editing.status === "todo" ? (
                    <span className="text-amber-700 font-medium">
                      Hali qabul qilinmagan
                    </span>
                  ) : (
                    <span className="font-medium text-sky-800">
                      Qabul qilingan
                      {editing.updatedAt
                        ? ` · ${formatDate(editing.updatedAt)}`
                        : ""}
                    </span>
                  )}
                </div>
                {editing.dueAt &&
                  editing.status !== "verified" &&
                  editing.status !== "cancelled" && (
                    <DeadlineCountdown
                      deadline={editing.dueAt}
                      showDate
                      className="!mt-1"
                    />
                  )}
                {editing.status === "verified" && (
                  <p className="text-sm text-violet-700 font-medium">
                    Vazifa tasdiqlangan
                    {editing.completedAt
                      ? ` · Yakun: ${formatDate(editing.completedAt)}`
                      : ""}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Sarlavha</Label>
              {isSbRole(user?.role) && !editing && (
                <div className="space-y-1.5">
                  <Select
                    onValueChange={(v) => {
                      const t = SB_TASK_TEMPLATES[Number(v)];
                      if (!t) return;
                      setTitle(t.title);
                      setDescription(t.description);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="SB shablon: kunlik / hodisa / oylik" />
                    </SelectTrigger>
                    <SelectContent>
                      {SB_TASK_TEMPLATES.map((t, i) => (
                        <SelectItem key={`${t.group}-${t.title}`} value={String(i)}>
                          {t.group}: {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Eskalatsiya: SB operatori → SB boshlig‘i → Direktor. Boshqa bo‘limlarga (IT, Ombor, Logistika, AXO, HR, Reviziya) ijrochi sifatida yuboring.
                  </p>
                </div>
              )}
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Masalan: Nomzod bilan qo‘ng‘iroq"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tavsif</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Batafsil matn..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ijrochi</Label>
                <Popover modal open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal h-10 px-3"
                    >
                      <span
                        className={cn(
                          "truncate",
                          !selectedAssignee && "text-muted-foreground",
                        )}
                      >
                        {selectedAssignee?.label || "Xodimni tanlang"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="z-[100] w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command
                      filter={(value, searchQ) => {
                        const q = searchQ.trim().toLowerCase();
                        if (!q) return 1;
                        return value.toLowerCase().includes(q) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Ism yoki lavozim bo‘yicha qidirish..." />
                      <CommandList className="max-h-56">
                        <CommandEmpty>Xodim topilmadi</CommandEmpty>
                        <CommandGroup>
                          {assigneeOptions.map((o) => (
                            <CommandItem
                              key={o.key}
                              value={o.label}
                              onSelect={() => {
                                setAssigneeKey(o.key);
                                setAssigneeOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 shrink-0",
                                  assigneeKey === o.key
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <span className="truncate">{o.label}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Muddat</Label>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Muhimlik</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Past</SelectItem>
                    <SelectItem value="normal">Oddiy</SelectItem>
                    <SelectItem value="high">Yuqori</SelectItem>
                    <SelectItem value="urgent">Shoshilinch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing && (
                <div className="space-y-1.5">
                  <Label>Holat</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">Qabul kutilmoqda</SelectItem>
                      <SelectItem value="in_progress">Bajarilmoqda (Jarayonda)</SelectItem>
                      <SelectItem value="done">Tasdiq kutilmoqda</SelectItem>
                      <SelectItem value="verified">Tasdiqlangan</SelectItem>
                      <SelectItem value="cancelled">Bekor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <FileDropzone
                inputRef={fileRef}
                label="RASM / FAYL (ixtiyoriy)"
                title="Rasm yoki fayl biriktiring"
                hint="PDF, DOCX, rasm — 10 MB gacha. Bosib tanlang yoki shu yerga tortib tashlang"
                uploading={attachUploading}
                uploadedCount={attachments.length}
                onPick={(files) =>
                  void onPickFiles(files, setAttachments, setAttachUploading)
                }
              />
              <AttachmentList
                items={attachments}
                onRemove={(id) =>
                  setAttachments((prev) => prev.filter((x) => x.id !== id))
                }
              />
            </div>
            {editing?.completionNote ||
            (editing?.completionAttachments?.length ?? 0) > 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 space-y-2">
                <p className="text-xs font-semibold text-emerald-800">
                  Ijrochi natijasi
                </p>
                {editing?.completionNote && (
                  <p className="text-sm text-emerald-900 whitespace-pre-wrap">
                    {editing.completionNote}
                  </p>
                )}
                <AttachmentList
                  items={editing?.completionAttachments || []}
                  readOnly
                />
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Bekor
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={createTask.isPending || updateTask.isPending}
            >
              {editing ? "Saqlash" : "Yaratish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ijrochi: faqat ko'rish */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{activeTask?.title}</DialogTitle>
          </DialogHeader>
          {activeTask && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600 whitespace-pre-wrap">
                {activeTask.description || "Tavsif yo'q"}
              </p>
              <p className="text-slate-500">
                Belgilagan: {activeTask.createdByName || "—"}
              </p>
              <p className="text-slate-500">
                Muddat: {formatDate(activeTask.dueAt)}
              </p>
              <AttachmentList items={activeTask.attachments || []} readOnly />
              {(activeTask.status === "done" ||
                activeTask.completionNote ||
                (activeTask.completionAttachments?.length ?? 0) > 0) && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-800">
                    Sizning natijangiz
                  </p>
                  {activeTask.completionNote && (
                    <p className="whitespace-pre-wrap">
                      {activeTask.completionNote}
                    </p>
                  )}
                  <AttachmentList
                    items={activeTask.completionAttachments || []}
                    readOnly
                  />
                </div>
              )}
              {isAssigneeOf(activeTask) && activeTask.status === "todo" && (
                <Button
                  className="w-full"
                  onClick={() => {
                    setViewOpen(false);
                    void handleAccept(activeTask);
                  }}
                  disabled={acceptTask.isPending}
                >
                  Qabul qilish
                </Button>
              )}
              {isAssigneeOf(activeTask) &&
                activeTask.status === "in_progress" && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        setViewOpen(false);
                        openComplete(activeTask);
                      }}
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      Bajarildi
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setViewOpen(false);
                        openExtend(activeTask);
                      }}
                    >
                      <Clock className="h-4 w-4 mr-1.5" />
                      Muddat
                    </Button>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ijrochi: bajarish */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent
          className="max-w-lg"
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Vazifani bajarish</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            «{activeTask?.title}» — matn, rasm yoki fayl qo‘shing va
            yuboring. Belgilagan odamga qaytadi.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Natija matni</Label>
              <Textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                rows={4}
                placeholder="Nima qilganingizni yozing..."
              />
            </div>
            <div className="space-y-2">
              <FileDropzone
                inputRef={completeFileRef}
                label="RASM / FAYL"
                title="Rasm yoki fayl biriktiring"
                hint="PDF, DOCX, rasm — 10 MB gacha. Bosib tanlang yoki shu yerga tortib tashlang"
                uploading={completeUploading}
                uploadedCount={completionFiles.length}
                onPick={(files) =>
                  void onPickFiles(files, setCompletionFiles, setCompleteUploading)
                }
              />
              <AttachmentList
                items={completionFiles}
                onRemove={(id) =>
                  setCompletionFiles((prev) => prev.filter((x) => x.id !== id))
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Bekor
            </Button>
            <Button
              onClick={() => void handleComplete()}
              disabled={completeTask.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Yuborish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ijrochi: muddat so'rovi */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Muddatni surish so‘rovi</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Yangi muddat belgilovchi tasdiqlasa qo‘llanadi.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Yangi muddat</Label>
              <Input
                type="datetime-local"
                value={extendDue}
                onChange={(e) => setExtendDue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Izoh</Label>
              <Textarea
                value={extendNote}
                onChange={(e) => setExtendNote(e.target.value)}
                rows={3}
                placeholder="Nima uchun kerak..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExtendOpen(false)}>
              Bekor
            </Button>
            <Button
              onClick={() => void handleExtend()}
              disabled={requestExtension.isPending}
            >
              So‘rov yuborish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileDropzone({
  inputRef,
  label,
  title,
  hint,
  onPick,
  uploading,
  uploadedCount = 0,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  title: string;
  hint: string;
  onPick: (files: FileList | null) => void;
  uploading?: boolean;
  uploadedCount?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const success = !uploading && uploadedCount > 0;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <label
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          if (!uploading) onPick(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition-colors",
          uploading && "pointer-events-none opacity-80 border-sky-400 bg-sky-50",
          !uploading &&
            dragging &&
            "border-primary bg-primary/5",
          !uploading &&
            success &&
            "border-emerald-500 bg-emerald-50 hover:border-emerald-600 hover:bg-emerald-50/90",
          !uploading &&
            !success &&
            !dragging &&
            "border-slate-300 bg-slate-50/80 hover:border-primary/50 hover:bg-slate-50",
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white",
            success ? "bg-emerald-600" : uploading ? "bg-sky-600" : "bg-slate-800",
          )}
        >
          {success ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 text-left">
          <span
            className={cn(
              "block text-sm font-semibold",
              success ? "text-emerald-800" : "text-slate-700",
            )}
          >
            {uploading
              ? "Yuklanmoqda..."
              : success
                ? `${uploadedCount} ta fayl yuklandi`
                : title}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-xs",
              success ? "text-emerald-700" : "text-slate-500",
            )}
          >
            {uploading
              ? "Kuting, fayl serverga yuborilmoqda"
              : success
                ? "Yana qo‘shish uchun bosing yoki tortib tashlang"
                : hint}
          </span>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function AttachmentList({
  items,
  onRemove,
  readOnly,
}: {
  items: TaskAttachment[];
  onRemove?: (id: string) => void;
  readOnly?: boolean;
}) {
  if (!items.length) return null;

  const downloadHref = (url: string) => {
    if (url.startsWith("/api/uploads/")) {
      return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
    }
    return url;
  };

  return (
    <ul className="space-y-1.5">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-sm"
        >
          {a.kind === "image" ? (
            <a href={a.url} target="_blank" rel="noreferrer" className="shrink-0">
              <img
                src={a.url}
                alt=""
                className="h-8 w-8 rounded object-cover"
              />
            </a>
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-slate-500" />
          )}
          <span className="truncate flex-1" title={a.name}>
            {a.name}
          </span>
          <a
            href={downloadHref(a.url)}
            download={a.name}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md border bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Yuklab olish
          </a>
          {!readOnly && onRemove && (
            <button
              type="button"
              className="p-1 text-slate-400 hover:text-red-600"
              onClick={() => onRemove(a.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function TaskCard({
  task,
  overdue,
  isCreator,
  isAssignee,
  onOpen,
  onComplete,
  onExtend,
  onDelete,
  onApproveExt,
  onRejectExt,
  onVerify,
  onRework,
  onAccept,
}: {
  task: Vazifa;
  overdue?: boolean;
  isCreator: boolean;
  isAssignee: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onExtend: () => void;
  onDelete: () => void;
  onApproveExt: () => void;
  onRejectExt: () => void;
  onVerify: () => void;
  onRework: () => void;
  onAccept: () => void;
}) {
  const pri = PRIORITY[task.priority] || PRIORITY.normal;
  const images = task.attachments?.filter((a) => a.kind === "image") ?? [];
  const files = task.attachments?.filter((a) => a.kind === "file") ?? [];
  const pendingExt = task.extensionStatus === "pending";
  const awaitingReview = task.status === "done";
  const isVerified = task.status === "verified";
  const needsAccept = task.status === "todo";
  const isAccepted = task.status === "in_progress";
  const hideCountdown = awaitingReview || isVerified;

  return (
    <article
      className={cn(
        "group rounded-lg border bg-white p-2.5 shadow-sm hover:shadow transition cursor-pointer",
        overdue && !hideCountdown && "border-rose-200 ring-1 ring-rose-100",
        needsAccept && isAssignee && "border-sky-300 ring-1 ring-sky-100",
        isAccepted && "border-blue-200 bg-blue-50/20",
        awaitingReview && "border-emerald-200 bg-emerald-50/30",
        isVerified && "border-violet-200 bg-violet-50/40",
        pendingExt && "border-amber-300",
      )}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        {isVerified ? (
          <Badge className="text-[9px] h-5 px-1.5 font-medium bg-violet-100 text-violet-800 hover:bg-violet-100">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            Bajarilgan
          </Badge>
        ) : awaitingReview ? (
          <Badge className="text-[9px] h-5 px-1.5 font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            Bajarilgan
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className={cn("text-[9px] h-5 px-1.5 font-medium", pri.className)}
          >
            <Flag className="h-2.5 w-2.5 mr-0.5" />
            {pri.label}
          </Badge>
        )}
        <span
          className={cn(
            "text-[9px] font-semibold shrink-0 rounded-full px-1.5 py-0.5",
            awaitingReview && "bg-emerald-100 text-emerald-800",
            pendingExt && !awaitingReview && "bg-orange-100 text-orange-800",
            needsAccept && "bg-sky-100 text-sky-800",
            isAccepted && "bg-amber-100 text-amber-900",
            isVerified && "bg-violet-100 text-violet-800",
            task.status === "cancelled" && "bg-slate-200 text-slate-600",
          )}
        >
          {awaitingReview
            ? "Tasdiq kutilmoqda"
            : pendingExt
              ? "Muddat so'rovi"
              : needsAccept
                ? "Qabul kutilmoqda"
                : isVerified
                  ? "Tasdiqlangan"
                  : isAccepted
                    ? "Bajarilmoqda"
                    : task.status}
        </span>
      </div>

      <h3 className="text-[13px] font-semibold text-slate-900 leading-snug mb-1">
        {task.title}
      </h3>

      {task.candidateId && task.pipelineStage && (
        <a
          href={
            task.pipelineStage === "hired"
              ? `/candidates/${task.candidateId}`
              : `/candidates/${task.candidateId}/${
                  task.pipelineStage === "offline_interview"
                    ? "offline-interview"
                    : task.pipelineStage === "final_decision"
                      ? "final-decision"
                      : task.pipelineStage
                }`
          }
          className="inline-flex text-[10px] font-medium text-sky-700 hover:underline mb-1"
          onClick={(e) => e.stopPropagation()}
        >
          Nomzod formasini ochish →
        </a>
      )}

      {task.description && (
        <p className="text-[11px] text-slate-500 line-clamp-2 mb-1.5">
          {task.description}
        </p>
      )}

      {images.length > 0 && (
        <div className="flex gap-1 mb-1.5 overflow-hidden">
          {images.slice(0, 3).map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt=""
              className="h-9 w-9 rounded object-cover border"
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-0.5 text-[10px] text-slate-500 mb-1.5">
        <div className="flex items-center gap-1.5">
          <User className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{task.assigneeName || "—"}</span>
        </div>
        {task.createdByName && (
          <div className="truncate pl-4 text-slate-400">
            Bergan: {task.createdByName}
          </div>
        )}
      </div>

      {hideCountdown ? (
        <div
          className={cn(
            "mb-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold",
            isVerified
              ? "border-violet-200 bg-violet-50 text-violet-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900",
          )}
        >
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            {isVerified ? "Bajarilgan va tasdiqlangan" : "Bajarilgan — tasdiq kutilmoqda"}
          </div>
        </div>
      ) : task.dueAt ? (
        <div className="mb-1.5 text-[10px] text-slate-500 flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          <span>{formatDate(task.dueAt)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1.5">
          <Calendar className="h-3 w-3" />
          Muddat yo‘q
        </div>
      )}

      {(awaitingReview || isVerified) &&
        (task.completionNote || (task.completionAttachments?.length ?? 0) > 0) && (
        <div className="mb-1.5 rounded-md bg-emerald-50 border border-emerald-100 px-2 py-1 text-[10px] text-emerald-800">
          <span className="font-semibold">Natija: </span>
          {task.completionNote
            ? task.completionNote.slice(0, 60) +
              (task.completionNote.length > 60 ? "…" : "")
            : `${task.completionAttachments.length} ta fayl`}
        </div>
      )}

      {pendingExt && (
        <div className="mb-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-900">
          Muddat so‘ralgan: {formatDate(task.extensionRequestedDueAt)}
        </div>
      )}

      {(images.length > 0 || files.length > 0) && !hideCountdown && (
        <div className="flex items-center gap-2 text-slate-400 mb-1">
          {images.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px]">
              <ImageIcon className="h-3 w-3" />
              {images.length}
            </span>
          )}
          {files.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px]">
              <Paperclip className="h-3 w-3" />
              {files.length}
            </span>
          )}
        </div>
      )}

      <div
        className="mt-1.5 pt-1.5 border-t border-slate-100 flex flex-wrap gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
        onClick={(e) => e.stopPropagation()}
      >
        {isAssignee && needsAccept && (
          <button
            type="button"
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md text-[11px] py-1.5 bg-sky-600 text-white hover:bg-sky-700"
            onClick={onAccept}
          >
            Qabul qilish
          </button>
        )}
        {isAssignee && isAccepted && (
          <>
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md text-[11px] py-1.5 hover:bg-emerald-50 text-emerald-700"
              onClick={onComplete}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Bajarildi
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-md text-[11px] px-2 py-1.5 hover:bg-amber-50 text-amber-800"
              onClick={onExtend}
            >
              <Clock className="h-3.5 w-3.5" />
              Muddat
            </button>
          </>
        )}
        {isCreator && awaitingReview && (
          <>
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md text-[11px] py-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={onVerify}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Tasdiqlash
            </button>
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md text-[11px] py-1.5 hover:bg-amber-50 text-amber-800 border border-amber-200"
              onClick={onRework}
            >
              Qayta ishlash
            </button>
          </>
        )}
        {isCreator && pendingExt && (
          <>
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md text-[11px] py-1.5 hover:bg-emerald-50 text-emerald-700"
              onClick={onApproveExt}
            >
              Tasdiqlash
            </button>
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md text-[11px] py-1.5 hover:bg-rose-50 text-rose-700"
              onClick={onRejectExt}
            >
              Rad etish
            </button>
          </>
        )}
        {isCreator && (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-rose-50 text-rose-600 ml-auto"
            onClick={onDelete}
            title="O'chirish"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
