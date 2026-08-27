import React, { useMemo, useState } from 'react';
import { useGetRequests, useDeleteRequest, RequestStatus } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Link, useLocation } from 'wouter';
import { Search, Plus, Filter, Eye, AlertCircle, Trash2, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { cn } from '../../lib/utils';
import { isHrManager, isHrRole } from '../../lib/roles';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';

const OPEN_STATUS_SET = new Set(['submitted', 'reviewing', 'accepted', 'announced']);

export default function RequestsList() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isViewerOnly = user?.role === 'director';
  const canDelete = isHrRole(user?.role) || user?.role === 'director';
  const isHrLike = isHrManager(user?.role) || user?.role === 'director';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');

  const { data: requests, isLoading, refetch } = useGetRequests({
    search: search || undefined,
  });
  const { mutate: removeRequest, isPending: isDeleting } = useDeleteRequest();

  const filtered = useMemo(() => {
    const list = requests ?? [];
    if (statusFilter === 'open') {
      return list.filter((r) => OPEN_STATUS_SET.has(r.status));
    }
    if (statusFilter === 'all') return list;
    return list.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const counts = useMemo(() => {
    const all = requests ?? [];
    return {
      open: all.filter((r) => r.status !== 'closed').length,
      submitted: all.filter((r) => r.status === 'submitted').length,
      reviewing: all.filter((r) => r.status === 'reviewing').length,
      accepted: all.filter((r) => r.status === 'accepted').length,
      announced: all.filter((r) => r.status === 'announced').length,
      closed: all.filter((r) => r.status === 'closed').length,
    };
  }, [requests]);

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

  const handleDelete = (id: number) => {
    removeRequest(
      { id },
      {
        onSuccess: () => {
          toast({ title: "O'chirildi", description: "Ariza o'chirildi" });
          refetch();
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || "O'chirishda xatolik yuz berdi",
            variant: 'destructive',
          });
        },
      },
    );
  };

  const chips: { key: string; label: string; count: number }[] = [
    { key: 'open', label: 'Ochiq', count: counts.open },
    { key: 'submitted', label: 'Yangi', count: counts.submitted },
    { key: 'reviewing', label: "Ko'rib chiqilmoqda", count: counts.reviewing },
    { key: 'accepted', label: 'Qabul qilingan', count: counts.accepted },
    { key: 'announced', label: "E'lon qilingan", count: counts.announced },
    { key: 'closed', label: 'Yopilgan', count: counts.closed },
    { key: 'all', label: 'Barchasi', count: (requests ?? []).length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Arizalar</h1>
          <p className="text-muted-foreground mt-1">
            {isHrLike
              ? "Arizalar va nazorat — status, muddat va e'lon vaqtlari bilan"
              : "Kadrlar bo'yicha ehtiyojlar ro'yxati"}
          </p>
        </div>
        {!isViewerOnly && (
          <Link href="/requests/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Yangi Ariza
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setStatusFilter(chip.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              statusFilter === chip.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-white hover:bg-muted/60 text-foreground',
            )}
          >
            {chip.label}
            <span className={cn(
              'rounded-full px-1.5 text-xs font-semibold',
              statusFilter === chip.key ? 'bg-white/20' : 'bg-muted',
            )}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Lavozim yoki bo'lim bo'yicha qidirish..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="open">Ochiqlar</SelectItem>
                  <SelectItem value="all">Barcha statuslar</SelectItem>
                  <SelectItem value="submitted">Yangi</SelectItem>
                  <SelectItem value="reviewing">Ko'rib chiqilmoqda</SelectItem>
                  <SelectItem value="accepted">Qabul qilingan</SelectItem>
                  <SelectItem value="announced">E'lon qilingan</SelectItem>
                  <SelectItem value="closed">Yopilgan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b">
                <tr>
                  <th className="px-6 py-4 font-medium">ID / Sana</th>
                  <th className="px-6 py-4 font-medium">Bo'lim / Lavozim</th>
                  <th className="px-6 py-4 font-medium">Ariza bergan</th>
                  <th className="px-6 py-4 font-medium text-center">Soni</th>
                  <th className="px-6 py-4 font-medium">Prioritet</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Mas'ul</th>
                  {isHrLike && (
                    <>
                      <th className="px-4 py-4 font-medium">HR yuborgan</th>
                      <th className="px-4 py-4 font-medium">Rekruter qabul</th>
                      <th className="px-4 py-4 font-medium">E'lon tasdiqlangan</th>
                    </>
                  )}
                  <th className="px-6 py-4 font-medium text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={isHrLike ? 11 : 8} className="px-6 py-8 text-center text-muted-foreground">
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
                      <td className="px-6 py-4">
                        <div className="font-medium">#{request.id}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(request.createdAt), 'dd.MM.yyyy')}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-foreground">{request.position}</div>
                        <div className="text-sm text-muted-foreground">
                          {request.departmentName}
                          {[request.city, request.district].filter(Boolean).length
                            ? ` · ${[request.city, request.district].filter(Boolean).join(', ')}`
                            : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">{request.createdByName || '—'}</div>
                      </td>
                      <td className="px-6 py-4 text-center font-medium">
                        {request.count}
                      </td>
                      <td className="px-6 py-4">
                        {request.priority === 'urgent' ? (
                          <span className="flex items-center text-destructive text-xs font-medium">
                            <AlertCircle className="w-3 h-3 mr-1" /> Shoshilinch
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Odatdagi</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(request.status)}
                      </td>
                      <td className="px-6 py-4">
                        {request.assignedToName ? (
                          <div className="text-sm">{request.assignedToName}</div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Tayinlanmagan</span>
                        )}
                      </td>
                      {isHrLike && (
                        <>
                          <td className="px-4 py-4 text-xs whitespace-nowrap">
                            {request.vacancyAssignedAt || request.assignedAt
                              ? format(new Date(request.vacancyAssignedAt || request.assignedAt!), 'dd.MM.yyyy HH:mm')
                              : <span className="text-muted-foreground italic">—</span>}
                          </td>
                          <td className="px-4 py-4 text-xs whitespace-nowrap">
                            {request.vacancyAcceptedAt
                              ? format(new Date(request.vacancyAcceptedAt), 'dd.MM.yyyy HH:mm')
                              : <span className="text-muted-foreground italic">Kutilmoqda</span>}
                          </td>
                          <td className="px-4 py-4 text-xs whitespace-nowrap">
                            {request.vacancyPublishedAt
                              ? format(new Date(request.vacancyPublishedAt), 'dd.MM.yyyy HH:mm')
                              : <span className="text-muted-foreground italic">—</span>}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1">
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1 text-destructive hover:text-destructive"
                                  disabled={isDeleting}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span className="hidden sm:inline">O'chirish</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Arizani o'chirasizmi?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Ariza #{request.id} ({request.position}) va unga bog'liq ish o'rinlari/nomzodlar o'chiriladi. Bu amalni qaytarib bo'lmaydi.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(request.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    O'chirish
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {isHrLike && request.vacancyId && (
                            <Link href={`/vacancies/${request.vacancyId}`}>
                              <Button variant="ghost" size="sm" className="h-8 gap-1">
                                <Briefcase className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}
                          <Button variant="ghost" size="sm" className="h-8 gap-1 pointer-events-none">
                            <Eye className="w-4 h-4 text-primary" />
                            <span className="hidden sm:inline">Ko'rish</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isHrLike ? 11 : 8} className="px-6 py-8 text-center text-muted-foreground">
                      Hech qanday Ariza topilmadi.
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
