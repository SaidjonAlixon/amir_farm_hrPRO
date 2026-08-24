import React, { useEffect, useState } from 'react';
import { useGetCandidate, useGetOffers, useUpdateOffer, useUpdateCandidate, ChecklistItem } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { Skeleton } from '../../components/ui/skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { CandidateReadOnlyBanner } from '../../components/candidates/CandidateReadOnlyBanner';
import { canManageCandidate } from '../../lib/candidate-access';
import { nextStageFormHref } from '../../lib/stage-routes';

const DEFAULT_DOCS: ChecklistItem[] = [
  { label: 'Pasport nusxasi', completed: false },
  { label: "Diplom / Ta'lim hujjati", completed: false },
  { label: 'Mehnat daftarchasi', completed: false },
  { label: 'Tibbiy ma\'lumotnoma', completed: false },
  { label: '2 dona 3x4 rasm', completed: false },
];

export default function DocumentsPage({ params }: { params: { id: string } }) {
  const candidateId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: candidate, isLoading } = useGetCandidate(candidateId, { query: { enabled: !!candidateId } });
  const { data: offers, refetch } = useGetOffers({ candidateId });
  const updateOffer = useUpdateOffer();
  const updateCandidate = useUpdateCandidate();
  const canEdit = canManageCandidate(user, candidate?.recruiterId);

  const offer = offers?.[0];
  const [docs, setDocs] = useState<ChecklistItem[]>(DEFAULT_DOCS);

  useEffect(() => {
    if (offer?.documentsChecklist?.length) {
      setDocs(offer.documentsChecklist as ChecklistItem[]);
    }
  }, [offer]);

  const toggle = (index: number) => {
    setDocs((prev) => prev.map((d, i) => (i === index ? { ...d, completed: !d.completed } : d)));
  };

  const save = () => {
    if (!offer) {
      toast({ title: 'Xatolik', description: 'Avval Job Offer yarating', variant: 'destructive' });
      return;
    }
    const allDone = docs.every((d) => d.completed);
    updateOffer.mutate(
      { id: offer.id, data: { documentsChecklist: docs } },
      {
        onSuccess: () => {
          if (allDone) {
            updateCandidate.mutate(
              { id: candidateId, data: { stage: 'internship' } },
              {
                onSuccess: () => {
                  toast({ title: 'Hujjatlar to\'liq', description: 'Stajirovka bosqichiga o\'tdi' });
                  setLocation(nextStageFormHref(candidateId, 'documents')!);
                },
              },
            );
          } else {
            toast({ title: 'Saqlandi', description: 'Hujjatlar checklisti yangilandi' });
            refetch();
          }
        },
        onError: () => toast({ title: 'Xatolik', description: 'Saqlashda xato', variant: 'destructive' }),
      },
    );
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!candidate) return <div className="p-8">Nomzod topilmadi</div>;

  const doneCount = docs.filter((d) => d.completed).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {!canEdit && <CandidateReadOnlyBanner assigneeName={candidate.recruiterName} />}
      <div className="flex items-center gap-4">
        <Link href={`/candidates/${candidateId}`}>
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hujjatlar</h1>
          <p className="text-muted-foreground mt-1">{candidate.fullName} — {doneCount}/{docs.length} tayyor</p>
        </div>
      </div>

      <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-80">
      <Card>
        <CardHeader><CardTitle>Kerakli hujjatlar checklisti</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {docs.map((item, index) => (
            <label key={item.label} className="flex items-start gap-3 p-3 rounded-md border bg-muted/20 cursor-pointer hover:bg-muted/40">
              <Checkbox checked={item.completed} onCheckedChange={() => toggle(index)} className="mt-0.5" />
              <span className={item.completed ? 'line-through text-muted-foreground' : ''}>{item.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/candidates/${candidateId}`}><Button variant="ghost">Bekor</Button></Link>
        <Button onClick={save} disabled={!canEdit || updateOffer.isPending || updateCandidate.isPending}>
          {docs.every((d) => d.completed) ? 'Yakunlash → Stajirovka' : 'Saqlash'}
        </Button>
      </div>
      </fieldset>
    </div>
  );
}
