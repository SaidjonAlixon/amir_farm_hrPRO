import React, { useEffect, useState } from 'react';
import {
  useGetCandidate,
  useGetOffers,
  useGetDepartments,
  useGetUsers,
  useGetEmployees,
  useCreateEmployee,
  useCreateInternship,
  useUpdateInternship,
  ChecklistItem,
} from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { Skeleton } from '../../components/ui/skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { CandidateReadOnlyBanner } from '../../components/candidates/CandidateReadOnlyBanner';
import { canManageCandidate } from '../../lib/candidate-access';

const DEFAULT_TASKS: ChecklistItem[] = [
  { label: 'Ish joyi bilan tanishish', completed: false },
  { label: 'Asosiy vazifalarni bajarish', completed: false },
  { label: 'Jamoa bilan ishlash', completed: false },
  { label: 'Hisobot topshirish', completed: false },
];

export default function InternshipPage({ params }: { params: { id: string } }) {
  const candidateId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: candidate, isLoading } = useGetCandidate(candidateId, { query: { enabled: !!candidateId } });
  const { data: offers } = useGetOffers({ candidateId });
  const { data: departments } = useGetDepartments();
  const { data: trainers } = useGetUsers({ role: 'trainer' });
  const { data: employees } = useGetEmployees();
  const createEmployee = useCreateEmployee();
  const createInternship = useCreateInternship();
  const updateInternship = useUpdateInternship();
  const canEdit = canManageCandidate(user, candidate?.recruiterId);

  const offer = offers?.[0];
  const existingEmployee = (employees ?? []).find((e) => e.candidateId === candidateId);

  const [departmentId, setDepartmentId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [internshipId, setInternshipId] = useState<number | null>(null);

  useEffect(() => {
    if (departments?.length && !departmentId) setDepartmentId(String(departments[0].id));
  }, [departments, departmentId]);

  const isPending = createEmployee.isPending || createInternship.isPending || updateInternship.isPending;

  const startInternship = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    if (!departmentId) {
      toast({ title: 'Xatolik', description: "Bo'limni tanlang", variant: 'destructive' });
      return;
    }

    const start = () => {
      const empId = existingEmployee?.id;
      if (!empId) return;
      createInternship.mutate(
        {
          data: {
            employeeId: empId,
            trainerId: trainerId ? Number(trainerId) : undefined,
            startDate,
            endDate: endDate || undefined,
            tasks,
          },
        },
        {
          onSuccess: (created) => {
            setInternshipId(created.id);
            toast({ title: 'Stajirovka boshlandi', description: 'Vazifalarni belgilab yakunlang' });
          },
          onError: () => toast({ title: 'Xatolik', description: 'Stajirovka yaratilmadi', variant: 'destructive' }),
        },
      );
    };

    if (existingEmployee) {
      start();
      return;
    }

    createEmployee.mutate(
      {
        data: {
          fullName: candidate.fullName,
          position: offer?.position || candidate.vacancyTitle || 'Xodim',
          departmentId: Number(departmentId),
          hiredAt: startDate,
          candidateId,
        },
      },
      {
        onSuccess: (emp) => {
          createInternship.mutate(
            {
              data: {
                employeeId: emp.id,
                trainerId: trainerId ? Number(trainerId) : undefined,
                startDate,
                endDate: endDate || undefined,
                tasks,
              },
            },
            {
              onSuccess: (created) => {
                setInternshipId(created.id);
                toast({ title: 'Stajirovka boshlandi' });
              },
              onError: () => toast({ title: 'Xatolik', description: 'Stajirovka yaratilmadi', variant: 'destructive' }),
            },
          );
        },
        onError: () => toast({ title: 'Xatolik', description: 'Xodim yaratilmadi', variant: 'destructive' }),
      },
    );
  };

  const completeInternship = () => {
    if (!internshipId) {
      toast({ title: 'Xatolik', description: 'Avval stajirovkani boshlang', variant: 'destructive' });
      return;
    }
    updateInternship.mutate(
      {
        id: internshipId,
        data: { tasks, status: 'completed', endDate: endDate || new Date().toISOString().slice(0, 10) },
      },
      {
        onSuccess: () => {
          toast({ title: 'Stajirovka yakunlandi', description: 'Nomzod ishga qabul qilindi' });
          setLocation(`/candidates/${candidateId}`);
        },
        onError: () => toast({ title: 'Xatolik', description: 'Yakunlashda xato', variant: 'destructive' }),
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
          <h1 className="text-3xl font-bold tracking-tight">Stajirovka</h1>
          <p className="text-muted-foreground mt-1">{candidate.fullName}</p>
        </div>
      </div>

      {!internshipId ? (
        <fieldset disabled={!canEdit} className="disabled:opacity-80">
        <form onSubmit={startInternship} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Stajirovkani boshlash</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bo'lim *</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    {(departments ?? []).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trener</Label>
                <Select value={trainerId} onValueChange={setTrainerId}>
                  <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    {(trainers ?? []).filter((u) => u.status === 'active').map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Boshlanish *</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tugash (reja)</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || !canEdit}>{isPending ? '...' : 'Boshlash'}</Button>
          </div>
        </form>
        </fieldset>
      ) : (
        <Card>
          <CardHeader><CardTitle>Stajirovka vazifalari</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {tasks.map((task, index) => (
              <label key={task.label} className="flex items-start gap-3 p-3 rounded-md border cursor-pointer">
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={() =>
                    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, completed: !t.completed } : t)))
                  }
                />
                <span>{task.label}</span>
              </label>
            ))}
            <Button className="w-full mt-4" onClick={completeInternship} disabled={isPending || !canEdit}>
              Stajirovkani yakunlash → Ishga qabul
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
