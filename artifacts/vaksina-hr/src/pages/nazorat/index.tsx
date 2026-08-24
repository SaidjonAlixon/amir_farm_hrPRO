import React, { useMemo, useState } from 'react';
import { useGetRequests, useGetDepartments, RequestStatus } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Link, useLocation } from 'wouter';
import { Search, Filter, Eye, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useAuth } from '../../contexts/AuthContext';
import { isHrManager } from '../../lib/roles';

export default function NazoratPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  const allowed = isHrManager(user?.role) || user?.role === 'director';

  const { data: requests, isLoading } = useGetRequests({
    search: search || undefined,
    departmentId: departmentFilter !== 'all' ? Number(departmentFilter) : undefined,
  });
  const { data: departments } = useGetDepartments();

  const filtered = useMemo(() => {
    const list = requests ?? [];
    if (statusFilter === 'all') return list;
    return list.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const getStatusBadge = (status: RequestStatus) => {
    switch (status) {
      case 'submitted': return <Badge variant="secondary" className="bg-gray-100 text-gray-800">Yangi</Badge>;
      case 'reviewing': return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Ko'rib chiqilmoqda</Badge>;
      case 'accepted': return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Qabul qilingan</Badge>;
      case 'announced': return <Badge variant="secondary" className="bg-purple-100 text-purple-800">E'lon qilingan</Badge>;
      case 'closed': return <Badge variant="secondary" className="bg-gray-800 text-white">Yopilgan</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  if (!allowed) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Nazorat sahifasi faqat HR, Admin va Direktor uchun.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nazorat</h1>
        <p className="text-muted-foreground mt-1">
          HR yuborgan, rekruter qabul qilgan va e'lon tasdiqlangan vaqtlar bilan to'liq nazorat
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Lavozim bo'yicha qidirish..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Bo'lim" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="all">Barcha bo'limlar</SelectItem>
                {(departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="all">Barcha statuslar</SelectItem>
                <SelectItem value="submitted">Yangi</SelectItem>
                <SelectItem value="reviewing">Ko'rib chiqilmoqda</SelectItem>
                <SelectItem value="accepted">Qabul qilingan</SelectItem>
                <SelectItem value="announced">E'lon qilingan</SelectItem>
                <SelectItem value="closed">Yopilgan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Lavozim</th>
                  <th className="px-4 py-3 font-medium">Bo'lim</th>
                  <th className="px-4 py-3 font-medium">Joy</th>
                  <th className="px-4 py-3 font-medium">Ariza bergan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Rekruter</th>
                  <th className="px-4 py-3 font-medium">HR yuborgan</th>
                  <th className="px-4 py-3 font-medium">Rekruter qabul</th>
                  <th className="px-4 py-3 font-medium">E'lon tasdiqlangan</th>
                  <th className="px-4 py-3 font-medium text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                      Yuklanmoqda...
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((request) => (
                    <tr
                      key={request.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => setLocation(`/requests/${request.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setLocation(`/requests/${request.id}`);
                        }
                      }}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium">#{request.id}</td>
                      <td className="px-4 py-3 font-semibold">{request.position}</td>
                      <td className="px-4 py-3">{request.departmentName || '—'}</td>
                      <td className="px-4 py-3">
                        {[request.city, request.district].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">{request.createdByName || '—'}</td>
                      <td className="px-4 py-3">{getStatusBadge(request.status)}</td>
                      <td className="px-4 py-3">{request.assignedToName || '—'}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {request.vacancyAssignedAt || request.assignedAt
                          ? format(new Date(request.vacancyAssignedAt || request.assignedAt!), 'dd.MM.yyyy HH:mm')
                          : <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {request.vacancyAcceptedAt
                          ? format(new Date(request.vacancyAcceptedAt), 'dd.MM.yyyy HH:mm')
                          : <span className="text-muted-foreground italic">Kutilmoqda</span>}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {request.vacancyPublishedAt
                          ? format(new Date(request.vacancyPublishedAt), 'dd.MM.yyyy HH:mm')
                          : <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => setLocation(`/requests/${request.id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {request.vacancyId && (
                            <Link href={`/vacancies/${request.vacancyId}`}>
                              <Button variant="ghost" size="sm" className="h-8 gap-1">
                                <Briefcase className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                      Hech qanday ariza topilmadi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
