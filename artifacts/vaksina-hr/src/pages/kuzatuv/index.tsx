import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { isHrDirektor, isHrOversight, HR_ROLE_LABELS } from "@/lib/roles";
import {
  useKuzatuv,
  useKuzatuvPerson,
  useKuzatuvPeople,
  type KuzatuvTask,
  type PersonDetail,
  type KuzatuvPersonListItem,
} from "@/lib/kuzatuv-api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Eye,
  Briefcase,
  Users,
  Phone,
  ListTodo,
  CheckCircle2,
  Clock3,
  UserRound,
  Kanban,
  ArrowLeft,
  MapPin,
  Calendar,
  FileText,
  GraduationCap,
  Search,
  Building2,
  Network,
  UserCog,
} from "lucide-react";
import type { OrgEmployeeView } from "@/lib/kuzatuv-api";

const STAGE_LABELS: Record<string, string> = {
  phone_interview: "Tanishuv",
  online_interview: "Onlayn suhbat",
  preboarding: "Pre-boarding",
  offline_interview: "Offline suhbat",
  final_decision: "Yakuniy qaror",
  offer: "Job offer",
  documents: "Hujjatlar",
  internship: "Stajirovka",
  hired: "Ishga qabul",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "Yangi",
  in_progress: "Jarayonda",
  done: "Bajarildi",
  verified: "Tasdiqlangan",
  cancelled: "Bekor",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Past",
  normal: "Oddiy",
  high: "Yuqori",
  urgent: "Shoshilinch",
};

const ROLE_LABELS: Record<string, string> = {
  ...HR_ROLE_LABELS,
  admin: "Admin",
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
};

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <span className="rounded-xl bg-slate-50 p-2 text-slate-600">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDue(iso: string | null) {
  if (!iso) return "Muddat yo‘q";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function empStatusClass(status: string) {
  switch (status) {
    case "working":
      return "bg-emerald-50 text-emerald-800";
    case "new":
      return "bg-sky-50 text-sky-800";
    case "dismissed":
      return "bg-slate-200 text-slate-700";
    case "need_hire":
      return "bg-amber-50 text-amber-900";
    case "searching":
      return "bg-orange-50 text-orange-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function OrgPersonCard({ e }: { e: OrgEmployeeView }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{e.fullName}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              {e.orgRoleLabel}
            </span>
            {e.position ? <span>{e.position}</span> : null}
            {e.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {e.location}
              </span>
            ) : null}
            {e.managerName ? <span>Mudir: {e.managerName}</span> : null}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Smena: {e.shiftDisplay}
            {e.hiredAt ? ` · Ishga kirgan: ${e.hiredAt}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            empStatusClass(e.employmentStatus),
          )}
        >
          {e.employmentStatusLabel}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {count}
        </span>
      </h3>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function PersonChip({
  name,
  onClick,
}: {
  name: string;
  onClick?: () => void;
}) {
  if (!onClick) return <span className="font-medium text-slate-700">{name}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-[#0b3a5c] underline-offset-2 hover:underline"
    >
      {name}
    </button>
  );
}

function TaskRow({
  task,
  full,
  onOpenPerson,
}: {
  task: KuzatuvTask;
  full: boolean;
  onOpenPerson?: (id: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{task.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Kimga:{" "}
            <PersonChip
              name={task.assigneeName}
              onClick={
                task.assigneeId && onOpenPerson
                  ? () => onOpenPerson(task.assigneeId!)
                  : undefined
              }
            />
            {" · "}
            Kimdan:{" "}
            <PersonChip
              name={task.createdByName}
              onClick={
                task.createdById && onOpenPerson
                  ? () => onOpenPerson(task.createdById!)
                  : undefined
              }
            />
          </p>
          {full && task.description ? (
            <p className="mt-1 text-sm text-slate-600">{task.description}</p>
          ) : null}
          {full && task.completionNote ? (
            <p className="mt-1 text-xs text-emerald-700">Natija: {task.completionNote}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {STATUS_LABEL[task.status] || task.status}
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {PRIORITY_LABEL[task.priority] || task.priority}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Muddat: {formatDue(task.dueAt)}</p>
    </div>
  );
}

function PersonDossier({
  personId,
  onBack,
  full,
}: {
  personId: number;
  onBack: () => void;
  full: boolean;
}) {
  const { data, isLoading, error } = useKuzatuvPerson(personId, true);
  const [tab, setTab] = useState<
    "all" | "org" | "branches" | "audits" | "needs" | "tasks" | "vacancies" | "candidates" | "interviews"
  >("all");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Orqaga
        </Button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error)?.message || "Yuklanmadi"}
        </div>
      </div>
    );
  }

  const p = data as PersonDetail;
  const managers = p.managedManagers ?? [];
  const staff = p.managedStaff ?? [];
  const branches = p.branches ?? [];
  const audits = p.audits ?? [];
  const needs = p.needs ?? [];
  const networkTasks = p.networkTasks ?? [];
  const isCoordOrMudir = p.person.role === "koordinator" || p.person.role === "mudir";
  const hasNetwork =
    isCoordOrMudir ||
    Boolean(p.employee) ||
    managers.length > 0 ||
    staff.length > 0 ||
    branches.length > 0 ||
    audits.length > 0 ||
    needs.length > 0 ||
    Boolean(p.person.departmentName);

  const staffByManager = new Map<number | "other", OrgEmployeeView[]>();
  for (const m of managers) staffByManager.set(m.id, []);
  for (const s of staff) {
    const mid = s.reportsToId && staffByManager.has(s.reportsToId) ? s.reportsToId : "other";
    const list = staffByManager.get(mid) ?? [];
    list.push(s);
    staffByManager.set(mid, list);
  }

  const tabs = [
    { id: "all" as const, label: "Hammasi" },
    ...(hasNetwork
      ? [
          {
            id: "branches" as const,
            label: `Filiallar / mudirlar (${p.summary.branchesCount ?? branches.length})`,
          },
          {
            id: "audits" as const,
            label: `Checklist (${p.summary.auditsCount ?? audits.length})`,
          },
          {
            id: "needs" as const,
            label: `Ehtiyoj (${p.summary.needsOpen ?? 0}/${p.summary.needsTotal ?? needs.length})`,
          },
          {
            id: "org" as const,
            label: `Xodimlar (${staff.length})`,
          },
        ]
      : []),
    {
      id: "tasks" as const,
      label: `Topshiriqlar (${
        isCoordOrMudir
          ? (p.summary.networkTasksOpen ?? 0) + (p.summary.networkTasksDone ?? 0) +
            p.summary.tasksAssignedOpen +
            p.summary.tasksAssignedDone
          : p.summary.tasksAssignedOpen + p.summary.tasksAssignedDone
      })`,
    },
    ...(!isCoordOrMudir
      ? [
          { id: "vacancies" as const, label: `Vakansiyalar (${p.summary.vacanciesTotal})` },
          { id: "candidates" as const, label: `Nomzodlar (${p.summary.candidatesTotal})` },
          {
            id: "interviews" as const,
            label: `Suhbatlar (${p.summary.phoneInterviews + p.summary.onlineInterviews + p.summary.offlineInterviews})`,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button type="button" variant="ghost" onClick={onBack} className="-ml-2 mb-2 gap-2 text-slate-600">
            <ArrowLeft className="h-4 w-4" /> Kuzatuvga qaytish
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0b3a5c] text-lg font-bold text-white">
              {p.person.fullName
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {p.person.fullName}
              </h1>
              <p className="text-sm text-slate-500">
                {p.person.roleLabel || ROLE_LABELS[p.person.role] || p.person.role}
                {p.person.departmentName ? ` · ${p.person.departmentName}` : ""}
                {full && p.person.login ? ` · @${p.person.login}` : ""}
                {full && p.person.phone ? ` · ${p.person.phone}` : ""}
                {" · "}
                {p.person.status === "active" ? "Faol" : p.person.status}
              </p>
              {p.employee ? (
                <p className="mt-1 text-xs text-slate-500">
                  {p.employee.orgRoleLabel}
                  {p.employee.location ? ` · ${p.employee.location}` : ""}
                  {" · "}
                  <span className={cn("rounded-full px-2 py-0.5 font-medium", empStatusClass(p.employee.employmentStatus))}>
                    {p.employee.employmentStatusLabel}
                  </span>
                </p>
              ) : null}
              {p.person.role === "mudir" && (p.coordinator || p.reportsTo) ? (
                <p className="mt-1.5 text-sm font-medium text-[#0b3a5c]">
                  Koordinator:{" "}
                  <span className="font-semibold">
                    {(p.coordinator || p.reportsTo)!.fullName}
                  </span>
                  {(p.coordinator || p.reportsTo)!.location
                    ? ` · ${(p.coordinator || p.reportsTo)!.location}`
                    : ""}
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            {isCoordOrMudir
              ? "Shu koordinator/mudirga bog‘liq filiallar, mudirlar, checklist holati, ehtiyojlar va topshiriqlar — to‘liq kuzatuv."
              : "Bo‘lim, vazifalar, vakansiyalar, nomzodlar va suhbatlar — to‘liq ko‘rinish."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isCoordOrMudir ? (
          <>
            <StatCard
              label="Filiallar / mudirlar"
              value={p.summary.branchesCount ?? branches.length}
              icon={Building2}
            />
            <StatCard
              label="Checklist tashriflari"
              value={p.summary.auditsCount ?? audits.length}
              icon={FileText}
            />
            <StatCard
              label="O‘rtacha checklist %"
              value={p.summary.auditsAvgScore != null ? `${p.summary.auditsAvgScore}%` : "—"}
              icon={CheckCircle2}
            />
            <StatCard
              label="Ehtiyoj (ochiq / jami)"
              value={`${p.summary.needsOpen ?? 0} / ${p.summary.needsTotal ?? 0}`}
              icon={Briefcase}
            />
            <StatCard
              label="Mudir topshiriqlari"
              value={`${p.summary.networkTasksOpen ?? 0} / ${p.summary.networkTasksDone ?? 0}`}
              icon={ListTodo}
            />
            <StatCard label="Xodimlar" value={p.summary.staffCount ?? staff.length} icon={Users} />
            {(p.summary.staffNeedHire ?? 0) > 0 ? (
              <StatCard label="Xodim kerak" value={p.summary.staffNeedHire!} icon={UserCog} />
            ) : null}
          </>
        ) : (
          <>
            {p.person.departmentName ? (
              <StatCard label="Bo‘lim" value={p.person.departmentName} icon={Building2} />
            ) : null}
            <StatCard label="Vakansiyalar" value={p.summary.vacanciesTotal} icon={Briefcase} />
            <StatCard label="Faol vakansiya" value={p.summary.vacanciesPublished} icon={Briefcase} />
            <StatCard label="Nomzodlar" value={p.summary.candidatesTotal} icon={Users} />
            <StatCard label="Ishga olingan" value={p.summary.candidatesHired} icon={CheckCircle2} />
            <StatCard label="Telefon suhbat" value={p.summary.phoneInterviews} icon={Phone} />
            <StatCard label="Onlayn suhbat" value={p.summary.onlineInterviews} icon={Phone} />
            <StatCard label="Offline suhbat" value={p.summary.offlineInterviews} icon={GraduationCap} />
            <StatCard
              label="Vazifa (ochiq / bajarilgan)"
              value={`${p.summary.tasksAssignedOpen} / ${p.summary.tasksAssignedDone}`}
              icon={ListTodo}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-[#0b3a5c] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "all" || tab === "branches") && hasNetwork ? (
        <Section
          title="Filiallar va mudirlar"
          count={branches.length || managers.length}
          empty="Bu koordinatorga bog‘liq filial/mudir topilmadi"
        >
          {(branches.length ? branches : managers.map((m) => ({
            managerEmployeeId: m.id,
            managerName: m.fullName,
            location: m.location,
            employmentStatusLabel: m.employmentStatusLabel,
            employmentStatus: m.employmentStatus,
            shiftDisplay: m.shiftDisplay,
            staffCount: staffByManager.get(m.id)?.length ?? 0,
            auditsCount: 0,
            needsOpen: 0,
            needsTotal: 0,
            tasksOpen: 0,
            tasksDone: 0,
            latestAudit: null as null,
          }))).map((b) => (
            <div
              key={b.managerEmployeeId}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">{b.managerName}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {b.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {b.location}
                      </span>
                    ) : (
                      <span>Filial ko‘rsatilmagan</span>
                    )}
                    <span>Xodimlar: {b.staffCount}</span>
                    <span>Smena: {b.shiftDisplay}</span>
                  </p>
                </div>
                {"employmentStatus" in b && b.employmentStatus ? (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      empStatusClass(String(b.employmentStatus)),
                    )}
                  >
                    {b.employmentStatusLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Checklist</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {b.latestAudit
                      ? `${b.latestAudit.scorePercent}% · ${b.latestAudit.visitDate}`
                      : "Tashrif yo‘q"}
                  </p>
                  <p className="text-[11px] text-slate-500">{b.auditsCount} ta tashrif</p>
                </div>
                <div className="rounded-xl bg-amber-50/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-amber-700/70">Ehtiyoj</p>
                  <p className="mt-0.5 text-sm font-semibold text-amber-950">
                    {b.needsOpen} ochiq / {b.needsTotal} jami
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-sky-700/70">Topshiriqlar</p>
                  <p className="mt-0.5 text-sm font-semibold text-sky-950">
                    {b.tasksOpen} ochiq / {b.tasksDone} bajarilgan
                  </p>
                </div>
              </div>
              {b.latestAudit ? (
                <p className="mt-2 text-xs text-slate-500">
                  Oxirgi checklist: {b.latestAudit.visitName} · Ha {b.latestAudit.yesCount} / Yo‘q{" "}
                  {b.latestAudit.noCount} (jami {b.latestAudit.totalCount})
                </p>
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      {(tab === "all" || tab === "audits") && hasNetwork ? (
        <Section
          title="Checklist tashriflari"
          count={audits.length}
          empty="Checklist tashrifi yo‘q"
        >
          {audits.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {a.branchLocation || "Filial"} · {a.managerName || "Mudir"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {a.visitDate} · {a.visitName}
                  {a.createdAt ? ` · ${formatDt(a.createdAt)}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Ha: {a.yesCount} · Yo‘q: {a.noCount} · Javob: {a.answeredCount}/{a.totalCount}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  a.scorePercent >= 80
                    ? "bg-emerald-50 text-emerald-800"
                    : a.scorePercent >= 50
                      ? "bg-amber-50 text-amber-900"
                      : "bg-red-50 text-red-700",
                )}
              >
                {a.scorePercent}%
              </span>
            </div>
          ))}
        </Section>
      ) : null}

      {(tab === "all" || tab === "needs") && hasNetwork ? (
        <Section title="Ehtiyojlar" count={needs.length} empty="Ehtiyoj yo‘q">
          {needs.map((n) => (
            <div
              key={n.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{n.needType}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {n.branchLocation || "—"}
                  {n.managerName ? ` · ${n.managerName}` : ""}
                </p>
                {n.note ? <p className="mt-1 text-sm text-slate-600">{n.note}</p> : null}
                <p className="mt-1 text-[11px] text-slate-400">
                  Yaratilgan: {formatDt(n.createdAt)}
                  {n.verifiedAt ? ` · Tasdiq: ${formatDt(n.verifiedAt)}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {n.statusLabel}
              </span>
            </div>
          ))}
        </Section>
      ) : null}

      {(tab === "all" || tab === "org") && hasNetwork ? (
        <>
          {p.person.departmentName || p.employee ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
                <Building2 className="h-4 w-4 text-[#0b3a5c]" />
                Bo‘lim va apteka profili
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Bo‘lim</p>
                  <p className="font-medium text-slate-900">{p.person.departmentName || "—"}</p>
                </div>
                {p.employee ? (
                  <>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Org rol</p>
                      <p className="font-medium text-slate-900">{p.employee.orgRoleLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Lavozim</p>
                      <p className="font-medium text-slate-900">{p.employee.position || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Filial / joy</p>
                      <p className="font-medium text-slate-900">{p.employee.location || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Holat</p>
                      <p>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            empStatusClass(p.employee.employmentStatus),
                          )}
                        >
                          {p.employee.employmentStatusLabel}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Smena</p>
                      <p className="font-medium text-slate-900">{p.employee.shiftDisplay}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Ishga kirgan</p>
                      <p className="font-medium text-slate-900">{p.employee.hiredAt || "—"}</p>
                    </div>
                  </>
                ) : null}
                {p.reportsTo || p.coordinator ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {p.person.role === "mudir" ? "Koordinator" : "Kimga bo‘ysunadi"}
                    </p>
                    <p className="font-medium text-slate-900">
                      {(p.coordinator || p.reportsTo)!.fullName}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({(p.coordinator || p.reportsTo)!.orgRoleLabel}
                        {(p.coordinator || p.reportsTo)!.location
                          ? ` · ${(p.coordinator || p.reportsTo)!.location}`
                          : ""}
                        )
                      </span>
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {managers.length > 0 ? (
            <Section
              title="Qo‘shgan / boshqaradigan mudirlar"
              count={managers.length}
              empty="Mudir biriktirilmagan"
            >
              {managers.map((m) => {
                const under = staffByManager.get(m.id) ?? [];
                return (
                  <div key={m.id} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <OrgPersonCard e={m} />
                    {under.length > 0 ? (
                      <div className="ml-2 space-y-2 border-l-2 border-[#0b3a5c]/20 pl-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Shu mudirning xodimlari ({under.length})
                        </p>
                        {under.map((s) => (
                          <OrgPersonCard key={s.id} e={s} />
                        ))}
                      </div>
                    ) : (
                      <p className="px-2 text-xs text-slate-400">
                        Bu mudir ostida hali farmasevt/stajyor yo‘q
                      </p>
                    )}
                  </div>
                );
              })}
            </Section>
          ) : null}

          {managers.length === 0 && staff.length > 0 ? (
            <Section
              title="Boshqaradigan xodimlar (farmasevt / stajyor)"
              count={staff.length}
              empty="Xodim yo‘q"
            >
              {staff.map((s) => (
                <OrgPersonCard key={s.id} e={s} />
              ))}
            </Section>
          ) : null}

          {managers.length > 0 && (staffByManager.get("other")?.length ?? 0) > 0 ? (
            <Section
              title="Boshqa bog‘langan xodimlar"
              count={staffByManager.get("other")!.length}
              empty=""
            >
              {staffByManager.get("other")!.map((s) => (
                <OrgPersonCard key={s.id} e={s} />
              ))}
            </Section>
          ) : null}
        </>
      ) : null}

      {(tab === "all" || tab === "tasks") && (
        <>
          {networkTasks.length > 0 || isCoordOrMudir ? (
            <Section
              title="Mudirlarning topshiriqlari (shu tarmoq)"
              count={networkTasks.length}
              empty="Mudirlarga topshiriq biriktirilmagan"
            >
              {networkTasks.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{t.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Mudir: <span className="font-medium text-slate-700">{t.assigneeName}</span>
                        {" · "}
                        Kimdan: {t.createdByName}
                      </p>
                      {t.completionNote ? (
                        <p className="mt-1 text-xs text-emerald-700">Natija: {t.completionNote}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium">
                      {t.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Muddat: {formatDue(t.dueAt)}
                    {t.completedAt ? ` · Bajarilgan: ${formatDt(t.completedAt)}` : ""}
                  </p>
                </div>
              ))}
            </Section>
          ) : null}

          <Section
            title="Biriktirilgan vazifalar (unga qo‘yilgan)"
            count={p.tasksAssigned.length}
            empty="Bu odamga vazifa biriktirilmagan"
          >
            {p.tasksAssigned.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{t.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Kimdan: <span className="font-medium text-slate-700">{t.createdByName}</span>
                    </p>
                    {t.description ? (
                      <p className="mt-1 text-sm text-slate-600">{t.description}</p>
                    ) : null}
                    {t.completionNote ? (
                      <p className="mt-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                        Natija / hisobot: {t.completionNote}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {t.statusLabel}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      {PRIORITY_LABEL[t.priority] || t.priority}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span>Muddat: {formatDue(t.dueAt)}</span>
                  <span>Yaratilgan: {formatDt(t.createdAt)}</span>
                  {t.acceptedAt ? <span>Qabul: {formatDt(t.acceptedAt)}</span> : null}
                  {t.completedAt ? <span>Bajarilgan: {formatDt(t.completedAt)}</span> : null}
                </div>
              </div>
            ))}
          </Section>

          {full ? (
            <Section
              title="U bergan vazifalar (boshqalarga)"
              count={p.tasksCreated.length}
              empty="Bu odam boshqalarga vazifa bermagan"
            >
              {p.tasksCreated.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{t.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Kimga: <span className="font-medium text-slate-700">{t.assigneeName}</span>
                      </p>
                      {t.description ? (
                        <p className="mt-1 text-sm text-slate-600">{t.description}</p>
                      ) : null}
                      {t.completionNote ? (
                        <p className="mt-1 text-xs text-emerald-700">Natija: {t.completionNote}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium">
                      {t.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Muddat: {formatDue(t.dueAt)}</p>
                </div>
              ))}
            </Section>
          ) : null}
        </>
      )}

      {!isCoordOrMudir && (tab === "all" || tab === "vacancies") && (
        <Section
          title="Vakansiyalar"
          count={p.vacancies.length}
          empty="Vakansiya biriktirilmagan"
        >
          {p.vacancies.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <Link href={`/vacancies/${v.id}`} className="font-medium text-[#0b3a5c] hover:underline">
                  {v.title}
                </Link>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {v.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {v.location}
                    </span>
                  ) : null}
                  <span>Yaratilgan: {formatDt(v.createdAt)}</span>
                  {v.deadline ? <span>Muddat: {formatDt(v.deadline)}</span> : null}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  v.status === "published"
                    ? "bg-emerald-50 text-emerald-800"
                    : v.status === "closed"
                      ? "bg-slate-800 text-white"
                      : "bg-amber-50 text-amber-800",
                )}
              >
                {v.statusLabel}
              </span>
            </div>
          ))}
        </Section>
      )}

      {!isCoordOrMudir && (tab === "all" || tab === "candidates") && (
        <Section title="Nomzodlar" count={p.candidates.length} empty="Nomzod yo‘q">
          {p.candidates.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <Link
                  href={`/candidates/${c.id}`}
                  className="font-medium text-[#0b3a5c] hover:underline"
                >
                  {c.fullName}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {c.vacancyTitle}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Yangilangan: {formatDt(c.updatedAt)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  {c.stageLabel}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    c.status === "hired"
                      ? "bg-emerald-50 text-emerald-800"
                      : c.status === "rejected"
                        ? "bg-red-50 text-red-700"
                        : "bg-slate-100 text-slate-700",
                  )}
                >
                  {c.statusLabel}
                </span>
              </div>
            </div>
          ))}
        </Section>
      )}

      {!isCoordOrMudir && (tab === "all" || tab === "interviews") && (
        <>
          <Section
            title="Telefon suhbatlar"
            count={p.phoneInterviews.length}
            empty="Telefon suhbat yo‘q"
          >
            {p.phoneInterviews.map((i) => (
              <div key={i.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/candidates/${i.candidateId}`}
                      className="font-medium text-[#0b3a5c] hover:underline"
                    >
                      {i.candidateName}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Sana: {i.interviewDate || "—"} · {formatDt(i.createdAt)}
                    </p>
                    {i.notes ? <p className="mt-1 text-sm text-slate-600">{i.notes}</p> : null}
                    {i.rejectReason ? (
                      <p className="mt-1 text-xs text-red-600">Sabab: {i.rejectReason}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium">
                    {i.statusLabel}
                  </span>
                </div>
              </div>
            ))}
          </Section>

          <Section
            title="Onlayn suhbatlar"
            count={p.onlineInterviews.length}
            empty="Onlayn suhbat yo‘q"
          >
            {p.onlineInterviews.map((i) => (
              <div key={i.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/candidates/${i.candidateId}`}
                      className="font-medium text-[#0b3a5c] hover:underline"
                    >
                      {i.candidateName}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Sana: {i.interviewDate || "—"}
                      {i.experienceLevel ? ` · ${i.experienceLevel}` : ""}
                    </p>
                    {i.notes ? <p className="mt-1 text-sm text-slate-600">{i.notes}</p> : null}
                  </div>
                  {i.score != null ? (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                      Ball: {i.score}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </Section>

          <Section
            title="Offline suhbatlar"
            count={p.offlineInterviews.length}
            empty="Offline suhbat yo‘q"
          >
            {p.offlineInterviews.map((i) => (
              <div key={`${i.roleInInterview}-${i.id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/candidates/${i.candidateId}`}
                      className="font-medium text-[#0b3a5c] hover:underline"
                    >
                      {i.candidateName}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <Calendar className="mr-1 inline h-3 w-3" />
                      {i.scheduledDate}
                      {i.scheduledTime ? ` ${i.scheduledTime}` : ""}
                      {" · "}
                      Rol: {i.roleInInterview === "hr" ? "HR" : "Trener"}
                    </p>
                    {i.resultNotes ? (
                      <p className="mt-1 text-sm text-slate-600">{i.resultNotes}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">
                      {i.attendanceStatus}
                    </span>
                    {i.result ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                        {i.result}
                      </span>
                    ) : null}
                    {i.hrScore != null ? <span>HR ball: {i.hrScore}</span> : null}
                    {i.trainerScore != null ? <span>Trener ball: {i.trainerScore}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

export default function KuzatuvPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const allowed = isHrOversight(user?.role) || user?.role === "admin";
  const full = isHrDirektor(user?.role) || user?.role === "admin";
  const { data, isLoading, error } = useKuzatuv(allowed);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [peopleQ, setPeopleQ] = useState("");
  const [peopleRole, setPeopleRole] = useState("all");
  const [debouncedQ, setDebouncedQ] = useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(peopleQ.trim()), 250);
    return () => clearTimeout(t);
  }, [peopleQ]);

  const { data: peopleData, isLoading: peopleLoading } = useKuzatuvPeople(
    { q: debouncedQ || undefined, role: peopleRole },
    allowed,
  );

  React.useEffect(() => {
    if (user && !allowed) setLocation("/dashboard");
  }, [user, allowed, setLocation]);

  if (!user || !allowed) {
    return <div className="p-8 text-center text-slate-500">Ruxsat yo‘q…</div>;
  }

  if (selectedPersonId != null) {
    return (
      <div className="space-y-6">
        <PersonDossier
          personId={selectedPersonId}
          onBack={() => setSelectedPersonId(null)}
          full={full}
        />
      </div>
    );
  }

  const people = peopleData?.people ?? [];
  const roleOptions = peopleData?.roles ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[#0b3a5c]">
          <Eye className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {full ? "HR Direktor" : "HR Auditor"}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Kuzatuv</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Istalgan xodimni ismi, lavozimi yoki bo‘limi bo‘yicha toping — tanlanganda bo‘limi,
          apteka tarmog‘idagi mudir/farmasevt/stajyorlari va holatlari, vazifalar, vakansiyalar
          va suhbatlar to‘liq ochiladi.
        </p>
      </div>

      {/* Xodim tanlash */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Xodimni tanlash</h2>
          <span className="text-xs text-slate-400">
            {peopleLoading ? "Yuklanmoqda…" : `${people.length} ta xodim`}
          </span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={peopleQ}
              onChange={(e) => setPeopleQ(e.target.value)}
              placeholder="Ism yoki lavozim bo‘yicha qidirish…"
              className="h-11 pl-9"
            />
          </div>
          <Select value={peopleRole} onValueChange={setPeopleRole}>
            <SelectTrigger className="h-11 w-full sm:w-[220px]">
              <SelectValue placeholder="Lavozim" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha lavozimlar</SelectItem>
              {roleOptions.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 max-h-[360px] space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-1.5">
          {peopleLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : people.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Mos xodim topilmadi
            </p>
          ) : (
            people.map((p: KuzatuvPersonListItem) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPersonId(p.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:ring-[#0b3a5c]/40 hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b3a5c] text-sm font-bold text-white">
                  {p.fullName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{p.fullName}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                      {p.roleLabel}
                    </span>
                    {p.departmentName ? (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Building2 className="h-3 w-3" />
                        {p.departmentName}
                      </span>
                    ) : null}
                    {full && p.login ? <span>@{p.login}</span> : null}
                    <span>
                      Vazifa:{" "}
                      <span className="text-amber-700">{p.tasksOpen}</span>
                      {" / "}
                      <span className="text-emerald-700">{p.tasksDone}</span>
                    </span>
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs font-medium text-[#0b3a5c] sm:inline">
                  To‘liq ochish →
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error).message}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Ochiq arizalar" value={data.summary.openRequests} icon={Briefcase} />
            <StatCard
              label="Faol vakansiyalar"
              value={data.summary.activeVacancies}
              icon={Briefcase}
            />
            <StatCard
              label="Faol nomzodlar"
              value={data.summary.activeCandidates}
              icon={Users}
            />
            <StatCard
              label="Ishga olingan"
              value={data.summary.hiredCandidates}
              icon={CheckCircle2}
            />
            <StatCard
              label="Telefon suhbatlar"
              value={data.summary.phoneInterviews}
              icon={Phone}
            />
            {full && data.summary.onlineInterviews != null ? (
              <StatCard
                label="Onlayn suhbatlar"
                value={data.summary.onlineInterviews}
                icon={Phone}
              />
            ) : null}
            {full && data.summary.offlineInterviews != null ? (
              <StatCard
                label="Offline suhbatlar"
                value={data.summary.offlineInterviews}
                icon={Users}
              />
            ) : null}
            <StatCard label="Ochiq vazifalar" value={data.summary.tasksOpen} icon={ListTodo} />
            <StatCard label="Bajarilgan vazifalar" value={data.summary.tasksDone} icon={Clock3} />
            <StatCard
              label="Rekruterlar"
              value={data.summary.recruitersCount}
              icon={UserRound}
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Rekruterlar ishi</h2>
            <p className="text-xs text-slate-500">Qatorni bosing — to‘liq dossier ochiladi</p>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Rekruter</th>
                    <th className="px-4 py-3 font-medium">Vakansiya</th>
                    <th className="px-4 py-3 font-medium">Faol</th>
                    <th className="px-4 py-3 font-medium">Suhbat</th>
                    <th className="px-4 py-3 font-medium">Ishga olindi</th>
                    <th className="px-4 py-3 font-medium">Vazifa</th>
                    {full ? <th className="px-4 py-3 font-medium">Qo‘shimcha</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.recruiters.length === 0 ? (
                    <tr>
                      <td colSpan={full ? 7 : 6} className="px-4 py-8 text-center text-slate-400">
                        Rekruter topilmadi
                      </td>
                    </tr>
                  ) : (
                    data.recruiters.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-[#0b3a5c]/5"
                        onClick={() => setSelectedPersonId(r.id)}
                      >
                        <td className="px-4 py-3 font-medium text-[#0b3a5c]">
                          {r.fullName}
                          <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                            Rekruter · Batafsil →
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.vacanciesPublished}
                          <span className="text-slate-400"> / {r.vacanciesTotal}</span>
                        </td>
                        <td className="px-4 py-3">{r.candidatesActive}</td>
                        <td className="px-4 py-3">{r.phoneInterviews}</td>
                        <td className="px-4 py-3">{r.candidatesHired}</td>
                        <td className="px-4 py-3">
                          <span className="text-amber-700">{r.tasksOpen}</span>
                          {" / "}
                          <span className="text-emerald-700">{r.tasksDone}</span>
                        </td>
                        {full ? (
                          <td className="px-4 py-3 text-xs text-slate-500">
                            rad: {r.candidatesRejected ?? 0}
                            {r.offlineInterviews != null ? ` · offline: ${r.offlineInterviews}` : ""}
                            {r.vacanciesClosed != null ? ` · yopilgan: ${r.vacanciesClosed}` : ""}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {full && data.pipeline && data.pipeline.length > 0 ? (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Kanban className="h-5 w-5" /> Pipeline
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {data.pipeline.map((p) => (
                  <div
                    key={p.stage}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <p className="text-xs text-slate-500">{STAGE_LABELS[p.stage] || p.stage}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">{p.count}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FileText className="h-5 w-5" />
              Vazifalar {full ? "(to‘liq)" : "(so‘nggi)"}
            </h2>
            <p className="text-xs text-slate-500">Ismni bosing — shu odamning dossieri ochiladi</p>
            <div className="space-y-2">
              {data.tasks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                  Vazifa yo‘q
                </p>
              ) : (
                data.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    full={full}
                    onOpenPerson={setSelectedPersonId}
                  />
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
