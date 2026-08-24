import React, { useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useToast } from "../../hooks/use-toast";
import {
  useCompleteReminder,
  useCreateReminder,
  useDeleteReminder,
  useGetReminder,
  useGetReminders,
  usePostponeReminder,
  type Reminder,
  type ReminderAttachment,
} from "../../lib/eslatmalar-api";
import { fileToAttachment } from "../../lib/vazifalar-api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Bell,
  Check,
  Clock,
  FileText,
  History,
  Plus,
  Trash2,
  CalendarClock,
} from "lucide-react";

type BoardCol = "missed" | "today" | "tomorrow" | "week" | "later" | "done";

const COLUMNS: {
  id: BoardCol;
  label: string;
  hint: string;
  top: string;
  countBg: string;
  empty: string;
  allowCreate: boolean;
}[] = [
  {
    id: "missed",
    label: "Bajarilmadi",
    hint: "Muddat o‘tgan",
    top: "bg-rose-500",
    countBg: "bg-rose-100 text-rose-800",
    empty: "Kechikkan eslatma yo‘q",
    allowCreate: false,
  },
  {
    id: "today",
    label: "Bugun",
    hint: "Shu kun",
    top: "bg-amber-500",
    countBg: "bg-amber-100 text-amber-900",
    empty: "Bugungi eslatma yo‘q",
    allowCreate: true,
  },
  {
    id: "tomorrow",
    label: "Ertaga",
    hint: "Kelasi kun",
    top: "bg-sky-500",
    countBg: "bg-sky-100 text-sky-800",
    empty: "Ertangi eslatma yo‘q",
    allowCreate: true,
  },
  {
    id: "week",
    label: "1 hafta",
    hint: "2–7 kun ichida",
    top: "bg-emerald-500",
    countBg: "bg-emerald-100 text-emerald-800",
    empty: "Haftalik eslatma yo‘q",
    allowCreate: true,
  },
  {
    id: "later",
    label: "Keyinroq",
    hint: "Maxsus sana",
    top: "bg-indigo-500",
    countBg: "bg-indigo-100 text-indigo-800",
    empty: "Uzoq muddatli yo‘q",
    allowCreate: true,
  },
  {
    id: "done",
    label: "Bajarilgan",
    hint: "Yakunlanganlar",
    top: "bg-violet-500",
    countBg: "bg-violet-100 text-violet-800",
    empty: "Bajarilgan yo‘q",
    allowCreate: false,
  },
];

const INTERVALS = [
  { value: "none", label: "Faqat bir marta" },
  { value: "15", label: "Har 15 daqiqa" },
  { value: "30", label: "Har 30 daqiqa" },
  { value: "60", label: "Har 1 soat" },
  { value: "120", label: "Har 2 soat" },
  { value: "360", label: "Har 6 soat" },
  { value: "720", label: "Har 12 soat" },
  { value: "1440", label: "Har kun" },
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function boardColumnFor(r: Reminder, now = new Date()): BoardCol {
  if (r.status === "completed") return "done";
  if (r.status === "missed") return "missed";
  const due = startOfDay(new Date(r.dueAt));
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  if (due.getTime() < today.getTime()) return "missed";
  if (due.getTime() === today.getTime()) return "today";
  if (due.getTime() === tomorrow.getTime()) return "tomorrow";
  if (due.getTime() > tomorrow.getTime() && due.getTime() <= weekEnd.getTime()) {
    return "week";
  }
  return "later";
}

function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string | null | undefined) {
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

function defaultDueForColumn(col: BoardCol) {
  const now = new Date();
  const setH = (d: Date, h = 18) => {
    d.setHours(h, 0, 0, 0);
    return d;
  };
  if (col === "today") return setH(new Date());
  if (col === "tomorrow") return setH(addDays(now, 1));
  if (col === "week") return setH(addDays(now, 7));
  if (col === "later") return setH(addDays(now, 14));
  return setH(new Date());
}

async function readFileAsAttachment(file: File): Promise<ReminderAttachment> {
  const att = await fileToAttachment(file);
  return {
    id: att.id || crypto.randomUUID(),
    name: att.name,
    mimeType: att.mimeType,
    kind: att.kind,
    url: att.url,
    size: att.size,
  };
}

const EVENT_LABELS: Record<string, string> = {
  created: "Yaratildi",
  due_changed: "Muddat o‘zgardi",
  completed: "Bajarildi",
  reopened: "Qayta ochildi",
  missed: "Bajarilmadi",
  notified: "Ogohlantirildi",
  note: "Yangilandi",
};

export default function EslatmalarPage() {
  const { toast } = useToast();
  const { data: reminders = [], isLoading } = useGetReminders();
  const createMut = useCreateReminder();
  const postponeMut = usePostponeReminder();
  const completeMut = useCompleteReminder();
  const deleteMut = useDeleteReminder();

  const [createOpen, setCreateOpen] = useState(false);
  const [createCol, setCreateCol] = useState<BoardCol>("today");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [notifyAt, setNotifyAt] = useState("");
  const [interval, setInterval] = useState("none");
  const [attachments, setAttachments] = useState<ReminderAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [newDue, setNewDue] = useState("");
  const [postponeNote, setPostponeNote] = useState("");

  const { data: detail } = useGetReminder(detailId);

  const byCol = useMemo(() => {
    const map: Record<BoardCol, Reminder[]> = {
      missed: [],
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      done: [],
    };
    for (const r of reminders) {
      map[boardColumnFor(r)].push(r);
    }
    return map;
  }, [reminders]);

  function openCreate(col: BoardCol) {
    setCreateCol(col);
    setTitle("");
    setDescription("");
    setDueAt(toDatetimeLocalValue(defaultDueForColumn(col).toISOString()));
    setNotifyAt("");
    setInterval("none");
    setAttachments([]);
    setCreateOpen(true);
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const next: ReminderAttachment[] = [];
      for (const f of Array.from(files)) {
        next.push(await readFileAsAttachment(f));
      }
      setAttachments((prev) => [...prev, ...next]);
    } catch (e: any) {
      toast({ title: "Fayl", description: e.message, variant: "destructive" });
    }
  }

  async function submitCreate() {
    if (!title.trim() || !dueAt) {
      toast({ title: "Sarlavha va muddat majburiy", variant: "destructive" });
      return;
    }
    try {
      await createMut.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        dueAt: new Date(dueAt).toISOString(),
        notifyAt: notifyAt ? new Date(notifyAt).toISOString() : null,
        remindIntervalMinutes: interval === "none" ? null : parseInt(interval, 10),
        attachments,
      });
      setCreateOpen(false);
      toast({ title: "Eslatma saqlandi" });
    } catch (e: any) {
      toast({ title: "Xato", description: e.message, variant: "destructive" });
    }
  }

  async function submitPostpone() {
    if (!detailId || !newDue) return;
    try {
      await postponeMut.mutateAsync({
        id: detailId,
        dueAt: new Date(newDue).toISOString(),
        note: postponeNote.trim() || undefined,
      });
      setPostponeOpen(false);
      toast({ title: "Muddat yangilandi", description: "Tarixga yozildi" });
    } catch (e: any) {
      toast({ title: "Xato", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-br from-slate-50 via-white to-amber-50/30">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/70 px-4 py-5 backdrop-blur sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-700/80">
              Shaxsiy nazorat
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Eslatmalarim
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              O‘zingizga vazifa, muddat, ogohlantirish va qayta eslatish.
              Muddat o‘tsa — «Bajarilmadi». Ko‘chirishlar tarixda saqlanadi.
            </p>
          </div>
          <Button onClick={() => openCreate("today")} className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Yangi eslatma
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
        {isLoading ? (
          <div className="grid h-full grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-full min-h-[320px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-w-max gap-3">
            {COLUMNS.map((col) => {
              const items = byCol[col.id];
              return (
                <div
                  key={col.id}
                  className="flex w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:w-[280px]"
                >
                  <div className={cn("h-1.5", col.top)} />
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{col.label}</p>
                      <p className="text-[11px] text-slate-500">{col.hint}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                        col.countBg,
                      )}
                    >
                      {items.length}
                    </span>
                  </div>

                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                    {items.length === 0 ? (
                      <p className="px-1 py-6 text-center text-xs text-slate-400">{col.empty}</p>
                    ) : (
                      items.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setDetailId(r.id)}
                          className={cn(
                            "w-full rounded-lg border p-3 text-left transition hover:shadow-sm",
                            r.status === "missed"
                              ? "border-rose-200 bg-rose-50/70"
                              : r.status === "completed"
                                ? "border-violet-200 bg-violet-50/50"
                                : "border-slate-200 bg-slate-50/80 hover:border-slate-300",
                          )}
                        >
                          <p className="text-sm font-semibold leading-snug text-slate-900">
                            {r.title}
                          </p>
                          {r.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                              {r.description}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                              <Clock className="h-3 w-3" />
                              {r.remainingLabel}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                              <CalendarClock className="h-3 w-3" />
                              {formatDate(r.dueAt)}
                            </span>
                            {r.attachments?.length ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                                <FileText className="h-3 w-3" />
                                {r.attachments.length}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  {col.allowCreate && (
                    <div className="border-t border-slate-100 p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full justify-start gap-1.5 text-xs text-slate-600"
                        onClick={() => openCreate(col.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Qo‘shish
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
          onFocusOutside={(e) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest?.('input[type="file"]')) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest?.('input[type="file"]')) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Yangi eslatma</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Sarlavha *</p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nima qilish kerak?"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Izoh</p>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Batafsil..."
                rows={3}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Qachon bajarish *</p>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Qachon ogohlantirish</p>
                <Input
                  type="datetime-local"
                  value={notifyAt}
                  onChange={(e) => setNotifyAt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Qancha vaqtda eslatish</p>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FileDropzone
              inputRef={fileRef}
              onPick={onPickFiles}
            />
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50 px-2.5 py-1.5 text-sm"
                  >
                    <span className="truncate">{a.name}</span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Bekor
            </Button>
            <Button onClick={submitCreate} disabled={createMut.isPending}>
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.title || "Eslatma"}</DialogTitle>
          </DialogHeader>
          {!detail ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-4 py-1">
              {detail.description ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p>
              ) : null}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Muddat</p>
                  <p className="font-medium">{formatDate(detail.dueAt)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Qolgan vaqt</p>
                  <p className="font-medium">{detail.remainingLabel}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Ogohlantirish</p>
                  <p className="font-medium">{formatDate(detail.notifyAt)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Qayta eslatish</p>
                  <p className="font-medium">
                    {INTERVALS.find((i) => i.value === String(detail.remindIntervalMinutes ?? "none"))
                      ?.label || "Faqat bir marta"}
                  </p>
                </div>
              </div>

              {detail.attachments?.length ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Fayllar
                  </p>
                  <ul className="space-y-1">
                    {detail.attachments.map((a) => (
                      <li key={a.id}>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-slate-50"
                        >
                          <FileText className="h-4 w-4 text-slate-500" />
                          <span className="truncate">{a.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <History className="h-3.5 w-3.5" />
                  Tarix
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {(detail.events ?? []).map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">
                          {EVENT_LABELS[ev.eventType] || ev.eventType}
                        </span>
                        <span className="text-slate-400">{formatDate(ev.createdAt)}</span>
                      </div>
                      {ev.note ? <p className="mt-0.5 text-slate-600">{ev.note}</p> : null}
                      {(ev.fromDueAt || ev.toDueAt) && (
                        <p className="mt-1 text-slate-500">
                          {ev.fromDueAt ? formatDate(ev.fromDueAt) : "—"} →{" "}
                          {ev.toDueAt ? formatDate(ev.toDueAt) : "—"}
                        </p>
                      )}
                      {(ev.fromStatus || ev.toStatus) && (
                        <p className="mt-0.5 text-slate-500">
                          Holat: {ev.fromStatus || "—"} → {ev.toStatus || "—"}
                        </p>
                      )}
                    </li>
                  ))}
                  {!detail.events?.length && (
                    <li className="text-center text-slate-400">Tarix bo‘sh</li>
                  )}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {detail.status !== "completed" && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={async () => {
                      try {
                        await completeMut.mutateAsync(detail.id);
                        toast({ title: "Bajarildi" });
                        setDetailId(null);
                      } catch (e: any) {
                        toast({
                          title: "Xato",
                          description: e.message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Bajarildi
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setNewDue(toDatetimeLocalValue(detail.dueAt));
                    setPostponeNote("");
                    setPostponeOpen(true);
                  }}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Muddatni ko‘chirish
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-rose-600"
                  onClick={async () => {
                    if (!confirm("Eslatmani o‘chirasizmi?")) return;
                    try {
                      await deleteMut.mutateAsync(detail.id);
                      setDetailId(null);
                      toast({ title: "O‘chirildi" });
                    } catch (e: any) {
                      toast({
                        title: "Xato",
                        description: e.message,
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  O‘chirish
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Postpone */}
      <Dialog open={postponeOpen} onOpenChange={setPostponeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Muddatni ko‘chirish</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Yangi muddat</p>
              <Input
                type="datetime-local"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Izoh (ixtiyoriy)</p>
              <Textarea
                value={postponeNote}
                onChange={(e) => setPostponeNote(e.target.value)}
                placeholder="Nima uchun ko‘chirilyapti?"
                rows={2}
              />
            </div>
            <p className="text-xs text-slate-500">
              Eski va yangi muddat tarixda saqlanadi (1-holat, 2-holat…).
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPostponeOpen(false)}>
              Bekor
            </Button>
            <Button onClick={submitPostpone} disabled={postponeMut.isPending}>
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileDropzone({
  inputRef,
  onPick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (files: FileList | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Fayl
      </p>
      <label
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onPick(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-slate-300 bg-slate-50/80 hover:border-primary/50",
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white">
          <Bell className="h-5 w-5" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-sm font-semibold text-slate-700">
            Fayl yuklash
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            PDF, rasm, hujjat — 10 MB gacha
          </span>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf"
          className="sr-only"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
