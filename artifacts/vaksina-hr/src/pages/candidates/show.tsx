import React, { useMemo, useState } from 'react';
import {
  useGetCandidate,
  useGetCandidatePipeline,
  useDeleteCandidate,
  useUpdateCandidate,
  useGetUsers,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Pipeline } from '../../components/ui/pipeline';
import { StageHistory } from '../../components/candidates/StageHistory';
import { CandidateReadOnlyBanner } from '../../components/candidates/CandidateReadOnlyBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft, User, Briefcase, GraduationCap, FileText, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/use-toast';
import {
  canManageCandidate,
  canReassignCandidate,
  isAssignableRole,
  roleLabel,
} from '../../lib/candidate-access';
import { isHrRole } from '../../lib/roles';
import { stageFormHref } from '../../lib/stage-routes';
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium whitespace-pre-wrap break-words">{value?.trim() ? value : 'Kiritilmagan'}</p>
    </div>
  );
}

export default function CandidateProfile({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: candidate, isLoading, refetch } = useGetCandidate(id, { query: { enabled: !!id } });
  const { data: pipeline, isLoading: isPipelineLoading } = useGetCandidatePipeline(id, { query: { enabled: !!id } });
  const { mutate: removeCandidate, isPending: isDeleting } = useDeleteCandidate();
  const { mutate: updateCandidate, isPending: isReassigning } = useUpdateCandidate();
  const { data: allUsers } = useGetUsers(undefined, {
    query: { enabled: canReassignCandidate(user) },
  } as any);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const canDelete = isHrRole(user?.role) || user?.role === 'director';
  const canReassign = canReassignCandidate(user);
  const canEdit = canManageCandidate(user, candidate?.recruiterId);

  const assignableUsers = useMemo(
    () =>
      (allUsers ?? []).filter(
        (u) => u.status === 'active' && isAssignableRole(u.role),
      ),
    [allUsers],
  );

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!candidate) return <div>Nomzod topilmadi</div>;

  const activeStage = selectedStage || pipeline?.currentStage || candidate.stage;

  const handleReassign = (value: string) => {
    const recruiterId = value === 'none' ? null : Number(value);
    updateCandidate(
      { id, data: { recruiterId } as any },
      {
        onSuccess: () => {
          toast({ title: 'Mas\'ul o\'zgartirildi', description: 'Suhbat yangi mas\'ulga biriktirildi' });
          refetch();
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || 'Mas\'ulni o\'zgartirib bo\'lmadi',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const renderActionButtons = () => {
    if (candidate.status === 'hired' || candidate.stage === 'hired') {
      return <Badge className="bg-emerald-100 text-emerald-800 px-3 py-2 text-sm">Ishga qabul qilingan</Badge>;
    }
    if (candidate.status === 'rejected') {
      return <Badge variant="destructive" className="px-3 py-2 text-sm">Rad etilgan</Badge>;
    }

    const actions: Record<string, { href: string; label: string; viewLabel: string }> = {
      phone_interview: { href: `/candidates/${id}/phone-interview`, label: '1. Suhbat natijasi', viewLabel: '1. Suhbat natijasini ko\'rish' },
      online_interview: { href: `/candidates/${id}/online-interview`, label: '2. Onlayn suhbat natijalari', viewLabel: '2. Onlayn suhbatni ko\'rish' },
      preboarding: { href: `/candidates/${id}/preboarding`, label: '3. Pre-boarding tekshiruvi', viewLabel: '3. Pre-boardingni ko\'rish' },
      offline_interview: { href: `/candidates/${id}/offline-interview`, label: '4. Offline suhbat natijalari', viewLabel: '4. Offline suhbatni ko\'rish' },
      final_decision: { href: `/candidates/${id}/final-decision`, label: '5. Yakuniy qaror', viewLabel: '5. Yakuniy qarorni ko\'rish' },
      offer: { href: `/candidates/${id}/offer`, label: '6. Job Offer', viewLabel: '6. Job Offerni ko\'rish' },
      documents: { href: `/candidates/${id}/documents`, label: '7. Hujjatlar', viewLabel: '7. Hujjatlarni ko\'rish' },
      internship: { href: `/candidates/${id}/internship`, label: '8. Stajirovka', viewLabel: '8. Stajirovkani ko\'rish' },
    };
    const action = actions[candidate.stage];
    if (!action) return null;
    return (
      <Link href={action.href}>
        <Button variant={canEdit ? 'default' : 'outline'}>
          {canEdit ? action.label : action.viewLabel}
        </Button>
      </Link>
    );
  };

  const statusLabel =
    candidate.status === 'active' ? 'Faol' : candidate.status === 'hired' ? 'Ishga qabul qilingan' : 'Rad etilgan';

  const handleDelete = () => {
    removeCandidate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "O'chirildi", description: "Nomzod o'chirildi" });
          setLocation('/candidates');
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {!canEdit && <CandidateReadOnlyBanner assigneeName={candidate.recruiterName} />}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/candidates">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl overflow-hidden shrink-0 border-2 border-white shadow-md">
              {candidate.photoUrl ? (
                <img src={candidate.photoUrl} alt={candidate.fullName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold tracking-tight">{candidate.fullName}</h1>
                <Badge
                  variant={candidate.status === 'hired' ? 'default' : candidate.status === 'rejected' ? 'destructive' : 'secondary'}
                  className={candidate.status === 'active' ? 'bg-emerald-100 text-emerald-800' : ''}
                >
                  {statusLabel}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <Briefcase className="w-4 h-4" /> {candidate.vacancyTitle || "Noma'lum ish o'rni"}
                <span className="mx-1">•</span>
                ID: #{candidate.id}
                <span className="mx-1">•</span>
                <span>
                  Mas'ul:{' '}
                  <span className="font-medium text-foreground">
                    {candidate.recruiterName || 'Biriktirilmagan'}
                  </span>
                </span>
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {renderActionButtons()}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" disabled={isDeleting}>
                  <Trash2 className="w-4 h-4" /> O'chirish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Nomzodni o'chirasizmi?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Nomzod va unga bog'liq suhbat/pipeline ma'lumotlari butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.
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

      {canReassign && (
        <Card className="border-2 border-primary/25 bg-primary/5 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
              <div className="flex-1 space-y-1.5 min-w-0">
                <p className="text-sm font-semibold text-foreground">Suhbatni kimga biriktirish</p>
                <p className="text-xs text-muted-foreground">
                  Rekruter, HR, trener, direktor yoki bo'lim boshlig'ini tanlang. Faqat shu odam va HR suhbatni olib boradi.
                </p>
              </div>
              <div className="w-full sm:w-[320px] shrink-0">
                <Select
                  value={candidate.recruiterId ? String(candidate.recruiterId) : 'none'}
                  onValueChange={handleReassign}
                  disabled={isReassigning}
                >
                  <SelectTrigger className="h-11 bg-white border-primary/30">
                    <SelectValue placeholder="Mas'ulni tanlang" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="none">Biriktirilmagan</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.fullName} ({roleLabel(u.role)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-t-4 border-t-primary shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30 pb-4">
          <CardTitle className="flex justify-between items-center gap-3 flex-wrap">
            <span>Tanlov bosqichlari</span>
            <Badge variant="outline" className="font-normal text-xs bg-white">
              Joriy: {pipeline?.currentStage || candidate.stage} ({(pipeline?.stages.findIndex((s) => s.key === (pipeline?.currentStage || candidate.stage)) ?? 0) + 1}/9)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isPipelineLoading ? (
            <div className="p-8 text-center text-muted-foreground">Voronka yuklanmoqda...</div>
          ) : pipeline ? (
            <Pipeline
              stages={pipeline.stages}
              selectedStage={activeStage}
              onSelectStage={(key) => {
                const stage = pipeline.stages.find((s) => s.key === key);
                const href = stageFormHref(id, key);
                if (!href) {
                  setSelectedStage(key);
                  return;
                }
                if (stage?.status === 'pending') {
                  toast({
                    title: 'Hali ochilmagan',
                    description: 'Avval joriy qadamni yakunlang',
                  });
                  setSelectedStage(key);
                  return;
                }
                setLocation(href);
              }}
            />
          ) : (
            <div className="p-8 text-center text-muted-foreground">Ma'lumot topilmadi</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bosqichlar bo'yicha batafsil ma'lumot</CardTitle>
          <p className="text-sm text-muted-foreground">
            Avval nomzodning asosiy ma'lumotlari, keyin har bir qadam natijasi
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Asosiy ma'lumotlar — qadamlar boshida */}
          <div className="rounded-xl border bg-muted/20 p-5 space-y-5">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Nomzodning asosiy ma'lumotlari</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <InfoRow label="F.I.Sh." value={candidate.fullName} />
              <InfoRow label="ID" value={`#${candidate.id}`} />
              <InfoRow label="Status" value={statusLabel} />
              <InfoRow label="Telefon" value={candidate.phone} />
              <InfoRow label="Manzil" value={candidate.address} />
              <InfoRow
                label="Tug'ilgan sana"
                value={candidate.birthDate ? format(new Date(candidate.birthDate), 'dd.MM.yyyy') : null}
              />
              <InfoRow label="Ish o'rni" value={candidate.vacancyTitle} />
              <div className="space-y-1 md:col-span-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mas'ul</p>
                {canReassign ? (
                  <Select
                    value={candidate.recruiterId ? String(candidate.recruiterId) : 'none'}
                    onValueChange={handleReassign}
                    disabled={isReassigning}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Mas'ulni tanlang" />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="none">Biriktirilmagan</SelectItem>
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.fullName} ({roleLabel(u.role)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">{candidate.recruiterName || 'Biriktirilmagan'}</p>
                )}
                {canReassign && (
                  <p className="text-[11px] text-muted-foreground">
                    HR istalgan vaqtda boshqa rolga o'tkaza oladi. Faqat mas'ul va HR o'zgartira oladi.
                  </p>
                )}
              </div>
              <InfoRow
                label="Ro'yxatdan o'tgan"
                value={format(new Date(candidate.createdAt), 'dd.MM.yyyy HH:mm')}
              />
              <InfoRow label="Kutilayotgan maosh" value={candidate.expectedSalary} />
              <InfoRow label="Joriy bosqich" value={candidate.stage} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Briefcase className="w-4 h-4 text-primary" />
                  Ish tajribasi
                </div>
                <div className="rounded-md bg-white border p-3 text-sm whitespace-pre-wrap min-h-[80px]">
                  {candidate.experience?.trim() || 'Kiritilmagan'}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  Ma'lumoti
                </div>
                <div className="rounded-md bg-white border p-3 text-sm whitespace-pre-wrap min-h-[80px]">
                  {candidate.education?.trim() || 'Kiritilmagan'}
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="w-4 h-4 text-primary" />
                Rekruter qaydlari
              </div>
              <div className="rounded-md bg-amber-50/60 border border-amber-100 p-3 text-sm whitespace-pre-wrap">
                {candidate.notes?.trim() || 'Hali qaydlar kiritilmagan'}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              1–9 qadamlar tarixi
            </h3>
            <StageHistory
              candidateId={id}
              stages={pipeline?.stages}
              selectedStage={activeStage}
              onSelectStage={setSelectedStage}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
