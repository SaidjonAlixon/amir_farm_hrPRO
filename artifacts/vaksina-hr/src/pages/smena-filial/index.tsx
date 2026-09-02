import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, CalendarDays, MapPin, Plus, Search, Settings2, Trash2, UserRound, X } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useToast } from "../../hooks/use-toast";
import { cn } from "../../lib/utils";
import {
  assignSmenaBranch,
  deleteDayShiftPlan,
  fetchDayShiftPlans,
  fetchSmenaMe,
  fetchShiftTemplates,
  saveDayShiftPlan,
  saveMySmena,
  saveShiftTemplate,
  shiftTypeShort,
  type DayShiftPlanDay,
  type ShiftTemplate,
  type ShiftTypeKey,
  type SmenaAssignable,
  type SmenaBranch,
} from "../../lib/smena-api";

type ShiftOption = {
  type: ShiftTypeKey;
  label: string;
  hint?: string;
  start: string;
  end: string;
  hoursNote?: string;
  skipGeofence?: boolean;
  overnight?: boolean;
};

function orgLabel(org: string | null) {
  if (org === "pharmacist") return "Farmasevt";
  if (org === "intern") return "Stajyor";
  if (org === "manager") return "Mudir";
  if (org === "coordinator") return "Koordinator";
  return org || "Xodim";
}

type DaySegmentDraft = {
  shiftType: ShiftTypeKey;
  shiftStart: string;
  shiftEnd: string;
  branchId: number | null;
};

function defaultSegment(type: ShiftTypeKey, meta?: ShiftOption): DaySegmentDraft {
  return {
    shiftType: type,
    shiftStart: meta?.start || "14:00",
    shiftEnd: meta?.end || "22:00",
    branchId: null,
  };
}

function needsBranch(shift: ShiftTypeKey) {
  return shift !== "remote" && shift !== "flexible" && shift !== "custom";
}

function segmentNeedsTimes(type: ShiftTypeKey) {
  return type === "custom" || type === "three";
}

const MAIN_SHIFTS: ShiftTypeKey[] = ["one", "two", "three"];
const OTHER_SHIFTS: ShiftTypeKey[] = ["remote", "flexible", "alternate", "alternate_night"];

function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0b3a5c] text-[11px] font-bold text-white">
        {n}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {hint ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function ShiftChip({
  label,
  active,
  onClick,
  accent,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: "amber" | "default";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl px-3.5 py-2 text-xs font-semibold ring-1 ring-inset transition",
        active && accent === "amber" && "bg-amber-600 text-white ring-amber-600",
        active && accent !== "amber" && "bg-[#0b3a5c] text-white ring-[#0b3a5c]",
        !active && "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300",
      )}
    >
      {label}
    </button>
  );
}

function TemplateRow({
  template,
  saving,
  highlight,
  onSave,
}: {
  template: ShiftTemplate;
  saving: boolean;
  highlight?: boolean;
  onSave: (p: { key: string; start: string; end: string }) => void;
}) {
  const [start, setStart] = useState(template.start);
  const [end, setEnd] = useState(template.end);

  useEffect(() => {
    setStart(template.start);
    setEnd(template.end);
  }, [template.start, template.end]);

  const dirty = start !== template.start || end !== template.end;

  return (
    <tr
      id={`template-${template.key}`}
      className={cn(
        "border-b border-slate-100 last:border-0 transition-colors",
        highlight && "bg-amber-100 ring-2 ring-inset ring-amber-400",
      )}
    >
      <td className="px-4 py-3 pr-2 align-middle">
        <p className="text-sm font-semibold text-slate-900">{template.label}</p>
        <p className="text-[10px] leading-snug text-slate-500">{template.hint}</p>
      </td>
      <td className="px-1 py-3 align-middle">
        <Input
          id={`template-start-${template.key}`}
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-9 w-full min-w-[6.5rem] bg-white"
        />
      </td>
      <td className="px-1 py-3 align-middle">
        <Input
          id={`template-end-${template.key}`}
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-9 w-full min-w-[6.5rem] bg-white"
        />
      </td>
      <td className="px-4 py-3 pl-2 text-right align-middle">
        <Button
          type="button"
          size="sm"
          className={cn(dirty && "bg-[#0b3a5c] hover:bg-[#0a3350]")}
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || saving}
          onClick={() => onSave({ key: template.key, start, end })}
        >
          Saqlash
        </Button>
      </td>
    </tr>
  );
}

function GlobalStandardsCard({
  templates,
  loading,
  saving,
  highlightKey,
  onSave,
}: {
  templates: ShiftTemplate[];
  loading: boolean;
  saving: boolean;
  highlightKey: ShiftTypeKey | null;
  onSave: (p: { key: string; start: string; end: string }) => void;
}) {
  return (
    <Card id="standart-vaqtlar" className="overflow-hidden border-[#0b3a5c]/20 shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0b3a5c]" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Standart smena vaqtlari</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                1-smena, 2-smena, 3-smena, masofadan va boshqa barcha smenalar uchun umumiy vaqt. O‘zgarish shu
                smenadagi barcha xodimlarga qo‘llanadi.
              </p>
            </div>
          </div>
        </div>
      </div>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Yuklanmoqda…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Smena</th>
                  <th className="px-1 py-2">Boshlanish</th>
                  <th className="px-1 py-2">Tugash</th>
                  <th className="px-4 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody className="px-4">
                {templates.map((t) => (
                  <TemplateRow
                    key={t.key}
                    template={t}
                    saving={saving}
                    highlight={highlightKey === t.key}
                    onSave={onSave}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2">
          <p className="text-[10px] text-slate-500">
            Maxsus vaqt faqat alohida xodim uchun — pastdagi xodim bo‘limidan belgilanadi.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SmenaFilialPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["smena-me"], queryFn: fetchSmenaMe });
  const data = q.data;

  const templatesQ = useQuery({
    queryKey: ["shift-templates"],
    queryFn: fetchShiftTemplates,
    enabled: Boolean(data?.canEditShiftTemplates || data?.canAssignAny),
  });

  const [branchQ, setBranchQ] = useState("");
  const [peopleQ, setPeopleQ] = useState("");
  const [pickedBranchId, setPickedBranchId] = useState<number | null>(null);
  const [pickedPersonId, setPickedPersonId] = useState<number | null>(null);
  const [pickedShift, setPickedShift] = useState<ShiftTypeKey>("one");
  const [customLabel, setCustomLabel] = useState("");
  const [customStart, setCustomStart] = useState("09:00");
  const [customEnd, setCustomEnd] = useState("18:00");
  const [highlightTemplate, setHighlightTemplate] = useState<ShiftTypeKey | null>(null);
  const [dayDate, setDayDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const [dayPlanMode, setDayPlanMode] = useState<"single" | "multi">("single");
  const [assignMode, setAssignMode] = useState<"permanent" | "daily">("permanent");
  const [showOtherShifts, setShowOtherShifts] = useState(false);
  const [daySegments, setDaySegments] = useState<DaySegmentDraft[]>([
    defaultSegment("three", { type: "three", label: "3-smena", start: "14:00", end: "22:00" }),
  ]);

  const shiftOptions: ShiftOption[] = useMemo(() => {
    if (data?.shifts?.length) return data.shifts as ShiftOption[];
    return [
      { type: "one", label: "1-smena", start: "08:00", end: "17:00" },
      { type: "two", label: "2-smena", start: "18:00", end: "23:45" },
      { type: "three", label: "3-smena", start: "14:00", end: "22:00" },
      { type: "remote", label: "Masofadan", start: "09:00", end: "18:00", skipGeofence: true },
      { type: "flexible", label: "Erkin grafik", start: "09:00", end: "21:00", skipGeofence: true },
      { type: "alternate", label: "Kun ora", start: "08:00", end: "17:00" },
      { type: "alternate_night", label: "Kun ora kechki", start: "17:00", end: "08:00", overnight: true },
    ];
  }, [data?.shifts]);

  const standardTemplates: ShiftTemplate[] = useMemo(() => {
    if (templatesQ.data?.shifts?.length) return templatesQ.data.shifts;
    return shiftOptions
      .filter((s) => s.type !== "custom")
      .map((s) => ({
        key: s.type,
        label: s.label,
        hint: s.hint || "",
        start: s.start,
        end: s.end,
        overnight: s.overnight,
        skipGeofence: s.skipGeofence,
        warnHm: s.start,
        warnText: "",
        hoursNote: `${s.label}: ${s.start}–${s.end}`,
      }));
  }, [templatesQ.data?.shifts, shiftOptions]);

  const shiftByType = useMemo(() => new Map(shiftOptions.map((s) => [s.type, s])), [shiftOptions]);

  const staff = useMemo(() => {
    const list = data?.assignable ?? [];
    if (data?.canAssignAny) return list;
    return list.filter((p) => p.orgRole === "pharmacist" || p.orgRole === "intern" || p.orgRole === "manager");
  }, [data?.assignable, data?.canAssignAny]);

  const branches = useMemo(() => {
    const list = data?.branches ?? [];
    const s = branchQ.trim().toLowerCase();
    if (!s) return list;
    return list.filter((b) => `${b.name} ${b.managerName}`.toLowerCase().includes(s));
  }, [data?.branches, branchQ]);

  const people = useMemo(() => {
    const s = peopleQ.trim().toLowerCase();
    if (!s) return staff;
    return staff.filter((p) =>
      `${p.fullName} ${p.position || ""} ${orgLabel(p.orgRole)} ${p.assignedBranchName || ""} ${p.shiftLabel || ""}`.toLowerCase().includes(s),
    );
  }, [staff, peopleQ]);

  const picked = staff.find((p) => p.id === pickedPersonId) ?? null;
  const pickedBranch = (data?.branches ?? []).find((b) => b.id === pickedBranchId) ?? null;
  const branchRequired = needsBranch(pickedShift);
  const activeShiftMeta = shiftByType.get(pickedShift);
  const canEditStandards = Boolean(data?.canEditShiftTemplates || data?.canAssignAny || data?.canAssignOthers);
  const canEditThreeTimes = Boolean(data?.canAssignOthers);
  const canEditShiftTimes =
    pickedShift === "custom" || pickedShift === "three"
      ? canEditThreeTimes || Boolean(data?.canAssignAny)
      : canEditStandards;
  const standardDirty =
    pickedShift !== "custom" &&
    Boolean(activeShiftMeta) &&
    (customStart !== (activeShiftMeta?.start || "") || customEnd !== (activeShiftMeta?.end || ""));

  function saveStandardFromPanel() {
    if (pickedShift === "custom") return;
    if (!customStart.trim() || !customEnd.trim()) {
      toast({ title: "Vaqt kiriting", variant: "destructive" });
      return;
    }
    setHighlightTemplate(pickedShift);
    saveTemplate.mutate({ key: pickedShift, start: customStart.trim(), end: customEnd.trim() });
    window.setTimeout(() => setHighlightTemplate(null), 3000);
  }

  const dayPlansQ = useQuery({
    queryKey: ["smena-day-plan", pickedPersonId],
    queryFn: () => fetchDayShiftPlans(pickedPersonId!),
    enabled: Boolean(pickedPersonId),
  });

  const saveDayPlan = useMutation({
    mutationFn: () => {
      if (!pickedPersonId) throw new Error("Xodim tanlanmagan");
      const segments = daySegments.map((s) => ({
        shiftType: s.shiftType,
        ...(segmentNeedsTimes(s.shiftType) ? { shiftStart: s.shiftStart, shiftEnd: s.shiftEnd } : {}),
        branchId: s.branchId ?? pickedBranchId ?? null,
      }));
      return saveDayShiftPlan(pickedPersonId, { workDate: dayDate, segments });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["smena-day-plan", pickedPersonId] });
      toast({ title: "Kunlik smena rejasi saqlandi", description: r.message });
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  const removeDayPlan = useMutation({
    mutationFn: (workDate: string) => deleteDayShiftPlan(pickedPersonId!, workDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smena-day-plan", pickedPersonId] });
      toast({ title: "Kunlik reja o‘chirildi" });
    },
    onError: (e: Error) => toast({ title: "O‘chirilmadi", description: e.message, variant: "destructive" }),
  });

  const saveTemplate = useMutation({
    mutationFn: (p: { key: string; start: string; end: string }) => saveShiftTemplate(p.key, { start: p.start, end: p.end }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-templates"] });
      qc.invalidateQueries({ queryKey: ["smena-me"] });
      toast({ title: "Umumiy smena vaqti yangilandi", description: "Barcha tegishli xodimlarga qo‘llanadi." });
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  const saveMine = useMutation({
    mutationFn: (body: { assignedBranchId?: number }) => saveMySmena(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smena-me"] });
      toast({ title: "Filial saqlandi" });
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  const saveAssign = useMutation({
    mutationFn: (p: {
      id: number;
      assignedBranchId: number | null;
      shiftType: ShiftTypeKey;
      shiftOnly?: boolean;
      shiftLabel?: string;
      shiftStart?: string;
      shiftEnd?: string;
    }) =>
      assignSmenaBranch(p.id, p.assignedBranchId, p.shiftType, {
        shiftOnly: p.shiftOnly,
        shiftLabel: p.shiftLabel,
        shiftStart: p.shiftStart,
        shiftEnd: p.shiftEnd,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["smena-me"] });
      toast({
        title: "Xodimga saqlandi",
        description: r.assignedBranchName ? `${r.assignedBranchName} · smena yangilandi` : "Smena va vaqt xodimga yuborildi",
      });
      cancelEdit();
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  function selectShift(type: ShiftTypeKey) {
    setPickedShift(type);
    const meta = shiftByType.get(type);
    if (type !== "custom" && meta) {
      setCustomStart(meta.start);
      setCustomEnd(meta.end);
    }
    if (assignMode === "daily" && dayPlanMode === "single") {
      setDaySegments([defaultSegment(type, meta)]);
    }
  }

  function pickPerson(p: SmenaAssignable) {
    setPickedPersonId(p.id);
    const st = (p.shiftType || "one") as ShiftTypeKey;
    selectShift(st);
    setPickedBranchId(p.assignedBranchId);
    setBranchQ("");
    setDayPlanMode("single");
    const meta = shiftByType.get(st);
    setDaySegments([defaultSegment(st === "three" ? "three" : "one", meta)]);
    if (st === "custom") {
      setCustomLabel(p.shiftLabel?.replace(/:.*$/, "").trim() || p.position || "Maxsus");
      setCustomStart(p.shiftStart || "09:00");
      setCustomEnd(p.shiftEnd || "18:00");
    } else if (st === "three") {
      setCustomStart(p.shiftStart || meta?.start || "14:00");
      setCustomEnd(p.shiftEnd || meta?.end || "22:00");
      setCustomLabel("");
    } else {
      setCustomLabel(p.position || "");
    }
  }

  function cancelEdit() {
    setPickedPersonId(null);
    setPickedBranchId(null);
    setPickedShift("one");
    setCustomLabel("");
    setCustomStart("09:00");
    setCustomEnd("18:00");
    setBranchQ("");
    setDayPlanMode("single");
    setDaySegments([defaultSegment("three", { type: "three", label: "3-smena", start: "14:00", end: "22:00" })]);
  }

  function onSaveTeam() {
    if (!pickedPersonId) {
      toast({ title: "Xodim tanlanmagan", variant: "destructive" });
      return;
    }
    if (pickedShift === "custom") {
      if (!customStart.trim() || !customEnd.trim()) {
        toast({ title: "Vaqt kiriting", description: "Boshlanish va tugash vaqtini belgilang.", variant: "destructive" });
        return;
      }
    } else if (pickedShift === "three" && canEditThreeTimes) {
      if (!customStart.trim() || !customEnd.trim()) {
        toast({ title: "3-smena vaqti", description: "Boshlanish va tugash soatini kiriting.", variant: "destructive" });
        return;
      }
    } else if (branchRequired && !pickedBranchId) {
      toast({ title: "Filial tanlang", variant: "destructive" });
      return;
    }
    saveAssign.mutate({
      id: pickedPersonId,
      assignedBranchId: branchRequired ? pickedBranchId : null,
      shiftType: pickedShift,
      shiftOnly: !branchRequired,
      ...(pickedShift === "custom"
        ? {
            shiftLabel: customLabel.trim() || picked?.position || "Maxsus",
            shiftStart: customStart.trim(),
            shiftEnd: customEnd.trim(),
          }
        : pickedShift === "three" && canEditThreeTimes
          ? {
              shiftStart: customStart.trim(),
              shiftEnd: customEnd.trim(),
            }
          : {}),
    });
  }

  const permanentSaveLabel =
    pickedShift === "three"
      ? "3-smenani doimiy saqlash"
      : pickedShift === "custom"
        ? "Maxsus grafikni saqlash"
        : "Doimiy smena va filialni saqlash";

  const timeFieldHint =
    pickedShift === "three"
      ? "Faqat shu xodim uchun 3-smena vaqti"
      : pickedShift === "custom"
        ? "Maxsus ish vaqti"
        : canEditStandards
          ? "Standart vaqt — o‘zgartirsangiz barcha xodimlarga ta’sir qiladi"
          : "Standart vaqt (o‘zgartirish faqat admin uchun)";

  function addDaySegment() {
    const oneMeta = shiftByType.get("one");
    const threeMeta = shiftByType.get("three");
    if (daySegments.length >= 4) return;
    const nextType: ShiftTypeKey = daySegments.some((s) => s.shiftType === "one") ? "three" : "one";
    const meta = nextType === "three" ? threeMeta : oneMeta;
    setDaySegments((prev) => [...prev, defaultSegment(nextType, meta)]);
    setDayPlanMode("multi");
  }

  function updateDaySegment(idx: number, patch: Partial<DaySegmentDraft>) {
    setDaySegments((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeDaySegment(idx: number) {
    setDaySegments((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [defaultSegment("three", shiftByType.get("three"))];
    });
  }

  if (q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-sm text-slate-500">Yuklanmoqda…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-600">Ma’lumot yuklanmadi</p>
      </div>
    );
  }

  const isAdmin = Boolean(data.canAssignAny);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28">
      <div className="rounded-2xl bg-gradient-to-br from-[#0b3a5c] to-[#0e4a72] px-5 py-4 text-white shadow-sm">
        <h1 className="text-lg font-semibold">Smena va filial</h1>
        <p className="mt-1 text-sm text-sky-100/90">
          {isAdmin
            ? "Standart vaqtlar yuqorida. Xodimga doimiy yoki faqat bir kunlik reja belgilang."
            : "Xodimni tanlang → Doimiy grafik yoki Faqat bir kun."}
        </p>
      </div>

      {canEditStandards ? (
        <GlobalStandardsCard
          templates={standardTemplates}
          loading={templatesQ.isLoading && !standardTemplates.length}
          saving={saveTemplate.isPending}
          highlightKey={highlightTemplate}
          onSave={saveTemplate.mutate}
        />
      ) : null}

      {data.canAssignOthers ? (
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardContent className="space-y-5 p-4 pt-5">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-[#0b3a5c]" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{isAdmin ? "Xodimlar" : "Farmasevt va stajyorlar"}</p>
                  <p className="text-[11px] text-slate-500">Ism bo‘yicha qidiring va xodimni tanlang</p>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={peopleQ}
                  onChange={(e) => setPeopleQ(e.target.value)}
                  placeholder="Ism yoki lavozim…"
                  className="h-10 rounded-xl border-slate-200 pl-9"
                />
              </div>

              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-100 bg-white">
                {people.map((p) => {
                  const active = pickedPersonId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPerson(p)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 transition",
                        active ? "bg-[#0b3a5c]/5" : "hover:bg-slate-50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          active ? "bg-[#0b3a5c] text-white" : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {p.fullName
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? "")
                          .join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{p.fullName}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {p.position || orgLabel(p.orgRole)} · {p.shiftLabel || shiftTypeShort(p.shiftType)}
                          {p.assignedBranchName ? ` · ${p.assignedBranchName}` : ""}
                        </p>
                      </div>
                      {active ? <Check className="h-4 w-4 shrink-0 text-[#0b3a5c]" /> : null}
                    </button>
                  );
                })}
                {people.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">Xodim topilmadi</p>
                ) : null}
              </div>
            </section>

            {picked ? (
              <section className="space-y-4 rounded-2xl border-2 border-[#0b3a5c]/15 bg-gradient-to-b from-slate-50 to-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-slate-900">{picked.fullName}</p>
                    <p className="text-xs text-slate-500">{picked.position || orgLabel(picked.orgRole)}</p>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-600">
                      <span className="font-medium text-slate-800">Hozir:</span>{" "}
                      {picked.shiftLabel || shiftTypeShort(picked.shiftType)}
                      {picked.assignedBranchName ? ` · ${picked.assignedBranchName}` : " · filial yo‘q"}
                    </div>
                  </div>
                  <button type="button" onClick={cancelEdit} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Rejim tanlash */}
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setAssignMode("permanent")}
                    className={cn(
                      "rounded-lg px-3 py-2.5 text-left transition",
                      assignMode === "permanent" ? "bg-white shadow-sm ring-1 ring-slate-200" : "text-slate-600",
                    )}
                  >
                    <p className="text-xs font-bold text-slate-900">Doimiy grafik</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-500">Har kuni shu smena va filial</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignMode("daily")}
                    className={cn(
                      "rounded-lg px-3 py-2.5 text-left transition",
                      assignMode === "daily" ? "bg-white shadow-sm ring-1 ring-amber-200" : "text-slate-600",
                    )}
                  >
                    <p className="text-xs font-bold text-amber-950">Faqat bir kun</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-500">Boshqa sana / vaqt / filial</p>
                  </button>
                </div>

                {assignMode === "permanent" ? (
                  <div className="space-y-4">
                    <StepHeader
                      n={1}
                      title="Smena turini tanlang"
                      hint="Asosiy smenalar: 1-kunduzgi, 2-kechki, 3-qo‘shimcha"
                    />
                    <div className="flex flex-wrap gap-2">
                      {MAIN_SHIFTS.map((t) => (
                        <ShiftChip
                          key={t}
                          label={shiftByType.get(t)?.label || shiftTypeShort(t)}
                          active={pickedShift === t}
                          onClick={() => selectShift(t)}
                          accent={t === "three" ? "amber" : "default"}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOtherShifts((v) => !v)}
                      className="flex w-full items-center justify-between rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <span>Boshqa smenalar (masofadan, erkin, kun ora…)</span>
                      {showOtherShifts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {showOtherShifts ? (
                      <div className="flex flex-wrap gap-1.5 pl-1">
                        {OTHER_SHIFTS.map((t) => (
                          <ShiftChip
                            key={t}
                            label={shiftByType.get(t)?.label || shiftTypeShort(t)}
                            active={pickedShift === t}
                            onClick={() => selectShift(t)}
                          />
                        ))}
                        {isAdmin ? (
                          <ShiftChip
                            label="Maxsus vaqt"
                            active={pickedShift === "custom"}
                            onClick={() => selectShift("custom")}
                            accent="amber"
                          />
                        ) : null}
                      </div>
                    ) : null}

                    <StepHeader n={2} title="Ish vaqti" hint={timeFieldHint} />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-600">Boshlanish</label>
                        <Input
                          type="time"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          disabled={!canEditShiftTimes}
                          className={cn("h-10 rounded-xl", !canEditShiftTimes && "bg-slate-100 text-slate-600")}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-600">Tugash</label>
                        <Input
                          type="time"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          disabled={!canEditShiftTimes}
                          className={cn("h-10 rounded-xl", !canEditShiftTimes && "bg-slate-100 text-slate-600")}
                        />
                      </div>
                    </div>

                    {pickedShift === "custom" ? (
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-600">Izoh / lavozim</label>
                        <Input
                          value={customLabel}
                          onChange={(e) => setCustomLabel(e.target.value)}
                          placeholder="Masalan: Buxgalter"
                          className="h-10 rounded-xl"
                        />
                      </div>
                    ) : null}

                    {canEditStandards && pickedShift !== "custom" && pickedShift !== "three" && standardDirty ? (
                      <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                        <p className="text-[11px] text-sky-900">
                          Eslatma: vaqtni o‘zgartirib «Standartni saqlash» bossangiz, <b>barcha</b>{" "}
                          {activeShiftMeta?.label} xodimlariga qo‘llanadi.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2 h-8 border-sky-300 bg-white text-xs"
                          disabled={saveTemplate.isPending}
                          onClick={saveStandardFromPanel}
                        >
                          <Settings2 className="mr-1 h-3 w-3" />
                          Standart vaqtni saqlash (hamma uchun)
                        </Button>
                      </div>
                    ) : null}

                    {branchRequired ? (
                      <>
                        <StepHeader
                          n={3}
                          title="Doimiy filial"
                          hint="Davomat faqat shu filial GPS (35 m) da qabul qilinadi"
                        />
                        <div className="space-y-2">
                          {pickedBranch ? (
                            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">
                              Tanlangan: {pickedBranch.name}
                            </p>
                          ) : null}
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                              value={branchQ}
                              onChange={(e) => setBranchQ(e.target.value)}
                              placeholder="Filial qidirish…"
                              className="h-9 rounded-xl pl-9"
                            />
                          </div>
                          <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-100">
                            {branches.map((b) => {
                              const on = pickedBranchId === b.id;
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => setPickedBranchId(b.id)}
                                  className={cn(
                                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
                                    on ? "bg-sky-50 font-medium text-sky-900" : "hover:bg-slate-50",
                                  )}
                                >
                                  {b.name}
                                  {on ? <Check className="h-4 w-4" /> : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        Bu smenada filial GPS talab qilinmaydi.
                      </p>
                    )}

                    <Button
                      type="button"
                      className={cn(
                        "h-11 w-full rounded-xl text-base font-medium",
                        pickedShift === "three" ? "bg-amber-600 hover:bg-amber-700" : "bg-[#0b3a5c] hover:bg-[#0a3350]",
                      )}
                      disabled={saveAssign.isPending}
                      onClick={onSaveTeam}
                    >
                      {saveAssign.isPending ? "Saqlanmoqda…" : permanentSaveLabel}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                    <StepHeader
                      n={1}
                      title="Qaysi kun?"
                      hint="Faqat shu sanada quyidagi reja ishlaydi. Ertasi kun doimiy grafikka qaytadi."
                    />
                    <Input
                      type="date"
                      value={dayDate}
                      onChange={(e) => setDayDate(e.target.value)}
                      className="h-10 rounded-xl bg-white"
                    />

                    <StepHeader
                      n={2}
                      title="Kun rejasi turi"
                      hint="Bitta smena yoki bir kunda 1-smena + 3-smena kabi bir nechta smena"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDayPlanMode("single");
                          setDaySegments([
                            defaultSegment(
                              pickedShift === "three" ? "three" : pickedShift === "two" ? "two" : "one",
                              activeShiftMeta,
                            ),
                          ]);
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-left transition",
                          dayPlanMode === "single"
                            ? "border-amber-500 bg-white shadow-sm"
                            : "border-amber-200 bg-amber-50/80",
                        )}
                      >
                        <p className="text-xs font-bold text-amber-950">Bitta smena</p>
                        <p className="text-[10px] text-slate-500">Masalan, faqat 3-smena</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDayPlanMode("multi");
                          if (daySegments.length < 2) {
                            setDaySegments([
                              defaultSegment("one", shiftByType.get("one")),
                              defaultSegment("three", shiftByType.get("three")),
                            ]);
                          }
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-left transition",
                          dayPlanMode === "multi"
                            ? "border-amber-500 bg-white shadow-sm"
                            : "border-amber-200 bg-amber-50/80",
                        )}
                      >
                        <p className="text-xs font-bold text-amber-950">2 ta smena</p>
                        <p className="text-[10px] text-slate-500">Masalan, 1-smena + 3-smena</p>
                      </button>
                    </div>

                    <StepHeader n={3} title="Smena va vaqt" hint="Har smena uchun alohida Keldim/Ketdim bo‘ladi" />

                    <div className="space-y-2">
                      {daySegments.map((seg, idx) => (
                        <div key={idx} className="space-y-2 rounded-xl border border-amber-100 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-800">
                              {dayPlanMode === "multi" ? `${idx + 1}-smena` : "Shu kun smenasi"}
                            </p>
                            {dayPlanMode === "multi" && daySegments.length > 1 ? (
                              <button type="button" className="text-rose-500" onClick={() => removeDaySegment(idx)}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {MAIN_SHIFTS.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  const meta = shiftByType.get(t);
                                  updateDaySegment(idx, {
                                    shiftType: t,
                                    shiftStart: meta?.start || seg.shiftStart,
                                    shiftEnd: meta?.end || seg.shiftEnd,
                                  });
                                }}
                                className={cn(
                                  "rounded-lg py-1.5 text-[11px] font-semibold ring-1 ring-inset",
                                  seg.shiftType === t
                                    ? "bg-amber-600 text-white ring-amber-600"
                                    : "bg-slate-50 text-slate-600 ring-slate-200",
                                )}
                              >
                                {shiftTypeShort(t)}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-0.5 block text-[10px] text-slate-500">Dan</label>
                              <Input
                                type="time"
                                value={seg.shiftStart}
                                onChange={(e) => updateDaySegment(idx, { shiftStart: e.target.value })}
                                className="h-9 rounded-lg bg-white text-xs"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-slate-500">Gacha</label>
                              <Input
                                type="time"
                                value={seg.shiftEnd}
                                onChange={(e) => updateDaySegment(idx, { shiftEnd: e.target.value })}
                                className="h-9 rounded-lg bg-white text-xs"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] text-slate-500">Filial (ixtiyoriy)</label>
                            <select
                              value={seg.branchId ?? ""}
                              onChange={(e) =>
                                updateDaySegment(idx, {
                                  branchId: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                            >
                              <option value="">Asosiy filial (yuqoridagi doimiy)</option>
                              {(data?.branches ?? []).map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>

                    {dayPlanMode === "multi" && daySegments.length < 4 ? (
                      <Button type="button" variant="outline" className="h-9 w-full border-amber-300 bg-white text-xs" onClick={addDaySegment}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Yana smena qo‘shish
                      </Button>
                    ) : null}

                    <Button
                      type="button"
                      className="h-11 w-full rounded-xl bg-amber-600 text-base font-medium hover:bg-amber-700"
                      disabled={saveDayPlan.isPending}
                      onClick={() => saveDayPlan.mutate()}
                    >
                      <CalendarDays className="mr-1.5 h-4 w-4" />
                      {saveDayPlan.isPending ? "Saqlanmoqda…" : `${dayDate} kunini saqlash`}
                    </Button>

                    {(dayPlansQ.data?.days?.length ?? 0) > 0 ? (
                      <div className="space-y-1.5 border-t border-amber-200 pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">
                          Reja qilingan kunlar
                        </p>
                        {(dayPlansQ.data?.days as DayShiftPlanDay[]).map((day) => (
                          <div key={day.workDate} className="flex items-start justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs">
                            <div>
                              <b>{day.workDate}</b>
                              {day.segments.map((s, i) => (
                                <p key={s.id} className="text-[11px] text-slate-600">
                                  {shiftTypeShort(s.shiftType)} {s.shiftStart}–{s.shiftEnd}
                                  {s.branchName ? ` · ${s.branchName}` : ""}
                                </p>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="shrink-0 text-rose-600"
                              disabled={removeDayPlan.isPending}
                              onClick={() => removeDayPlan.mutate(day.workDate)}
                            >
                              O‘chirish
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
                Yuqoridan xodimni tanlang
              </p>
            )}
          </CardContent>
        </Card>
      ) : data.canPickOwnBranch ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#0b3a5c]" />
              <p className="text-sm font-semibold text-slate-900">Mening filialim</p>
            </div>
            <p className="text-xs text-slate-500">
              Hozir: <b className="text-slate-800">{data.employee?.assignedBranchName || "—"}</b>
              {data.shift ? (
                <>
                  {" "}
                  · Smena: <b>{data.shift.hoursNote}</b>
                </>
              ) : null}
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={branchQ} onChange={(e) => setBranchQ(e.target.value)} placeholder="Filial qidirish…" className="h-10 pl-9" />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-100">
              {branches.map((b) => {
                const on = pickedBranchId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setPickedBranchId(b.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
                      on ? "bg-sky-50 font-medium" : "hover:bg-slate-50",
                    )}
                  >
                    {b.name}
                    {on ? <Check className="h-4 w-4 text-sky-600" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setPickedBranchId(data.employee?.assignedBranchId ?? null)}>
                Bekor
              </Button>
              <Button
                className="bg-[#0b3a5c]"
                disabled={!pickedBranchId || saveMine.isPending}
                onClick={() => pickedBranchId && saveMine.mutate({ assignedBranchId: pickedBranchId })}
              >
                Saqlash
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 p-4 shadow-sm">
          <p className="text-sm text-slate-600">
            Filial: <b>{data.employee?.assignedBranchName || "belgilanmagan"}</b>
          </p>
          {data.shift ? (
            <p className="mt-1 text-sm text-slate-600">
              Smena: <b>{data.shift.hoursNote}</b>
            </p>
          ) : null}
        </Card>
      )}
    </div>
  );
}
