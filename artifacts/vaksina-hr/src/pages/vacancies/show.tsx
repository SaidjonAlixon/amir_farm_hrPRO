import React from 'react';
import {
  useGetVacancy,
  usePublishVacancy,
  useDeleteVacancy,
  useUpdateVacancy,
  useGetCandidates,
  type Candidate,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  ArrowLeft,
  MapPin,
  Clock,
  DollarSign,
  Gift,
  Users,
  Trash2,
  CheckCircle,
  CheckCircle2,
  FileDown,
  Phone,
  GraduationCap,
  Briefcase,
  ExternalLink,
  CalendarClock,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { isHrManager, isHrRole, canExtendVacancy } from '../../lib/roles';
import { openCandidatePdf, openVacancyCandidatesPdf } from '../../lib/candidate-pdf';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const STAGE_LABELS: Record<string, string> = {
  phone_interview: 'Tanishuv',
  online_interview: 'Onlayn suhbat',
  preboarding: 'Pre-boarding',
  offline_interview: 'Offline suhbat',
  final_decision: 'Yakuniy qaror',
  offer: 'Job offer',
  documents: 'Hujjatlar',
  internship: 'Stajirovka',
  hired: 'Ishga qabul',
  rejected: 'Rad etilgan',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Faol',
  hired: 'Ishga olingan',
  rejected: 'Rad etilgan',
};

function toLocalInput(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addDaysIso(fromIso: string | null | undefined, days: number) {
  const now = new Date();
  const cur = fromIso ? new Date(fromIso) : now;
  const base = !Number.isNaN(cur.getTime()) && cur.getTime() > now.getTime() ? cur : now;
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

function formatMaybeDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd.MM.yyyy HH:mm');
  } catch {
    return iso;
  }
}

function toPdfData(c: Candidate) {
  return {
    fullName: c.fullName,
    phone: c.phone,
    birthDate: c.birthDate,
    address: c.address,
    education: c.education,
    experience: c.experience,
    expectedSalary: c.expectedSalary,
    notes: c.notes,
    stage: c.stage,
    stageLabel: STAGE_LABELS[c.stage] || c.stage,
    status: c.status,
    statusLabel: STATUS_LABELS[c.status || ''] || c.status || '—',
    recruiterName: c.recruiterName,
    createdAt: formatMaybeDate(c.createdAt),
  };
}

export default function VacancyDetails({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: vacancy, isLoading, refetch } = useGetVacancy(id, { query: { enabled: !!id } });
  const { data: candidates, isLoading: candidatesLoading } = useGetCandidates(
    { vacancyId: id },
    { query: { enabled: !!id } } as any,
  );
  const { mutate: publish, isPending: isPublishing } = usePublishVacancy();
  const { mutate: removeVacancy, isPending: isDeleting } = useDeleteVacancy();
  const { mutate: updateVacancy, isPending: isUpdating } = useUpdateVacancy();
  const { toast } = useToast();
  const [selectedChannels, setSelectedChannels] = React.useState<number[]>([]);
  const autoPublish = new URLSearchParams(window.location.search).get('publish') === '1';
  const [publishOpen, setPublishOpen] = React.useState(autoPublish);
  const [extendOpen, setExtendOpen] = React.useState(false);
  const [customDeadline, setCustomDeadline] = React.useState('');
  const [busyKind, setBusyKind] = React.useState<'close' | 'extend' | null>(null);
  const canPublish = isHrManager(user?.role) || user?.role === 'recruiter';
  const canDelete = isHrRole(user?.role) || user?.role === 'director';
  const isAssignedRecruiter =
    user?.role === 'recruiter' && vacancy?.recruiterId === user.id;
  const canClose =
    !!vacancy &&
    vacancy.status === 'published' &&
    (user?.role === 'admin' ||
      isHrRole(user?.role) ||
      user?.role === 'director' ||
      isAssignedRecruiter);
  const canExtend =
    !!vacancy &&
    vacancy.status !== 'closed' &&
    canExtendVacancy(user?.role);

  React.useEffect(() => {
    if (autoPublish && vacancy?.status === 'draft' && canPublish) {
      setPublishOpen(true);
    }
  }, [autoPublish, vacancy?.status, canPublish]);

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!vacancy) return <div>Ish o'rni topilmadi</div>;

  const vacancyPdfMeta = {
    title: vacancy.title,
    location: vacancy.location,
    salaryRange: vacancy.salaryRange,
    recruiterName: vacancy.recruiterName,
    departmentName: vacancy.departmentName,
  };

  const list = candidates ?? [];

  const handleExportAllPdf = () => {
    const ok = openVacancyCandidatesPdf(list.map(toPdfData), vacancyPdfMeta);
    if (!ok) {
      toast({
        title: 'Popup bloklangan',
        description: 'Brauzerda popup-ni ruxsat qiling',
        variant: 'destructive',
      });
    }
  };

  const handleExportOnePdf = (c: Candidate) => {
    const ok = openCandidatePdf(toPdfData(c), vacancyPdfMeta);
    if (!ok) {
      toast({
        title: 'Popup bloklangan',
        description: 'Brauzerda popup-ni ruxsat qiling',
        variant: 'destructive',
      });
    }
  };

  const handlePublish = () => {
    if (selectedChannels.length === 0) {
      toast({ title: 'Xatolik', description: "Kamida bitta kanalni tanlang", variant: 'destructive' });
      return;
    }

    publish(
      { id, data: { channelIds: selectedChannels } },
      {
        onSuccess: () => {
          toast({ title: 'Qabul qilindi', description: "Ish o'rni faol holatga o'tkazildi" });
          setPublishOpen(false);
          setSelectedChannels([]);
          window.history.replaceState({}, '', `/vacancies/${id}`);
          refetch();
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || "E'lon qilishda xatolik yuz berdi",
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleDelete = () => {
    removeVacancy(
      { id },
      {
        onSuccess: () => {
          toast({ title: "O'chirildi", description: "Ish o'rni o'chirildi" });
          setLocation('/vacancies');
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || "O'chirishda xatolik yuz berdi",
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleClose = () => {
    setBusyKind('close');
    updateVacancy(
      { id, data: { status: 'closed' } },
      {
        onSuccess: () => {
          toast({ title: 'Bajarildi', description: "Ish o'rni yopildi — odam olindi" });
          refetch();
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || "Ish o'rinini yopib bo'lmadi",
            variant: 'destructive',
          });
        },
        onSettled: () => setBusyKind(null),
      },
    );
  };

  const handleExtend = (deadlineIso: string) => {
    setBusyKind('extend');
    updateVacancy(
      { id, data: { deadline: deadlineIso } },
      {
        onSuccess: () => {
          toast({
            title: 'Muddat cho‘zildi',
            description: `Yangi muddat: ${format(new Date(deadlineIso), 'dd.MM.yyyy HH:mm')}`,
          });
          setExtendOpen(false);
          refetch();
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || "Ish o'rinini cho‘zib bo'lmadi",
            variant: 'destructive',
          });
        },
        onSettled: () => setBusyKind(null),
      },
    );
  };

  const isClosing = isUpdating && busyKind === 'close';
  const isExtending = isUpdating && busyKind === 'extend';

  const publishChannels = [
    { id: 1, name: 'HeadHunter (hh.uz)' },
    { id: 2, name: 'OLX.uz' },
    { id: 3, name: 'Telegram Kanal' },
    { id: 4, name: 'Instagram' },
    { id: 5, name: 'Kompaniya sayti' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/vacancies">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{vacancy.title}</h1>
              <Badge
                variant="secondary"
                className={
                  vacancy.status === 'published'
                    ? 'bg-emerald-100 text-emerald-800'
                    : vacancy.status === 'draft'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-800 text-white gap-1'
                }
              >
                {vacancy.status === 'published' ? (
                  'Faol'
                ) : vacancy.status === 'draft' ? (
                  'Yangi'
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> Bajarildi
                  </>
                )}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Ariza #{vacancy.requestId}
              {vacancy.departmentName ? ` · ${vacancy.departmentName}` : ''}
              {' · '}
              {format(new Date(vacancy.createdAt), 'dd.MM.yyyy')}
              {' · '}
              {list.length} ta nomzod
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {list.length > 0 && (
            <Button type="button" variant="outline" className="gap-2" onClick={handleExportAllPdf}>
              <FileDown className="w-4 h-4" /> Barcha nomzodlar PDF
            </Button>
          )}
          {(user?.role === 'recruiter' || isHrRole(user?.role) || user?.role === 'director' || user?.role === 'admin') &&
            vacancy.status !== 'closed' && (
            <Link href={`/candidates/new?vacancyId=${vacancy.id}`}>
              <Button variant="outline" className="gap-2">
                <Users className="w-4 h-4" /> Nomzod qo'shish
              </Button>
            </Link>
          )}

          {canExtend && (
            <Dialog
              open={extendOpen}
              onOpenChange={(open) => {
                setExtendOpen(open);
                if (open) setCustomDeadline(toLocalInput((vacancy as any).deadline));
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={isExtending}>
                  <CalendarClock className="w-4 h-4" />
                  {isExtending ? 'Cho‘zilmoqda...' : "Ish o'rinini cho'zish"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ish o‘rinini cho‘zish</DialogTitle>
                  <DialogDescription>
                    Joriy muddat:{' '}
                    {(vacancy as any).deadline
                      ? format(new Date((vacancy as any).deadline), 'dd.MM.yyyy HH:mm')
                      : 'Belgilanmagan'}
                    . Yangi muddat hozirgisidan keyin bo‘lishi kerak.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap gap-2">
                  {[3, 7, 14, 30].map((d) => (
                    <Button
                      key={d}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isExtending}
                      onClick={() => handleExtend(addDaysIso((vacancy as any).deadline, d))}
                    >
                      +{d} kun
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label>Yoki aniq sana va vaqt</Label>
                  <Input
                    type="datetime-local"
                    value={customDeadline}
                    onChange={(e) => setCustomDeadline(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setExtendOpen(false)}>
                    Bekor
                  </Button>
                  <Button
                    type="button"
                    disabled={isExtending || !customDeadline}
                    onClick={() => handleExtend(new Date(customDeadline).toISOString())}
                  >
                    Cho‘zish
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canClose && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={isClosing}>
                  <CheckCircle2 className="w-4 h-4" />
                  {isClosing ? 'Yopilmoqda...' : "Ish o'rinini yopish"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ish o‘rinini yopish?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Odam olindi deb belgilansin. Status <strong>Bajarildi</strong> bo‘ladi.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Bekor</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClose}>Ha, yopish</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {vacancy.status === 'draft' && canPublish && (
            <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary">
                  <CheckCircle className="w-4 h-4" /> Qabul qildim
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Qabul qilish va e'lon qilish</DialogTitle>
                  <DialogDescription>
                    Ish o'rnini qabul qiling va qayerlarda e'lon berishingizni tanlang. Tasdiqlangach status Faol bo'ladi.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <p className="text-sm text-muted-foreground">E'lon kanallari:</p>
                  <div className="space-y-3">
                    {publishChannels.map(channel => (
                      <div key={channel.id} className="flex items-center space-x-2 border p-3 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => {
                        setSelectedChannels(prev =>
                          prev.includes(channel.id) ? prev.filter(cid => cid !== channel.id) : [...prev, channel.id]
                        );
                      }}>
                        <Checkbox
                          id={`channel-${channel.id}`}
                          checked={selectedChannels.includes(channel.id)}
                          onCheckedChange={(checked) => {
                            setSelectedChannels(prev =>
                              checked ? [...prev, channel.id] : prev.filter(cid => cid !== channel.id)
                            );
                          }}
                        />
                        <label htmlFor={`channel-${channel.id}`} className="text-sm font-medium leading-none cursor-pointer flex-1">
                          {channel.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setPublishOpen(false)}>Bekor qilish</Button>
                  <Button onClick={handlePublish} disabled={isPublishing || selectedChannels.length === 0}>
                    {isPublishing ? 'Saqlanmoqda...' : "Qabul qilish va faollashtirish"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" disabled={isDeleting}>
                  <Trash2 className="w-4 h-4" /> O'chirish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ish o'rnini o'chirasizmi?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Bu ish o'rni va unga bog'liq barcha nomzodlar butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    O'chirish
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card className="border-[#0b3a5c]/20 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#0b3a5c]" />
              Nomzodlar
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Faqat «{vacancy.title}» ish o‘rni uchun — {list.length} ta
            </p>
          </div>
          {list.length > 0 && (
            <Button type="button" size="sm" variant="secondary" className="gap-2" onClick={handleExportAllPdf}>
              <FileDown className="w-4 h-4" /> PDF yuklab olish
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {candidatesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
              <p className="text-sm text-slate-500">Bu ish o‘rni uchun hali nomzod yo‘q</p>
              {vacancy.status !== 'closed' && (
                <Link href={`/candidates/new?vacancyId=${vacancy.id}`}>
                  <Button className="mt-3" size="sm">Nomzod qo‘shish</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0 space-y-3">
                    <div className="flex min-h-[28px] flex-wrap items-center gap-2">
                      <Link
                        href={`/candidates/${c.id}`}
                        className="truncate text-lg font-semibold text-[#0b3a5c] hover:underline"
                      >
                        {c.fullName}
                      </Link>
                      <Badge variant="secondary" className="shrink-0 bg-sky-50 text-sky-800">
                        {STAGE_LABELS[c.stage] || c.stage}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={
                          c.status === 'hired'
                            ? 'shrink-0 bg-emerald-50 text-emerald-800'
                            : c.status === 'rejected'
                              ? 'shrink-0 bg-red-50 text-red-700'
                              : 'shrink-0 bg-slate-100 text-slate-700'
                        }
                      >
                        {STATUS_LABELS[c.status || ''] || c.status || 'Faol'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{c.phone || '—'}</span>
                      </p>
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate">
                        <GraduationCap className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{c.education || 'Taʼlim kiritilmagan'}</span>
                      </p>
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate">
                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{c.experience || 'Tajriba kiritilmagan'}</span>
                      </p>
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{c.address || 'Manzil kiritilmagan'}</span>
                      </p>
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate">
                        <DollarSign className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{c.expectedSalary || 'Maosh kiritilmagan'}</span>
                      </p>
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate text-xs text-slate-400">
                        Tug‘ilgan: {c.birthDate || '—'}
                      </p>
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate text-xs text-slate-400">
                        Qo‘shilgan: {formatMaybeDate(c.createdAt)}
                      </p>
                      <p className="flex min-h-[20px] items-center gap-1.5 truncate text-xs text-slate-400">
                        Rekruter: {c.recruiterName || vacancy.recruiterName || '—'}
                      </p>
                    </div>

                    <div className="min-h-[52px] rounded-lg bg-slate-50 px-3 py-2">
                      <p className="line-clamp-2 text-sm text-slate-600">
                        {c.notes?.trim() || 'Izoh yo‘q'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-row gap-2 sm:w-[112px] sm:flex-col">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-2 sm:flex-none"
                      onClick={() => handleExportOnePdf(c)}
                    >
                      <FileDown className="w-4 h-4" /> PDF
                    </Button>
                    <Link href={`/candidates/${c.id}`} className="flex-1 sm:flex-none">
                      <Button type="button" size="sm" variant="secondary" className="w-full gap-2">
                        <ExternalLink className="w-4 h-4" /> Profil
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle>Kim kerak — Ariza ma'lumoti</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Lavozim</p>
                <p className="font-semibold mt-1">{vacancy.requestPosition || vacancy.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Bo'lim</p>
                <p className="font-semibold mt-1">{vacancy.departmentName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Kerakli soni</p>
                <p className="font-semibold mt-1">{vacancy.requestCount ?? '—'} kishi</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Prioritet</p>
                <p className="font-semibold mt-1">
                  {vacancy.requestPriority === 'urgent' ? 'Shoshilinch' : vacancy.requestPriority || '—'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Talablar</p>
                <div className="rounded-md bg-muted/40 p-3 whitespace-pre-wrap">
                  {vacancy.requestRequirements || vacancy.requestDescription || 'Kiritilmagan'}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Mas'ul rekruter</p>
                <p className="font-semibold mt-1 text-primary">{vacancy.recruiterName || 'Biriktirilmagan'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Kadr topish muddati</p>
                <p className="font-semibold mt-1">
                  {vacancy.deadline
                    ? format(new Date(vacancy.deadline), 'dd.MM.yyyy HH:mm')
                    : 'Belgilanmagan'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vaqtlar tarixi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">HR rekruterga yuborgan</span>
                <span className="font-medium text-right">
                  {(vacancy as any).assignedAt
                    ? format(new Date((vacancy as any).assignedAt), 'dd.MM.yyyy HH:mm')
                    : format(new Date(vacancy.createdAt), 'dd.MM.yyyy HH:mm')}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Rekruter qabul qilgan</span>
                <span className="font-medium text-right">
                  {(vacancy as any).acceptedAt
                    ? format(new Date((vacancy as any).acceptedAt), 'dd.MM.yyyy HH:mm')
                    : <span className="italic text-muted-foreground">Hali qabul qilinmagan</span>}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">E'lon tasdiqlangan (Faol)</span>
                <span className="font-medium text-right">
                  {(vacancy as any).publishedAt
                    ? format(new Date((vacancy as any).publishedAt), 'dd.MM.yyyy HH:mm')
                    : <span className="italic text-muted-foreground">Hali e'lon qilinmagan</span>}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ish o'rni matni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                  {vacancy.description || 'Matn kiritilmagan'}
                </div>
              </div>

              {vacancy.benefits && (
                <div className="pt-4 border-t">
                  <h4 className="flex items-center gap-2 font-semibold text-lg mb-3">
                    <Gift className="w-5 h-5 text-primary" /> Biz taklif qilamiz:
                  </h4>
                  <div className="bg-muted/30 p-4 rounded-md text-sm whitespace-pre-wrap">
                    {vacancy.benefits}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ish sharoitlari</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <span className="font-medium block text-foreground">Manzil</span>
                  <span className="text-muted-foreground">{vacancy.location || 'Kiritilmagan'}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <span className="font-medium block text-foreground">Grafik</span>
                  <span className="text-muted-foreground">{vacancy.schedule || 'Kiritilmagan'}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <span className="font-medium block text-foreground">Maosh</span>
                  <span className="text-muted-foreground">{vacancy.salaryRange || 'Suhbat natijalariga ko\'ra'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {vacancy.channels && vacancy.channels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>E'lon qilingan kanallar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {vacancy.channels.map((channel, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                    <span className="font-medium text-sm">{channel.channelName}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>👀 {channel.views || 0}</span>
                      <span>👥 {channel.applications || 0}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
