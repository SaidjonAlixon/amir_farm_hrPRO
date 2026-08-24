import React, { useMemo, useState } from 'react';
import {
  useGetDashboardStats,
  useGetRecentActivity,
  useGetRecruiterTasks,
  useGetPipelineOverview,
  useGetRequests,
  useGetVacancies,
  RequestStatus,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Users,
  FileText,
  Briefcase,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  ArrowRight,
  Store,
  ClipboardList,
  ClipboardCheck,
  ListTodo,
  AlarmClock,
  MessageCircle,
  GraduationCap,
  Calendar,
  Shield,
  Trophy,
  Banknote,
  Calculator,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation } from 'wouter';
import { PipelineFunnel } from '../components/dashboard/PipelineFunnel';
import { RecentActivityFeed } from '../components/dashboard/RecentActivityFeed';
import { DeadlineCountdown } from '../components/DeadlineCountdown';
import { sortByDeadlineAsc } from '../lib/deadline-countdown';
import { useStaffingAlerts } from '../lib/staffing-api';
import { useBranchNeeds } from '../lib/branch-needs-api';
import { useGetTasks } from '../lib/vazifalar-api';
import { useGetReminders } from '../lib/eslatmalar-api';
import { FaceIdEnroll } from '../components/FaceIdEnroll';
import { useChatList } from '../lib/chat-api';
import { cn } from '../lib/utils';
import { HR_ROLE_LABELS, canViewChecklistStatus, canViewHolat, canViewHolatFull, isHrRole, isSbRole } from '../lib/roles';
import { useHolat } from '../lib/holat-api';
import {
  BranchListRows,
  ChatListRows,
  DashActionBar,
  DashDetailDialog,
  DashListRow,
  DashTile,
  flattenHolatTree,
  MudirListRows,
  NeedListRows,
  PersonListRows,
  ReminderListRows,
  StaffingAlertRows,
  TaskListRows,
} from '../components/dashboard/dashboard-widgets';

const OPEN_STATUSES = new Set(['submitted', 'reviewing', 'accepted', 'announced']);

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  ...HR_ROLE_LABELS,
  recruiter: 'Rekruter',
  director: 'Direktor',
  department_head: "Bo'lim boshlig'i",
  trainer: 'Trener',
  mentor: 'Mentor',
  mudir: 'Mudir',
  koordinator: 'Koordinator',
  texnik: 'Texnik',
  ombor: 'Ombor',
  sb: 'SB operatori',
  sb_boshliq: "SB bo‘limi boshlig‘i",
  farmasevt: 'Farmasevt',
  stajyor: 'Stajyor',
  moliya: 'Moliyachi',
};

type DashKind =
  | 'recruitment' // admin, hr, director, recruiter
  | 'department' // department_head
  | 'trainer'
  | 'mentor'
  | 'pharmacy' // mudir, koordinator
  | 'pharmacy_staff' // farmasevt
  | 'ops' // texnik, ombor
  | 'security'
  | 'finance'
  | 'intern';

type DashDetailKey =
  | 'staffing'
  | 'needs'
  | 'tasks'
  | 'reminders'
  | 'chat'
  | 'mudirs'
  | 'pharmacists'
  | 'interns'
  | 'no_staff'
  | 'open_requests'
  | 'vacancies'
  | 'candidates'
  | 'hired'
  | 'holat_coord'
  | 'holat_mudir'
  | 'holat_pharm'
  | 'holat_intern'
  | 'holat_with'
  | 'holat_without'
  | null;

function dashKindFor(role?: string | null): DashKind {
  if (isHrRole(role)) return 'recruitment';
  if (isSbRole(role)) return 'security';
  switch (role) {
    case 'admin':
    case 'director':
    case 'recruiter':
      return 'recruitment';
    case 'department_head':
      return 'department';
    case 'trainer':
      return 'trainer';
    case 'mentor':
      return 'mentor';
    case 'mudir':
    case 'koordinator':
      return 'pharmacy';
    case 'texnik':
    case 'ombor':
      return 'ops';
    case 'farmasevt':
      return 'pharmacy_staff';
    case 'moliya':
      return 'finance';
    case 'stajyor':
      return 'intern';
    default:
      return 'ops';
  }
}

function requestStatusBadge(status: RequestStatus | string) {
  switch (status) {
    case 'submitted':
      return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Yangi</Badge>;
    case 'reviewing':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Ko'rib chiqilmoqda</Badge>;
    case 'accepted':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Qabul qilingan</Badge>;
    case 'announced':
      return <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">E'lon qilingan</Badge>;
    case 'closed':
      return <Badge className="bg-gray-800 text-white hover:bg-gray-800">Yopilgan</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const role = user?.role;
  const kind = dashKindFor(role);
  const [detail, setDetail] = useState<DashDetailKey>(null);
  const openDetail = (key: DashDetailKey) => setDetail(key);
  const closeDetail = () => setDetail(null);

  React.useEffect(() => {
    if (kind === 'intern') setLocation('/kirish');
  }, [kind, setLocation]);

  const isRecruitment = kind === 'recruitment';
  const isPharmacy = kind === 'pharmacy';
  const isPharmacyStaff = kind === 'pharmacy_staff';
  const canWatchRequests = role === 'director' || isHrRole(role) || role === 'admin';
  const canSeePipeline = role === 'admin' || isHrRole(role) || role === 'recruiter' || role === 'director';
  const canSeeRecruiterTasks = role === 'admin' || isHrRole(role) || role === 'recruiter';
  const canFetchVacancies =
    role === 'admin' ||
    role === 'director' ||
    role === 'recruiter' ||
    isHrRole(role) ||
    role === 'department_head';

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { enabled: isRecruitment || kind === 'department' || kind === 'trainer' },
  } as any);
  const { data: activities, isLoading: activitiesLoading } = useGetRecentActivity({
    query: { enabled: isRecruitment || kind === 'department' },
  } as any);
  const { data: tasks, isLoading: tasksLoading } = useGetRecruiterTasks({
    query: { enabled: canSeeRecruiterTasks },
  } as any);
  const { data: pipeline, isLoading: pipelineLoading } = useGetPipelineOverview({
    query: { enabled: canSeePipeline },
  } as any);
  const { data: allRequests, isLoading: requestsLoading } = useGetRequests(undefined, {
    query: { enabled: !!canWatchRequests || kind === 'department' },
  });
  const { data: vacancies, isLoading: vacanciesLoading } = useGetVacancies(
    { status: undefined } as any,
    { query: { enabled: !!canFetchVacancies } } as any,
  );

  const { data: staffingAlerts, isLoading: staffingLoading } = useStaffingAlerts(
    undefined,
    { enabled: isPharmacy },
  );
  const { data: branchNeeds, isLoading: needsLoading } = useBranchNeeds({
    enabled: isPharmacy || isPharmacyStaff || kind === 'ops',
  });
  const { data: myTasks, isLoading: myTasksLoading } = useGetTasks(undefined, {
    enabled: kind !== 'intern' && kind !== 'mentor',
  } as any);
  const { data: reminders, isLoading: remindersLoading } = useGetReminders({
    query: { enabled: kind !== 'intern' },
  });
  const { data: chats } = useChatList({ enabled: kind !== 'intern' } as any);
  const holatOn = canViewHolat(role);
  const { data: holat, isLoading: holatLoading } = useHolat(holatOn);

  const deadlineVacancies = useMemo(() => {
    const uid = user?.id;
    const seen = new Set<number>();
    const list = (vacancies ?? []).filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      if (!(v.status === 'published' || v.status === 'draft')) return false;
      if (!(v as any).deadline) return false;
      if (role === 'admin' || role === 'director') return true;
      if (role === 'recruiter') return (v as any).recruiterId === uid;
      return (v as any).requestCreatedById === uid;
    });
    return sortByDeadlineAsc(list as Array<(typeof list)[number] & { deadline?: string | null }>);
  }, [vacancies, user?.id, role]);

  const canSeeDeadlineVacancies =
    role === 'admin' || role === 'director' || role === 'recruiter' || deadlineVacancies.length > 0;

  const openRequests = useMemo(
    () =>
      (allRequests ?? [])
        .filter((r) => OPEN_STATUSES.has(r.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allRequests],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      submitted: 0,
      reviewing: 0,
      accepted: 0,
      announced: 0,
    };
    for (const r of openRequests) {
      if (counts[r.status] !== undefined) counts[r.status] += 1;
    }
    return counts;
  }, [openRequests]);

  const openTaskCount = useMemo(
    () => (myTasks ?? []).filter((t) => t.status === 'todo' || t.status === 'in_progress').length,
    [myTasks],
  );
  const activeReminders = useMemo(
    () => (reminders ?? []).filter((r: any) => r.status === 'active').length,
    [reminders],
  );
  const unreadChats = useMemo(
    () => (chats?.chats ?? []).reduce((a, c) => a + (c.unreadCount || 0), 0),
    [chats],
  );
  const pendingNeeds = useMemo(() => {
    const list = branchNeeds ?? [];
    if (role === 'koordinator') {
      return list.filter((n) => n.status === 'pending' || n.status === 'done').length;
    }
    if (role === 'mudir') {
      return list.filter((n) => ['pending', 'assigned', 'in_progress', 'done'].includes(String(n.status))).length;
    }
    return list.filter((n) => n.status !== 'verified' && n.status !== 'closed').length;
  }, [branchNeeds, role]);
  const pendingStaffing = useMemo(
    () => (staffingAlerts ?? []).filter((a) => a.workflowStatus === 'pending').length,
    [staffingAlerts],
  );

  const holatTree = useMemo(() => flattenHolatTree(holat), [holat]);
  const pendingStaffingList = useMemo(
    () => (staffingAlerts ?? []).filter((a) => a.workflowStatus === 'pending'),
    [staffingAlerts],
  );
  const filteredNeedsList = useMemo(() => {
    const list = branchNeeds ?? [];
    if (role === 'koordinator') return list.filter((n) => n.status === 'pending' || n.status === 'done');
    if (role === 'mudir') {
      return list.filter((n) => ['pending', 'assigned', 'in_progress', 'done'].includes(String(n.status)));
    }
    return list.filter((n) => n.status !== 'verified' && n.status !== 'closed');
  }, [branchNeeds, role]);
  const openTasksList = useMemo(
    () => (myTasks ?? []).filter((t) => t.status === 'todo' || t.status === 'in_progress'),
    [myTasks],
  );
  const activeRemindersList = useMemo(
    () => (reminders ?? []).filter((r: any) => r.status === 'active'),
    [reminders],
  );
  const chatItems = useMemo(() => chats?.chats ?? [], [chats]);

  if (kind === 'intern') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground">
        Kirish bo‘limiga yo‘naltirilmoqda...
      </div>
    );
  }

  const subtitle = ROLE_LABELS[role || ''] || role;

  const detailDialog = (
    <DashDetailDialog
      open={detail !== null}
      onOpenChange={(v) => !v && closeDetail()}
      title={
        detail === 'staffing'
          ? 'Kadr ogohlantirishlari'
          : detail === 'needs'
            ? 'Ehtiyojlar'
            : detail === 'tasks'
              ? 'Topshiriqlar'
              : detail === 'reminders'
                ? 'Eslatmalar'
                : detail === 'chat'
                  ? 'Chatlar'
                  : detail === 'mudirs'
                    ? 'Mening mudirlarim'
                    : detail === 'pharmacists'
                      ? 'Farmasevtlar'
                      : detail === 'interns'
                        ? 'Stajyorlar'
                        : detail === 'no_staff'
                          ? 'Jamoa yo‘q filiallar'
                          : detail === 'open_requests'
                            ? 'Ochiq arizalar'
                            : detail === 'vacancies'
                              ? 'Faol ish o‘rinlari'
                              : detail === 'candidates'
                                ? 'Faol nomzodlar'
                                : detail === 'hired'
                                  ? 'Bu oy ishga qabul'
                                  : detail === 'holat_coord'
                                    ? 'Koordinatorlar'
                                    : detail === 'holat_mudir'
                                      ? 'Mudirlar'
                                      : detail === 'holat_pharm'
                                        ? 'Farmasevtlar (tarmoq)'
                                        : detail === 'holat_intern'
                                          ? 'Stajyorlar (tarmoq)'
                                          : detail === 'holat_with'
                                            ? 'Jamoa bor filiallar'
                                            : detail === 'holat_without'
                                              ? 'Jamoa yo‘q filiallar'
                                              : ''
      }
      description={
        detail === 'staffing'
          ? 'Kutilayotgan kadr holatlari — bosib to‘liq ro‘yxatni oching'
          : detail === 'needs'
            ? 'Filial ehtiyojlari va ularning holati'
            : detail === 'tasks'
              ? 'Sizga biriktirilgan ochiq topshiriqlar'
              : undefined
      }
      href={
        detail === 'staffing'
          ? '/pharmacy-network'
          : detail === 'needs'
            ? '/ehtiyoj'
            : detail === 'tasks'
              ? '/vazifalar'
              : detail === 'reminders'
                ? '/eslatmalar'
                : detail === 'chat'
                  ? '/chat'
                  : detail === 'mudirs' || detail === 'pharmacists' || detail === 'interns' || detail === 'no_staff'
                    ? '/pharmacy-network'
                    : detail === 'open_requests'
                      ? '/requests'
                      : detail === 'vacancies'
                        ? '/vacancies'
                        : detail === 'candidates'
                          ? '/candidates'
                          : detail === 'hired'
                            ? '/candidates?stage=hired'
                            : detail?.startsWith('holat_')
                              ? '/admin/holat'
                              : undefined
      }
    >
      {detail === 'staffing' ? <StaffingAlertRows alerts={pendingStaffingList} /> : null}
      {detail === 'needs' ? <NeedListRows needs={filteredNeedsList.slice(0, 20)} /> : null}
      {detail === 'tasks' ? <TaskListRows tasks={openTasksList.slice(0, 20)} /> : null}
      {detail === 'reminders' ? <ReminderListRows reminders={activeRemindersList.slice(0, 20)} /> : null}
      {detail === 'chat' ? <ChatListRows chats={chatItems.slice(0, 20)} /> : null}
      {detail === 'vacancies' ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Faol ish o‘rinlari: <strong>{stats?.activeVacancies ?? 0}</strong> ta
        </p>
      ) : null}
      {detail === 'candidates' ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Faol nomzodlar: <strong>{stats?.activeCandidates ?? 0}</strong> ta
        </p>
      ) : null}
      {detail === 'hired' ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Bu oy ishga qabul: <strong>{stats?.hiredThisMonth ?? 0}</strong> ta
        </p>
      ) : null}
      {detail === 'mudirs' ? <MudirListRows mudirs={holatTree.mudirs} /> : null}
      {detail === 'pharmacists' ? <PersonListRows people={holatTree.pharmacists} /> : null}
      {detail === 'interns' ? <PersonListRows people={holatTree.interns} /> : null}
      {detail === 'no_staff' ? <BranchListRows branches={holat?.branchesWithoutStaff ?? []} /> : null}
      {detail === 'open_requests' ? (
        <>
          {openRequests.slice(0, 12).map((r) => (
            <Link key={r.id} href={`/requests/${r.id}`}>
              <DashListRow
                title={`#${r.id} · ${r.position}`}
                subtitle={[r.departmentName, r.assignedToName].filter(Boolean).join(' · ')}
                badge={requestStatusBadge(r.status)}
              />
            </Link>
          ))}
        </>
      ) : null}
      {detail === 'holat_mudir' ? <MudirListRows mudirs={holatTree.mudirs} /> : null}
      {detail === 'holat_pharm' ? <PersonListRows people={holatTree.pharmacists} /> : null}
      {detail === 'holat_intern' ? <PersonListRows people={holatTree.interns} /> : null}
      {detail === 'holat_without' ? <BranchListRows branches={holat?.branchesWithoutStaff ?? []} /> : null}
      {detail === 'holat_with' ? (
        <>
          {(holat?.branchesWithStaff ?? []).map((b) => (
            <DashListRow
              key={b.branch}
              title={b.branch}
              subtitle={`${b.mudirName} · ${b.staffCount} xodim`}
              badge={<Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 text-[10px]">Jamoa bor</Badge>}
            />
          ))}
        </>
      ) : null}
      {detail === 'holat_coord' ? (
        <>
          {(holat?.coordinators ?? []).map((c) => (
            <DashListRow
              key={c.employeeId ?? c.fullName}
              title={c.fullName}
              subtitle={`Mudir: ${c.mudirCount} · Farmasevt: ${c.pharmacistCount}`}
            />
          ))}
        </>
      ) : null}
    </DashDetailDialog>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap rounded-2xl border bg-gradient-to-br from-white to-slate-50/80 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0b3a5c]">Boshqaruv paneli</h1>
          <p className="text-muted-foreground mt-1 text-sm break-words">
            {user?.fullName}
            {subtitle ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-[#0b3a5c]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0b3a5c] align-middle">
                {subtitle}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Kartochkani bosing — tezkor ma&apos;lumot ochiladi</p>
        </div>
      </div>

      <FaceIdEnroll />

      {/* ===== RECRUITMENT (admin / hr / director / recruiter) ===== */}
      {isRecruitment && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {(role === 'admin' || isHrRole(role) || role === 'director') && (
              <DashTile
                title="Ochiq arizalar"
                value={stats?.openRequests}
                icon={FileText}
                loading={statsLoading}
                color="text-blue-600"
                accent="bg-blue-50"
                onClick={() => openDetail('open_requests')}
                active={detail === 'open_requests'}
              />
            )}
            <DashTile
              title="Faol ish o'rinlari"
              value={stats?.activeVacancies}
              icon={Briefcase}
              loading={statsLoading}
              color="text-indigo-600"
              accent="bg-indigo-50"
              onClick={() => openDetail('vacancies')}
              active={detail === 'vacancies'}
            />
            <DashTile
              title="Faol nomzodlar"
              value={stats?.activeCandidates}
              icon={Users}
              loading={statsLoading}
              color="text-amber-600"
              accent="bg-amber-50"
              onClick={() => openDetail('candidates')}
              active={detail === 'candidates'}
            />
            <DashTile
              title="Bu oy ishga qabul"
              value={stats?.hiredThisMonth}
              icon={TrendingUp}
              loading={statsLoading}
              color="text-emerald-600"
              accent="bg-emerald-50"
              onClick={() => openDetail('hired')}
              active={detail === 'hired'}
            />
            <DashTile
              title="Topshiriqlar"
              value={openTaskCount}
              icon={ListTodo}
              loading={myTasksLoading}
              color="text-sky-600"
              accent="bg-sky-50"
              onClick={() => openDetail('tasks')}
              active={detail === 'tasks'}
            />
            <DashTile
              title="Chat"
              value={unreadChats || undefined}
              icon={MessageCircle}
              color="text-violet-600"
              accent="bg-violet-50"
              onClick={() => openDetail('chat')}
              active={detail === 'chat'}
              hint={unreadChats ? 'o‘qilmagan' : undefined}
            />
          </div>

          {canViewHolatFull(role) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tarmoq holati</p>
                <Link href="/admin/holat" className="text-xs font-medium text-[#0b3a5c] hover:underline">
                  Holat →
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <DashTile title="Koordinator" value={holat?.pharmacyCounts.coordinators} icon={Users} loading={holatLoading} color="text-teal-600" accent="bg-teal-50" onClick={() => openDetail('holat_coord')} active={detail === 'holat_coord'} />
                <DashTile title="Mudir" value={holat?.pharmacyCounts.mudirs} icon={Store} loading={holatLoading} color="text-sky-600" accent="bg-sky-50" onClick={() => openDetail('holat_mudir')} active={detail === 'holat_mudir'} />
                <DashTile title="Farmasevt" value={holat?.pharmacyCounts.pharmacists} icon={Users} loading={holatLoading} color="text-emerald-600" accent="bg-emerald-50" onClick={() => openDetail('holat_pharm')} active={detail === 'holat_pharm'} />
                <DashTile title="Stajyor" value={holat?.pharmacyCounts.interns} icon={GraduationCap} loading={holatLoading} color="text-violet-600" accent="bg-violet-50" onClick={() => openDetail('holat_intern')} active={detail === 'holat_intern'} />
                <DashTile title="Jamoa bor" value={holat?.branchesWithStaff.length} icon={Store} loading={holatLoading} color="text-indigo-600" accent="bg-indigo-50" onClick={() => openDetail('holat_with')} active={detail === 'holat_with'} />
                <DashTile title="Jamoa yo‘q" value={holat?.branchesWithoutStaff.length} icon={AlertCircle} loading={holatLoading} color="text-amber-600" accent="bg-amber-50" onClick={() => openDetail('holat_without')} active={detail === 'holat_without'} />
              </div>
            </div>
          )}

          {canSeeDeadlineVacancies && (deadlineVacancies.length > 0 || vacanciesLoading) && (
            <DeadlineBlock
              loading={vacanciesLoading}
              items={deadlineVacancies}
            />
          )}

          {canWatchRequests && (
            <RequestsBlock
              loading={requestsLoading}
              openRequests={openRequests}
              statusCounts={statusCounts}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {canSeePipeline && (
                <PipelineCard
                  pipeline={pipeline}
                  loading={pipelineLoading || statsLoading}
                  stats={stats}
                />
              )}
              {canSeeRecruiterTasks && (
                <RecruiterTasksCard tasks={tasks} loading={tasksLoading} />
              )}
            </div>
            <ActivityCard activities={activities} loading={activitiesLoading} />
          </div>
        </>
      )}

      {/* ===== DEPARTMENT HEAD ===== */}
      {kind === 'department' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <DashTile title="Ochiq arizalar" value={openRequests.length} icon={FileText} loading={requestsLoading} color="text-blue-600" accent="bg-blue-50" onClick={() => openDetail('open_requests')} active={detail === 'open_requests'} />
            <DashTile title="Topshiriqlar" value={openTaskCount} icon={ListTodo} loading={myTasksLoading} color="text-sky-600" accent="bg-sky-50" onClick={() => openDetail('tasks')} active={detail === 'tasks'} />
            <DashTile title="Eslatmalar" value={activeReminders} icon={AlarmClock} loading={remindersLoading} color="text-amber-600" accent="bg-amber-50" onClick={() => openDetail('reminders')} active={detail === 'reminders'} />
            <DashTile title="Chat" value={unreadChats || undefined} icon={MessageCircle} color="text-violet-600" accent="bg-violet-50" onClick={() => openDetail('chat')} active={detail === 'chat'} hint={unreadChats ? 'o‘qilmagan' : undefined} />
          </div>
          {deadlineVacancies.length > 0 && <DeadlineBlock loading={false} items={deadlineVacancies} />}
          <DashActionBar
            items={[
              { href: '/requests', title: 'Arizalar', desc: 'Bo‘lim arizalari', icon: FileText },
              { href: '/candidates', title: 'Nomzodlar', desc: 'Tanlov jarayoni', icon: Users },
              { href: '/pharmacy-network', title: 'Aptekalar', desc: 'Tarmoq holati', icon: Store },
              ...(canViewChecklistStatus(role) ? [{ href: '/checklist-holati', title: 'Cheklist', desc: 'Tashriflar', icon: ClipboardCheck }] : []),
              { href: '/vazifalar', title: 'Topshiriqlar', desc: 'Jamoa vazifalari', icon: ListTodo },
              { href: '/chat', title: 'Chat', desc: 'Xodimlar bilan aloqa', icon: MessageCircle },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MyTasksPreview tasks={myTasks} loading={myTasksLoading} />
            <ActivityCard activities={activities} loading={activitiesLoading} />
          </div>
        </>
      )}

      {/* ===== TRAINER ===== */}
      {kind === 'trainer' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <DashTile title="Topshiriqlar" value={openTaskCount} icon={ListTodo} loading={myTasksLoading} color="text-sky-600" accent="bg-sky-50" onClick={() => openDetail('tasks')} active={detail === 'tasks'} />
            <DashTile title="Eslatmalar" value={activeReminders} icon={AlarmClock} loading={remindersLoading} color="text-amber-600" accent="bg-amber-50" onClick={() => openDetail('reminders')} active={detail === 'reminders'} />
            <DashTile title="Chat" value={unreadChats || undefined} icon={MessageCircle} color="text-violet-600" accent="bg-violet-50" onClick={() => openDetail('chat')} active={detail === 'chat'} />
          </div>
          <DashActionBar
            items={[
              { href: '/interviews', title: 'Suhbatlar', desc: 'Rejalashtirish', icon: Calendar },
              { href: '/internships', title: 'Stajirovkalar', desc: 'Stajorlar', icon: GraduationCap },
              { href: '/vazifalar', title: 'Topshiriqlar', desc: 'Kunlik ishlar', icon: ListTodo },
            ]}
          />
          <MyTasksPreview tasks={myTasks} loading={myTasksLoading} />
        </>
      )}

      {/* ===== MENTOR ===== */}
      {kind === 'mentor' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <DashTile title="Eslatmalar" value={activeReminders} icon={AlarmClock} loading={remindersLoading} color="text-amber-600" accent="bg-amber-50" onClick={() => openDetail('reminders')} active={detail === 'reminders'} />
            <DashTile title="Chat" value={unreadChats || undefined} icon={MessageCircle} color="text-violet-600" accent="bg-violet-50" onClick={() => openDetail('chat')} active={detail === 'chat'} />
            <DashTile title="Xodimlar" value="→" icon={Users} color="text-blue-600" accent="bg-blue-50" hint="Ro‘yxatni ochish" onClick={() => setLocation('/employees')} />
          </div>
          <DashActionBar
            items={[
              { href: '/employees', title: 'Xodimlar', desc: 'Mentorlik', icon: Users },
              { href: '/eslatmalar', title: 'Eslatmalar', desc: 'Shaxsiy', icon: AlarmClock },
              { href: '/chat', title: 'Chat', desc: 'Jamoa', icon: MessageCircle },
            ]}
          />
        </>
      )}

      {/* ===== PHARMACY (mudir / koordinator) ===== */}
      {isPharmacy && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2.5">
            <DashTile
              title="Kadr ogohlantirish"
              value={pendingStaffing}
              icon={AlertCircle}
              loading={staffingLoading}
              color="text-red-600"
              accent="bg-red-50"
              onClick={() => openDetail('staffing')}
              active={detail === 'staffing'}
            />
            <DashTile
              title="Ehtiyoj"
              value={pendingNeeds}
              icon={ClipboardList}
              loading={needsLoading}
              color="text-orange-600"
              accent="bg-orange-50"
              onClick={() => openDetail('needs')}
              active={detail === 'needs'}
            />
            <DashTile
              title="Topshiriqlar"
              value={openTaskCount}
              icon={ListTodo}
              loading={myTasksLoading}
              color="text-sky-600"
              accent="bg-sky-50"
              onClick={() => openDetail('tasks')}
              active={detail === 'tasks'}
            />
            {role === 'koordinator' ? (
              <DashTile
                title="Cheklist"
                value="→"
                icon={ClipboardCheck}
                color="text-emerald-600"
                accent="bg-emerald-50"
                hint="Audit / GPS"
                onClick={() => setLocation('/checklist')}
              />
            ) : (
              <DashTile
                title="Eslatmalar"
                value={activeReminders}
                icon={AlarmClock}
                loading={remindersLoading}
                color="text-emerald-600"
                accent="bg-emerald-50"
                onClick={() => openDetail('reminders')}
                active={detail === 'reminders'}
              />
            )}
          </div>

          {holatOn && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {role === 'koordinator' && (
                <DashTile
                  title="Mening mudirlarim"
                  value={holat?.pharmacyCounts.mudirs}
                  icon={Users}
                  loading={holatLoading}
                  color="text-sky-600"
                  accent="bg-sky-50"
                  onClick={() => openDetail('mudirs')}
                  active={detail === 'mudirs'}
                />
              )}
              {role === 'mudir' && (
                <DashTile
                  title="Mening filialim"
                  value={holatTree.mudirs[0]?.branch?.slice(0, 12) ?? '—'}
                  icon={Store}
                  loading={holatLoading}
                  color="text-indigo-600"
                  accent="bg-indigo-50"
                  hint={holatTree.mudirs[0]?.fullName}
                  onClick={() => openDetail('mudirs')}
                  active={detail === 'mudirs'}
                />
              )}
              <DashTile
                title="Farmasevtlar"
                value={holat?.pharmacyCounts.pharmacists}
                icon={Users}
                loading={holatLoading}
                color="text-emerald-600"
                accent="bg-emerald-50"
                onClick={() => openDetail('pharmacists')}
                active={detail === 'pharmacists'}
              />
              <DashTile
                title="Stajyorlar"
                value={holat?.pharmacyCounts.interns}
                icon={GraduationCap}
                loading={holatLoading}
                color="text-violet-600"
                accent="bg-violet-50"
                onClick={() => openDetail('interns')}
                active={detail === 'interns'}
              />
              {role === 'koordinator' && (
                <DashTile
                  title="Jamoa yo‘q filial"
                  value={holat?.branchesWithoutStaff.length}
                  icon={AlertCircle}
                  loading={holatLoading}
                  color="text-amber-600"
                  accent="bg-amber-50"
                  onClick={() => openDetail('no_staff')}
                  active={detail === 'no_staff'}
                />
              )}
            </div>
          )}

          <DashActionBar
            items={[
              { href: '/pharmacy-network', title: 'Aptekalar', desc: 'Filiallar holati', icon: Store },
              { href: '/ehtiyoj', title: 'Ehtiyoj', desc: 'So‘rovlar', icon: ClipboardList },
              { href: '/vazifalar', title: 'Topshiriqlar', desc: 'Kunlik ishlar', icon: ListTodo },
              ...(role === 'koordinator'
                ? [
                    { href: '/checklist', title: 'Cheklist', desc: 'Filial audit', icon: ClipboardCheck },
                    { href: '/checklist-holati', title: 'Reyting', desc: 'Kunlik / haftalik', icon: TrendingUp },
                  ]
                : []),
              { href: '/chat', title: 'Chat', desc: 'Jamoa suhbati', icon: MessageCircle },
            ]}
          />

          {(pendingStaffing > 0 || staffingLoading) && (
            <Card className="border-red-200/80 bg-red-50/40">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <div>
                  <CardTitle className="text-sm">Kadr ogohlantirishlari</CardTitle>
                  <p className="text-xs text-muted-foreground">Bosing — ro‘yxat ochiladi</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => openDetail('staffing')}>
                  {pendingStaffing} ta <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MyTasksPreview tasks={myTasks} loading={myTasksLoading} />
            <NeedsPreview needs={branchNeeds} loading={needsLoading} />
          </div>
        </>
      )}

      {isPharmacyStaff && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <DashTile
              title="Ehtiyoj"
              value={pendingNeeds}
              icon={ClipboardList}
              loading={needsLoading}
              color="text-orange-600"
              accent="bg-orange-50"
              onClick={() => openDetail('needs')}
              active={detail === 'needs'}
            />
            <DashTile
              title="Chat"
              value={unreadChats || undefined}
              icon={MessageCircle}
              color="text-violet-600"
              accent="bg-violet-50"
              onClick={() => openDetail('chat')}
              active={detail === 'chat'}
              hint={unreadChats ? 'o‘qilmagan' : undefined}
            />
            <DashTile
              title="Topshiriqlar"
              value={openTaskCount}
              icon={ListTodo}
              loading={myTasksLoading}
              color="text-sky-600"
              accent="bg-sky-50"
              onClick={() => openDetail('tasks')}
              active={detail === 'tasks'}
            />
            <DashTile
              title="Eslatmalar"
              value={activeReminders}
              icon={AlarmClock}
              loading={remindersLoading}
              color="text-amber-600"
              accent="bg-amber-50"
              onClick={() => openDetail('reminders')}
              active={detail === 'reminders'}
            />
            <DashTile
              title="Reyting"
              value="→"
              icon={Trophy}
              color="text-emerald-600"
              accent="bg-emerald-50"
              hint="Filial balli"
              onClick={() => setLocation('/reyting')}
            />
            <DashTile
              title="Oylik"
              value="→"
              icon={Banknote}
              color="text-[#0b3a5c]"
              accent="bg-slate-100"
              hint="Maosh / davomat"
              onClick={() => setLocation('/oylik')}
            />
          </div>
          <DashActionBar
            items={[
              { href: '/ehtiyoj', title: 'Ehtiyoj', desc: 'Filial so‘rovi', icon: ClipboardList },
              { href: '/chat', title: 'Chat', desc: 'Jamoa suhbati', icon: MessageCircle },
              { href: '/vazifalar', title: 'Topshiriqlar', desc: 'Kunlik ishlar', icon: ListTodo },
              { href: '/eslatmalar', title: 'Eslatmalar', desc: 'Shaxsiy', icon: AlarmClock },
              { href: '/reyting', title: 'Reyting', desc: 'Filial balli', icon: Trophy },
              { href: '/oylik', title: 'Oylik', desc: 'Maosh varaqasi', icon: Banknote },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MyTasksPreview tasks={myTasks} loading={myTasksLoading} />
            <NeedsPreview needs={branchNeeds} loading={needsLoading} />
          </div>
        </>
      )}

      {/* ===== SECURITY (SB) ===== */}
      {kind === 'security' && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                <Shield className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Xavfsizlik (SB)</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Eskalatsiya: operator → boshliq → direktor
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <DashTile title="Topshiriqlar" value={openTaskCount} icon={ListTodo} loading={myTasksLoading} color="text-sky-600" accent="bg-sky-50" onClick={() => openDetail('tasks')} active={detail === 'tasks'} />
            <DashTile title="Eslatmalar" value={activeReminders} icon={AlarmClock} loading={remindersLoading} color="text-amber-600" accent="bg-amber-50" onClick={() => openDetail('reminders')} active={detail === 'reminders'} />
            <DashTile title="Chat" value={unreadChats || undefined} icon={MessageCircle} color="text-violet-600" accent="bg-violet-50" onClick={() => openDetail('chat')} active={detail === 'chat'} />
          </div>
          <DashActionBar
            items={[
              { href: '/davomat', title: 'Davomat', desc: 'Jurnal', icon: ClipboardCheck },
              { href: '/pharmacy-network', title: 'Aptekalar', desc: 'Filiallar', icon: Store },
              { href: '/vazifalar', title: 'Topshiriqlar', desc: 'So‘rovlar', icon: ListTodo },
              { href: '/tashkiliy-tuzilma', title: 'Tuzilma', desc: 'SB bo‘limi', icon: Users },
              { href: '/eslatmalar', title: 'Eslatmalar', desc: 'Navbatchilik', icon: AlarmClock },
            ]}
          />
          <MyTasksPreview tasks={myTasks} loading={myTasksLoading} />
        </>
      )}

      {kind === 'finance' && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 shadow-sm">
            <p className="text-sm font-semibold text-emerald-900">Moliya bo‘limi</p>
            <p className="mt-0.5 text-xs text-emerald-800/80">
              Fiks maosh, KPI, bonus va jami oylik — xodimlar kesimida. Davomat, topshiriq va checklist
              avtomatik tortiladi.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <DashTile
              title="Hisob-kitob"
              value="→"
              icon={Calculator}
              color="text-emerald-700"
              accent="bg-emerald-50"
              hint="Filial oyligi"
              onClick={() => setLocation('/hisobkitob')}
            />
            <DashTile
              title="Oylik / KPI"
              value="→"
              icon={Banknote}
              color="text-[#0b3a5c]"
              accent="bg-slate-100"
              hint="Hisob-kitob"
              onClick={() => setLocation('/oylik')}
            />
            <DashTile
              title="Xodimlar"
              value="→"
              icon={Users}
              color="text-sky-600"
              accent="bg-sky-50"
              hint="Fiks maosh"
              onClick={() => setLocation('/employees')}
            />
            <DashTile title="Topshiriqlar" value={openTaskCount} icon={ListTodo} loading={myTasksLoading} color="text-sky-600" accent="bg-sky-50" onClick={() => openDetail('tasks')} active={detail === 'tasks'} />
            <DashTile title="Chat" value={unreadChats || undefined} icon={MessageCircle} color="text-violet-600" accent="bg-violet-50" onClick={() => openDetail('chat')} active={detail === 'chat'} />
          </div>
          <DashActionBar
            items={[
              { href: '/hisobkitob', title: 'Hisob-kitob', desc: 'Filial oyligi', icon: Calculator },
              { href: '/oylik', title: 'Oylik', desc: 'KPI va bonus', icon: Banknote },
              { href: '/employees', title: 'Xodimlar', desc: 'Ro‘yxat', icon: Users },
              { href: '/davomat', title: 'Davomat', desc: 'Hisobot', icon: ClipboardCheck },
              { href: '/checklist-holati', title: 'Cheklist', desc: 'KPI manbai', icon: ClipboardList },
              { href: '/tashkiliy-tuzilma', title: 'Tuzilma', desc: 'Bo‘limlar', icon: Users },
              { href: '/vazifalar', title: 'Topshiriqlar', desc: 'KPI manbai', icon: ListTodo },
            ]}
          />
          <MyTasksPreview tasks={myTasks} loading={myTasksLoading} />
        </>
      )}

      {kind === 'ops' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <DashTile title="Topshiriqlar" value={openTaskCount} icon={ListTodo} loading={myTasksLoading} color="text-sky-600" accent="bg-sky-50" onClick={() => openDetail('tasks')} active={detail === 'tasks'} />
            <DashTile title="Ehtiyoj" value={pendingNeeds} icon={ClipboardList} loading={needsLoading} color="text-orange-600" accent="bg-orange-50" onClick={() => openDetail('needs')} active={detail === 'needs'} />
            <DashTile title="Eslatmalar" value={activeReminders} icon={AlarmClock} loading={remindersLoading} color="text-amber-600" accent="bg-amber-50" onClick={() => openDetail('reminders')} active={detail === 'reminders'} />
            <DashTile title="Chat" value={unreadChats || undefined} icon={MessageCircle} color="text-violet-600" accent="bg-violet-50" onClick={() => openDetail('chat')} active={detail === 'chat'} />
          </div>
          <DashActionBar
            items={[
              { href: '/vazifalar', title: 'Topshiriqlar', desc: 'Berilgan ishlar', icon: ListTodo },
              { href: '/ehtiyoj', title: 'Ehtiyoj', desc: 'Filial so‘rovlari', icon: ClipboardList },
              { href: '/eslatmalar', title: 'Eslatmalar', desc: 'Shaxsiy', icon: AlarmClock },
              { href: '/chat', title: 'Chat', desc: 'Jamoa', icon: MessageCircle },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MyTasksPreview tasks={myTasks} loading={myTasksLoading} />
            <NeedsPreview needs={branchNeeds} loading={needsLoading} />
          </div>
        </>
      )}

      {detailDialog}
    </div>
  );
}

function DeadlineBlock({
  loading,
  items,
}: {
  loading: boolean;
  items: any[];
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            E'lon muddati — qancha vaqt qoldi
          </h2>
          <p className="mt-1 text-xs text-amber-900/70">
            Sizga tegishli ochiq eʼlonlar. Kam qolgan muddat birinchi.
          </p>
        </div>
        <Badge variant="secondary" className="bg-amber-100 text-amber-900">
          {items.length} ta
        </Badge>
      </div>
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="max-h-[min(55vh,420px)] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {items.map((v) => (
            <Link key={v.id} href={`/vacancies/${v.id}`}>
              <div className="flex flex-col gap-2 rounded-lg border border-amber-200/80 bg-white px-3 py-2.5 transition hover:border-amber-400 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{v.title}</p>
                    <Badge
                      variant="secondary"
                      className={
                        v.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }
                    >
                      {v.status === 'published' ? 'Faol' : 'Yangi'}
                    </Badge>
                  </div>
                  {v.recruiterName && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{v.recruiterName}</p>
                  )}
                </div>
                <div className="w-full shrink-0 sm:w-56">
                  <DeadlineCountdown deadline={v.deadline} compact showDate className="w-full" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestsBlock({
  loading,
  openRequests,
  statusCounts,
}: {
  loading: boolean;
  openRequests: any[];
  statusCounts: Record<string, number>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Ochiq Arizalar holati</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Direktor, HR va admin uchun — ochiq arizalar
          </p>
        </div>
        <Link href="/requests">
          <Button variant="outline" size="sm" className="gap-1">
            Barchasi <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-gray-50">Yangi: {statusCounts.submitted}</Badge>
          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
            Ko'rib chiqilmoqda: {statusCounts.reviewing}
          </Badge>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
            Qabul qilingan: {statusCounts.accepted}
          </Badge>
          <Badge variant="outline" className="bg-violet-50 text-violet-800 border-violet-200">
            E'lon qilingan: {statusCounts.announced}
          </Badge>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : openRequests.length > 0 ? (
          <div className="divide-y rounded-md border">
            {openRequests.slice(0, 8).map((request) => (
              <Link key={request.id} href={`/requests/${request.id}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-muted/40 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        #{request.id} · {request.position}
                      </span>
                      {request.priority === 'urgent' && (
                        <span className="inline-flex items-center text-xs text-destructive font-medium">
                          <AlertCircle className="w-3 h-3 mr-1" /> Shoshilinch
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {request.departmentName || "Bo'lim noma'lum"}
                      {request.assignedToName ? ` · Mas'ul: ${request.assignedToName}` : ' · Tayinlanmagan'}
                      {' · '}
                      {format(new Date(request.createdAt), 'dd.MM.yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {requestStatusBadge(request.status)}
                    <Eye className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border border-dashed rounded-md">
            Hozircha ochiq Ariza yo'q
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineCard({ pipeline, loading, stats }: any) {
  return (
    <Card className="overflow-hidden border-t-4 border-t-primary shadow-sm">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-white">
        <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
          <span>Tanlov voronkasi</span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="tabular-nums font-semibold">9</span>
            <span>ta bosqich</span>
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Har bir qatorda shu bosqichgacha yetgan nomzodlar soni
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <PipelineFunnel
          pipeline={pipeline}
          loading={loading}
          summary={{
            total: stats?.totalCandidates ?? pipeline?.[0]?.count ?? 0,
            pending: stats?.activeCandidates ?? 0,
            hired: stats?.hiredThisMonth ?? 0,
            rejected: stats?.rejectedCandidates ?? 0,
          }}
        />
      </CardContent>
    </Card>
  );
}

function RecruiterTasksCard({ tasks, loading }: { tasks?: any[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Bugungi vazifalar</CardTitle>
        <Badge variant="secondary">{tasks?.length || 0}</Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((task) => {
              const href =
                task.linkUrl ||
                (task.candidateId ? `/candidates/${task.candidateId}` : '/candidates');
              const dueLabel =
                task.dueLabel ||
                (task.dueDate ? format(new Date(task.dueDate), 'dd.MM HH:mm') : '');
              const deadline = task.deadline || task.dueDate;
              const isVacancyDeadline = task.type === 'find_candidate' && !!task.vacancyId;
              return (
                <Link key={task.id} href={href}>
                  <div
                    className={cn(
                      'flex items-start p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer',
                      isVacancyDeadline && task.priority === 'high'
                        ? 'border-amber-300 bg-amber-50/70 animate-pulse'
                        : '',
                    )}
                  >
                    <div className="mt-0.5">
                      {task.priority === 'high' ? (
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      ) : task.priority === 'medium' ? (
                        <Clock className="w-5 h-5 text-amber-500" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                      <p className="text-sm font-medium">{task.description}</p>
                      {task.candidateName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Nomzod: {task.candidateName}
                        </p>
                      )}
                      {isVacancyDeadline && deadline ? (
                        <div className="mt-2">
                          <DeadlineCountdown deadline={deadline} compact showDate />
                        </div>
                      ) : null}
                    </div>
                    {!isVacancyDeadline && (
                      <div className="text-xs font-medium text-muted-foreground whitespace-nowrap ml-2">
                        {dueLabel}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto text-emerald-500/50 mb-3" />
            <p>Barcha vazifalar bajarilgan!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ activities, loading }: { activities?: any[]; loading: boolean }) {
  return (
    <Card className="h-[calc(100vh-12rem)] min-h-[320px] flex flex-col overflow-hidden border-t-4 border-t-sky-500 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-50/80 to-white shrink-0">
        <CardTitle>So'nggi faollik</CardTitle>
        <p className="text-sm text-muted-foreground">Bosib tegishli yozuvni oching</p>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto pr-1">
        <RecentActivityFeed activities={activities} loading={loading} />
      </CardContent>
    </Card>
  );
}

function MyTasksPreview({ tasks, loading }: { tasks?: any[]; loading: boolean }) {
  const open = (tasks ?? [])
    .filter((t) => t.status === 'todo' || t.status === 'in_progress')
    .slice(0, 6);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Mening topshiriqlarim</CardTitle>
        <Link href="/vazifalar">
          <Button variant="outline" size="sm" className="gap-1">
            Barchasi <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : open.length ? (
          open.map((t) => (
            <Link key={t.id} href="/vazifalar">
              <div className="rounded-lg border px-3 py-2.5 hover:bg-muted/40 cursor-pointer">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.status === 'in_progress' ? 'Jarayonda' : 'Yangi'}
                  {t.dueAt ? ` · ${format(new Date(t.dueAt), 'dd.MM.yyyy')}` : ''}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Ochiq topshiriq yo‘q</p>
        )}
      </CardContent>
    </Card>
  );
}

function NeedsPreview({ needs, loading }: { needs?: any[]; loading: boolean }) {
  const list = (needs ?? [])
    .filter((n) => n.status !== 'verified' && n.status !== 'closed')
    .slice(0, 6);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Ehtiyojlar</CardTitle>
        <Link href="/ehtiyoj">
          <Button variant="outline" size="sm" className="gap-1">
            Barchasi <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : list.length ? (
          list.map((n) => (
            <Link key={n.id} href="/ehtiyoj">
              <div className="rounded-lg border px-3 py-2.5 hover:bg-muted/40 cursor-pointer">
                <p className="text-sm font-medium truncate">{n.needType}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {n.branchLocation || 'Filial'} · {n.status}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Ochiq ehtiyoj yo‘q</p>
        )}
      </CardContent>
    </Card>
  );
}
