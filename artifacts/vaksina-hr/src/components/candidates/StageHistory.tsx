import React, { useMemo } from 'react';
import {
  useGetPhoneInterviews,
  useGetOnlineInterviews,
  useGetOfflineInterviews,
  useGetPreboardings,
  useGetOffers,
  useGetEmployees,
  useGetInternships,
  PipelineStage,
  ChecklistItem,
} from '@workspace/api-client-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { Check, Circle, X } from 'lucide-react';
import { format } from 'date-fns';

const STAGE_ORDER = [
  'phone_interview',
  'online_interview',
  'preboarding',
  'offline_interview',
  'final_decision',
  'offer',
  'documents',
  'internship',
  'hired',
] as const;

function statusBadge(status?: string | null) {
  if (!status) return null;
  const map: Record<string, string> = {
    suitable: 'Tavsiya etiladi',
    not_suitable: 'Tavsiya etilmaydi',
    pending: 'Kutilmoqda',
    experienced: 'Tajribali',
    inexperienced: 'Tajribasiz',
    passed: "O'tdi",
    failed: "O'tmadi",
    attended: 'Keldi',
    absent: 'Kelmadi',
    accepted: 'Qabul qilingan',
    rejected: 'Rad etilgan',
    ongoing: 'Davom etmoqda',
    completed: 'Yakunlangan',
  };
  return <Badge variant="secondary">{map[status] || status}</Badge>;
}

function ChecklistView({ items }: { items?: ChecklistItem[] | null }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">Checklist yo'q</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm">
          {item.completed ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className={item.completed ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground italic">{text}</p>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-sm py-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{children}</div>
    </div>
  );
}

interface StageHistoryProps {
  candidateId: number;
  stages?: PipelineStage[];
  selectedStage?: string | null;
  onSelectStage?: (key: string) => void;
}

export function StageHistory({ candidateId, stages, selectedStage, onSelectStage }: StageHistoryProps) {
  const enabled = !!candidateId;

  const { data: phones } = useGetPhoneInterviews({ candidateId }, { query: { enabled } });
  const { data: onlines } = useGetOnlineInterviews({ candidateId }, { query: { enabled } });
  const { data: offlines } = useGetOfflineInterviews({ candidateId }, { query: { enabled } });
  const { data: preboards } = useGetPreboardings({ candidateId }, { query: { enabled } });
  const { data: offers } = useGetOffers({ candidateId }, { query: { enabled } });
  const { data: employees } = useGetEmployees(undefined, { query: { enabled } });

  const employee = useMemo(
    () => (employees ?? []).find((e) => e.candidateId === candidateId),
    [employees, candidateId],
  );

  const { data: internships } = useGetInternships(
    employee ? { employeeId: employee.id } : undefined,
    { query: { enabled: !!employee } },
  );

  const phone = phones?.[0];
  const online = onlines?.[0];
  const offline = offlines?.[0];
  const preboard = preboards?.[0];
  const offer = offers?.[0];
  const internship = internships?.[0];

  const openValue = selectedStage || stages?.find((s) => s.status === 'in_progress')?.key || stages?.find((s) => s.status === 'completed')?.key;

  const stageMeta = (key: string) => {
    const idx = STAGE_ORDER.indexOf(key as any);
    const stage = stages?.find((s) => s.key === key);
    return { idx: idx >= 0 ? idx + 1 : 0, stage };
  };

  const header = (key: string, title: string) => {
    const { idx, stage } = stageMeta(key);
    return (
      <div className="flex items-center gap-3 w-full pr-2">
        <span
          className={cn(
            'w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0',
            stage?.status === 'completed' && 'bg-emerald-500 text-white border-emerald-500',
            stage?.status === 'in_progress' && 'bg-amber-400 text-white border-amber-400',
            stage?.status === 'failed' && 'bg-destructive text-white border-destructive',
            (!stage || stage.status === 'pending') && 'bg-muted text-muted-foreground',
          )}
        >
          {stage?.status === 'completed' ? <Check className="w-3.5 h-3.5" /> : stage?.status === 'failed' ? <X className="w-3.5 h-3.5" /> : idx}
        </span>
        <div className="flex-1 text-left">
          <div className="font-semibold">{idx}-qadam · {title}</div>
          <div className="text-xs text-muted-foreground font-normal">
            {stage?.status === 'completed' && 'Bajarilgan'}
            {stage?.status === 'in_progress' && 'Joriy bosqich'}
            {stage?.status === 'failed' && 'Rad etilgan'}
            {(!stage || stage.status === 'pending') && 'Hali boshlanmagan'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={openValue ?? undefined}
      onValueChange={(v) => onSelectStage?.(v)}
      className="border rounded-lg px-4 bg-white"
    >
      <AccordionItem value="phone_interview">
        <AccordionTrigger>{header('phone_interview', 'Tanishuv')}</AccordionTrigger>
        <AccordionContent>
          {phone ? (
            <div className="space-y-1 pb-2">
              <Row label="Rekruter">{phone.recruiterName || '—'}</Row>
              <Row label="Sana">{phone.interviewDate || '—'}</Row>
              <Row label="Natija">{statusBadge(phone.status)}</Row>
              <Row label="Izoh">{phone.notes || '—'}</Row>
              {phone.rejectReason && <Row label="Rad sababi">{phone.rejectReason}</Row>}
            </div>
          ) : (
            <Empty text="Tanishuv ma'lumoti hali kiritilmagan" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="online_interview">
        <AccordionTrigger>{header('online_interview', 'Onlayn suhbat')}</AccordionTrigger>
        <AccordionContent>
          {online ? (
            <div className="space-y-3 pb-2">
              <Row label="Sana">{online.interviewDate || '—'}</Row>
              <Row label="Tajriba">{statusBadge(online.experienceLevel)}</Row>
              <Row label="Ball">{online.score != null ? `${online.score} / 100` : '—'}</Row>
              <Row label="Izoh">{online.notes || '—'}</Row>
              {!!online.questionsAnswers?.length && (
                <div className="pt-2 space-y-2">
                  <p className="text-sm font-medium">Savol-javoblar</p>
                  {online.questionsAnswers.map((qa, i) => (
                    <div key={i} className="rounded-md border bg-muted/30 p-3 text-sm">
                      <p className="font-medium">{i + 1}. {qa.question}</p>
                      <p className="text-muted-foreground mt-1">{qa.answer || 'Javob kiritilmagan'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Empty text="Onlayn suhbat ma'lumoti hali kiritilmagan" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="preboarding">
        <AccordionTrigger>{header('preboarding', 'Pre-boarding')}</AccordionTrigger>
        <AccordionContent>
          {preboard ? (
            <div className="space-y-3 pb-2">
              <ChecklistView items={preboard.checklist as ChecklistItem[] | undefined} />
              <Row label="Izoh">{preboard.notes || '—'}</Row>
            </div>
          ) : (
            <Empty text="Pre-boarding ma'lumoti hali kiritilmagan" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="offline_interview">
        <AccordionTrigger>{header('offline_interview', 'Offline suhbat')}</AccordionTrigger>
        <AccordionContent>
          {offline ? (
            <div className="space-y-1 pb-2">
              <Row label="Sana">{offline.scheduledDate}{offline.scheduledTime ? ` · ${offline.scheduledTime}` : ''}</Row>
              <Row label="HR">{offline.hrName || '—'}</Row>
              <Row label="Trener">{offline.trainerName || '—'}</Row>
              <Row label="Kelish">{statusBadge(offline.attendanceStatus)}</Row>
              <Row label="HR ball">{offline.hrScore ?? '—'}</Row>
              <Row label="HR izoh">{offline.hrNotes || '—'}</Row>
              <Row label="Trener ball">{offline.trainerScore ?? '—'}</Row>
              <Row label="Trener izoh">{offline.trainerNotes || '—'}</Row>
              <Row label="Natija">{statusBadge(offline.result)}</Row>
              <Row label="Qaror izohi">{offline.resultNotes || '—'}</Row>
            </div>
          ) : (
            <Empty text="Offline suhbat ma'lumoti hali kiritilmagan" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="final_decision">
        <AccordionTrigger>{header('final_decision', 'Yakuniy qaror')}</AccordionTrigger>
        <AccordionContent>
          {offline?.result ? (
            <div className="space-y-1 pb-2">
              <Row label="Qaror">{statusBadge(offline.result)}</Row>
              <Row label="Izoh">{offline.resultNotes || '—'}</Row>
            </div>
          ) : stageMeta('final_decision').stage?.status === 'completed' || stageMeta('offer').stage?.status !== 'pending' ? (
            <Empty text="Yakuniy qaror tasdiqlangan — keyingi bosqichga o'tilgan" />
          ) : (
            <Empty text="Yakuniy qaror hali chiqarilmagan" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="offer">
        <AccordionTrigger>{header('offer', 'Job Offer')}</AccordionTrigger>
        <AccordionContent>
          {offer ? (
            <div className="space-y-1 pb-2">
              <Row label="Lavozim">{offer.position}</Row>
              <Row label="Maosh">{offer.salary}</Row>
              <Row label="Sharoitlar">{offer.workConditions || '—'}</Row>
              <Row label="Status">{statusBadge(offer.status)}</Row>
              <Row label="Yaratilgan">{offer.createdAt ? format(new Date(offer.createdAt), 'dd.MM.yyyy HH:mm') : '—'}</Row>
            </div>
          ) : (
            <Empty text="Job offer hali yaratilmagan" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="documents">
        <AccordionTrigger>{header('documents', 'Hujjatlar')}</AccordionTrigger>
        <AccordionContent>
          {offer?.documentsChecklist?.length ? (
            <ChecklistView items={offer.documentsChecklist as ChecklistItem[]} />
          ) : (
            <Empty text="Hujjatlar checklisti hali yo'q" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="internship">
        <AccordionTrigger>{header('internship', 'Stajirovka')}</AccordionTrigger>
        <AccordionContent>
          {internship ? (
            <div className="space-y-3 pb-2">
              <Row label="Xodim">{internship.employeeName || employee?.fullName || '—'}</Row>
              <Row label="Trener">{internship.trainerName || '—'}</Row>
              <Row label="Davr">{internship.startDate}{internship.endDate ? ` — ${internship.endDate}` : ''}</Row>
              <Row label="Status">{statusBadge(internship.status)}</Row>
              <ChecklistView items={internship.tasks as ChecklistItem[] | undefined} />
            </div>
          ) : (
            <Empty text="Stajirovka ma'lumoti hali kiritilmagan" />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="hired">
        <AccordionTrigger>{header('hired', 'Ishga qabul')}</AccordionTrigger>
        <AccordionContent>
          {employee ? (
            <div className="space-y-1 pb-2">
              <Row label="F.I.Sh.">{employee.fullName}</Row>
              <Row label="Lavozim">{employee.position}</Row>
              <Row label="Bo'lim">{employee.departmentName || '—'}</Row>
              <Row label="Mentor">{employee.mentorName || '—'}</Row>
              <Row label="Qabul sanasi">{employee.hiredAt}</Row>
            </div>
          ) : stageMeta('hired').stage?.status === 'completed' || stageMeta('hired').stage?.status === 'in_progress' ? (
            <Empty text="Ishga qabul jarayoni — xodim kartochkasi yaratilgan bo'lishi mumkin" />
          ) : (
            <Empty text="Hali ishga qabul qilinmagan" />
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
