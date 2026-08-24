import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGetEmployees, type Employee } from '@workspace/api-client-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { cn } from '../../lib/utils';
import { isHrManager, isHrRole, isSbRole } from '../../lib/roles';
import {
  EMPLOYMENT_STATUS_LABELS,
  PIPELINE_STEPS,
  useCancelStaffingAlert,
  useConfirmStaffingAlert,
  useStaffingAlerts,
  type EmploymentStatus,
  type StaffingAlert,
} from '../../lib/staffing-api';
import { DeadlineCountdown } from '../../components/DeadlineCountdown';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { AlertTriangle, Check, Clock, Pencil, ChevronDown, ChevronUp, MapPin, Store, Search, Users, X, Plus, Copy, Eye, EyeOff, Download, Trash2 } from 'lucide-react';
import { Link } from 'wouter';
import {
  useCreatePharmacyStaff,
  useHardDeletePharmacyEmployee,
  useSaveManagerLocation,
  useOwnMudirCredentials,
  useOwnStaffLogins,
  usePatchNetworkCredentials,
  usePatchEmployeeProfile,
  downloadOwnMudirsExcel,
  downloadOwnStaffExcel,
  gpsFromLocationField,
  gpsInputError,
  displayBranchName,
  type PharmacyStaffRole,
  type PharmacyStaffResult,
} from '../../lib/pharmacy-staff-api';
import { Label } from '../../components/ui/label';

type ShiftType = 'one' | 'two' | 'custom';
type BranchEmployee = Employee & {
  latitude?: number | null;
  longitude?: number | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function shiftText(shiftType?: string | null, shiftLabel?: string | null) {
  if (shiftType === 'two') return '2-smena';
  if (shiftType === 'custom') return shiftLabel?.trim() || 'Maxsus holat';
  return '1-smena';
}

function empStatus(person: Employee): EmploymentStatus {
  return (person.employmentStatus as EmploymentStatus) || 'working';
}

function staffCounts(team: Employee[]) {
  const live = team.filter((p) => empStatus(p) !== 'dismissed');
  const pharmacists = live.filter((p) => p.orgRole === 'pharmacist' || p.orgRole === 'supervisor').length;
  const interns = live.filter((p) => p.orgRole === 'intern').length;
  return { pharmacists, interns, total: pharmacists + interns };
}

function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function isAlertStatus(status?: string | null) {
  return !!status && status !== 'working' && status !== 'no_manager';
}

function isNoManagerStatus(status?: string | null) {
  return status === 'no_manager';
}

function resolvePipelineStep(ph: Employee, linked?: StaffingAlert) {
  const status = empStatus(ph);
  if (
    status === 'searching' ||
    linked?.employmentStatus === 'searching' ||
    linked?.vacancyStatus === 'published' ||
    linked?.pipelineKey === 'searching'
  ) {
    return 5;
  }
  if (linked?.pipelineStep != null && linked.pipelineStep > 0) return linked.pipelineStep;
  if (linked?.vacancyId || linked?.vacancyStatus === 'draft') return 3;
  if (linked?.workflowStatus === 'confirmed' || linked?.requestId) return 2;
  if (
    linked?.workflowStatus === 'pending' ||
    status === 'need_hire' ||
    status === 'dismissed' ||
    status === 'new'
  ) {
    return 1;
  }
  return 0;
}

function deadlineLabel(kind?: StaffingAlert['deadlineKind']) {
  if (kind === 'vacancy') return 'Eʼlon muddati';
  if (kind === 'request') return 'Ariza muddati';
  if (kind === 'confirm') return 'Tasdiq muddati';
  return 'Muddat';
}

function EmploymentBadge({ status }: { status?: string | null }) {
  const s = (status as EmploymentStatus) || 'working';
  const label = EMPLOYMENT_STATUS_LABELS[s] || s;
  const tone =
    s === 'working'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : s === 'new'
        ? 'bg-sky-50 text-sky-700 ring-sky-200'
        : s === 'closed'
          ? 'bg-slate-200 text-slate-800 ring-slate-400'
        : s === 'dismissed'
          ? 'bg-red-100 text-red-800 ring-red-300'
          : s === 'no_manager'
            ? 'bg-amber-100 text-amber-900 ring-amber-300'
          : s === 'searching'
            ? 'bg-violet-100 text-violet-800 ring-violet-300 animate-pulse'
            : 'bg-orange-100 text-orange-800 ring-orange-300';

  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', tone)}>
      {label}
    </span>
  );
}

function ShiftBadge({
  shiftType,
  shiftLabel,
  alert,
}: {
  shiftType?: string | null;
  shiftLabel?: string | null;
  alert?: boolean;
}) {
  const label = shiftText(shiftType, shiftLabel);
  const tone = alert
    ? 'bg-red-100 text-red-800 ring-red-300'
    : shiftType === 'two'
      ? 'bg-teal-50 text-teal-700 ring-teal-200'
      : shiftType === 'custom'
        ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : 'bg-sky-50 text-sky-700 ring-sky-200';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset', tone)}>
      <Clock className="h-2.5 w-2.5 opacity-70" />
      {label}
    </span>
  );
}

function PipelineStrip({ step }: { step: number }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
      {PIPELINE_STEPS.map((s, i) => {
        const active = step >= s.step;
        const current = step === s.step;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <span className={cn('h-px w-2 shrink-0', active ? 'bg-red-400' : 'bg-slate-200')} />
            )}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                current
                  ? 'bg-red-600 text-white animate-pulse'
                  : active
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-100 text-slate-400',
              )}
              title={s.label}
            >
              {s.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white bg-slate-600',
        size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-9 w-9 text-xs',
      )}
    >
      {initials(name)}
    </div>
  );
}

function LoginPassCard({
  cred,
  reveal,
  onToggleReveal,
  onCopy,
  onEdit,
}: {
  cred: { login: string; password: string };
  reveal: boolean;
  onToggleReveal: () => void;
  onCopy: (text: string, label: string) => void;
  onEdit?: () => void;
}) {
  if (!cred.login || cred.login === '—') return null;
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate">
          <span className="text-slate-500">Login: </span>
          <span className="font-mono font-semibold text-slate-800">{cred.login}</span>
        </p>
        <button
          type="button"
          className="shrink-0 text-slate-400 hover:text-primary"
          title="Loginni nusxalash"
          onClick={(e) => {
            e.stopPropagation();
            void onCopy(cred.login, 'Login');
          }}
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate">
          <span className="text-slate-500">Parol: </span>
          <span className="font-mono font-semibold text-slate-800">
            {reveal ? cred.password : '••••••••'}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="text-slate-400 hover:text-primary"
            title={reveal ? 'Yashirish' : 'Ko‘rsatish'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleReveal();
            }}
          >
            {reveal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
          <button
            type="button"
            className="text-slate-400 hover:text-primary"
            title="Parolni nusxalash"
            onClick={(e) => {
              e.stopPropagation();
              void onCopy(cred.password, 'Parol');
            }}
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>
      {onEdit ? (
        <button
          type="button"
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-3 w-3" />
          Login/parolni tahrirlash
        </button>
      ) : null}
    </div>
  );
}

export default function PharmacyNetworkPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: employees, isLoading, refetch } = useGetEmployees();
  const patchProfile = usePatchEmployeeProfile();
  const { data: alerts, refetch: refetchAlerts } = useStaffingAlerts('open', {
    enabled: !!user,
  });
  const { mutate: confirmAlert, isPending: confirming } = useConfirmStaffingAlert();
  const { mutate: cancelAlert, isPending: cancelling } = useCancelStaffingAlert();
  const createStaff = useCreatePharmacyStaff();
  const hardDeleteStaff = useHardDeletePharmacyEmployee();
  const saveBranchGps = useSaveManagerLocation();

  const canAddMudir = user?.role === 'koordinator' || user?.role === 'admin' || isHrManager(user?.role);
  const canAddTeam = user?.role === 'mudir';
  const canAddStaff = canAddMudir || canAddTeam;
  const canHardDelete =
    user?.role === 'admin' ||
    user?.role === 'hr' ||
    user?.role === 'hr_menejer' ||
    user?.role === 'hr_direktor' ||
    user?.role === 'director';
  const canPickFilialForStaff = canAddMudir;

  const canSeeFullNetwork =
    isHrRole(user?.role) ||
    user?.role === 'director' ||
    user?.role === 'admin' ||
    user?.role === 'recruiter' ||
    user?.role === 'koordinator' ||
    user?.role === 'department_head' ||
    isSbRole(user?.role);

  const isMudirOnly = user?.role === 'mudir';
  const isKoordinatorOnly = user?.role === 'koordinator';
  const { data: mudirCreds = [] } = useOwnMudirCredentials(isKoordinatorOnly);
  const { data: staffCreds = [] } = useOwnStaffLogins(isKoordinatorOnly || isMudirOnly);
  const patchCreds = usePatchNetworkCredentials();
  const credByEmployee = useMemo(() => {
    const map = new Map<number, { login: string; password: string; fullName: string }>();
    for (const c of mudirCreds) map.set(c.employeeId, c);
    for (const c of staffCreds) map.set(c.employeeId, c);
    return map;
  }, [mudirCreds, staffCreds]);
  const [showPwdIds, setShowPwdIds] = useState<Record<number, boolean>>({});
  const [exportingMudirs, setExportingMudirs] = useState(false);

  const canEditShift =
    isHrRole(user?.role) ||
    user?.role === 'director' ||
    user?.role === 'admin' ||
    user?.role === 'department_head' ||
    user?.role === 'mudir' ||
    user?.role === 'koordinator';

  const canEditStatus =
    user?.role === 'mudir' ||
    isHrRole(user?.role) ||
    user?.role === 'admin' ||
    user?.role === 'director' ||
    user?.role === 'koordinator';

  const canSeeAlerts =
    user?.role === 'koordinator' ||
    user?.role === 'mudir' ||
    user?.role === 'admin' ||
    isHrRole(user?.role) ||
    user?.role === 'director';

  const canConfirmAlerts = user?.role === 'koordinator' || isHrManager(user?.role);
  const canSetBranchGps = user?.role === 'koordinator' || user?.role === 'admin' || isHrManager(user?.role);
  const canSetNoManager =
    user?.role === 'koordinator' ||
    user?.role === 'admin' ||
    user?.role === 'director' ||
    isHrRole(user?.role);

  /** Filialni «Yopilgan» qilish — faqat Admin / Direktor / HR menejer / HR direktor */
  const canCloseBranch =
    user?.role === 'admin' ||
    user?.role === 'director' ||
    user?.role === 'hr_direktor' ||
    user?.role === 'hr_menejer' ||
    user?.role === 'hr';

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const teamPanelRef = useRef<HTMLDivElement>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [shiftType, setShiftType] = useState<ShiftType>('one');
  const [shiftLabel, setShiftLabel] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>('working');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [search, setSearch] = useState('');
  const [coordinatorFilter, setCoordinatorFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<'all' | 'with' | 'without'>('all');

  const [addOpen, setAddOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [staffRole, setStaffRole] = useState<PharmacyStaffRole>('mudir');
  const [addKind, setAddKind] = useState<'mudir' | 'xodim'>('mudir');
  const [addManagerId, setAddManagerId] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [createdCreds, setCreatedCreds] = useState<PharmacyStaffResult | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [gpsDraft, setGpsDraft] = useState<Record<number, string>>({});
  const [branchNameDraft, setBranchNameDraft] = useState<Record<number, string>>({});
  const [gpsEditingId, setGpsEditingId] = useState<number | null>(null);
  const [savedGps, setSavedGps] = useState<Record<number, { lat: number; lng: number }>>({});
  const [credTarget, setCredTarget] = useState<{
    employeeId: number;
    fullName: string;
    login: string;
  } | null>(null);
  const [credLogin, setCredLogin] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    userId: number | null;
    fullName: string;
    kind: 'filial' | 'staff';
    staffCount?: number;
  } | null>(null);

  const orgPeople = useMemo(
    () => (employees ?? []).filter((e) => !!e.orgRole),
    [employees],
  );

  const coordinators = useMemo(() => {
    let list = orgPeople.filter((e) => e.orgRole === 'coordinator');
    // Koordinator faqat o‘z kartasini ko‘radi — boshqa koordinatorlarning mudirlari aralashmasin
    if (isKoordinatorOnly && user?.id) {
      list = list.filter((e) => e.userId === user.id);
    }
    return list;
  }, [orgPeople, isKoordinatorOnly, user?.id]);

  const allManagers = useMemo(() => {
    let list = orgPeople.filter((e) => e.orgRole === 'manager');
    // Mudir faqat o‘z kartasini ko‘radi
    if (isMudirOnly && user?.id) {
      list = list.filter((e) => e.userId === user.id);
    }
    // Koordinator — faqat o‘zi qo‘shgan (reportsToId = o‘z coordinator employee id)
    if (isKoordinatorOnly && user?.id) {
      const myCoord = orgPeople.find((e) => e.orgRole === 'coordinator' && e.userId === user.id);
      list = myCoord ? list.filter((m) => m.reportsToId === myCoord.id) : [];
    }
    return list.sort((a, b) => (a.location ?? '').localeCompare(b.location ?? '', 'uz'));
  }, [orgPeople, isMudirOnly, isKoordinatorOnly, user?.id]);

  const pharmacistsByManager = useMemo(() => {
    const map = new Map<number, Employee[]>();
    for (const p of orgPeople.filter(
      (e) => e.orgRole === 'pharmacist' || e.orgRole === 'intern' || e.orgRole === 'supervisor',
    )) {
      if (!p.reportsToId) continue;
      const list = map.get(p.reportsToId) ?? [];
      list.push(p);
      map.set(p.reportsToId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const rank = (r?: string | null) =>
          r === 'intern' ? 0 : r === 'supervisor' ? 1 : 2;
        const d = rank(a.orgRole) - rank(b.orgRole);
        if (d !== 0) return d;
        return a.fullName.localeCompare(b.fullName, 'uz');
      });
    }
    return map;
  }, [orgPeople]);

  const alertByEmployee = useMemo(() => {
    const map = new Map<number, StaffingAlert>();
    for (const a of alerts ?? []) {
      const prev = map.get(a.employeeId);
      if (!prev || new Date(a.createdAt) > new Date(prev.createdAt)) {
        map.set(a.employeeId, a);
      }
    }
    return map;
  }, [alerts]);

  const branchHasAlert = (managerId: number) => {
    const mgr = allManagers.find((m) => m.id === managerId);
    if (mgr && (isAlertStatus(empStatus(mgr)) || alertByEmployee.has(mgr.id))) return true;
    return (pharmacistsByManager.get(managerId) ?? []).some(
      (p) => isAlertStatus(empStatus(p)) || alertByEmployee.has(p.id),
    );
  };

  const nameMatch = (person: Employee, q: string) =>
    person.fullName.toLowerCase().includes(q);

  const shiftMatch = (person: Employee) => {
    if (shiftFilter === 'all') return true;
    return (person.shiftType || 'one') === shiftFilter;
  };

  const filteredCoordinators = useMemo(() => {
    const q = search.trim().toLowerCase();
    return coordinators.filter((c) => {
      if (coordinatorFilter !== 'all' && String(c.id) !== coordinatorFilter) return false;

      const managersUnder = allManagers.filter((m) => m.reportsToId === c.id);
      const orphansUnder = orgPeople.filter(
        (p) =>
          (p.orgRole === 'pharmacist' || p.orgRole === 'intern' || p.orgRole === 'supervisor') &&
          p.reportsToId === c.id,
      );
      const personShiftOk = (p: Employee) => shiftFilter === 'all' || (p.shiftType || 'one') === shiftFilter;
      const underMatchesShift =
        managersUnder.some((m) => {
          if (personShiftOk(m)) return true;
          return (pharmacistsByManager.get(m.id) ?? []).some((p) => personShiftOk(p));
        }) || orphansUnder.some((p) => personShiftOk(p));
      if (shiftFilter !== 'all' && !personShiftOk(c) && !underMatchesShift) return false;

      if (!q) return true;
      if (c.fullName.toLowerCase().includes(q)) return true;
      if (orphansUnder.some((p) => p.fullName.toLowerCase().includes(q))) return true;
      return managersUnder.some((m) => {
        if (m.fullName.toLowerCase().includes(q)) return true;
        return (pharmacistsByManager.get(m.id) ?? []).some((p) => p.fullName.toLowerCase().includes(q));
      });
    });
  }, [coordinators, coordinatorFilter, search, shiftFilter, allManagers, pharmacistsByManager, orgPeople]);

  const managers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const allowedCoordIds = new Set(filteredCoordinators.map((c) => c.id));
    let list = isMudirOnly
      ? allManagers
      : allManagers.filter((m) => m.reportsToId != null && allowedCoordIds.has(m.reportsToId));

    if (shiftFilter !== 'all') {
      list = list.filter((m) => {
        if (shiftMatch(m)) return true;
        return (pharmacistsByManager.get(m.id) ?? []).some((p) => shiftMatch(p));
      });
    }

    if (q) {
      list = list.filter((m) => {
        if (nameMatch(m, q)) return true;
        return (pharmacistsByManager.get(m.id) ?? []).some((p) => nameMatch(p, q));
      });
    }

    return list;
  }, [allManagers, filteredCoordinators, shiftFilter, search, pharmacistsByManager, isMudirOnly]);

  const teamStats = useMemo(() => {
    let withTeam = 0;
    for (const m of managers) {
      if (staffCounts(pharmacistsByManager.get(m.id) ?? []).total > 0) withTeam += 1;
    }
    return { total: managers.length, withTeam, without: managers.length - withTeam };
  }, [managers, pharmacistsByManager]);

  const visibleManagers = useMemo(() => {
    if (teamFilter === 'all') return managers;
    return managers.filter((m) => {
      const has = staffCounts(pharmacistsByManager.get(m.id) ?? []).total > 0;
      return teamFilter === 'with' ? has : !has;
    });
  }, [managers, teamFilter, pharmacistsByManager]);

  const orphanStaffGroups = useMemo(() => {
    if (isMudirOnly) return [] as { key: string; location: string; staff: Employee[] }[];
    const allowedCoordIds = new Set(filteredCoordinators.map((c) => c.id));
    const staffRoles = new Set(['pharmacist', 'intern', 'supervisor']);
    const q = search.trim().toLowerCase();
    const orphans = orgPeople.filter((p) => {
      if (!staffRoles.has(p.orgRole || '')) return false;
      if (!p.reportsToId || !allowedCoordIds.has(p.reportsToId)) return false;
      if (shiftFilter !== 'all' && !shiftMatch(p)) return false;
      if (q && !nameMatch(p, q)) return false;
      return true;
    });
    const map = new Map<string, Employee[]>();
    for (const p of orphans) {
      const loc = (p.location || '').trim() || 'Filial';
      const list = map.get(loc) ?? [];
      list.push(p);
      map.set(loc, list);
    }
    return [...map.entries()].map(([location, staff]) => ({
      key: location,
      location,
      staff: staff.sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz')),
    }));
  }, [isMudirOnly, filteredCoordinators, orgPeople, shiftFilter, search]);

  const filterTeam = (managerId: number) => {
    let team = pharmacistsByManager.get(managerId) ?? [];
    const q = search.trim().toLowerCase();
    if (shiftFilter !== 'all') {
      team = team.filter((p) => shiftMatch(p));
    }
    if (q) {
      const manager = allManagers.find((m) => m.id === managerId);
      if (manager && nameMatch(manager, q)) {
        return team;
      }
      team = team.filter((p) => nameMatch(p, q));
    }
    return team;
  };

  const pendingAlerts = useMemo(
    () => (alerts ?? []).filter((a) => a.workflowStatus === 'pending'),
    [alerts],
  );

  const confirmedAlerts = useMemo(
    () => (alerts ?? []).filter((a) => a.workflowStatus === 'confirmed'),
    [alerts],
  );

  /** Koordinator: avval tasdiq kutilayotganlar, keyin ariza jarayonidagilar — yig‘ilib turadi */
  const openAlerts = useMemo(() => {
    const list = alerts ?? [];
    return [...list].sort((a, b) => {
      if (a.workflowStatus === 'pending' && b.workflowStatus !== 'pending') return -1;
      if (a.workflowStatus !== 'pending' && b.workflowStatus === 'pending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [alerts]);

  const openEditor = (person: Employee, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditTarget(person);
    const parts = String(person.fullName || '').trim().split(/\s+/).filter(Boolean);
    setEditFirstName(parts.length <= 1 ? person.fullName || '' : parts.slice(0, -1).join(' '));
    setEditLastName(parts.length <= 1 ? '' : parts[parts.length - 1]);
    setEditPhone(String((person as Employee & { phone?: string | null }).phone || ''));
    setShiftType((person.shiftType as ShiftType) || 'one');
    setShiftLabel(person.shiftLabel ?? '');
    setEmploymentStatus(empStatus(person));
  };

  const openDeleteTarget = (person: Employee, staffCount = 0) => {
    const kind = person.orgRole === 'manager' ? 'filial' : 'staff';
    setDeleteTarget({
      id: person.id,
      userId: person.userId ?? null,
      fullName: person.fullName,
      kind,
      staffCount: kind === 'filial' ? staffCount : 0,
    });
  };

  const confirmHardDelete = () => {
    if (!deleteTarget) return;
    hardDeleteStaff.mutate(
      {
        employeeId: deleteTarget.id,
        userId: deleteTarget.userId,
        fullName: deleteTarget.fullName,
      },
      {
        onSuccess: (data) => {
          setDeleteTarget(null);
          setEditTarget(null);
          setExpandedId(null);
          void refetch();
          void refetchAlerts();
          toast({
            title: 'O‘chirildi',
            description: data.message,
          });
        },
        onError: (err: Error) => {
          void refetch();
          toast({
            title: 'O‘chirilmadi',
            description: err.message || 'Xatolik',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const openAddStaff = (kind: 'mudir' | 'xodim' = canAddMudir ? 'mudir' : 'xodim', managerId?: number) => {
    setFirstName('');
    setLastName('');
    setPhone('');
    setBranchLocation('');
    setAddKind(kind);
    setStaffRole(kind === 'mudir' ? 'mudir' : 'farmasevt');
    setAddManagerId(managerId != null ? String(managerId) : '');
    setShowPwd(false);
    setAddOpen(true);
  };

  const handleCreateStaff = () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: 'Ism va familiya kiriting', variant: 'destructive' });
      return;
    }
    if (!phone.trim()) {
      toast({ title: 'Telefon raqam kiriting', variant: 'destructive' });
      return;
    }
    if (addKind === 'xodim' && canPickFilialForStaff && !addManagerId && !canAddTeam) {
      toast({ title: 'Filialni tanlang', variant: 'destructive' });
      return;
    }
    createStaff.mutate(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        role: staffRole,
        location: staffRole === 'mudir' ? branchLocation.trim() || undefined : undefined,
        managerEmployeeId:
          addKind === 'xodim' && addManagerId ? Number(addManagerId) : undefined,
      },
      {
        onSuccess: (data) => {
          setAddOpen(false);
          setCreatedCreds(data);
          void refetch();
          toast({ title: 'Yaratildi', description: `${data.fullName} qo‘shildi` });
        },
        onError: (e: any) => {
          toast({
            title: 'Yaratilmadi',
            description: e?.message || 'Xato',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const openCredEditor = (employeeId: number, fullName: string) => {
    const cred = credByEmployee.get(employeeId);
    setCredTarget({ employeeId, fullName, login: cred?.login || '' });
    setCredLogin(cred?.login && cred.login !== '—' ? cred.login : '');
    setCredPassword('');
  };

  const saveCredentials = () => {
    if (!credTarget) return;
    patchCreds.mutate(
      { employeeId: credTarget.employeeId, login: credLogin.trim(), password: credPassword },
      {
        onSuccess: () => {
          toast({ title: 'Login/parol saqlandi' });
          setCredTarget(null);
          setCredPassword('');
        },
        onError: (e: any) => {
          toast({
            title: 'Saqlanmadi',
            description: e?.message || 'Xato',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} nusxalandi` });
    } catch {
      toast({ title: 'Nusxalanmadi', variant: 'destructive' });
    }
  };

  const handleLoginExcel = async () => {
    setExportingMudirs(true);
    try {
      if (isMudirOnly) await downloadOwnStaffExcel();
      else await downloadOwnMudirsExcel();
      toast({ title: 'Excel yuklandi' });
    } catch (e: any) {
      toast({ title: 'Excel yuklanmadi', description: e?.message, variant: 'destructive' });
    } finally {
      setExportingMudirs(false);
    }
  };

  const saveEditor = () => {
    if (!editTarget) return;
    const fullName = `${editFirstName.trim()} ${editLastName.trim()}`.replace(/\s+/g, ' ').trim();
    if (!fullName) {
      toast({ title: 'Ism kiriting', variant: 'destructive' });
      return;
    }
    patchProfile.mutate(
      {
        employeeId: editTarget.id,
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        fullName,
        phone: editPhone.trim(),
        shiftType,
        shiftLabel: shiftType === 'custom' ? shiftLabel.trim() || 'Maxsus holat' : '',
        ...(canEditStatus ? { employmentStatus } : {}),
      },
      {
        onSuccess: () => {
          toast({
            title: 'Saqlandi',
            description:
              canEditStatus && employmentStatus === 'no_manager'
                ? 'Mudir yo‘q deb belgilandi. Xodimlar ishlashda davom etadi.'
                : canEditStatus && employmentStatus !== 'working'
                  ? 'Holat yangilandi — ogohlantirish yuborildi'
                  : 'Ism va maʼlumot yangilandi',
          });
          setEditTarget(null);
          refetch();
          refetchAlerts();
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || 'Saqlashda xatolik',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const saveBranchLocation = (manager: BranchEmployee) => {
    const coordinates = (gpsDraft[manager.id] || '').trim();
    const branchName = (branchNameDraft[manager.id] ?? displayBranchName(manager.location) ?? '').trim();
    const fromField = gpsFromLocationField(manager.location);
    const hasExistingGps =
      (typeof manager.latitude === 'number' && typeof manager.longitude === 'number') ||
      Boolean(fromField) ||
      Boolean(savedGps[manager.id]);

    if (coordinates) {
      const bad = gpsInputError(coordinates);
      if (bad) {
        toast({
          title: 'Koordinata to‘liq emas',
          description: bad,
          variant: 'destructive',
        });
        return;
      }
    } else if (!hasExistingGps) {
      toast({
        title: 'Koordinata kerak',
        description: `Avval GPS yozing: 41°18'23.3"N 69°18'28.0"E`,
        variant: 'destructive',
      });
      return;
    }

    if (!branchName || branchName === 'Filial' || branchName === 'Lokatsiya') {
      toast({
        title: 'Filial nomini yozing',
        description: 'Masalan: Novza, Olmos 2, Chilonzor',
        variant: 'destructive',
      });
      return;
    }

    saveBranchGps.mutate(
      {
        employeeId: manager.id,
        coordinates,
        branchName,
        keepLocation: branchName,
      },
      {
        onSuccess: (data) => {
          if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            setSavedGps((prev) => ({
              ...prev,
              [manager.id]: { lat: data.latitude!, lng: data.longitude! },
            }));
          }
          toast({
            title: 'Saqlandi',
            description: `«${displayBranchName(data.location) || branchName}» — pinni bosing, xarita ochiladi`,
          });
          setGpsEditingId(null);
          setGpsDraft((prev) => {
            const next = { ...prev };
            delete next[manager.id];
            return next;
          });
          setBranchNameDraft((prev) => {
            const next = { ...prev };
            delete next[manager.id];
            return next;
          });
          void refetch();
        },
        onError: (err: Error) => {
          toast({ title: 'Saqlanmadi', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const handleConfirm = (alertId: number) => {
    confirmAlert(alertId, {
      onSuccess: (result) => {
        toast({
          title: 'Tasdiqlandi',
          description: `Ariza #${result.requestId} yaratildi — HR, direktor va rekruterlarga koʻrinadi`,
        });
        refetchAlerts();
      },
      onError: (err: Error) => {
        toast({ title: 'Xatolik', description: err.message, variant: 'destructive' });
      },
    });
  };

  const handleCancelAlert = (alertId: number) => {
    cancelAlert(alertId, {
      onSuccess: () => {
        toast({ title: 'Bekor qilindi' });
        refetchAlerts();
      },
      onError: (err: Error) => {
        toast({ title: 'Xatolik', description: err.message, variant: 'destructive' });
      },
    });
  };

  const toggleBranch = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  useEffect(() => {
    if (expandedId == null) return;
    const id = window.requestAnimationFrame(() => {
      teamPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [expandedId]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isMudirOnly) {
    if (allManagers.length === 0) {
      return (
        <div className="mx-auto max-w-md rounded-2xl border border-dashed bg-white p-8 text-center">
          <Store className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Filial bog‘lanmagan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sizning akkauntingiz hali filial mudiriga ulanmagan. Koordinator/HR bilan bog‘laning.
          </p>
        </div>
      );
    }
  }

  const networkEmpty = !isMudirOnly && coordinators.length === 0 && allManagers.length === 0;

  return (
    <div className={cn('space-y-5', canAddTeam && 'pb-24 md:pb-0')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Aptekalar tarmog‘i</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMudirOnly
              ? 'O‘z filialingizdagi farmasevt va stajyorlar — login/parol, Excel va tahrirlash.'
              : isKoordinatorOnly
                ? 'Faqat o‘z filiallaringiz. «Xodim qo‘shish» — istalgan filialga farmasevt/stajyor. Excelda ham chiqadi.'
                : 'Mudir qo‘shing — tizim login/parol beradi. Mudir keyin farmasevt va stajyor qo‘shadi.'}
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {(isKoordinatorOnly || isMudirOnly) && (
            <Button
              variant="outline"
              className="w-full gap-2 sm:w-auto"
              onClick={() => void handleLoginExcel()}
              disabled={exportingMudirs || allManagers.length === 0}
            >
              <Download className="h-4 w-4" />
              {exportingMudirs ? 'Yuklanmoqda…' : 'Excel yuklash'}
            </Button>
          )}
          {isKoordinatorOnly && (
            <Button
              variant="outline"
              className="h-11 w-full gap-2 sm:h-9 sm:w-auto"
              onClick={() => openAddStaff('xodim')}
              disabled={allManagers.length === 0}
            >
              <Plus className="h-4 w-4" />
              Xodim qo‘shish
            </Button>
          )}
          {canAddStaff && (
            <Button className="h-11 w-full gap-2 sm:h-9 sm:w-auto" onClick={() => openAddStaff(canAddMudir ? 'mudir' : 'xodim')}>
              <Plus className="h-4 w-4" />
              {canAddMudir ? 'Mudir qo‘shish' : 'Xodim qo‘shish'}
            </Button>
          )}
        </div>
      </div>

      {networkEmpty ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <Store className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Tarmoq maʼlumoti yo‘q</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canAddMudir
              ? 'Birinchi mudirni qo‘shing — ism, familiya, raqam. Tizim login va parol yaratadi.'
              : 'Koordinator va mudirlar hali qo‘shilmagan.'}
          </p>
          {canAddMudir && (
            <Button className="mt-4 gap-2" onClick={() => openAddStaff('mudir')}>
              <Plus className="h-4 w-4" /> Mudir qo‘shish
            </Button>
          )}
        </div>
      ) : null}

        {canSeeAlerts && (
          <div
            className={cn(
              'rounded-xl border p-3 sm:p-4 transition-colors',
              openAlerts.length > 0
                ? 'border-red-300 bg-red-50/70'
                : 'border-slate-200 bg-slate-50/80',
            )}
          >
            <button
              type="button"
              onClick={() => setAlertsOpen((o) => !o)}
              className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                {alertsOpen ? (
                  <ChevronUp className={cn('h-4 w-4 shrink-0', openAlerts.length ? 'text-red-600' : 'text-slate-500')} />
                ) : (
                  <ChevronDown className={cn('h-4 w-4 shrink-0', openAlerts.length ? 'text-red-600' : 'text-slate-500')} />
                )}
                <span className="relative inline-flex">
                  <AlertTriangle
                    className={cn(
                      'h-4 w-4 shrink-0',
                      openAlerts.length > 0 ? 'text-red-600' : 'text-slate-400',
                      openAlerts.length > 0 && 'animate-pulse',
                    )}
                  />
                  {openAlerts.length > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white animate-pulse ring-2 ring-red-100">
                      {openAlerts.length > 99 ? '99+' : openAlerts.length}
                    </span>
                  )}
                </span>
                <h2
                  className={cn(
                    'text-sm font-semibold',
                    openAlerts.length > 0 ? 'text-red-900' : 'text-slate-700',
                  )}
                >
                  {user?.role === 'koordinator'
                    ? 'Ogohlantirishlar va arizalar'
                    : 'Ogohlantirishlar'}
                  {openAlerts.length ? ` (${openAlerts.length})` : ''}
                </h2>
                {openAlerts.length > 0 && !alertsOpen && (
                  <span className="hidden rounded-full bg-red-600/15 px-2 py-0.5 text-[10px] font-semibold text-red-700 animate-pulse sm:inline">
                    Yangi xabar bor — oching
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {user?.role === 'koordinator' && openAlerts.length > 0 && (
                  <p className="text-[11px] text-red-700/80">
                    {pendingAlerts.length > 0 && (
                      <span className="font-medium">Tasdiq: {pendingAlerts.length}</span>
                    )}
                    {pendingAlerts.length > 0 && confirmedAlerts.length > 0 && ' · '}
                    {confirmedAlerts.length > 0 && (
                      <span>Ariza jarayonida: {confirmedAlerts.length}</span>
                    )}
                  </p>
                )}
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    openAlerts.length > 0 ? 'text-red-700/70' : 'text-slate-500',
                  )}
                >
                  {alertsOpen ? 'Yig‘ish' : 'Ochish'}
                </span>
              </div>
            </button>

            {alertsOpen && (
              <div className="mt-3">
                {!openAlerts.length ? (
                  <p className="text-sm text-slate-500">Hozircha ochiq ogohlantirish yoʻq.</p>
                ) : (
                  <div className="max-h-[min(50vh,380px)] space-y-2 overflow-y-auto overscroll-contain pr-1">
                    {user?.role === 'koordinator' && pendingAlerts.length > 0 && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Tasdiq kutilmoqda
                      </p>
                    )}
                    {openAlerts.map((a, idx) => {
                      const showArizaDivider =
                        user?.role === 'koordinator' &&
                        a.workflowStatus === 'confirmed' &&
                        (idx === 0 || openAlerts[idx - 1]?.workflowStatus === 'pending');

                      return (
                        <React.Fragment key={a.id}>
                          {showArizaDivider && (
                            <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Ariza jarayonida
                            </p>
                          )}
                          <div className="rounded-lg border border-red-200 bg-white px-3 py-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {a.branchLocation || 'Filial'} — {a.employeeName}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {a.employmentStatusLabel}
                                  {' · '}
                                  {shiftText(a.shiftType, a.shiftLabel)}
                                  {a.managerName ? ` · Mudir: ${a.managerName}` : ''}
                                  {' · '}
                                  {a.pipelineLabel}
                                </p>
                                <PipelineStrip
                                  step={
                                    typeof a.pipelineStep === 'number' && a.pipelineStep > 0
                                      ? a.pipelineStep
                                      : 1
                                  }
                                />
                              </div>
                              <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:w-52 sm:items-end">
                                {a.displayDeadline && (
                                  <DeadlineCountdown
                                    deadline={a.displayDeadline}
                                    compact
                                    showDate
                                    dateLabel={deadlineLabel(a.deadlineKind)}
                                    className="w-full"
                                  />
                                )}
                                {a.workflowStatus === 'pending' && canConfirmAlerts && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="h-8 gap-1"
                                      disabled={confirming}
                                      onClick={() => handleConfirm(a.id)}
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      Tasdiqlash
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1"
                                      disabled={cancelling}
                                      onClick={() => handleCancelAlert(a.id)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      Bekor
                                    </Button>
                                  </div>
                                )}
                                {a.workflowStatus === 'pending' && !canConfirmAlerts && (
                                  <span className="text-[11px] font-medium text-amber-700">
                                    Koordinator tasdiǧi kutilmoqda
                                  </span>
                                )}
                                {a.workflowStatus === 'confirmed' && a.requestId && (
                                  <Link
                                    href={`/requests/${a.requestId}`}
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                                  >
                                    Ariza #{a.requestId}
                                  </Link>
                                )}
                                {a.workflowStatus === 'confirmed' && !a.requestId && (
                                  <span className="text-[11px] font-medium text-slate-500">
                                    Ariza yaratilgan
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
                {user?.role === 'mudir' && pendingAlerts.length > 0 && (
                  <p className="mt-2 text-[11px] text-red-700/80">
                    Tasdiqlash faqat koordinator tomonidan bajariladi.
                  </p>
                )}
                {user?.role === 'koordinator' && openAlerts.length > 0 && (
                  <p className="mt-2 text-[11px] text-red-700/80">
                    «Tasdiqlash» → ariza ochiladi; yopilmaguncha shu yerda qoladi.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {canSeeFullNetwork && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ism yoki familiya bo‘yicha qidirish..."
              className="pl-9"
            />
          </div>
          {!isKoordinatorOnly ? (
            <Select value={coordinatorFilter} onValueChange={setCoordinatorFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Koordinatorlar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha koordinatorlar</SelectItem>
                {coordinators.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={shiftFilter} onValueChange={setShiftFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Smena" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha smenalar</SelectItem>
              <SelectItem value="one">1-smena</SelectItem>
              <SelectItem value="two">2-smena</SelectItem>
              <SelectItem value="custom">Maxsus</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
            {(
              [
                ['all', `Barchasi (${teamStats.total})`],
                ['with', `Jamoa bor (${teamStats.withTeam})`],
                ['without', `Jamoa yo‘q (${teamStats.without})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTeamFilter(key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset',
                  teamFilter === key
                    ? key === 'without'
                      ? 'bg-amber-100 text-amber-900 ring-amber-300'
                      : key === 'with'
                        ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
                        : 'bg-[#0b3a5c] text-white ring-[#0b3a5c]'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-[#f4f7fa] to-white">
        {(canSeeFullNetwork || isMudirOnly) && (
        <div className="border-b border-slate-200/80 px-4 py-4 sm:px-5">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            1 · Koordinator
          </p>
          {!filteredCoordinators.length ? (
            <p className="py-4 text-center text-sm text-slate-400">
              {isMudirOnly ? 'Koordinator topilmadi' : 'Filter bo‘yicha koordinator topilmadi'}
            </p>
          ) : (
            <div className={cn('flex flex-wrap justify-center gap-2.5', isMudirOnly && 'flex-col items-stretch sm:items-center')}>
              {(isMudirOnly ? coordinators : filteredCoordinators).map((coordinator) => {
                const alert = isAlertStatus(empStatus(coordinator));
                return (
                  <div
                    key={coordinator.id}
                    className={cn(
                      isMudirOnly
                        ? 'mx-auto w-full max-w-sm'
                        : 'w-full max-w-[calc((100%-2.5rem)/2)] sm:max-w-[calc((100%-1.25rem)/3)] lg:max-w-[calc((100%-3.125rem)/6)]',
                    )}
                  >
                    <div
                      className={cn(
                        'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm',
                        alert ? 'border-red-300 ring-1 ring-red-200' : 'border-[#0b3a5c]/25',
                      )}
                    >
                      <div
                        className={cn(
                          'flex flex-1 flex-col border-t-[3px]',
                          isMudirOnly ? 'p-3.5 sm:p-4' : 'p-2.5',
                          alert ? 'border-t-red-500' : 'border-t-[#0b3a5c]',
                        )}
                      >
                        <span className="mb-2 w-fit truncate rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                          Markaz
                        </span>
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'flex shrink-0 items-center justify-center rounded-full bg-[#0b3a5c] font-semibold text-white',
                              isMudirOnly ? 'h-11 w-11 text-sm' : 'h-7 w-7 text-[9px]',
                            )}
                          >
                            {initials(coordinator.fullName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cn('truncate font-semibold leading-snug text-slate-900', isMudirOnly ? 'text-sm' : 'text-xs')}>
                              {coordinator.fullName}
                            </p>
                            <p className={cn('mt-0.5 truncate text-slate-500', isMudirOnly ? 'text-[11px]' : 'text-[10px]')}>
                              Koordinator
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <EmploymentBadge status={empStatus(coordinator)} />
                              {canSeeFullNetwork && (canEditShift || canEditStatus) && (
                                <button
                                  type="button"
                                  onClick={(e) => openEditor(coordinator, e)}
                                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-primary"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        <div className="px-3 py-3 sm:px-4">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {isMudirOnly ? 'Mening filiali' : '2 · Filial mudirlari'}
            </p>
            <p className="text-xs text-slate-500">
              {teamStats.total} ta filial
              {!isMudirOnly ? ` · ${teamStats.withTeam} jamoa bor · ${teamStats.without} yo‘q` : ''}
            </p>
          </div>

          {expandedId != null && (() => {
            const manager = managers.find((m) => m.id === expandedId);
            const team = filterTeam(expandedId);
            const alert = manager ? branchHasAlert(manager.id) : false;
            if (!manager) return null;

            return (
              <div
                ref={teamPanelRef}
                className={cn(
                  'mb-4 flex max-h-[min(55vh,480px)] scroll-mt-20 flex-col rounded-xl border bg-white shadow-sm',
                  alert
                    ? 'border-red-300'
                    : isNoManagerStatus(empStatus(manager))
                      ? 'border-amber-300'
                      : 'border-slate-200',
                )}
              >
                <div className="mb-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Farmatsevtlar — eʼlon holati
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {displayBranchName(manager.location) || 'Filial'} — {manager.fullName}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setExpandedId(null)}
                  >
                    Yopish
                  </Button>
                </div>

                {team.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-amber-800">
                    Bu filialda farmasevt va stajyor yo‘q
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {team.map((ph) => {
                        const linked = alertByEmployee.get(ph.id);
                        const phAlert = isAlertStatus(empStatus(ph)) || !!linked;
                        const pipelineStep = resolvePipelineStep(ph, linked);

                        return (
                          <div
                            key={ph.id}
                            className={cn(
                              'rounded-lg border px-3 py-2.5',
                              phAlert ? 'border-red-300 bg-red-50/80' : 'border-slate-200 bg-slate-50/70',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Avatar name={ph.fullName} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-sm font-medium text-slate-900">{ph.fullName}</p>
                                  {ph.orgRole === 'intern' ? (
                                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                                      Stajyor
                                    </span>
                                  ) : ph.orgRole === 'supervisor' ? (
                                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                                      Boshqaruvchi
                                    </span>
                                  ) : (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                      Farmasevt
                                    </span>
                                  )}
                                  {(canEditShift || canEditStatus) && (
                                    <button
                                      type="button"
                                      onClick={(e) => openEditor(ph, e)}
                                      className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-primary"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canHardDelete && (
                                    <button
                                      type="button"
                                      onClick={() => openDeleteTarget(ph)}
                                      className="rounded p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                                      title="Butunlay o‘chirish"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <ShiftBadge
                                    shiftType={ph.shiftType}
                                    shiftLabel={ph.shiftLabel}
                                    alert={phAlert}
                                  />
                                  <EmploymentBadge status={empStatus(ph)} />
                                </div>
                                {(isKoordinatorOnly || isMudirOnly) && credByEmployee.get(ph.id) ? (
                                  <LoginPassCard
                                    cred={credByEmployee.get(ph.id)!}
                                    reveal={!!showPwdIds[ph.id]}
                                    onToggleReveal={() =>
                                      setShowPwdIds((prev) => ({
                                        ...prev,
                                        [ph.id]: !prev[ph.id],
                                      }))
                                    }
                                    onCopy={copyText}
                                    onEdit={() => openCredEditor(ph.id, ph.fullName)}
                                  />
                                ) : null}
                                <PipelineStrip step={pipelineStep} />
                                {linked?.displayDeadline && (
                                  <div className="mt-2">
                                    <DeadlineCountdown
                                      deadline={linked.displayDeadline}
                                      compact
                                      showDate
                                      dateLabel={deadlineLabel(linked.deadlineKind)}
                                    />
                                  </div>
                                )}
                                {linked?.requestId && (
                                  <Link
                                    href={`/requests/${linked.requestId}`}
                                    className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline"
                                  >
                                    Ariza #{linked.requestId}
                                    {linked.vacancyId ? ` · Vakansiya #${linked.vacancyId}` : ''}
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {visibleManagers.length === 0 && orphanStaffGroups.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Filter bo‘yicha mudir topilmadi</p>
          ) : (
            <div
              className={cn(
                isMudirOnly
                  ? 'mx-auto flex w-full max-w-sm flex-col gap-3'
                  : 'grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
              )}
            >
              {visibleManagers.map((manager) => {
                const fullTeam = pharmacistsByManager.get(manager.id) ?? [];
                const counts = staffCounts(fullTeam);
                const hasTeam = counts.total > 0;
                const open = expandedId === manager.id;
                const noMudir = isNoManagerStatus(empStatus(manager));
                const branchClosed = empStatus(manager) === 'closed';
                const alert = branchHasAlert(manager.id);
                const branch = manager as BranchEmployee;
                const fromField = gpsFromLocationField(manager.location);
                const gpsSaved = savedGps[manager.id];
                const lat =
                  typeof branch.latitude === 'number'
                    ? branch.latitude
                    : gpsSaved?.lat ?? fromField?.lat;
                const lng =
                  typeof branch.longitude === 'number'
                    ? branch.longitude
                    : gpsSaved?.lng ?? fromField?.lng;
                const hasGps = typeof lat === 'number' && typeof lng === 'number';
                const displayName = displayBranchName(manager.location).trim();
                const hasName = Boolean(displayName);
                const locationLabel = hasName
                  ? displayName
                  : hasGps
                    ? 'Nomsiz lokatsiya'
                    : 'Lokatsiya yo‘q';
                const accent = alert
                  ? 'border-t-red-500'
                  : branchClosed
                    ? 'border-t-slate-500'
                  : noMudir
                    ? 'border-t-amber-500'
                    : hasTeam
                      ? 'border-t-emerald-500'
                      : 'border-t-amber-400';

                return (
                  <div
                    key={manager.id}
                    className={cn(
                      'group flex min-w-0 flex-col overflow-hidden rounded-xl border border-t-[3px] bg-white shadow-sm transition-all hover:shadow-md',
                      accent,
                      alert && 'border-red-300 bg-red-50/30 ring-1 ring-red-200',
                      branchClosed && !alert && 'border-slate-300 bg-slate-100/70 ring-1 ring-slate-300',
                      noMudir && !alert && !branchClosed && 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-200',
                      !alert && !noMudir && !branchClosed && !hasTeam && 'border-amber-200 bg-amber-50/30',
                      !alert && !noMudir && !branchClosed && hasTeam && 'border-emerald-200',
                      open
                        ? alert
                          ? 'shadow-md ring-2 ring-red-200'
                          : branchClosed
                            ? 'shadow-md ring-2 ring-slate-300'
                          : noMudir
                            ? 'shadow-md ring-2 ring-amber-200'
                            : 'border-primary/40 shadow-md ring-2 ring-primary/20'
                        : !alert && 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <div className="flex flex-1 flex-col gap-3 p-3.5 sm:p-4">
                      <div className="flex flex-col gap-2">
                        {(() => {
                          const editing =
                            gpsEditingId === manager.id || (canSetBranchGps && !hasGps && !hasName);
                          if (canSetBranchGps && editing) {
                            return (
                              <div className="min-w-0 w-full space-y-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                    Filial nomi
                                  </label>
                                  <Input
                                    value={
                                      branchNameDraft[manager.id] ??
                                      (hasName ? displayName : '')
                                    }
                                    onChange={(e) =>
                                      setBranchNameDraft((prev) => ({
                                        ...prev,
                                        [manager.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Masalan: Novza, Olmos 2"
                                    className="h-9 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                    Koordinata (GPS)
                                  </label>
                                  <textarea
                                    value={gpsDraft[manager.id] ?? ''}
                                    onChange={(e) =>
                                      setGpsDraft((prev) => ({ ...prev, [manager.id]: e.target.value }))
                                    }
                                    placeholder={`41°18'23.3"N 69°18'28.0"E`}
                                    rows={2}
                                    className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs leading-snug"
                                  />
                                  <p className="text-[10px] leading-snug text-slate-500">
                                    Google Maps dan nusxa. Agar GPS allaqachon bor bo‘lsa, faqat nomni
                                    o‘zgartirish mumkin.
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-9 min-w-[7rem] flex-1 sm:flex-none"
                                    disabled={saveBranchGps.isPending}
                                    onClick={() => saveBranchLocation(branch)}
                                  >
                                    {saveBranchGps.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
                                  </Button>
                                  {gpsEditingId === manager.id && (hasGps || hasName) ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-9 flex-1 sm:flex-none"
                                      onClick={() => {
                                        setGpsEditingId(null);
                                        setGpsDraft((prev) => {
                                          const next = { ...prev };
                                          delete next[manager.id];
                                          return next;
                                        });
                                        setBranchNameDraft((prev) => {
                                          const next = { ...prev };
                                          delete next[manager.id];
                                          return next;
                                        });
                                      }}
                                    >
                                      Bekor
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="flex w-full min-w-0 items-start gap-2">
                              {hasGps ? (
                                <a
                                  href={googleMapsUrl(lat, lng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Xaritada ochish"
                                  onClick={(e) => e.stopPropagation()}
                                  className={cn(
                                    'inline-flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-sky-50 hover:text-sky-800',
                                    alert ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-800',
                                  )}
                                >
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
                                  <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold leading-snug">
                                    {locationLabel}
                                  </span>
                                </a>
                              ) : (
                                <div
                                  className={cn(
                                    'inline-flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2.5 py-2',
                                    alert ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-800',
                                  )}
                                >
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
                                  <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold leading-snug">
                                    {locationLabel}
                                  </span>
                                </div>
                              )}
                              {canSetBranchGps ? (
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-[#0b3a5c]/30 hover:text-[#0b3a5c]"
                                  title="Nom va koordinatani tahrirlash"
                                  onClick={() => {
                                    setGpsEditingId(manager.id);
                                    setBranchNameDraft((prev) => ({
                                      ...prev,
                                      [manager.id]: hasName ? displayName : '',
                                    }));
                                    setGpsDraft((prev) => ({
                                      ...prev,
                                      [manager.id]:
                                        prev[manager.id] || (hasGps ? `${lat}, ${lng}` : ''),
                                    }));
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          );
                        })()}
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              hasTeam ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900',
                            )}
                            title={hasTeam ? 'Farmasevt yoki stajyor bor' : 'Farmasevt va stajyor yo‘q'}
                          >
                            {hasTeam ? 'Jamoa bor' : 'Jamoa yo‘q'}
                          </span>
                          {isKoordinatorOnly && (
                            <button
                              type="button"
                              onClick={() => openAddStaff('xodim', manager.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                              title="Farmasevt yoki stajyor qo‘shish"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                          {canAddMudir && !isKoordinatorOnly && (
                            <button
                              type="button"
                              onClick={() => openAddStaff('xodim', manager.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                              title="Xodim qo‘shish"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                          {canAddTeam && (
                            <button
                              type="button"
                              onClick={() => openAddStaff('xodim', manager.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm"
                              title="Xodim qo‘shish"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                          {canHardDelete && (
                            <button
                              type="button"
                              onClick={() => openDeleteTarget(manager, fullTeam.length)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:bg-rose-100"
                              title="Filial va mudirni butunlay o‘chirish"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                          {(canEditShift || canEditStatus) && (
                            <button
                              type="button"
                              onClick={(e) => openEditor(manager, e)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary"
                              title="Holatni o'zgartirish"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                            alert ? 'bg-red-600' : 'bg-slate-700',
                          )}
                        >
                          {initials(manager.fullName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-slate-900">
                            {manager.fullName}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {noMudir ? 'Mudir yo‘q' : 'Mudir (zav.aptek)'}
                          </p>
                          <p className="mt-1 flex items-start gap-1 text-xs font-semibold leading-snug text-sky-900">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" />
                            <span className="min-w-0 break-words">{locationLabel}</span>
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 font-medium',
                                counts.pharmacists > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500',
                              )}
                            >
                              Farmasevt: {counts.pharmacists}
                            </span>
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 font-medium',
                                counts.interns > 0 ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-100 text-slate-500',
                              )}
                            >
                              Stajyor: {counts.interns}
                            </span>
                          </div>
                          {isKoordinatorOnly && credByEmployee.get(manager.id) ? (
                            <LoginPassCard
                              cred={credByEmployee.get(manager.id)!}
                              reveal={!!showPwdIds[manager.id]}
                              onToggleReveal={() =>
                                setShowPwdIds((prev) => ({
                                  ...prev,
                                  [manager.id]: !prev[manager.id],
                                }))
                              }
                              onCopy={copyText}
                              onEdit={() => openCredEditor(manager.id, manager.fullName)}
                            />
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span
                              className={cn(
                                'inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                                alert
                                  ? 'bg-red-100 text-red-800 ring-red-300'
                                  : manager.shiftType === 'two'
                                    ? 'bg-teal-50 text-teal-700 ring-teal-200'
                                    : manager.shiftType === 'custom'
                                      ? 'bg-amber-50 text-amber-800 ring-amber-200'
                                      : 'bg-sky-50 text-sky-700 ring-sky-200',
                              )}
                            >
                              {shiftText(manager.shiftType, manager.shiftLabel)}
                            </span>
                            <span
                              className={cn(
                                'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                empStatus(manager) === 'working'
                                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                  : empStatus(manager) === 'searching'
                                    ? 'bg-violet-100 text-violet-800 ring-violet-300'
                                    : empStatus(manager) === 'closed'
                                      ? 'bg-slate-200 text-slate-800 ring-slate-400'
                                    : empStatus(manager) === 'dismissed'
                                      ? 'bg-red-100 text-red-800 ring-red-300'
                                      : empStatus(manager) === 'new'
                                        ? 'bg-sky-50 text-sky-700 ring-sky-200'
                                        : empStatus(manager) === 'no_manager'
                                          ? 'bg-amber-100 text-amber-900 ring-amber-300'
                                        : 'bg-orange-100 text-orange-800 ring-orange-300',
                              )}
                            >
                              {EMPLOYMENT_STATUS_LABELS[empStatus(manager)]}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleBranch(manager.id)}
                        className={cn(
                          'mt-auto flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors',
                          open
                            ? 'bg-primary text-primary-foreground'
                            : alert
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
                        )}
                      >
                        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {open ? 'Yopish' : 'Batafsil'}
                      </button>

                      {isMudirOnly && (
                        <div className="space-y-2 border-t border-slate-100 pt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Filial xodimlari
                          </p>
                          {fullTeam.length === 0 ? (
                            <p className="text-center text-xs text-slate-400">
                              Hali farmasevt yoki stajyor yo‘q. «Xodim qo‘shish» bosing.
                            </p>
                          ) : (
                            fullTeam.map((ph) => {
                              const linked = alertByEmployee.get(ph.id);
                              const phAlert = isAlertStatus(empStatus(ph)) || !!linked;
                              return (
                                <div
                                  key={ph.id}
                                  className={cn(
                                    'rounded-lg border px-3 py-2.5',
                                    phAlert ? 'border-red-300 bg-red-50/80' : 'border-slate-200 bg-slate-50/70',
                                  )}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0b3a5c] text-[11px] font-semibold text-white">
                                      {initials(ph.fullName)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-slate-900">{ph.fullName}</p>
                                      <p className="mt-0.5 text-[11px] text-slate-500">
                                        {ph.orgRole === 'intern'
                                          ? 'Stajyor'
                                          : ph.orgRole === 'supervisor'
                                            ? 'Boshqaruvchi'
                                            : 'Farmasevt'}
                                      </p>
                                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                        <ShiftBadge
                                          shiftType={ph.shiftType}
                                          shiftLabel={ph.shiftLabel}
                                          alert={phAlert}
                                        />
                                        <EmploymentBadge status={empStatus(ph)} />
                                        {(canEditShift || canEditStatus) && (
                                          <button
                                            type="button"
                                            onClick={(e) => openEditor(ph, e)}
                                            className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-primary"
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </button>
                                        )}
                                        {canHardDelete && (
                                          <button
                                            type="button"
                                            onClick={() => openDeleteTarget(ph)}
                                            className="rounded p-0.5 text-rose-500 hover:bg-rose-50"
                                            title="Butunlay o‘chirish"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                      {credByEmployee.get(ph.id) ? (
                                        <LoginPassCard
                                          cred={credByEmployee.get(ph.id)!}
                                          reveal={!!showPwdIds[ph.id]}
                                          onToggleReveal={() =>
                                            setShowPwdIds((prev) => ({
                                              ...prev,
                                              [ph.id]: !prev[ph.id],
                                            }))
                                          }
                                          onCopy={copyText}
                                          onEdit={() => openCredEditor(ph.id, ph.fullName)}
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {orphanStaffGroups.map((group) => (
                <div
                  key={`orphan-${group.key}`}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-amber-300 border-t-[3px] border-t-amber-500 bg-amber-50/40 shadow-sm ring-1 ring-amber-200"
                >
                  <div className="flex flex-1 flex-col gap-3 p-3.5 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex min-w-0 items-start gap-1.5 rounded-lg bg-amber-100 px-2 py-1 text-amber-900">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
                        <span className="min-w-0 flex-1 whitespace-normal break-words text-[13px] font-semibold leading-snug">
                          {displayBranchName(group.location) || group.location || 'Filial'}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-amber-800">
                        <Users className="h-3 w-3" />
                        {group.staff.length}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Mudir yo‘q</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Filialda xodimlar bor, mudir biriktirilmagan. Ular ishlashda davom etadi.
                      </p>
                      <div className="mt-2">
                        <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-300">
                          Mudir yo‘q
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 border-t border-amber-100 pt-3">
                      {group.staff.map((ph) => (
                        <div key={ph.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0b3a5c] text-[11px] font-semibold text-white">
                              {initials(ph.fullName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{ph.fullName}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {ph.orgRole === 'intern'
                                  ? 'Stajyor'
                                  : ph.orgRole === 'supervisor'
                                    ? 'Boshqaruvchi'
                                    : 'Farmasevt'}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                <ShiftBadge
                                  shiftType={ph.shiftType}
                                  shiftLabel={ph.shiftLabel}
                                  alert={isAlertStatus(empStatus(ph))}
                                />
                                <EmploymentBadge status={empStatus(ph)} />
                                {(canEditShift || canEditStatus) && (
                                  <button
                                    type="button"
                                    onClick={(e) => openEditor(ph, e)}
                                    className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-primary"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {canAddTeam && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] md:hidden">
          <Button className="h-11 w-full gap-2" onClick={() => openAddStaff('xodim')}>
            <Plus className="h-4 w-4" />
            Xodim qo‘shish
          </Button>
        </div>
      )}

      <Dialog open={!!credTarget} onOpenChange={(open) => !open && setCredTarget(null)}>
        <DialogContent className="w-[calc(100%-1.25rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Login/parol — {credTarget?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Login</Label>
              <Input
                value={credLogin}
                onChange={(e) => setCredLogin(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Yangi parol</Label>
              <Input
                type="text"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="O‘zgartirmasangiz bo‘sh qoldiring"
              />
              <p className="text-xs text-slate-500">Kamida 6 belgi. Bo‘sh qoldirsangiz, parol o‘zgarmaydi.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCredTarget(null)}>
              Bekor qilish
            </Button>
            <Button onClick={saveCredentials} disabled={patchCreds.isPending || !credLogin.trim()}>
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="w-[calc(100%-1.25rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Tahrirlash — {editTarget?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ism</Label>
                <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Familiya</Label>
                <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
              />
            </div>
            {canEditStatus && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Xodim holati</p>
                <Select
                  value={employmentStatus}
                  onValueChange={(v) => setEmploymentStatus(v as EmploymentStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="working">Ishlamoqda</SelectItem>
                    <SelectItem value="new">Yangi</SelectItem>
                    <SelectItem value="dismissed">Bo'shatilgan</SelectItem>
                    <SelectItem value="need_hire">Xodim kerak</SelectItem>
                    <SelectItem value="searching">Qidirilmoqda</SelectItem>
                    {canSetNoManager && editTarget?.orgRole === 'manager' && (
                      <SelectItem value="no_manager">Mudir yo‘q</SelectItem>
                    )}
                    {editTarget?.orgRole === 'manager' &&
                      (canCloseBranch || employmentStatus === 'closed') && (
                      <SelectItem value="closed" disabled={!canCloseBranch}>
                        Yopilgan
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {employmentStatus === 'closed' ? (
                  <p className="text-xs text-slate-600">
                    Filial yopilgan deb belgilanadi, lekin ro‘yxatda «Yopilgan» statusi bilan qoladi.
                  </p>
                ) : employmentStatus === 'no_manager' ? (
                  <p className="text-xs text-amber-700">
                    Faqat mudir yo‘q deb belgilanadi. Filialdagi xodimlar ishlashda davom etadi, yollash ochilmaydi.
                  </p>
                ) : employmentStatus !== 'working' ? (
                  <p className="text-xs text-red-600">
                    Bu holat filialni qizil qiladi va ogohlantirish yuboradi.
                  </p>
                ) : null}
              </div>
            )}
            {canEditShift && editTarget?.orgRole !== 'coordinator' && (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Smena</p>
                  <Select value={shiftType} onValueChange={(v) => setShiftType(v as ShiftType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one">1-smena</SelectItem>
                      <SelectItem value="two">2-smena</SelectItem>
                      <SelectItem value="custom">Mudir belgilagan holat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {shiftType === 'custom' && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Maxsus smena</p>
                    <Input
                      value={shiftLabel}
                      onChange={(e) => setShiftLabel(e.target.value)}
                      placeholder="Masalan: Navbatchi..."
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            {canHardDelete && editTarget && editTarget.orgRole !== 'coordinator' ? (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
                onClick={() => {
                  const count =
                    editTarget.orgRole === 'manager'
                      ? (pharmacistsByManager.get(editTarget.id) ?? []).length
                      : 0;
                  openDeleteTarget(editTarget, count);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Butunlay o‘chirish
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditTarget(null)}>
                Bekor qilish
              </Button>
              <Button onClick={saveEditor} disabled={patchProfile.isPending}>
                Saqlash
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[calc(100%-1.25rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addKind === 'mudir' ? 'Yangi mudir' : 'Yangi xodim'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ism</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Dilnoza"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Familiya</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Xushboqova"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Telefon raqam</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
              />
            </div>
            {addKind === 'mudir' ? (
              <>
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select value="mudir" disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mudir">Mudir</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Filial koordinatasi</Label>
                  <Input
                    value={branchLocation}
                    onChange={(e) => setBranchLocation(e.target.value)}
                    placeholder={`41°18'23.3"N 69°18'28.0"E`}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Google Maps dan nusxa — tizim lokatsiya nomini o‘zi topadi.
                  </p>
                </div>
              </>
            ) : (
              <>
                {isKoordinatorOnly || (canPickFilialForStaff && !canAddTeam) ? (
                  <div className="space-y-1.5">
                    <Label>Filial</Label>
                    <Select value={addManagerId || undefined} onValueChange={setAddManagerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filialni tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {allManagers.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {displayBranchName(m.location) || m.fullName} — {m.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Xodim shu mudir ostiga tushadi.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select
                    value={staffRole}
                    onValueChange={(v) => setStaffRole(v as PharmacyStaffRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="farmasevt">Farmasevt</SelectItem>
                      <SelectItem value="stajyor">Stajyor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Yaratilgach tizim avtomatik login va parol beradi.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Bekor
            </Button>
            <Button onClick={handleCreateStaff} disabled={createStaff.isPending}>
              {createStaff.isPending ? 'Yaratilmoqda...' : 'Yaratish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdCreds} onOpenChange={(o) => !o && setCreatedCreds(null)}>
        <DialogContent className="w-[calc(100%-1.25rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Login va parol</DialogTitle>
          </DialogHeader>
          {createdCreds && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{createdCreds.fullName}</span>
                {' · '}
                {createdCreds.role}
              </p>
              <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase text-slate-500">Login</p>
                    <p className="font-mono text-sm font-semibold">{createdCreds.login}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => void copyText(createdCreds.login, 'Login')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase text-slate-500">Parol</p>
                    <p className="font-mono text-sm font-semibold">
                      {showPwd ? createdCreds.temporaryPassword : '••••••••'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowPwd((v) => !v)}
                    >
                      {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void copyText(createdCreds.temporaryPassword, 'Parol')
                      }
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() =>
                  void copyText(
                    `Login: ${createdCreds.login}\nParol: ${createdCreds.temporaryPassword}`,
                    'Login/parol',
                  )
                }
              >
                Hammasini nusxalash
              </Button>
              <p className="text-xs text-amber-700">
                Parolni hozir saqlang — keyin ko‘rinmaydi.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedCreds(null)}>Yopish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === 'filial' ? 'Filialni o‘chirish?' : 'Xodimni o‘chirish?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-slate-900">{deleteTarget?.fullName}</span>{' '}
                  {deleteTarget?.kind === 'filial'
                    ? 'filiali va mudiri tizimdan butunlay o‘chiriladi.'
                    : 'tizimdan butunlay o‘chiriladi.'}
                </p>
                {deleteTarget?.kind === 'filial' && (deleteTarget.staffCount ?? 0) > 0 ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                    Shu filialdagi {deleteTarget.staffCount} ta farmasevt/stajyor ham o‘chadi.
                  </p>
                ) : null}
                <p className="text-rose-700">
                  Login, parol, davomat, Face ID va boshqa bog‘liq ma’lumotlar ham yo‘qoladi. Qaytarib
                  bo‘lmaydi.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hardDeleteStaff.isPending}>Bekor</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={hardDeleteStaff.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmHardDelete();
              }}
            >
              {hardDeleteStaff.isPending ? 'O‘chirilmoqda…' : 'Ha, o‘chirish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
