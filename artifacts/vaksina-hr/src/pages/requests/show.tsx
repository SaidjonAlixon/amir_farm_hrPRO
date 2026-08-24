import React, { useState } from 'react';
import {
  useGetRequest,
  useAssignRequest,
  useApproveRequest,
  useGetUsers,
} from '@workspace/api-client-react';
import { useCreateRequestClaim, useRequestClaims } from '../../lib/staffing-api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { ArrowLeft, UserPlus, CheckCircle, Briefcase, Hand } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { isHrManager } from '../../lib/roles';

export default function RequestDetails({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { user } = useAuth();
  const { data: request, isLoading, refetch } = useGetRequest(id, { query: { enabled: !!id } });
  const { mutate: assign, isPending: isAssigning } = useAssignRequest();
  const { mutate: approve, isPending: isApproving } = useApproveRequest();
  const { data: recruiters } = useGetUsers({ role: 'recruiter' });
  const { data: claims, refetch: refetchClaims } = useRequestClaims(id);
  const { mutate: createClaim, isPending: claiming } = useCreateRequestClaim();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [approveOpen, setApproveOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState<string>('');
  const [deadline, setDeadline] = useState('');
  const [claimNote, setClaimNote] = useState('');

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!request) return <div>Ariza topilmadi</div>;

  const canApprove = isHrManager(user?.role);
  const isHrLike = canApprove || user?.role === 'director';
  const isRecruiter = user?.role === 'recruiter' || user?.role === 'admin';
  const needsDeadline = !request.deadline;
  const canShowApprove =
    canApprove &&
    !request.vacancyId &&
    (request.status === 'submitted' || request.status === 'reviewing' || request.status === 'accepted');

  const myClaim = (claims ?? []).find((c) => c.recruiterId === user?.id);
  const pendingClaims = (claims ?? []).filter((c) => c.status === 'pending');
  const canClaim =
    user?.role === 'recruiter' &&
    !request.vacancyId &&
    request.status !== 'closed' &&
    request.status !== 'announced' &&
    !myClaim;

  const handleAssignToMe = () => {
    if (!user) return;
    assign({ id, data: { userId: user.id } }, {
      onSuccess: () => {
        toast({ title: 'Muvaffaqiyatli', description: "Ariza sizga biriktirildi" });
        refetch();
      }
    });
  };

  const handleClaim = () => {
    createClaim(
      { id, note: claimNote.trim() || undefined },
      {
        onSuccess: () => {
          toast({ title: 'Soʻrov qoldirildi', description: 'HR koʻrib chiqib rekruterni belgilaydi' });
          setClaimNote('');
          refetchClaims();
        },
        onError: (err: Error) => {
          toast({ title: 'Xatolik', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const openApprove = () => {
    const preferred = pendingClaims[0];
    setRecruiterId(preferred ? String(preferred.recruiterId) : '');
    setDeadline(request.deadline ? String(request.deadline).slice(0, 10) : '');
    setApproveOpen(true);
  };

  const handleApprove = () => {
    if (!recruiterId) {
      toast({ title: 'Xatolik', description: 'Rekruterni tanlang', variant: 'destructive' });
      return;
    }
    if (needsDeadline && !deadline) {
      toast({ title: 'Xatolik', description: 'Muddatni belgilang', variant: 'destructive' });
      return;
    }

    approve(
      {
        id,
        data: {
          recruiterId: parseInt(recruiterId, 10),
          ...(needsDeadline || deadline ? { deadline } : {}),
        },
      },
      {
        onSuccess: (result) => {
          toast({
            title: 'Tasdiqlandi',
            description: "Ish o'rni rekruterga biriktirildi. U qabul qilib e'lon qilgach faol bo'ladi.",
          });
          setApproveOpen(false);
          refetch();
          refetchClaims();
          if (result.vacancy?.id) {
            setLocation(`/vacancies/${result.vacancy.id}`);
          }
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || 'Tasdiqlashda xatolik',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const statusLabel: Record<string, string> = {
    submitted: 'Yangi',
    reviewing: "Ko'rib chiqilmoqda",
    accepted: 'Qabul qilingan',
    announced: "E'lon qilingan",
    closed: 'Yopilgan',
  };

  const claimStatusLabel: Record<string, string> = {
    pending: 'Kutilmoqda',
    accepted: 'Qabul',
    rejected: 'Rad',
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/requests">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{request.position}</h1>
              <Badge variant={request.priority === 'urgent' ? 'destructive' : 'secondary'}>
                {request.priority === 'urgent' ? 'Shoshilinch' : 'Odatdagi'}
              </Badge>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                {statusLabel[request.status] || request.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {request.departmentName}
              {request.createdByName ? ` • ${request.createdByName}` : ''}
              {" • "}ID: #{request.id}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {request.status === 'submitted' && isHrLike && canApprove && (
            <Button variant="outline" className="gap-2" onClick={handleAssignToMe} disabled={isAssigning}>
              <UserPlus className="w-4 h-4" /> Menga biriktirish
            </Button>
          )}
          {canShowApprove && (
            <Button className="gap-2" onClick={openApprove}>
              <CheckCircle className="w-4 h-4" /> Tasdiqlash va ish o'rni yaratish
            </Button>
          )}
          {request.vacancyId && (
            <Link href={`/vacancies/${request.vacancyId}`}>
              <Button variant="secondary" className="gap-2">
                <Briefcase className="w-4 h-4" /> Ish o'rnini ko'rish
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Asosiy ma'lumotlar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-2">Vazifalar (Description)</h4>
                <div className="bg-muted/30 p-4 rounded-md text-sm whitespace-pre-wrap">
                  {request.description || 'Kiritilmagan'}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-2">Talablar (Requirements)</h4>
                <div className="bg-muted/30 p-4 rounded-md text-sm whitespace-pre-wrap">
                  {request.requirements || 'Kiritilmagan'}
                </div>
              </div>

              {request.reason && (
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-2">Sabab</h4>
                  <p className="text-sm">{request.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(isHrLike || isRecruiter) && (
            <Card>
              <CardHeader>
                <CardTitle>Rekruter soʻrovlari</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {canClaim && (
                  <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <p className="text-sm text-muted-foreground">
                      Bu vakansiyani olish uchun soʻrov qoldiring — HR belgilab beradi.
                    </p>
                    <Textarea
                      value={claimNote}
                      onChange={(e) => setClaimNote(e.target.value)}
                      placeholder="Izoh (ixtiyoriy)"
                      rows={2}
                    />
                    <Button className="gap-2" onClick={handleClaim} disabled={claiming}>
                      <Hand className="w-4 h-4" />
                      Soʻrov qoldirish
                    </Button>
                  </div>
                )}

                {myClaim && user?.role === 'recruiter' && (
                  <p className="text-sm text-muted-foreground">
                    Sizning soʻrovingiz: <strong>{claimStatusLabel[myClaim.status]}</strong>
                    {myClaim.note ? ` — ${myClaim.note}` : ''}
                  </p>
                )}

                {(claims ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Hali soʻrov yoʻq</p>
                ) : (
                  <ul className="space-y-2">
                    {(claims ?? []).map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{c.recruiterName || `Rekruter #${c.recruiterId}`}</p>
                          {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{claimStatusLabel[c.status]}</Badge>
                          {canShowApprove && c.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7"
                              onClick={() => {
                                setRecruiterId(String(c.recruiterId));
                                setDeadline(request.deadline ? String(request.deadline).slice(0, 10) : '');
                                setApproveOpen(true);
                              }}
                            >
                              Biriktirish
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Kim kerak — ehtiyoj</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Lavozim:</span>
                <span className="font-medium text-right">{request.position}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Bo'lim:</span>
                <span className="font-medium">{request.departmentName || '—'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Joy:</span>
                <span className="font-medium text-right">
                  {[request.city, request.district].filter(Boolean).join(', ') || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Ariza bergan:</span>
                <span className="font-medium">{request.createdByName || '—'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Kerakli soni:</span>
                <span className="font-medium">{request.count} kishi</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Maosh:</span>
                <span className="font-medium">{request.salaryRange || 'Kelishilgan'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Muddat:</span>
                <span className="font-medium">
                  {request.deadline
                    ? (() => {
                        const d = new Date(request.deadline);
                        return Number.isNaN(d.getTime()) ? request.deadline : format(d, 'dd.MM.yyyy');
                      })()
                    : 'Belgilanmagan'}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Ariza sanasi:</span>
                <span className="font-medium">{format(new Date(request.createdAt), 'dd.MM.yyyy HH:mm')}</span>
              </div>
              {(request.vacancyAssignedAt || request.assignedAt) && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">HR rekruterga yuborgan:</span>
                  <span className="font-medium">
                    {format(new Date(request.vacancyAssignedAt || request.assignedAt!), 'dd.MM.yyyy HH:mm')}
                  </span>
                </div>
              )}
              {request.vacancyAcceptedAt && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Rekruter qabul qilgan:</span>
                  <span className="font-medium">{format(new Date(request.vacancyAcceptedAt), 'dd.MM.yyyy HH:mm')}</span>
                </div>
              )}
              {request.vacancyPublishedAt && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">E'lon tasdiqlangan:</span>
                  <span className="font-medium">{format(new Date(request.vacancyPublishedAt), 'dd.MM.yyyy HH:mm')}</span>
                </div>
              )}
              {!request.vacancyAcceptedAt && request.vacancyId && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Rekruter qabul:</span>
                  <span className="font-medium italic text-muted-foreground">Kutilmoqda</span>
                </div>
              )}

              <div className="pt-2">
                <span className="text-muted-foreground block mb-1">Mas'ul (rekruter):</span>
                {request.assignedToName ? (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                      {request.assignedToName.charAt(0)}
                    </div>
                    <span className="font-medium">{request.assignedToName}</span>
                  </div>
                ) : (
                  <div className="p-2 border border-dashed border-gray-300 rounded-md text-center text-muted-foreground italic">
                    Hali tayinlanmagan
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tasdiqlash va ish o'rni yaratish</DialogTitle>
            <DialogDescription>
              Rekruterni tanlang (soʻrov qoldirganlar yuqorida). Tasdiqlangach ish o'rni biriktiriladi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {pendingClaims.length > 0 && (
              <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                Soʻrov qoldirganlar:{' '}
                {pendingClaims.map((c) => c.recruiterName || `#${c.recruiterId}`).join(', ')}
              </div>
            )}
            <div className="space-y-2">
              <Label>Rekruter</Label>
              <Select value={recruiterId} onValueChange={setRecruiterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Rekruterni tanlang" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {(recruiters ?? [])
                    .filter((u) => u.status === 'active')
                    .map((u) => {
                      const claimed = pendingClaims.some((c) => c.recruiterId === u.id);
                      return (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.fullName}{claimed ? ' · soʻrov bor' : ''}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Muddat {needsDeadline ? '(majburiy)' : '(arizadagi muddat bilan)'}
              </Label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required={needsDeadline}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={isApproving}>
              Bekor qilish
            </Button>
            <Button onClick={handleApprove} disabled={isApproving}>
              {isApproving ? 'Tasdiqlanmoqda...' : 'Tasdiqlash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
