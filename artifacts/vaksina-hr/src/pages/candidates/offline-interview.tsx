import React, { useEffect, useMemo, useState } from 'react';
import {
  useGetCandidate,
  useGetUsers,
  useGetOfflineInterviews,
  useCreateOfflineInterview,
  useUpdateOfflineInterview,
} from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Skeleton } from '../../components/ui/skeleton';
import { CandidateReadOnlyBanner } from '../../components/candidates/CandidateReadOnlyBanner';
import { canManageCandidate } from '../../lib/candidate-access';
import { nextStageFormHref } from '../../lib/stage-routes';
import { HR_ROLE_LABELS, isHrRole } from '../../lib/roles';

export default function OfflineInterviewPage({ params }: { params: { id: string } }) {
  const candidateId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: candidate, isLoading } = useGetCandidate(candidateId, {
    query: { enabled: !!candidateId },
  });
  const { data: offlines, isLoading: offlineLoading } = useGetOfflineInterviews(
    { candidateId },
    { query: { enabled: !!candidateId } },
  );
  const existing = offlines?.[0];

  const { data: allUsers, isLoading: hrsLoading } = useGetUsers();
  const { data: trainers, isLoading: trainersLoading } = useGetUsers({ role: 'trainer' });
  const hrs = useMemo(
    () =>
      (allUsers ?? [])
        .filter((u) => isHrRole(u.role) && u.status === 'active')
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz')),
    [allUsers],
  );
  const createMutation = useCreateOfflineInterview();
  const updateMutation = useUpdateOfflineInterview();
  const canEdit = canManageCandidate(user, candidate?.recruiterId) && !existing?.result;

  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [hrId, setHrId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState('attended');
  const [hrScore, setHrScore] = useState('');
  const [hrNotes, setHrNotes] = useState('');
  const [trainerScore, setTrainerScore] = useState('');
  const [trainerNotes, setTrainerNotes] = useState('');
  const [result, setResult] = useState('');
  const [resultNotes, setResultNotes] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!hrId && isHrRole(user?.role)) {
      setHrId(String(user!.id));
    }
    if (!trainerId && user?.role === 'trainer') setTrainerId(String(user.id));
  }, [user, hrId, trainerId]);

  useEffect(() => {
    if (!existing || prefilled) return;
    setScheduledDate(existing.scheduledDate || new Date().toISOString().slice(0, 10));
    setScheduledTime(existing.scheduledTime || '10:00');
    if (existing.hrId) setHrId(String(existing.hrId));
    if (existing.trainerId) setTrainerId(String(existing.trainerId));
    if (existing.attendanceStatus) setAttendanceStatus(existing.attendanceStatus);
    if (existing.hrScore != null) setHrScore(String(existing.hrScore));
    if (existing.hrNotes) setHrNotes(existing.hrNotes);
    if (existing.trainerScore != null) setTrainerScore(String(existing.trainerScore));
    if (existing.trainerNotes) setTrainerNotes(existing.trainerNotes);
    if (existing.result) setResult(existing.result);
    if (existing.resultNotes) setResultNotes(existing.resultNotes);
    setPrefilled(true);
  }, [existing, prefilled]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast({ title: 'Ruxsat yo\'q', description: 'Faqat HR va rekruter o\'zgartira oladi', variant: 'destructive' });
      return;
    }
    if (!scheduledDate) {
      toast({ title: 'Xatolik', description: 'Sanani kiriting', variant: 'destructive' });
      return;
    }
    if (!hrId && !trainerId) {
      toast({ title: 'Xatolik', description: 'HR yoki Trenerni tanlang', variant: 'destructive' });
      return;
    }
    if (!result) {
      toast({ title: 'Xatolik', description: 'Yakuniy natijani tanlang', variant: 'destructive' });
      return;
    }

    const resultPayload = {
      scheduledDate,
      scheduledTime: scheduledTime || undefined,
      hrId: hrId ? Number(hrId) : undefined,
      trainerId: trainerId ? Number(trainerId) : undefined,
      attendanceStatus,
      hrScore: hrScore ? Number(hrScore) : undefined,
      hrNotes: hrNotes || undefined,
      trainerScore: trainerScore ? Number(trainerScore) : undefined,
      trainerNotes: trainerNotes || undefined,
      result,
      resultNotes: resultNotes || undefined,
    };

    const finishOk = () => {
      toast({
        title: 'Saqlandi',
        description: result === 'passed'
          ? "Suhbatdan o'tdi — yakuniy qarorga o‘tilmoqda"
          : "Suhbatdan o'tmadi",
      });
      if (result === 'passed') {
        setLocation(nextStageFormHref(candidateId, 'offline_interview')!);
      } else {
        setLocation(`/candidates/${candidateId}`);
      }
    };

    if (existing?.id) {
      updateMutation.mutate(
        { id: existing.id, data: resultPayload as any },
        {
          onSuccess: finishOk,
          onError: () => {
            toast({ title: 'Xatolik', description: 'Natijani yangilashda xato', variant: 'destructive' });
          },
        },
      );
      return;
    }

    createMutation.mutate(
      {
        data: {
          candidateId,
          scheduledDate,
          scheduledTime: scheduledTime || undefined,
          hrId: hrId ? Number(hrId) : undefined,
          trainerId: trainerId ? Number(trainerId) : undefined,
        },
      },
      {
        onSuccess: (created) => {
          updateMutation.mutate(
            { id: created.id, data: resultPayload as any },
            {
              onSuccess: finishOk,
              onError: () => {
                toast({ title: 'Xatolik', description: 'Natijani yangilashda xato', variant: 'destructive' });
              },
            },
          );
        },
        onError: () => {
          toast({ title: 'Xatolik', description: 'Suhbat yaratishda xato', variant: 'destructive' });
        },
      },
    );
  };

  if (isLoading || offlineLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!candidate) return <div className="p-8">Nomzod topilmadi</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {!canManageCandidate(user, candidate?.recruiterId) && (
        <CandidateReadOnlyBanner assigneeName={candidate.recruiterName} />
      )}
      {existing?.result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Bu offline suhbat yakunlangan. Natija o‘zgartirilmaydi.
        </div>
      )}
      <div className="flex items-center gap-4">
        <Link href={`/candidates/${candidateId}`}>
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Offline suhbat</h1>
          <p className="text-muted-foreground mt-1">{candidate.fullName} — HR va Trener baholashi</p>
        </div>
      </div>

      <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-80">
      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Reja</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sana *</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Vaqt</Label>
              <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>HR</Label>
              <Select value={hrId} onValueChange={setHrId} disabled={hrsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="HR tanlang" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {hrs.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.fullName}
                      {u.role && u.role !== 'hr'
                        ? ` (${HR_ROLE_LABELS[u.role] || u.role})`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trener</Label>
              <Select value={trainerId} onValueChange={setTrainerId} disabled={trainersLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Trener tanlang" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {(trainers ?? []).filter((u) => u.status === 'active').map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Kelish holati</Label>
              <Select value={attendanceStatus} onValueChange={setAttendanceStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="attended">Keldi</SelectItem>
                  <SelectItem value="absent">Kelmadi</SelectItem>
                  <SelectItem value="rescheduled">Qayta belgilandi</SelectItem>
                  <SelectItem value="pending">Kutilmoqda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Baholash</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>HR ball (1–5)</Label>
                <Input type="number" min={1} max={5} value={hrScore} onChange={(e) => setHrScore(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Trener ball (1–5)</Label>
                <Input type="number" min={1} max={5} value={trainerScore} onChange={(e) => setTrainerScore(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>HR izohi</Label>
              <Textarea value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} className="min-h-[70px]" />
            </div>
            <div className="space-y-2">
              <Label>Trener izohi</Label>
              <Textarea value={trainerNotes} onChange={(e) => setTrainerNotes(e.target.value)} className="min-h-[70px]" />
            </div>
            <div className="space-y-2">
              <Label>Yakuniy qaror *</Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger>
                  <SelectValue placeholder="O'tdi / o'tmadi" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="passed">Suhbatdan o'tdi → Yakuniy qaror</SelectItem>
                  <SelectItem value="failed">Suhbatdan o'tmadi → Rad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Qaror izohi</Label>
              <Textarea value={resultNotes} onChange={(e) => setResultNotes(e.target.value)} className="min-h-[70px]" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={`/candidates/${candidateId}`}>
            <Button type="button" variant="ghost">Bekor qilish</Button>
          </Link>
          <Button type="submit" disabled={isPending || !canEdit}>
            {isPending ? 'Saqlanmoqda...' : 'Natijani saqlash'}
          </Button>
        </div>
      </form>
      </fieldset>
    </div>
  );
}
