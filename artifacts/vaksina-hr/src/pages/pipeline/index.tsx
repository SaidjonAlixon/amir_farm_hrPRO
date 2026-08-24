import React, { useMemo, useState } from 'react';
import {
  useGetCandidates,
  useGetPhoneInterviews,
  useGetUsers,
  type Candidate,
} from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import {
  Search,
  ChevronRight,
  Phone,
  User,
  AlertTriangle,
} from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { canManageCandidate, isRecruiterScoped } from '../../lib/candidate-access';
import { cn } from '../../lib/utils';
import { CardStack } from '../../components/CardStack';

const BOARD_COLUMNS = [
  {
    id: 'yangi',
    label: 'Yangi ariza',
    hint: 'Tanishuv navbati',
    top: 'bg-sky-400',
    countBg: 'bg-sky-100 text-sky-800',
    stages: ['phone_interview'] as const,
    needsPhoneRecord: false as boolean | null,
  },
  {
    id: 'telefon',
    label: 'Tanishuv',
    hint: '1-qadam',
    top: 'bg-blue-500',
    countBg: 'bg-blue-100 text-blue-800',
    stages: ['phone_interview'] as const,
    needsPhoneRecord: true as boolean | null,
  },
  {
    id: 'onlayn',
    label: 'Onlayn',
    hint: 'Test / suhbat',
    top: 'bg-violet-500',
    countBg: 'bg-violet-100 text-violet-800',
    stages: ['online_interview'] as const,
    needsPhoneRecord: null,
  },
  {
    id: 'preboarding',
    label: 'Pre-boarding',
    hint: 'Tanishtirish',
    top: 'bg-fuchsia-500',
    countBg: 'bg-fuchsia-100 text-fuchsia-800',
    stages: ['preboarding'] as const,
    needsPhoneRecord: null,
  },
  {
    id: 'offline',
    label: 'Offline',
    hint: 'Yuzma-yuz',
    top: 'bg-indigo-500',
    countBg: 'bg-indigo-100 text-indigo-800',
    stages: ['offline_interview'] as const,
    needsPhoneRecord: null,
  },
  {
    id: 'qaror',
    label: 'Qaror',
    hint: 'Yakuniy qaror',
    top: 'bg-purple-500',
    countBg: 'bg-purple-100 text-purple-800',
    stages: ['final_decision'] as const,
    needsPhoneRecord: null,
  },
  {
    id: 'staj',
    label: 'Staj',
    hint: 'Offer · Hujjat · Staj',
    top: 'bg-amber-400',
    countBg: 'bg-amber-100 text-amber-900',
    stages: ['offer', 'documents', 'internship'] as const,
    needsPhoneRecord: null,
  },
  {
    id: 'ishga',
    label: 'Ishga olindi',
    hint: 'Yakunlangan',
    top: 'bg-emerald-500',
    countBg: 'bg-emerald-100 text-emerald-800',
    stages: ['hired'] as const,
    needsPhoneRecord: null,
  },
] as const;

const STAGE_LABELS: Record<string, string> = {
  phone_interview: 'Tanishuv',
  online_interview: 'Onlayn suhbat',
  preboarding: 'Pre-boarding',
  offline_interview: 'Offline suhbat',
  final_decision: 'Yakuniy qaror',
  offer: 'Job Offer',
  documents: 'Hujjatlar',
  internship: 'Stajirovka',
  hired: 'Ishga olindi',
};

const STAGE_ACTION: Record<string, string> = {
  phone_interview: 'phone-interview',
  online_interview: 'online-interview',
  preboarding: 'preboarding',
  offline_interview: 'offline-interview',
  final_decision: 'final-decision',
  offer: 'offer',
  documents: 'documents',
  internship: 'internship',
  hired: '',
};

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

function stageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
}

function columnEntryIndex(columnId: string): number {
  const col = BOARD_COLUMNS.find((c) => c.id === columnId);
  if (!col) return -1;
  return Math.min(...col.stages.map((s) => stageIndex(s)).filter((i) => i >= 0));
}

function ageFromBirth(birthDate?: string | null): string | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years > 0 && years < 100 ? `${years} yosh` : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function columnForCandidate(
  c: Candidate,
  phoneDoneIds: Set<number>,
): (typeof BOARD_COLUMNS)[number] | null {
  if (c.status === 'rejected') return null;
  if (c.status === 'hired' || c.stage === 'hired') {
    return BOARD_COLUMNS.find((col) => col.id === 'ishga')!;
  }
  for (const col of BOARD_COLUMNS) {
    if (col.id === 'ishga') continue;
    if (!(col.stages as readonly string[]).includes(c.stage)) continue;
    if (col.id === 'yangi' || col.id === 'telefon') {
      const hasPhone = phoneDoneIds.has(c.id);
      if (col.needsPhoneRecord === true && !hasPhone) continue;
      if (col.needsPhoneRecord === false && hasPhone) continue;
    }
    return col;
  }
  return BOARD_COLUMNS.find((col) => (col.stages as readonly string[]).includes(c.stage)) ?? null;
}

function CandidateCard({
  candidate,
  canDrag,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  candidate: Candidate;
  canDrag: boolean;
  isDragging: boolean;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
}) {
  const age = ageFromBirth(candidate.birthDate);
  const href = STAGE_ACTION[candidate.stage]
    ? `/candidates/${candidate.id}/${STAGE_ACTION[candidate.stage]}`
    : `/candidates/${candidate.id}`;
  const meta = [age, candidate.experience].filter(Boolean).join(' · ');

  return (
    <article
      draggable={canDrag}
      onDragStart={() => canDrag && onDragStart(candidate.id)}
      onDragEnd={onDragEnd}
      className={cn(
        'relative rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        'transition-[box-shadow,transform,opacity] duration-150',
        'hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)]',
        canDrag && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40 scale-[0.98]',
      )}
    >
      {candidate.status === 'active' && candidate.stage !== 'hired' && (
        <div className="absolute right-3 top-3 text-amber-500/80" title="Joriy qadam kutilmoqda">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} />
        </div>
      )}

      <div className="flex gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-[12px] font-semibold text-white">
          {candidate.photoUrl ? (
            <img src={candidate.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(candidate.fullName)
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Link href={`/candidates/${candidate.id}`}>
            <h3 className="truncate text-[14px] font-semibold leading-snug text-slate-900 hover:text-slate-700">
              {candidate.fullName}
            </h3>
          </Link>
          <p className="truncate text-[12px] leading-snug text-slate-500">
            {candidate.vacancyTitle || 'Lavozim belgilanmagan'}
          </p>
          {meta && (
            <p className="truncate text-[11px] leading-relaxed text-slate-400">{meta}</p>
          )}
          {candidate.recruiterName && (
            <p className="truncate pt-0.5 text-[12px] font-medium leading-snug text-violet-700">
              {candidate.recruiterName}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="inline-flex max-w-[60%] truncate rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
          {STAGE_LABELS[candidate.stage] || candidate.stage}
        </span>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-sky-700 hover:text-sky-900"
          onClick={(e) => e.stopPropagation()}
        >
          Qadam
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {candidate.phone && (
        <a
          href={`tel:${candidate.phone}`}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] leading-none text-slate-400 hover:text-slate-600"
          onClick={(e) => e.stopPropagation()}
          title={candidate.phone}
        >
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{candidate.phone}</span>
        </a>
      )}
    </article>
  );
}

export default function PipelineBoardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const recruiterOnly = isRecruiterScoped(user?.role);
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [tab, setTab] = useState<'pipeline' | 'archive'>('pipeline');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const { data: candidates, isLoading } = useGetCandidates();
  const { data: phoneInterviews } = useGetPhoneInterviews();
  const { data: recruiters } = useGetUsers({ role: 'recruiter' });
  const { data: hrs } = useGetUsers({ role: 'hr' });

  const phoneDoneIds = useMemo(() => {
    const set = new Set<number>();
    for (const p of phoneInterviews ?? []) {
      if (p.candidateId) set.add(p.candidateId);
    }
    return set;
  }, [phoneInterviews]);

  const assignees = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of [...(recruiters ?? []), ...(hrs ?? [])]) {
      if (u.status === 'active') map.set(u.id, u.fullName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [recruiters, hrs]);

  const filtered = useMemo(() => {
    let list = candidates ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.vacancyTitle || '').toLowerCase().includes(q),
      );
    }
    if (assignee !== 'all') {
      const id = Number(assignee);
      list = list.filter((c) => c.recruiterId === id);
    }
    return list;
  }, [candidates, search, assignee]);

  const archived = useMemo(
    () => filtered.filter((c) => c.status === 'rejected'),
    [filtered],
  );

  const activeCount = useMemo(
    () => filtered.filter((c) => c.status !== 'rejected').length,
    [filtered],
  );

  const byColumn = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    for (const col of BOARD_COLUMNS) map[col.id] = [];
    for (const c of filtered) {
      if (c.status === 'rejected') continue;
      const col = columnForCandidate(c, phoneDoneIds);
      if (col) map[col.id].push(c);
    }
    return map;
  }, [filtered, phoneDoneIds]);

  const moveToColumn = (candidateId: number, columnId: string) => {
    const col = BOARD_COLUMNS.find((c) => c.id === columnId);
    const candidate = (candidates ?? []).find((c) => c.id === candidateId);
    if (!col || !candidate) return;

    if (!canManageCandidate(user, candidate.recruiterId)) {
      toast({
        title: 'Ruxsat yo‘q',
        description: 'Faqat HR yoki biriktirilgan mas\'ul ko‘chirishi mumkin',
        variant: 'destructive',
      });
      return;
    }

    const currentCol = columnForCandidate(candidate, phoneDoneIds);
    const openCurrent = () => {
      const action = STAGE_ACTION[candidate.stage];
      if (action) setLocation(`/candidates/${candidateId}/${action}`);
      else setLocation(`/candidates/${candidateId}`);
    };

    if (currentCol?.id === columnId) {
      openCurrent();
      return;
    }

    const curIdx = stageIndex(candidate.stage);
    const targetIdx = columnEntryIndex(columnId);

    if (targetIdx > curIdx) {
      const nextStage = STAGE_ORDER[curIdx + 1];
      toast({
        title: 'Avval joriy qadamni yakunlang',
        description: `${STAGE_LABELS[candidate.stage]} → keyin ${STAGE_LABELS[nextStage] || 'keyingi'}`,
      });
      openCurrent();
      return;
    }

    if (targetIdx < curIdx) {
      toast({
        title: 'Qadam o‘tkazib yuborilmaydi',
        description: 'Orqaga sakrash mumkin emas. Joriy bosqichda davom eting.',
        variant: 'destructive',
      });
      openCurrent();
    }
  };

  return (
    <div className="-mx-2 space-y-4 sm:mx-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pipeline</h1>
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {activeCount}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Qadamlar ketma-ket: yakunlangach keyingi ustunga o‘tadi
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab('pipeline')}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
                tab === 'pipeline' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => setTab('archive')}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
                tab === 'archive' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              Baza / Arxiv
              {archived.length > 0 && (
                <span className="ml-1.5 tabular-nums text-inherit/80">{archived.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-sm backdrop-blur sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, lavozim, telefon bo‘yicha qidirish"
            className="h-10 border-0 bg-slate-50 pl-9 shadow-none focus-visible:bg-white focus-visible:ring-1"
          />
        </div>
        {!recruiterOnly && (
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-10 w-full border-0 bg-slate-50 shadow-none sm:w-[220px]">
              <User className="mr-2 h-4 w-4 text-slate-400" />
              <SelectValue placeholder="Mas'ul" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha mas'ullar</SelectItem>
              {assignees.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {recruiterOnly && (
          <div className="flex h-10 items-center gap-2 rounded-md bg-slate-50 px-3 text-sm text-slate-600 sm:min-w-[200px]">
            <User className="h-4 w-4 text-slate-400" />
            Faqat mening ishlarim
          </div>
        )}
      </div>

      {tab === 'archive' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {archived.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Rad etilgan nomzodlar yo‘q</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {archived.map((c) => (
                <Link key={c.id} href={`/candidates/${c.id}`}>
                  <div className="rounded-xl border border-rose-100 bg-gradient-to-b from-rose-50/80 to-white p-3 transition hover:border-rose-200 hover:shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-200/60 text-[11px] font-semibold text-rose-900">
                        {initials(c.fullName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{c.fullName}</p>
                        <p className="truncate text-xs text-slate-500">{c.vacancyTitle || '—'}</p>
                      </div>
                    </div>
                    <Badge className="mt-3 bg-rose-100 text-rose-800 hover:bg-rose-100">Rad etilgan</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-gray-50 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-gray-50 to-transparent" />
          <div className="flex gap-3 overflow-x-auto pb-3 pt-1 scroll-smooth">
            {BOARD_COLUMNS.map((col) => {
              const items = byColumn[col.id] ?? [];
              const isOver = dragOverCol === col.id;
              return (
                <section
                  key={col.id}
                  className={cn(
                    'flex w-[268px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-[#f7f8fa]',
                    'transition-shadow duration-150',
                    isOver && 'ring-2 ring-sky-400/70 ring-offset-2 shadow-md',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverCol(col.id);
                  }}
                  onDragLeave={() => setDragOverCol((v) => (v === col.id ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCol(null);
                    if (draggingId != null) moveToColumn(draggingId, col.id);
                    setDraggingId(null);
                  }}
                >
                  <div className={cn('h-1 w-full', col.top)} />
                  <header className="sticky top-0 z-[1] border-b border-slate-200/60 bg-[#f7f8fa] px-3.5 py-3 backdrop-blur">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-700">
                        {col.label}
                      </h2>
                      <span
                        className={cn(
                          'inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                          col.countBg,
                        )}
                      >
                        {items.length}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-normal text-slate-400">{col.hint}</p>
                  </header>

                  <div className="flex max-h-[calc(100vh-270px)] min-h-[180px] flex-1 flex-col gap-3 overflow-y-auto p-3">
                    {isLoading ? (
                      <div className="space-y-2 py-2">
                        {[0, 1].map((i) => (
                          <div key={i} className="h-28 animate-pulse rounded-xl bg-white/80" />
                        ))}
                      </div>
                    ) : items.length === 0 ? (
                      <div
                        className={cn(
                          'flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/40 px-3 py-10',
                          isOver && 'border-sky-300 bg-sky-50/50',
                        )}
                      >
                        <p className="text-center text-[11px] text-slate-400">Bo‘sh</p>
                      </div>
                    ) : (
                      <CardStack
                        items={items}
                        stackSize={3}
                        getKey={(c) => c.id}
                        renderCard={(c) => (
                          <CandidateCard
                            candidate={c}
                            canDrag={canManageCandidate(user, c.recruiterId)}
                            isDragging={draggingId === c.id}
                            onDragStart={setDraggingId}
                            onDragEnd={() => setDraggingId(null)}
                          />
                        )}
                      />
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
