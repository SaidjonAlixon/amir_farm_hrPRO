import React, { useEffect, useState } from 'react';
import {
  useGetCandidate,
  useGetUsers,
  useGetPhoneInterviews,
  useCreatePhoneInterview,
  useUpdatePhoneInterview,
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

export default function PhoneInterviewPage({ params }: { params: { id: string } }) {
  const candidateId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: candidate, isLoading } = useGetCandidate(candidateId, {
    query: { enabled: !!candidateId },
  });
  const { data: existingList, isLoading: existingLoading } = useGetPhoneInterviews(
    { candidateId },
    { query: { enabled: !!candidateId } },
  );
  const existing = existingList?.[0];
  const { data: recruiters, isLoading: recruitersLoading } = useGetUsers({ role: 'recruiter' });
  const { mutate: createInterview, isPending: creating } = useCreatePhoneInterview();
  const { mutate: updateInterview, isPending: updating } = useUpdatePhoneInterview();
  const isPending = creating || updating;
  const canEdit = canManageCandidate(user, candidate?.recruiterId);

  const [recruiterId, setRecruiterId] = useState('');
  const [interviewDate, setInterviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!recruiterId && user?.role === 'recruiter') {
      setRecruiterId(String(user.id));
    } else if (!recruiterId && candidate?.recruiterId) {
      setRecruiterId(String(candidate.recruiterId));
    }
  }, [user, candidate, recruiterId]);

  useEffect(() => {
    if (hydrated || !existing) return;
    if (existing.recruiterId) setRecruiterId(String(existing.recruiterId));
    if (existing.interviewDate) setInterviewDate(String(existing.interviewDate).slice(0, 10));
    if (existing.status) setStatus(existing.status);
    if (existing.notes) setNotes(existing.notes);
    if (existing.rejectReason) setRejectReason(existing.rejectReason);
    setHydrated(true);
  }, [existing, hydrated]);

  const finishOk = (resultStatus: string) => {
    if (resultStatus === 'suitable') {
      toast({
        title: 'Saqlandi',
        description: '1-qadam yakunlandi — onlayn suhbatga o‘tilmoqda',
      });
      setLocation(nextStageFormHref(candidateId, 'phone_interview')!);
    } else if (resultStatus === 'not_suitable') {
      toast({ title: 'Saqlandi', description: 'Nomzod rad etildi' });
      setLocation(`/candidates/${candidateId}`);
    } else {
      toast({ title: 'Saqlandi', description: 'Natija kutilmoqda holatida saqlandi' });
      setLocation(`/candidates/${candidateId}`);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast({ title: 'Ruxsat yo\'q', description: 'Faqat mas\'ul va HR o\'zgartira oladi', variant: 'destructive' });
      return;
    }
    if (!recruiterId) {
      toast({ title: 'Xatolik', description: 'Suhbatni kim o\'tkazishini tanlang', variant: 'destructive' });
      return;
    }
    if (!status) {
      toast({ title: 'Xatolik', description: 'Natijani tanlang (mos keladi / kelmaydi)', variant: 'destructive' });
      return;
    }
    if (status === 'not_suitable' && !rejectReason.trim()) {
      toast({ title: 'Xatolik', description: 'Rad etish sababini yozing', variant: 'destructive' });
      return;
    }

    if (existing?.id) {
      updateInterview(
        {
          id: existing.id,
          data: {
            interviewDate: interviewDate || undefined,
            notes: notes || undefined,
            status,
            rejectReason: status === 'not_suitable' ? rejectReason : undefined,
          },
        },
        {
          onSuccess: () => finishOk(status),
          onError: () => {
            toast({ title: 'Xatolik', description: 'Saqlashda xatolik yuz berdi', variant: 'destructive' });
          },
        },
      );
    } else {
      createInterview(
        {
          data: {
            candidateId,
            recruiterId: Number(recruiterId),
            interviewDate: interviewDate || undefined,
            notes: notes || undefined,
            status,
            rejectReason: status === 'not_suitable' ? rejectReason : undefined,
          },
        },
        {
          onSuccess: () => finishOk(status),
          onError: () => {
            toast({ title: 'Xatolik', description: 'Saqlashda xatolik yuz berdi', variant: 'destructive' });
          },
        },
      );
    }
  };

  if (isLoading || existingLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!candidate) return <div className="p-8">Nomzod topilmadi</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {!canEdit && <CandidateReadOnlyBanner assigneeName={candidate.recruiterName} />}
      <div className="flex items-center gap-4">
        <Link href={`/candidates/${candidateId}`}>
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">1-qadam · Tanishuv</p>
          <h1 className="text-3xl font-bold tracking-tight">Suhbat natijasi</h1>
          <p className="text-muted-foreground mt-1">{candidate.fullName}</p>
        </div>
      </div>

      <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-80">
      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Suhbat natijasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Kim o'tkazadi *</Label>
              <Select
                value={recruiterId}
                onValueChange={setRecruiterId}
                disabled={recruitersLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={recruitersLoading ? 'Yuklanmoqda...' : 'Rekruterni tanlang'} />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {(recruiters ?? []).filter((u) => u.status === 'active').map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Suhbat sanasi</Label>
              <Input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Natija *</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Tavsiya etiladi / etilmaydi" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="suitable">Tavsiya etiladi → Onlayn suhbat</SelectItem>
                  <SelectItem value="not_suitable">Tavsiya etilmaydi → Rad etish</SelectItem>
                  <SelectItem value="pending">Kutilmoqda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {status === 'not_suitable' && (
              <div className="space-y-2">
                <Label>Rad etish sababi *</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nima uchun mos kelmadi..."
                  className="min-h-[80px]"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Izohlar</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Suhbat davomida qaydlar..."
                className="min-h-[100px]"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={`/candidates/${candidateId}`}>
            <Button type="button" variant="ghost">Bekor qilish</Button>
          </Link>
          <Button type="submit" disabled={isPending || !canEdit}>
            {isPending ? 'Saqlanmoqda...' : existing ? 'Yangilash' : 'Natijani saqlash'}
          </Button>
        </div>
      </form>
      </fieldset>
    </div>
  );
}
