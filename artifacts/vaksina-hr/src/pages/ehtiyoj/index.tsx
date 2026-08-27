import React, { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useGetEmployees, type Employee } from '@workspace/api-client-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { isHrManager } from '../../lib/roles';
import {
  formatNeedDt,
  needLabel,
  roleLabel,
  useBranchNeedAssignees,
  useBranchNeeds,
  useBranchNeedsHistory,
  useCloseBranchNeed,
  useConfirmBranchNeed,
  useCreateBranchNeed,
  useVerifyBranchNeed,
  type BranchNeed,
} from '../../lib/branch-needs-api';
import { useAuditBranches } from '../../lib/branch-audits-api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Skeleton } from '../../components/ui/skeleton';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  X,
} from 'lucide-react';

function statusBadge(status: string) {
  if (status === 'pending') {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Tasdiq kutilmoqda</Badge>;
  }
  if (status === 'assigned') {
    return <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">Xodimga yuborilgan</Badge>;
  }
  if (status === 'in_progress') {
    return <Badge className="bg-indigo-100 text-indigo-900 hover:bg-indigo-100">Qabul qilingan</Badge>;
  }
  if (status === 'done') {
    return <Badge className="bg-orange-100 text-orange-900 hover:bg-orange-100">Bajarilgan — tasdiq</Badge>;
  }
  if (status === 'verified') {
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Yakunlangan</Badge>;
  }
  if (status === 'closed') {
    return <Badge variant="secondary">Yopilgan</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function NeedTimeline({ n }: { n: BranchNeed }) {
  const rows: { label: string; at: string | null; detail?: string | null }[] = [
    {
      label: 'Mudir / yuboruvchi',
      at: n.createdAt,
      detail: n.createdByName
        ? `${n.createdByName}${n.createdByRole ? ` (${roleLabel(n.createdByRole)})` : ''}`
        : null,
    },
    {
      label: 'Koordinator tasdiǧi',
      at: n.confirmedAt,
      detail: n.confirmedByName,
    },
    {
      label: 'Xodimga yuborilgan',
      at: n.assignedAt || n.confirmedAt,
      detail: n.assignedUserName
        ? `${n.assignedUserName}${n.assignedUserRole ? ` · ${roleLabel(n.assignedUserRole)}` : ''}`
        : null,
    },
    { label: 'Xodim qabul qilgan', at: n.acceptedAt },
    { label: 'Xodim bajargan', at: n.completedAt },
    {
      label: 'Yakuniy tasdiq',
      at: n.verifiedAt,
      detail: n.verifiedByName,
    },
  ];

  return (
    <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3">
      {rows.map((r) => (
        <li key={r.label} className="text-[11px] leading-snug">
          <span className={r.at ? 'font-medium text-slate-700' : 'text-slate-400'}>{r.label}:</span>{' '}
          <span className={r.at ? 'text-slate-800' : 'text-slate-400'}>{formatNeedDt(r.at)}</span>
          {r.detail && r.at ? <span className="text-slate-500"> · {r.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default function EhtiyojPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const canWrite =
    user?.role === 'mudir' ||
    user?.role === 'koordinator' ||
    isHrManager(user?.role);

  const canConfirm =
    user?.role === 'koordinator' || isHrManager(user?.role);

  const canVerify =
    user?.role === 'mudir' ||
    user?.role === 'koordinator' ||
    isHrManager(user?.role);

  const isMudir = user?.role === 'mudir';
  const isKoordinator = user?.role === 'koordinator';
  const isAssigneeOnly = user?.role === 'texnik' || user?.role === 'ombor';

  const { data: needs, isLoading, refetch } = useBranchNeeds();
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } =
    useBranchNeedsHistory();
  const { data: employees, isLoading: employeesLoading } = useGetEmployees(undefined, {
    query: { enabled: canWrite && !isMudir && !isKoordinator },
  } as any);
  const { data: auditBranches = [], isLoading: branchesLoading } = useAuditBranches();
  const {
    data: assignees,
    isLoading: assigneesLoading,
    isError: assigneesError,
    refetch: refetchAssignees,
  } = useBranchNeedAssignees(canConfirm);
  const { mutate: createNeed, isPending: creating } = useCreateBranchNeed();
  const { mutate: confirmNeed, isPending: confirming } = useConfirmBranchNeed();
  const { mutate: verifyNeed, isPending: verifying } = useVerifyBranchNeed();
  const { mutate: closeNeed, isPending: closing } = useCloseBranchNeed();

  const [listOpen, setListOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [needTitle, setNeedTitle] = useState('');
  const [note, setNote] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [managerId, setManagerId] = useState<string>('none');
  const [createAssigneeId, setCreateAssigneeId] = useState<string>('none');
  const [search, setSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<BranchNeed | null>(null);
  const [confirmAssigneeId, setConfirmAssigneeId] = useState<string>('none');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'texnik' | 'ombor' | 'other'>('all');

  const managers = useMemo(() => {
    // Koordinator: cheklist API dagi filiallar (o‘z tarmog‘i)
    if (isKoordinator) {
      return auditBranches.map((b) => ({
        id: b.id,
        fullName: b.managerName,
        location: b.branchLocation,
      }));
    }
    return (employees ?? [])
      .filter((e: Employee) => e.orgRole === 'manager')
      .sort((a: Employee, b: Employee) =>
        (a.location ?? '').localeCompare(b.location ?? '', 'uz'),
      );
  }, [auditBranches, employees, isKoordinator]);

  const managersLoading = isKoordinator ? branchesLoading : employeesLoading;

  const filteredAssignees = useMemo(() => {
    const list = assignees ?? [];
    if (assigneeFilter === 'all') return list;
    if (assigneeFilter === 'texnik') return list.filter((a) => a.role === 'texnik');
    if (assigneeFilter === 'ombor') return list.filter((a) => a.role === 'ombor');
    return list.filter((a) => a.role !== 'texnik' && a.role !== 'ombor');
  }, [assignees, assigneeFilter]);

  const pendingNeeds = useMemo(
    () => (needs ?? []).filter((n) => n.status === 'pending'),
    [needs],
  );
  const doneNeeds = useMemo(
    () => (needs ?? []).filter((n) => n.status === 'done'),
    [needs],
  );

  const openNeeds = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = needs ?? [];
    if (!q) return list;
    return list.filter((n) => {
      const hay = [
        needLabel(n.needType),
        n.branchLocation,
        n.managerName,
        n.note,
        n.createdByName,
        n.assignedUserName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [needs, search]);

  const refreshAll = () => {
    refetch();
    refetchHistory();
  };

  const submit = () => {
    const title = needTitle.trim();
    if (!title) {
      toast({ title: 'Ehtiyoj matnini yozing', variant: 'destructive' });
      return;
    }
    if (isKoordinator && managerId === 'none') {
      toast({ title: 'Filial / mudirni tanlang', variant: 'destructive' });
      return;
    }
    if (isKoordinator && createAssigneeId === 'none') {
      toast({
        title: 'Ijrochini tanlang',
        description: 'Koordinator ehtiyojni belgilaganda vazifa darhol ochiladi',
        variant: 'destructive',
      });
      return;
    }
    const mgr = managerId !== 'none' ? Number(managerId) : null;
    const selected = managers.find((m) => m.id === mgr);
    const assigneeUserId =
      canConfirm && createAssigneeId !== 'none' ? Number(createAssigneeId) : undefined;

    createNeed(
      {
        needType: title,
        note: note.trim() || undefined,
        managerEmployeeId: mgr,
        branchLocation: branchLocation.trim() || selected?.location || undefined,
        assigneeUserId,
      },
      {
        onSuccess: (created) => {
          toast({
            title: created.status === 'assigned' ? 'Ehtiyoj belgilandi' : 'Ehtiyoj yuborildi',
            description:
              created.status === 'assigned'
                ? 'Ijrochiga vazifa ochildi — Topshiriqlar bo‘limida'
                : 'Koordinator tasdiǧi kutilmoqda',
          });
          setNeedTitle('');
          setNote('');
          setBranchLocation('');
          setManagerId('none');
          setCreateAssigneeId('none');
          setListOpen(true);
          refreshAll();
        },
        onError: (err: Error) => {
          toast({ title: 'Xatolik', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const handleConfirm = () => {
    if (!confirmTarget || confirmAssigneeId === 'none') {
      toast({ title: 'Ijrochini tanlang', variant: 'destructive' });
      return;
    }
    confirmNeed(
      { id: confirmTarget.id, assigneeUserId: Number(confirmAssigneeId) },
      {
        onSuccess: (result) => {
          toast({
            title: 'Tasdiqlandi',
            description: `Topshiriq #${result.taskId} yuborildi`,
          });
          setConfirmTarget(null);
          setConfirmAssigneeId('none');
          refreshAll();
        },
        onError: (err: Error) => {
          toast({ title: 'Xatolik', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const handleVerify = (id: number) => {
    verifyNeed(id, {
      onSuccess: () => {
        toast({ title: 'Yakuniy tasdiqlandi', description: 'Yozuv bazada saqlandi' });
        refreshAll();
      },
      onError: (err: Error) => {
        toast({ title: 'Xatolik', description: err.message, variant: 'destructive' });
      },
    });
  };

  const handleClose = (id: number) => {
    closeNeed(id, {
      onSuccess: () => {
        toast({ title: 'Yopildi', description: 'Yozuv bazada saqlandi' });
        refreshAll();
      },
      onError: (err: Error) => {
        toast({ title: 'Xatolik', description: err.message, variant: 'destructive' });
      },
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          <ClipboardList className="h-7 w-7 text-primary" />
          Ehtiyoj
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAssigneeOnly
            ? 'Sizga biriktirilgan ehtiyojlar. Qabul qilish va bajarish — Topshiriqlar bo‘limida.'
            : isMudir
              ? 'Yuboring → koordinator tasdiqlaydi → xodim bajaradi → siz yoki koordinator yakuniy tasdiqlaydi. Barcha vaqtlar bazada qoladi.'
              : isKoordinator
                ? 'O‘zingiz ehtiyoj belgilang: filial va ijrochini tanlang — vazifa shu kun Topshiriqlar bo‘limiga tushadi. Mudirdan kelganlarini ham tasdiqlaysiz.'
                : 'Vaqtlar: yuborilgan → tasdiqlangan → xodimga → qabul → bajarilgan → yakuniy tasdiq. Yozuvlar o‘chirilmaydi.'}
        </p>
      </div>

      {canWrite && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-1 text-sm font-semibold text-slate-800">
            {isKoordinator ? 'Ehtiyoj belgilash' : 'Yangi ehtiyoj'}
          </p>
          {isKoordinator ? (
            <p className="mb-3 text-xs text-slate-500">
              Filial + ijrochi tanlang — darhol topshiriq ochiladi
            </p>
          ) : (
            <div className="mb-3" />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-xs font-medium text-slate-500">Ehtiyoj</p>
              <Input
                value={needTitle}
                onChange={(e) => setNeedTitle(e.target.value)}
                placeholder="Masalan: Mudir, kompyuter, printer..."
                maxLength={120}
              />
            </div>
            {!isMudir && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500">
                  Filial / mudir{isKoordinator ? ' *' : ''}
                </p>
                <Select
                  value={managerId}
                  onValueChange={setManagerId}
                  disabled={managersLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        managersLoading ? 'Yuklanmoqda…' : 'Filialni tanlang'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanlanmagan</SelectItem>
                    {managers.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {(m.location || 'Filial') + ' — ' + m.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!managersLoading && managers.length === 0 && (
                  <p className="text-[11px] text-amber-700">
                    Filial topilmadi. Aptekalar tarmog‘ida mudirlar bog‘langanligini tekshiring.
                  </p>
                )}
              </div>
            )}
            {!isMudir && !isKoordinator && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500">Filial nomi (ixtiyoriy)</p>
                <Input
                  value={branchLocation}
                  onChange={(e) => setBranchLocation(e.target.value)}
                  placeholder="Masalan: FARM LYUKS"
                />
              </div>
            )}
            {canConfirm && (
              <div className={`space-y-1.5 ${isKoordinator ? 'sm:col-span-1' : 'sm:col-span-2'}`}>
                <p className="text-xs font-medium text-slate-500">
                  {isKoordinator
                    ? 'Ijrochi *'
                    : 'Ijrochi (ixtiyoriy — tanlasangiz darhol topshiriq ketadi)'}
                </p>
                <Select
                  value={createAssigneeId}
                  onValueChange={setCreateAssigneeId}
                  disabled={assigneesLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        assigneesLoading
                          ? 'Yuklanmoqda…'
                          : isKoordinator
                            ? 'Ijrochini tanlang'
                            : 'Keyinroq tasdiqlayman'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!isKoordinator && (
                      <SelectItem value="none">Keyinroq tasdiqlayman</SelectItem>
                    )}
                    {isKoordinator && <SelectItem value="none">Tanlanmagan</SelectItem>}
                    {(assignees ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.fullName} · {roleLabel(a.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assigneesError && (
                  <button
                    type="button"
                    className="text-[11px] text-rose-600 underline"
                    onClick={() => void refetchAssignees()}
                  >
                    Ijrochilar yuklanmadi — qayta urinish
                  </button>
                )}
                {!assigneesLoading && !assigneesError && (assignees?.length ?? 0) === 0 && (
                  <p className="text-[11px] text-amber-700">
                    Faol ijrochi topilmadi (texnik / ombor va boshqalar).
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-xs font-medium text-slate-500">Izoh</p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Qisqa izoh..."
                rows={2}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={submit}
              disabled={
                creating ||
                !needTitle.trim() ||
                (isKoordinator && (managerId === 'none' || createAssigneeId === 'none'))
              }
            >
              {isMudir
                ? 'Koordinatorga yuborish'
                : isKoordinator
                  ? 'Belgilash va yuborish'
                  : 'Qo‘shish'}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            {listOpen ? (
              <ChevronUp className="h-4 w-4 text-sky-700" />
            ) : (
              <ChevronDown className="h-4 w-4 text-sky-700" />
            )}
            <AlertTriangle className="h-4 w-4 text-sky-700" />
            <h2 className="text-sm font-semibold text-sky-950">
              Faol ehtiyojlar ({openNeeds.length})
              {canConfirm && pendingNeeds.length > 0 ? ` · tasdiq: ${pendingNeeds.length}` : ''}
              {canVerify && doneNeeds.length > 0 ? ` · yakuniy: ${doneNeeds.length}` : ''}
            </h2>
          </div>
          <span className="text-[11px] font-medium text-sky-800/80">
            {listOpen ? 'Yig‘ish' : 'Ochish'}
          </span>
        </button>

        {listOpen && (
          <div className="mt-3 space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Qidirish..."
              className="bg-white"
            />

            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !openNeeds.length ? (
              <p className="text-sm text-sky-900/60">Hozircha ochiq ehtiyoj yoʻq.</p>
            ) : (
              <div className="max-h-[min(60vh,560px)] space-y-2 overflow-y-auto overscroll-contain pr-1">
                {openNeeds.map((n) => (
                  <div
                    key={n.id}
                    className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="bg-sky-100 text-sky-900">
                            {needLabel(n.needType)}
                          </Badge>
                          {statusBadge(n.status)}
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                          {n.branchLocation || 'Filial'}
                          {n.managerName ? ` — ${n.managerName}` : ''}
                        </p>
                        {n.note && <p className="mt-0.5 text-xs text-slate-600">{n.note}</p>}
                        {n.taskId ? (
                          <p className="mt-1 text-[11px] text-sky-800">
                            <Link href="/vazifalar" className="underline">
                              Vazifa #{n.taskId}
                            </Link>
                            {n.assignedUserName
                              ? ` · ${n.assignedUserName}${
                                  n.assignedUserRole ? ` (${roleLabel(n.assignedUserRole)})` : ''
                                }`
                              : ''}
                          </p>
                        ) : null}
                        <NeedTimeline n={n} />
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {canConfirm && n.status === 'pending' && (
                          <Button
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => {
                              setConfirmTarget(n);
                              setConfirmAssigneeId('none');
                              setAssigneeFilter('all');
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Tasdiqlash
                          </Button>
                        )}
                        {canVerify && n.status === 'done' && (
                          <Button
                            size="sm"
                            className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                            disabled={verifying}
                            onClick={() => handleVerify(n.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Yakuniy tasdiq
                          </Button>
                        )}
                        {canWrite &&
                          n.status === 'pending' &&
                          (isMudir || canConfirm) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              disabled={closing}
                              onClick={() => handleClose(n.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                              Yopish
                            </Button>
                          )}
                        {canConfirm &&
                          (n.status === 'assigned' ||
                            n.status === 'in_progress' ||
                            n.status === 'done') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              disabled={closing}
                              onClick={() => handleClose(n.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                              Bekor
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            {historyOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-600" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-600" />
            )}
            <h2 className="text-sm font-semibold text-slate-800">
              Tarix (baza) ({(history ?? []).length})
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            {historyOpen ? 'Yig‘ish' : 'Ochish'}
          </span>
        </button>
        {historyOpen && (
          <div className="mt-3">
            {historyLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !(history ?? []).length ? (
              <p className="text-sm text-slate-500">Hali yakunlangan yozuv yoʻq.</p>
            ) : (
              <div className="max-h-[min(45vh,400px)] space-y-2 overflow-y-auto pr-1">
                {(history ?? []).map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{needLabel(n.needType)}</Badge>
                      {statusBadge(n.status)}
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {n.branchLocation || 'Filial'}
                      {n.managerName ? ` — ${n.managerName}` : ''}
                    </p>
                    <NeedTimeline n={n} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
            setConfirmAssigneeId('none');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ehtiyojni tasdiqlash</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">
                {confirmTarget ? needLabel(confirmTarget.needType) : ''}
              </span>
              {confirmTarget?.branchLocation ? ` — ${confirmTarget.branchLocation}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              Ijrochini tanlang (texnik, ombor yoki boshqa). Topshiriqlar bo‘limiga tushadi.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'Barchasi'],
                  ['texnik', 'Texnik'],
                  ['ombor', 'Ombor'],
                  ['other', 'Boshqa'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAssigneeFilter(key);
                    setConfirmAssigneeId('none');
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
                    assigneeFilter === key
                      ? 'bg-primary text-primary-foreground ring-primary'
                      : 'bg-white text-slate-700 ring-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Select value={confirmAssigneeId} onValueChange={setConfirmAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Ijrochini tanlang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Tanlanmagan</SelectItem>
                {filteredAssignees.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.fullName} · {roleLabel(a.role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Bekor
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={confirming || confirmAssigneeId === 'none'}
            >
              Tasdiqlash va yuborish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
