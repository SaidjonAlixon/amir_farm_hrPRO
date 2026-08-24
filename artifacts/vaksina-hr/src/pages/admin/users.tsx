import React, { useMemo, useState } from 'react';
import {
  useGetUsers,
  useGetDepartments,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getGetUsersQueryKey,
  type User,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Copy, Check, Eye, EyeOff, Trash2, UserPlus, FileSpreadsheet, Loader2, Pencil, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { PhoneInput } from '../../components/ui/phone-input';
import {
  isOptionalUzPhoneValid,
  normalizeUzPhone,
  UZ_PHONE_HINT,
} from '../../lib/phone';
import { userRoleLabel } from '../../lib/roles';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'hr_direktor', label: 'HR Direktor' },
  { value: 'hr_auditor', label: 'HR Auditor' },
  { value: 'hr_menejer', label: 'HR Menejer' },
  { value: 'recruiter', label: 'Rekruter' },
  { value: 'trainer', label: 'Trener' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'director', label: 'Direktor' },
  { value: 'department_head', label: "Bo'lim boshlig'i" },
  { value: 'mudir', label: 'Mudir' },
  { value: 'koordinator', label: 'Koordinator' },
  { value: 'texnik', label: 'Texnik' },
  { value: 'ombor', label: 'Ombor' },
  { value: 'sb', label: 'SB operatori' },
  { value: 'sb_boshliq', label: "SB bo‘limi boshlig‘i" },
  { value: 'farmasevt', label: 'Farmasevt' },
  { value: 'stajyor', label: 'Stajyor' },
  { value: 'moliya', label: 'Moliyachi' },
] as const;

const STATUSES = [
  { value: 'active', label: 'Faol' },
  { value: 'vacant', label: "Bo‘sh" },
  { value: 'terminated', label: 'Tugatilgan' },
  { value: 'on_leave', label: 'Tatilda' },
] as const;

function normalizeUserStatus(status?: string | null) {
  if (status === 'inactive' || status === 'blocked') return 'vacant';
  if (STATUSES.some((s) => s.value === status)) return status as (typeof STATUSES)[number]['value'];
  return 'active';
}

function statusLabel(status?: string | null) {
  const key = normalizeUserStatus(status);
  return STATUSES.find((s) => s.value === key)?.label || 'Faol';
}

function statusClass(status?: string | null) {
  const key = normalizeUserStatus(status);
  if (key === 'active') return 'bg-emerald-100 text-emerald-800';
  if (key === 'on_leave') return 'bg-amber-100 text-amber-900';
  if (key === 'terminated') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}

type CreatedCredentials = {
  fullName: string;
  role: string;
  login: string;
  temporaryPassword: string;
};

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [credsOpen, setCredsOpen] = useState(false);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);
  const [showPwd, setShowPwd] = useState(true);
  const [copied, setCopied] = useState<'login' | 'password' | 'both' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('recruiter');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('none');
  const [status, setStatus] = useState('active');

  const { data: users, isLoading } = useGetUsers({
    search: search || undefined,
    role: roleFilter !== 'all' ? roleFilter : undefined,
  });
  const { data: departments } = useGetDepartments();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const isAdmin = me?.role === 'admin';

  const sorted = useMemo(() => {
    return [...(users ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));
  }, [users]);

  const onExportExcel = async () => {
    if (!isAdmin || exporting) return;
    setExporting(true);
    try {
      const res = await fetch('/api/users/export', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Excel yuklanmadi');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `foydalanuvchilar_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Excel yuklandi', description: 'Login va parollar bilan to‘liq ro‘yxat' });
    } catch (err: any) {
      toast({
        title: 'Xatolik',
        description: err?.message || 'Export amalga oshmadi',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setRole('recruiter');
    setPhone('');
    setDepartmentId('none');
    setStatus('active');
    setEditing(null);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setFullName(u.fullName);
    // Eski «hr» roli ro‘yxatdan olib tashlangan — tahrirda HR Menejer
    setRole(u.role === 'hr' ? 'hr_menejer' : u.role);
    setPhone(u.phone || '');
    setDepartmentId(u.departmentId != null ? String(u.departmentId) : 'none');
    setStatus(normalizeUserStatus(u.status));
    setEditOpen(true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast({ title: 'Ruxsat yo‘q', description: 'Faqat admin yaratishi mumkin', variant: 'destructive' });
      return;
    }
    if (!fullName.trim() || fullName.trim().split(/\s+/).length < 2) {
      toast({ title: 'Xatolik', description: 'Ism va familiyani to‘liq yozing', variant: 'destructive' });
      return;
    }
    if (!role) {
      toast({ title: 'Xatolik', description: 'Rolni tanlang', variant: 'destructive' });
      return;
    }
    if (!isOptionalUzPhoneValid(phone)) {
      toast({
        title: 'Telefon noto‘g‘ri',
        description: UZ_PHONE_HINT,
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate(
      {
        data: {
          fullName: fullName.trim(),
          role,
          phone: normalizeUzPhone(phone) || undefined,
          departmentId: departmentId === 'none' ? null : Number(departmentId),
        } as any,
      },
      {
        onSuccess: (data: any) => {
          invalidate();
          setCreateOpen(false);
          resetForm();
          setCreated({
            fullName: data.fullName,
            role: data.role,
            login: data.login,
            temporaryPassword: data.temporaryPassword || '',
          });
          setShowPwd(true);
          setCopied(null);
          setCredsOpen(true);
          toast({ title: 'Yaratildi', description: 'Login va parol tayyor' });
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || 'Foydalanuvchi yaratilmadi',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const onUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editing) return;
    if (!fullName.trim() || fullName.trim().split(/\s+/).length < 2) {
      toast({ title: 'Xatolik', description: 'Ism va familiyani to‘liq yozing', variant: 'destructive' });
      return;
    }
    if (!role) {
      toast({ title: 'Xatolik', description: 'Rolni tanlang', variant: 'destructive' });
      return;
    }
    if (!isOptionalUzPhoneValid(phone)) {
      toast({
        title: 'Telefon noto‘g‘ri',
        description: UZ_PHONE_HINT,
        variant: 'destructive',
      });
      return;
    }

    updateMutation.mutate(
      {
        id: editing.id,
        data: {
          fullName: fullName.trim(),
          role,
          phone: normalizeUzPhone(phone) || null,
          departmentId: departmentId === 'none' ? null : Number(departmentId),
          status,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setEditOpen(false);
          resetForm();
          toast({ title: 'Saqlandi', description: 'Foydalanuvchi yangilandi' });
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || 'Saqlanmadi',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const copyText = async (text: string, kind: 'login' | 'password' | 'both') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast({ title: 'Nusxa olindi' });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: 'Nusxa olinmadi', variant: 'destructive' });
    }
  };

  const setUserStatus = (u: User, next: string) => {
    if (!isAdmin) return;
    if (u.id === me?.id && next !== 'active') {
      toast({ title: 'O‘zingizni faoldan chiqara olmaysiz', variant: 'destructive' });
      return;
    }
    const current = normalizeUserStatus(u.status);
    if (current === next) return;
    updateMutation.mutate(
      { id: u.id, data: { status: next } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: 'Holat yangilandi', description: statusLabel(next) });
        },
        onError: (err: any) => {
          toast({ title: 'Xatolik', description: err?.message || 'Holat saqlanmadi', variant: 'destructive' });
        },
      },
    );
  };

  const onRegenerateLogin = async (u: User) => {
    if (!isAdmin) return;
    if (u.id === me?.id) {
      toast({ title: 'O‘zingizning loginni shu yerda yangilay olmaysiz', variant: 'destructive' });
      return;
    }
    const ok = window.confirm(
      `${u.fullName} uchun yangi login va parol yaratilsinmi?\nEski login/parol ishlamay qoladi.`,
    );
    if (!ok) return;
    setRegeneratingId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}/regenerate-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Yaratilmadi');
      }
      invalidate();
      setCreated({
        fullName: data.fullName,
        role: data.role,
        login: data.login,
        temporaryPassword: data.temporaryPassword || '',
      });
      setShowPwd(true);
      setCopied(null);
      setCredsOpen(true);
      toast({ title: 'Yangi login va parol', description: 'Foydalanuvchiga bering — eski kirish yopildi' });
    } catch (err: any) {
      toast({
        title: 'Xatolik',
        description: err?.message || 'Login/parol yaratilmadi',
        variant: 'destructive',
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const onDelete = (u: User) => {
    if (!isAdmin) return;
    if (u.id === me?.id) {
      toast({ title: 'O‘zingizni o‘chira olmaysiz', variant: 'destructive' });
      return;
    }
    if (!window.confirm(`${u.fullName} ni o‘chirasizmi?`)) return;
    deleteMutation.mutate(
      { id: u.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: 'O‘chirildi' });
        },
        onError: (err: any) => {
          toast({ title: 'Xatolik', description: err?.message || 'O‘chirilmadi', variant: 'destructive' });
        },
      },
    );
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">Foydalanuvchilar</h1>
        <p className="mt-2 text-muted-foreground">Bu bo‘lim faqat admin uchun.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Foydalanuvchilar</h1>
          <p className="mt-1 text-muted-foreground">
            Rol bo‘yicha login va parol avtomatik yaratiladi
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={exporting || !sorted.length}
            onClick={() => void onExportExcel()}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
            )}
            Excel export
          </Button>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Yangi foydalanuvchi
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism bo‘yicha qidirish..."
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Barcha rollar</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Ro‘yxat {sorted.length ? `(${sorted.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Foydalanuvchi</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Login</th>
                  <th className="px-4 py-3 font-medium">Bo‘lim</th>
                  <th className="px-4 py-3 font-medium">Holat</th>
                  <th className="px-4 py-3 font-medium text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Yuklanmoqda...
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Foydalanuvchi topilmadi
                    </td>
                  </tr>
                ) : (
                  sorted.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.fullName}</div>
                        {u.phone && <div className="text-xs text-muted-foreground">{u.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{userRoleLabel(u.role) || u.role}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{u.login}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.departmentName || '—'}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={normalizeUserStatus(u.status)}
                          onValueChange={(v) => setUserStatus(u, v)}
                          disabled={u.id === me?.id}
                        >
                          <SelectTrigger
                            className={cn(
                              'h-8 w-[132px] rounded-full border-0 px-2.5 text-xs font-semibold shadow-none focus:ring-0',
                              statusClass(u.status),
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(u)}
                            title="Tahrirlash"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void onRegenerateLogin(u)}
                            disabled={u.id === me?.id || regeneratingId === u.id}
                            title="Yangi login va parol"
                          >
                            {regeneratingId === u.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <KeyRound className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDelete(u)}
                            disabled={u.id === me?.id}
                            title="O‘chirish"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle>Yangi foydalanuvchi</DialogTitle>
            <DialogDescription>
              Ism-familiya va rolni tanlang — login va parol avtomatik beriladi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="flex max-h-[min(70vh,32rem)] flex-col">
            <div className="space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-fullName">Ism familiya *</Label>
                <Input
                  id="create-fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Masalan: Aziza Karimova"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Rol *</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Rolni tanlang" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100]">
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Telefon (ixtiyoriy)</Label>
                <PhoneInput value={phone} onChange={setPhone} />
                <p className="text-xs text-muted-foreground">{UZ_PHONE_HINT}</p>
              </div>
              <div className="space-y-2">
                <Label>Bo‘lim (ixtiyoriy)</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Bo‘lim" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100]">
                    <SelectItem value="none">Belgilanmagan</SelectItem>
                    {(departments ?? []).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 border-t bg-muted/30 px-5 py-3 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                <Plus className="h-4 w-4" />
                {createMutation.isPending ? 'Yaratilmoqda...' : 'Yaratish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle>Foydalanuvchini tahrirlash</DialogTitle>
            <DialogDescription>
              {editing?.login ? (
                <>
                  Login: <span className="font-mono font-medium text-foreground">{editing.login}</span>
                </>
              ) : (
                'Ism, rol, telefon va bo‘limni o‘zgartiring.'
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onUpdate} className="flex max-h-[min(70vh,36rem)] flex-col">
            <div className="space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-fullName">Ism familiya *</Label>
                <Input
                  id="edit-fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Masalan: Aziza Karimova"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Rol *</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Rolni tanlang" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100]">
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Telefon (ixtiyoriy)</Label>
                <PhoneInput value={phone} onChange={setPhone} />
                <p className="text-xs text-muted-foreground">{UZ_PHONE_HINT}</p>
              </div>
              <div className="space-y-2">
                <Label>Bo‘lim (ixtiyoriy)</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Bo‘lim" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100]">
                    <SelectItem value="none">Belgilanmagan</SelectItem>
                    {(departments ?? []).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Holat</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Holat" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100]">
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 border-t bg-muted/30 px-5 py-3 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
                <Pencil className="h-4 w-4" />
                {updateMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Credentials dialog */}
      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi login va parol</DialogTitle>
            <DialogDescription>
              {created?.fullName} ({userRoleLabel(created?.role || '') || created?.role}) uchun
              kirish ma’lumotlari. Parol faqat hozir ko‘rsatiladi — foydalanuvchiga bering.
            </DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Login</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-semibold">{created.login}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => copyText(created.login, 'login')}
                  >
                    {copied === 'login' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Nusxa
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Parol</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-semibold tracking-wide">
                    {showPwd ? created.temporaryPassword : '••••••••'}
                  </code>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setShowPwd((v) => !v)}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      onClick={() => copyText(created.temporaryPassword, 'password')}
                    >
                      {copied === 'password' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      Nusxa
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full gap-2"
                onClick={() =>
                  copyText(
                    `Login: ${created.login}\nParol: ${created.temporaryPassword}`,
                    'both',
                  )
                }
              >
                {copied === 'both' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Ikkalasini nusxalash
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredsOpen(false)}>Yopish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
