import React, { useMemo, useState } from 'react';
import {
  useGetCandidate,
  useGetUsers,
  useGetOnlineInterviews,
  useCreateOnlineInterview,
  useUpdateOnlineInterview,
} from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Skeleton } from '../../components/ui/skeleton';
import { CandidateReadOnlyBanner } from '../../components/candidates/CandidateReadOnlyBanner';
import { canManageCandidate } from '../../lib/candidate-access';
import { nextStageFormHref } from '../../lib/stage-routes';

type QA = { question: string; answer: string };

const DEFAULT_QUESTIONS = [
  'Lavozim vazifalarini qanday tushunasiz?',
  'O\'xshash ish tajribangiz bormi? Misollar keltiring.',
  'Jamoada ishlash tajribangiz qanday?',
];

export default function OnlineInterviewPage({ params }: { params: { id: string } }) {
  const candidateId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: candidate, isLoading } = useGetCandidate(candidateId, {
    query: { enabled: !!candidateId },
  });
  const { data: existingList, isLoading: existingLoading } = useGetOnlineInterviews(
    { candidateId },
    { query: { enabled: !!candidateId } },
  );
  const existing = existingList?.[0];
  const { data: recruiters, isLoading: recruitersLoading } = useGetUsers({ role: 'recruiter' });
  const { data: hrs, isLoading: hrsLoading } = useGetUsers({ role: 'hr' });
  const { mutate: createInterview, isPending: creating } = useCreateOnlineInterview();
  const { mutate: updateInterview, isPending: updating } = useUpdateOnlineInterview();
  const isPending = creating || updating;
  const canEdit = canManageCandidate(user, candidate?.recruiterId);

  const interviewers = useMemo(() => {
    const list = [...(recruiters ?? []), ...(hrs ?? [])];
    const seen = new Set<number>();
    return list.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return u.status === 'active';
    });
  }, [recruiters, hrs]);

  const [interviewerId, setInterviewerId] = useState<string>('');
  const [interviewDate, setInterviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [experienceLevel, setExperienceLevel] = useState<string>('');
  const [score, setScore] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [qa, setQa] = useState<QA[]>(
    DEFAULT_QUESTIONS.map((question) => ({ question, answer: '' })),
  );
  const [hydrated, setHydrated] = useState(false);

  React.useEffect(() => {
    if (!interviewerId && user && (user.role === 'recruiter' || user.role === 'hr')) {
      setInterviewerId(String(user.id));
    }
  }, [user, interviewerId]);

  React.useEffect(() => {
    if (hydrated || !existing) return;
    if (existing.interviewDate) setInterviewDate(String(existing.interviewDate).slice(0, 10));
    if (existing.experienceLevel) setExperienceLevel(existing.experienceLevel);
    if (existing.score != null) setScore(String(existing.score));
    if (existing.notes) setNotes(existing.notes);
    if (existing.questionsAnswers?.length) {
      setQa(existing.questionsAnswers.map((q) => ({ question: q.question || '', answer: q.answer || '' })));
    }
    setHydrated(true);
  }, [existing, hydrated]);

  const updateQa = (index: number, field: keyof QA, value: string) => {
    setQa((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addQuestion = () => {
    setQa((prev) => [...prev, { question: '', answer: '' }]);
  };

  const removeQuestion = (index: number) => {
    setQa((prev) => prev.filter((_, i) => i !== index));
  };

  const finishOk = () => {
    toast({ title: 'Saqlandi', description: 'Onlayn suhbat natijasi yozildi — pre-boardingga o‘tilmoqda' });
    setLocation(nextStageFormHref(candidateId, 'online_interview')!);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast({ title: 'Ruxsat yo\'q', description: 'Faqat mas\'ul va HR o\'zgartira oladi', variant: 'destructive' });
      return;
    }
    if (!interviewerId) {
      toast({ title: 'Xatolik', description: 'Suhbatni kim o\'tkazishini tanlang', variant: 'destructive' });
      return;
    }
    if (!experienceLevel) {
      toast({ title: 'Xatolik', description: 'Tajriba darajasini tanlang', variant: 'destructive' });
      return;
    }

    const interviewer = interviewers.find((u) => String(u.id) === interviewerId);
    const interviewerNote = interviewer
      ? `Suhbatni o'tkazdi: ${interviewer.fullName} (${interviewer.role})`
      : '';

    const payload = {
      interviewDate: interviewDate || undefined,
      questionsAnswers: qa.filter((q) => q.question.trim()),
      experienceLevel,
      score: score ? Number(score) : undefined,
      notes: [interviewerNote, notes].filter(Boolean).join('\n'),
    };

    if (existing?.id) {
      updateInterview(
        { id: existing.id, data: payload },
        {
          onSuccess: finishOk,
          onError: () => {
            toast({ title: 'Xatolik', description: 'Saqlashda xatolik yuz berdi', variant: 'destructive' });
          },
        },
      );
    } else {
      createInterview(
        { data: { candidateId, ...payload } },
        {
          onSuccess: finishOk,
          onError: () => {
            toast({ title: 'Xatolik', description: 'Saqlashda xatolik yuz berdi', variant: 'destructive' });
          },
        },
      );
    }
  };

  if (isLoading || existingLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!candidate) return <div className="p-8">Nomzod topilmadi</div>;

  const usersLoading = recruitersLoading || hrsLoading;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {!canEdit && <CandidateReadOnlyBanner assigneeName={candidate.recruiterName} />}
      <div className="flex items-center gap-4">
        <Link href={`/candidates/${candidateId}`}>
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Onlayn suhbat</h1>
          <p className="text-muted-foreground mt-1">{candidate.fullName} — savol-javob va baholash</p>
        </div>
      </div>

      <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-80">
      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Asosiy ma'lumotlar</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Kim o'tkazadi *</Label>
              <Select
                value={interviewerId}
                onValueChange={setInterviewerId}
                disabled={usersLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={usersLoading ? 'Yuklanmoqda...' : 'Rekruter yoki HR tanlang'} />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {interviewers.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">Foydalanuvchi topilmadi</div>
                  ) : (
                    interviewers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.fullName} ({u.role === 'hr' ? 'HR' : 'Rekruter'})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Suhbat sanasi</Label>
              <Input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Tajriba darajasi *</Label>
              <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Tanlang" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="experienced">Tajribali</SelectItem>
                  <SelectItem value="inexperienced">Tajribasiz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Umumiy ball (0–100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Masalan: 75"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Savol-javoblar</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
              <Plus className="w-4 h-4 mr-1" /> Savol qo'shish
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {qa.map((item, index) => (
              <div key={index} className="space-y-2 p-4 border rounded-md bg-muted/20">
                <div className="flex gap-2">
                  <Input
                    value={item.question}
                    onChange={(e) => updateQa(index, 'question', e.target.value)}
                    placeholder={`Savol ${index + 1}`}
                    className="flex-1"
                  />
                  {qa.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(index)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <Textarea
                  value={item.answer}
                  onChange={(e) => updateQa(index, 'answer', e.target.value)}
                  placeholder="Nomzod javobi..."
                  className="min-h-[80px]"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qo'shimcha izoh</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Suhbat bo'yicha umumiy xulosa..."
              className="min-h-[100px]"
            />
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
