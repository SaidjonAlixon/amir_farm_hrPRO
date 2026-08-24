import React, { useState } from 'react';
import { useGetCandidate, useUpdateCandidate } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { Skeleton } from '../../components/ui/skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { CandidateReadOnlyBanner } from '../../components/candidates/CandidateReadOnlyBanner';
import { canManageCandidate } from '../../lib/candidate-access';
import { nextStageFormHref } from '../../lib/stage-routes';

export default function FinalDecisionPage({ params }: { params: { id: string } }) {
  const candidateId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: candidate, isLoading } = useGetCandidate(candidateId, { query: { enabled: !!candidateId } });
  const updateCandidate = useUpdateCandidate();
  const [notes, setNotes] = useState('');
  const canEdit = canManageCandidate(user, candidate?.recruiterId);

  const decide = (passed: boolean) => {
    if (!canEdit) {
      toast({ title: 'Ruxsat yo\'q', description: 'Faqat mas\'ul va HR o\'zgartira oladi', variant: 'destructive' });
      return;
    }
    updateCandidate.mutate(
      {
        id: candidateId,
        data: passed
          ? { stage: 'offer', status: 'active' }
          : { stage: 'final_decision', status: 'rejected' },
      },
      {
        onSuccess: () => {
          toast({
            title: passed ? "Suhbatdan o'tdi" : "Suhbatdan o'tmadi",
            description: passed ? 'Keyingi bosqich: Job Offer' : 'Nomzod rad etildi',
          });
          setLocation(passed ? nextStageFormHref(candidateId, 'final_decision')! : `/candidates/${candidateId}`);
        },
        onError: () => toast({ title: 'Xatolik', description: 'Saqlashda xato', variant: 'destructive' }),
      },
    );
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!candidate) return <div className="p-8">Nomzod topilmadi</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {!canEdit && <CandidateReadOnlyBanner assigneeName={candidate.recruiterName} />}
      <div className="flex items-center gap-4">
        <Link href={`/candidates/${candidateId}`}>
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Yakuniy qaror</h1>
          <p className="text-muted-foreground mt-1">{candidate.fullName} — HR/Trener tasdig'i</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Qaror</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Izoh</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qaror sababi..." className="min-h-[100px]" disabled={!canEdit} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Button
              variant="destructive"
              className="h-12"
              disabled={updateCandidate.isPending || !canEdit}
              onClick={() => decide(false)}
            >
              <XCircle className="w-4 h-4 mr-2" /> O'tmadi
            </Button>
            <Button
              className="h-12"
              disabled={updateCandidate.isPending || !canEdit}
              onClick={() => decide(true)}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> O'tdi → Job Offer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
