import React, { useMemo, useState } from 'react';
import {
  useGetVacancies,
  useUpdateVacancy,
  getGetVacanciesQueryKey,
  VacancyStatus,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Link, useLocation } from 'wouter';
import {
  Search,
  Plus,
  Filter,
  MapPin,
  DollarSign,
  Clock,
  Users,
  Share2,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { FaTelegram, FaInstagram, FaGlobe, FaFacebook } from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import { DeadlineCountdown } from '../../components/DeadlineCountdown';
import { sortByDeadlineAsc } from '../../lib/deadline-countdown';
import { useToast } from '../../hooks/use-toast';
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

export default function VacanciesList() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canCreate = isHrManager(user?.role);
  const canPublish = isHrManager(user?.role) || user?.role === 'recruiter';
  const canCloseRole =
    isHrRole(user?.role) ||
    user?.role === 'admin' ||
    user?.role === 'director' ||
    user?.role === 'recruiter';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [closingId, setClosingId] = useState<number | null>(null);

  const { data: vacancies, isLoading } = useGetVacancies({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });
  const closeMutation = useUpdateVacancy();

  const sortedVacancies = useMemo(() => {
    const list = vacancies ?? [];
    return sortByDeadlineAsc(list as Array<(typeof list)[number] & { deadline?: string | null }>);
  }, [vacancies]);

  const getStatusBadge = (status: VacancyStatus) => {
    switch (status) {
      case 'draft':
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
            Yangi
          </Badge>
        );
      case 'published':
        return (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
            Faol
          </Badge>
        );
      case 'closed':
        return (
          <Badge variant="secondary" className="bg-slate-800 text-white gap-1">
            <CheckCircle2 className="w-3 h-3" /> Bajarildi
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const canCloseVacancy = (vacancy: { status: string; recruiterId?: number | null }) => {
    if (!canCloseRole) return false;
    if (vacancy.status === 'closed' || vacancy.status === 'draft') return false;
    if (user?.role === 'recruiter') return vacancy.recruiterId === user.id;
    return true;
  };

  const handleClose = (id: number) => {
    setClosingId(id);
    closeMutation.mutate(
      { id, data: { status: 'closed' } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetVacanciesQueryKey() });
          toast({
            title: 'Bajarildi',
            description: "Ish o'rni yopildi — odam olindi",
          });
          setClosingId(null);
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || "Ish o'rinini yopib bo'lmadi",
            variant: 'destructive',
          });
          setClosingId(null);
        },
      },
    );
  };

  const getChannelIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('telegram')) return <FaTelegram className="text-blue-500 w-4 h-4" />;
    if (n.includes('instagram')) return <FaInstagram className="text-pink-500 w-4 h-4" />;
    if (n.includes('facebook')) return <FaFacebook className="text-blue-600 w-4 h-4" />;
    if (n.includes('veb') || n.includes('web') || n.includes('sayt')) return <FaGlobe className="text-gray-600 w-4 h-4" />;
    return <span className="font-bold text-xs bg-gray-200 rounded px-1">{name.substring(0, 2)}</span>;
  };

  const openVacancy = (id: number, publish = false) => {
    setLocation(publish ? `/vacancies/${id}?publish=1` : `/vacancies/${id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ish o'rinlari</h1>
          <p className="text-muted-foreground mt-1">E'lon qilingan va tayyorlanayotgan ish o'rinlari</p>
        </div>
        {canCreate && (
          <Link href="/vacancies/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Yangi ish o'rni
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Ish o'rni nomini qidiring..."
            className="pl-9 bg-gray-50 border-transparent focus-visible:bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-gray-50 border-transparent">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha statuslar</SelectItem>
              <SelectItem value="draft">Yangi</SelectItem>
              <SelectItem value="published">Faol</SelectItem>
              <SelectItem value="closed">Bajarildi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse bg-gray-100/50" />
          ))}
        </div>
      ) : sortedVacancies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedVacancies.map((vacancy) => (
            <Card
              key={vacancy.id}
              role="link"
              tabIndex={0}
              onClick={() => openVacancy(vacancy.id, vacancy.status === 'draft' && canPublish)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openVacancy(vacancy.id, vacancy.status === 'draft' && canPublish);
                }
              }}
              className={`group hover:shadow-md transition-all flex flex-col border-t-4 cursor-pointer ${
                vacancy.status === 'closed'
                  ? 'border-t-slate-400 opacity-90'
                  : 'border-t-transparent hover:border-t-primary'
              }`}
            >
              <CardContent className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4 gap-2">
                  {getStatusBadge(vacancy.status)}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(vacancy.createdAt), 'dd.MM.yyyy')}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
                  {vacancy.title}
                </h3>
                {(vacancy as any).recruiterName && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Rekruter:{' '}
                    <span className="font-medium text-foreground">{(vacancy as any).recruiterName}</span>
                  </p>
                )}
                {(vacancy as any).deadline && vacancy.status !== 'closed' && (
                  <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                    <DeadlineCountdown
                      deadline={(vacancy as any).deadline}
                      showDate
                      className="w-full"
                    />
                  </div>
                )}

                <div className="space-y-2 mt-auto mb-4">
                  {vacancy.location && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 mr-2 shrink-0" />
                      <span className="truncate">{vacancy.location}</span>
                    </div>
                  )}
                  {vacancy.salaryRange && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <DollarSign className="w-4 h-4 mr-2 shrink-0" />
                      <span className="truncate">{vacancy.salaryRange}</span>
                    </div>
                  )}
                  {vacancy.schedule && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 mr-2 shrink-0" />
                      <span className="truncate">{vacancy.schedule}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t mt-auto flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {vacancy.channels && vacancy.channels.length > 0 ? (
                      <div className="flex -space-x-2">
                        {vacancy.channels.map((ch, i) => (
                          <div
                            key={i}
                            className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm"
                            title={ch.channelName}
                          >
                            {getChannelIcon(ch.channelName)}
                          </div>
                        ))}
                      </div>
                    ) : vacancy.status === 'draft' && canPublish ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <Share2 className="w-3.5 h-3.5" /> Qabul qilish uchun bosing
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Kanallar yo'q</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-sm font-medium shrink-0">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>{vacancy.candidatesCount || 0}</span>
                  </div>
                </div>

                {canCloseVacancy(vacancy) && (
                  <div
                    className="mt-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 border-slate-300 text-slate-800 hover:bg-slate-900 hover:text-white"
                          disabled={closingId === vacancy.id && closeMutation.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {closingId === vacancy.id && closeMutation.isPending
                            ? 'Yopilmoqda...'
                            : "Ish o'rinini yopish"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Ish o‘rinini yopish?</AlertDialogTitle>
                          <AlertDialogDescription>
                            «{vacancy.title}» — odam olindi deb belgilansin. Status{' '}
                            <strong>Bajarildi</strong> bo‘ladi.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Bekor</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleClose(vacancy.id)}>
                            Ha, yopish
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-lg border">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">Ish o'rinlari topilmadi</h3>
          <p className="text-gray-500 mt-1">
            Hozircha tizimda ish o'rinlari mavjud emas yoki qidiruvga mos kelmadi.
          </p>
          {canCreate && (
            <Link href="/vacancies/new">
              <Button className="mt-4">Yangi qo'shish</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
