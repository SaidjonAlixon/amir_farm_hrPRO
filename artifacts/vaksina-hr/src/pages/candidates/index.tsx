import React, { useState } from 'react';
import { useGetCandidates, CandidateStage } from '@workspace/api-client-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Link, useLocation } from 'wouter';
import { Search, Plus, Filter, User, Briefcase, Phone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useAuth } from '../../contexts/AuthContext';
import { isHrManager } from '../../lib/roles';

function getFiltersFromUrl() {
  if (typeof window === 'undefined') return { stage: 'all', status: 'all' };
  const params = new URLSearchParams(window.location.search);
  let stage = params.get('stage') || 'all';
  let status = params.get('status') || 'all';
  // Eski linklar: stage=rejected/hired → status filter
  if (stage === 'rejected') {
    status = 'rejected';
    stage = 'all';
  } else if (stage === 'hired') {
    status = 'hired';
    stage = 'all';
  }
  return { stage, status };
}

const STATUS_TITLES: Record<string, string> = {
  all: "Barcha nomzodlar ro'yxati",
  active: "Kutilmoqda — faol nomzodlar",
  hired: "Ishga qabul qilingan nomzodlar",
  rejected: "Rad etilgan nomzodlar",
};

export default function CandidatesList() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const initial = getFiltersFromUrl();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>(initial.stage);
  const [statusFilter, setStatusFilter] = useState<string>(initial.status);

  const canAddCandidate =
    user?.role === 'recruiter' ||
    isHrManager(user?.role) ||
    user?.role === 'director';

  const { data: candidates, isLoading } = useGetCandidates({
    search: search || undefined,
    stage: stageFilter !== 'all' ? stageFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const updateStatus = (value: string) => {
    setStatusFilter(value);
    const params = new URLSearchParams();
    if (value !== 'all') params.set('status', value);
    if (stageFilter !== 'all') params.set('stage', stageFilter);
    const q = params.toString();
    setLocation(q ? `/candidates?${q}` : '/candidates');
  };

  const updateStage = (value: string) => {
    setStageFilter(value);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (value !== 'all') params.set('stage', value);
    const q = params.toString();
    setLocation(q ? `/candidates?${q}` : '/candidates');
  };

  const getStageBadge = (stage: CandidateStage) => {
    const stageMap: Record<string, { label: string, color: string }> = {
      phone_interview: { label: 'Tanishuv', color: 'bg-blue-100 text-blue-800' },
      online_interview: { label: 'Onlayn suhbat', color: 'bg-indigo-100 text-indigo-800' },
      preboarding: { label: 'Pre-boarding', color: 'bg-purple-100 text-purple-800' },
      offline_interview: { label: 'Offline suhbat', color: 'bg-orange-100 text-orange-800' },
      final_decision: { label: 'Yakuniy qaror', color: 'bg-amber-100 text-amber-800' },
      offer: { label: 'Job Offer', color: 'bg-teal-100 text-teal-800' },
      documents: { label: 'Hujjatlar', color: 'bg-slate-100 text-slate-800' },
      internship: { label: 'Stajirovka', color: 'bg-cyan-100 text-cyan-800' },
      hired: { label: 'Ishga qabul', color: 'bg-emerald-100 text-emerald-800' },
    };

    const s = stageMap[stage] || { label: stage, color: 'bg-gray-100 text-gray-800' };
    return <Badge variant="secondary" className={s.color}>{s.label}</Badge>;
  };

  const getStatusBadge = (status?: string) => {
    if (status === 'hired') return <Badge className="bg-emerald-100 text-emerald-800">Ishga qabul</Badge>;
    if (status === 'rejected') return <Badge className="bg-rose-100 text-rose-800">Rad etilgan</Badge>;
    return <Badge className="bg-amber-100 text-amber-800">Kutilmoqda</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nomzodlar</h1>
          <p className="text-muted-foreground mt-1">
            {STATUS_TITLES[statusFilter] || STATUS_TITLES.all}
          </p>
        </div>
        {canAddCandidate && (
          <Link href="/candidates/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Yangi nomzod
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Ism, raqam bo'yicha qidirish..." 
            className="pl-9 bg-gray-50 border-transparent focus-visible:bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0 flex-wrap">
          <Select value={statusFilter} onValueChange={updateStatus}>
            <SelectTrigger className="w-full sm:w-[180px] bg-gray-50 border-transparent">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Holat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha holatlar</SelectItem>
              <SelectItem value="active">Kutilmoqda</SelectItem>
              <SelectItem value="hired">Ishga qabul</SelectItem>
              <SelectItem value="rejected">Rad etilgan</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={updateStage}>
            <SelectTrigger className="w-full sm:w-[200px] bg-gray-50 border-transparent">
              <SelectValue placeholder="Bosqich" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha bosqichlar</SelectItem>
              <SelectItem value="phone_interview">Tanishuv</SelectItem>
              <SelectItem value="online_interview">Onlayn suhbat</SelectItem>
              <SelectItem value="preboarding">Pre-boarding</SelectItem>
              <SelectItem value="offline_interview">Offline suhbat</SelectItem>
              <SelectItem value="final_decision">Yakuniy qaror</SelectItem>
              <SelectItem value="offer">Job Offer</SelectItem>
              <SelectItem value="documents">Hujjatlar</SelectItem>
              <SelectItem value="internship">Stajirovka</SelectItem>
              <SelectItem value="hired">Ishga qabul</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground border-b">
              <tr>
                <th className="px-6 py-4 font-medium">Nomzod</th>
                <th className="px-6 py-4 font-medium">Ish o'rni</th>
                <th className="px-6 py-4 font-medium">Aloqa</th>
                <th className="px-6 py-4 font-medium">Bosqich</th>
                <th className="px-6 py-4 font-medium">Holat</th>
                <th className="px-6 py-4 font-medium">Rekruter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    Yuklanmoqda...
                  </td>
                </tr>
              ) : candidates && candidates.length > 0 ? (
                candidates.map((candidate) => (
                  <tr
                    key={candidate.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => setLocation(`/candidates/${candidate.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setLocation(`/candidates/${candidate.id}`);
                      }
                    }}
                    className="hover:bg-muted/30 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
                          {candidate.photoUrl ? (
                            <img src={candidate.photoUrl} alt={candidate.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-foreground block">
                            {candidate.fullName}
                          </span>
                          {candidate.expectedSalary && (
                            <span className="text-xs text-muted-foreground">Kutilma: {candidate.expectedSalary}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{candidate.vacancyTitle || 'Noma\'lum'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{candidate.phone}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStageBadge(candidate.stage)}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(candidate.status)}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-sm">
                      {candidate.recruiterName || 'Biriktirilmagan'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    Hech qanday nomzod topilmadi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
