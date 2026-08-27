import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, MapPin, Search, Settings2, UserRound, X } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useToast } from "../../hooks/use-toast";
import { cn } from "../../lib/utils";
import {
  assignSmenaBranch,
  fetchSmenaMe,
  fetchShiftTemplates,
  saveMySmena,
  saveShiftTemplate,
  shiftTypeShort,
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

function needsBranch(shift: ShiftTypeKey) {
  return shift !== "remote" && shift !== "flexible" && shift !== "custom";
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
                1-smena, 2-smena, masofadan va boshqa barcha smenalar uchun umumiy vaqt. O‘zgarish shu smenadagi
                barcha xodimlarga qo‘llanadi.
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

  const shiftOptions: ShiftOption[] = useMemo(() => {
    if (data?.shifts?.length) return data.shifts as ShiftOption[];
    return [
      { type: "one", label: "1-smena", start: "08:00", end: "17:00" },
      { type: "two", label: "2-smena", start: "18:00", end: "23:45" },
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
  const canEditStandards = Boolean(data?.canEditShiftTemplates || data?.canAssignAny);
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
  }

  function pickPerson(p: SmenaAssignable) {
    setPickedPersonId(p.id);
    const st = (p.shiftType || "one") as ShiftTypeKey;
    selectShift(st);
    setPickedBranchId(p.assignedBranchId);
    setBranchQ("");
    if (st === "custom") {
      setCustomLabel(p.shiftLabel?.replace(/:.*$/, "").trim() || p.position || "Maxsus");
      setCustomStart(p.shiftStart || "09:00");
      setCustomEnd(p.shiftEnd || "18:00");
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
        : {}),
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
            ? "Yuqorida standart smena vaqtlari, pastda xodimlarga biriktirish."
            : "Xodimni tanlang, smena va filialni belgilang."}
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
                  <div>
                    <p className="text-base font-semibold text-slate-900">{picked.fullName}</p>
                    <p className="text-xs text-slate-500">{picked.position || orgLabel(picked.orgRole)}</p>
                  </div>
                  <button type="button" onClick={cancelEdit} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Smena turi</p>
                  <div className="flex flex-wrap gap-1.5">
                    {shiftOptions.map((s) => (
                      <button
                        key={s.type}
                        type="button"
                        onClick={() => selectShift(s.type)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
                          pickedShift === s.type
                            ? "bg-[#0b3a5c] text-white ring-[#0b3a5c]"
                            : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => selectShift("custom")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
                          pickedShift === "custom"
                            ? "bg-amber-600 text-white ring-amber-600"
                            : "bg-white text-amber-800 ring-amber-200 hover:ring-amber-300",
                        )}
                      >
                        Maxsus vaqt
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Boshlanish</label>
                    <Input
                      type="time"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      disabled={!canEditStandards && pickedShift !== "custom"}
                      className={cn(
                        "h-10 rounded-xl",
                        !canEditStandards && pickedShift !== "custom" && "bg-slate-100 text-slate-600",
                      )}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Tugash</label>
                    <Input
                      type="time"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      disabled={!canEditStandards && pickedShift !== "custom"}
                      className={cn(
                        "h-10 rounded-xl",
                        !canEditStandards && pickedShift !== "custom" && "bg-slate-100 text-slate-600",
                      )}
                    />
                  </div>
                </div>

                {pickedShift === "custom" ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Lavozim / izoh</label>
                    <Input
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="Masalan: Buxgalter"
                      className="h-10 rounded-xl"
                    />
                  </div>
                ) : canEditStandards ? (
                  <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <p className="text-xs text-sky-950">
                      <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                      Yuqoridagi vaqt — <b>{activeShiftMeta?.label || shiftTypeShort(pickedShift)}</b> standarti.
                      O‘zgartirsangiz, shu smenadagi <b>barcha xodimlarga</b> qo‘llanadi.
                    </p>
                    <Button
                      type="button"
                      className="h-10 w-full bg-[#0b3a5c] hover:bg-[#0a3350]"
                      disabled={!standardDirty || saveTemplate.isPending}
                      onClick={saveStandardFromPanel}
                    >
                      <Settings2 className="mr-1.5 h-4 w-4" />
                      {saveTemplate.isPending ? "Saqlanmoqda…" : "Standart vaqtni saqlash"}
                    </Button>
                  </div>
                ) : activeShiftMeta ? (
                  <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                    Standart: {activeShiftMeta.start}–{activeShiftMeta.end}
                  </p>
                ) : null}

                {branchRequired ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <MapPin className="h-3.5 w-3.5" />
                      Filial {pickedBranch ? `· ${pickedBranch.name}` : ""}
                    </p>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        value={branchQ}
                        onChange={(e) => setBranchQ(e.target.value)}
                        placeholder="Filial qidirish…"
                        className="h-9 rounded-xl pl-9"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-100">
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
                      {branches.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-slate-400">Filial topilmadi</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    Bu smenada filial GPS talab qilinmaydi.
                  </p>
                )}

                <Button
                  type="button"
                  className="h-11 w-full rounded-xl bg-[#0b3a5c] text-base font-medium hover:bg-[#0a3350]"
                  disabled={saveAssign.isPending}
                  onClick={onSaveTeam}
                >
                  {saveAssign.isPending ? "Saqlanmoqda…" : "Xodimga saqlash"}
                </Button>
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
