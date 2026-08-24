import React, { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useLocation } from 'wouter';
import {
  Users,
  Briefcase,
  FileText,
  LayoutDashboard,
  Calendar,
  LogOut,
  Bell,
  Settings,
  Menu,
  X,
  GraduationCap,
  Store,
  Kanban,
  ListTodo,
  ClipboardList,
  ClipboardCheck,
  AlarmClock,
  MessageCircle,
  Network,
  ScanFace,
  ChevronDown,
  Pin,
  Video,
  Trophy,
  BarChart3,
  Banknote,
  Calculator,
  MapPin,
} from 'lucide-react';
import {
  useLogout,
  useGetNotifications,
  useGetRequests,
  useGetVacancies,
  useGetDashboardStats,
  getGetNotificationsQueryKey,
  getGetDashboardStatsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffingAlerts } from '@/lib/staffing-api';
import { cn } from '@/lib/utils';
import { DavomatAttendanceBanner } from '@/components/DavomatAttendanceBanner';
import { FaceIdEnroll } from '@/components/FaceIdEnroll';
import { updateMyProfile } from '@/lib/face-id';
import { isHrManager, isHrRole, isStajyor, canSeeHrRecruitment, isHrRecruitmentPath } from '@/lib/roles';
import { useTelegramMiniAppChrome } from '@/pages/tg-entry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

type NavItem = {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  accent: string;
  line: string;
  chip: string;
};

const NAV_SECTIONS: {
  id: string;
  label: string;
  accent: string;
  line: string;
  chip: string;
  paths: string[];
}[] = [
  {
    id: 'main',
    label: 'Asosiy',
    accent: 'bg-sky-400',
    line: 'border-sky-400/55',
    chip: 'text-sky-300',
    paths: ['/dashboard', '/kirish', '/chat', '/tashkiliy-tuzilma', '/oylik', '/hisobkitob', '/reyting'],
  },
  {
    id: 'work',
    label: 'Mening ishim',
    accent: 'bg-amber-400',
    line: 'border-amber-400/55',
    chip: 'text-amber-300',
    paths: ['/vazifalar', '/eslatmalar'],
  },
  {
    id: 'hr',
    label: 'HR va kadrlar',
    accent: 'bg-indigo-400',
    line: 'border-indigo-400/55',
    chip: 'text-indigo-300',
    paths: [
      '/requests',
      '/vacancies',
      '/candidates',
      '/interviews',
      '/pipeline',
      '/internships',
      '/employees',
    ],
  },
  {
    id: 'attendance',
    label: 'Davomat',
    accent: 'bg-teal-400',
    line: 'border-teal-400/55',
    chip: 'text-teal-300',
    paths: ['/davomat-face', '/davomat', '/davomat-uzoq', '/smena-filial', '/checklist-holati'],
  },
  {
    id: 'pharmacy',
    label: "Apteka tarmog'i",
    accent: 'bg-emerald-400',
    line: 'border-emerald-400/55',
    chip: 'text-emerald-300',
    paths: ['/pharmacy-network', '/checklist', '/ehtiyoj'],
  },
  {
    id: 'admin',
    label: 'Sozlamalar',
    accent: 'bg-rose-400',
    line: 'border-rose-400/55',
    chip: 'text-rose-300',
    paths: ['/admin/users', '/admin/holat', '/admin/departments', '/admin/kirish-videolar', '/admin/faces'],
  },
];

function groupNavItems(items: NavItem[]): NavSection[] {
  const byPath = new Map(items.map((item) => [item.path, item]));
  const used = new Set<string>();
  const groups: NavSection[] = [];
  for (const sec of NAV_SECTIONS) {
    const list = sec.paths
      .map((path) => byPath.get(path))
      .filter((item): item is NavItem => !!item);
    if (!list.length) continue;
    groups.push({
      id: sec.id,
      label: sec.label,
      accent: sec.accent,
      line: sec.line,
      chip: sec.chip,
      items: list,
    });
    for (const item of list) used.add(item.path);
  }
  const rest = items.filter((item) => !used.has(item.path));
  if (rest.length) {
    groups.push({
      id: 'other',
      label: 'Boshqa',
      accent: 'bg-slate-400',
      line: 'border-slate-400/55',
      chip: 'text-slate-300',
      items: rest,
    });
  }
  return groups;
}

function pathIsActive(location: string, path: string) {
  return location === path || location.startsWith(`${path}/`);
}

/** Map notification linkUrl → sidebar path */
function linkToNavPath(linkUrl?: string | null): string | null {
  if (!linkUrl) return null;
  const path = linkUrl.split('?')[0];

  if (path.startsWith('/requests') || path.startsWith('/nazorat')) return '/requests';
  if (path.startsWith('/vacancies')) return '/vacancies';
  if (path.startsWith('/employees')) return '/employees';
  if (path.startsWith('/smena-filial')) return '/smena-filial';
  if (path.startsWith('/davomat-face')) return '/davomat-face';
  if (path.startsWith('/davomat-uzoq')) return '/davomat-uzoq';
  if (path.startsWith('/davomat')) return '/davomat';
  if (path.startsWith('/checklist-holati')) return '/checklist-holati';
  if (path.startsWith('/internships')) return '/internships';
  if (path.startsWith('/pharmacy-network')) return '/pharmacy-network';
  if (path.startsWith('/tashkiliy-tuzilma')) return '/tashkiliy-tuzilma';
  if (path.startsWith('/ehtiyoj')) return '/ehtiyoj';
  if (path.startsWith('/pipeline')) return '/pipeline';
  if (path.startsWith('/vazifalar')) return '/vazifalar';
  if (path.startsWith('/eslatmalar')) return '/eslatmalar';
  if (path.startsWith('/chat')) return '/chat';
  if (path.startsWith('/kirish')) return '/kirish';
  if (path.startsWith('/interviews')) return '/interviews';
  if (path.startsWith('/admin/users')) return '/admin/users';
  if (path.startsWith('/admin/holat')) return '/admin/holat';
  if (path.startsWith('/admin/faces')) return '/admin/faces';
  if (path.startsWith('/admin/departments')) return '/admin/departments';
  if (path.startsWith('/admin/kirish-videolar')) return '/admin/kirish-videolar';
  if (path.startsWith('/dashboard')) return '/dashboard';

  if (
    path.includes('interview') ||
    path.includes('preboarding') ||
    path.includes('final-decision') ||
    path.includes('/offer')
  ) {
    return '/interviews';
  }
  if (path.startsWith('/candidates')) return '/candidates';

  return null;
}

function NavBadge({
  count,
  collapsed,
  pulse,
}: {
  count: number;
  collapsed?: boolean;
  pulse?: boolean;
}) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-red-500 text-white font-semibold leading-none',
        pulse && 'animate-pulse ring-2 ring-red-300/80',
        collapsed
          ? 'absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px]'
          : 'ml-auto min-w-[20px] h-5 px-1.5 text-[11px]',
      )}
    >
      {label}
    </span>
  );
}

export const Layout = ({ children }: { children: React.ReactNode }) => {
  useTelegramMiniAppChrome();
  const { user, isAuthenticated, isLoading, setUser } = useAuth();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const queryClient = useQueryClient();
  /** Mobil: drawer ochiq/yopiq. Desktop: kengaytirilgan/icon-only. */
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = React.useState(false);
  const [openSectionId, setOpenSectionId] = React.useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('vaksina-nav-pins');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const markedPathsRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  const [facePhotoUrl, setFacePhotoUrl] = React.useState<string | null>(null);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [profileFirst, setProfileFirst] = React.useState('');
  const [profileLast, setProfileLast] = React.useState('');
  const [profilePassword, setProfilePassword] = React.useState('');
  const [profilePassword2, setProfilePassword2] = React.useState('');
  const [profileSaving, setProfileSaving] = React.useState(false);

  const onFaceStatusChange = React.useCallback(
    (status: { registered: boolean; photoUrl?: string | null }) => {
      setFacePhotoUrl(status.photoUrl ?? null);
    },
    [],
  );

  const openProfileEditor = () => {
    const parts = splitFullName(user?.fullName || '');
    setProfileFirst(parts.first);
    setProfileLast(parts.last);
    setProfilePassword('');
    setProfilePassword2('');
    setProfileOpen(true);
  };

  const saveProfile = async () => {
    if (!profileFirst.trim() || !profileLast.trim()) {
      toast({ title: 'Ism va familiyani kiriting', variant: 'destructive' });
      return;
    }
    if (!profilePassword.trim()) {
      toast({ title: 'Yangi parolni kiriting', variant: 'destructive' });
      return;
    }
    if (profilePassword !== profilePassword2) {
      toast({ title: 'Parollar mos kelmadi', variant: 'destructive' });
      return;
    }
    setProfileSaving(true);
    try {
      const res = await updateMyProfile({
        firstName: profileFirst.trim(),
        lastName: profileLast.trim(),
        password: profilePassword.trim(),
      });
      if (res.user && user) {
        setUser({
          ...user,
          fullName: res.user.fullName,
          id: res.user.id,
          role: (res.user.role as typeof user.role) || user.role,
        });
      }
      setProfileOpen(false);
      toast({
        title: 'Saqlandi',
        description: 'Ism/familiya va yangi parol bazaga yozildi (Excelda ham shu chiqadi)',
      });
    } catch (err: unknown) {
      toast({
        title: 'Saqlanmadi',
        description: err instanceof Error ? err.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  // Sahifa o‘zgaganda mobil menyuni yopish
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    const sec = NAV_SECTIONS.find((s) => s.paths.some((p) => pathIsActive(location, p)));
    if (sec) setOpenSectionId(sec.id);
  }, [location]);

  useEffect(() => {
    try {
      localStorage.setItem('vaksina-nav-pins', JSON.stringify(pinnedIds));
    } catch {
      /* ignore */
    }
  }, [pinnedIds]);

  // Mobil menyu ochiq bo‘lsa body scrollni bloklash
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const isHrLike = isHrRole(user?.role) || user?.role === 'admin' || user?.role === 'director';
  const isRecruiter = user?.role === 'recruiter';
  const isPharmacyStaff = user?.role === 'koordinator' || user?.role === 'mudir';

  const { data: unreadNotifications } = useGetNotifications(
    { unreadOnly: true },
    {
      query: {
        enabled: !!user,
        staleTime: 45_000,
        refetchInterval: 90_000,
        refetchOnWindowFocus: false,
      },
    } as any,
  );

  // Badge uchun — og‘ir so‘rovlarni kam poll qilamiz (RealtimeSync yetarli)
  const { data: dashboardStats } = useGetDashboardStats({
    query: {
      enabled: !!user,
      staleTime: 60_000,
      refetchInterval: 120_000,
      refetchOnWindowFocus: false,
    },
  } as any);

  const { data: staffingAlerts } = useStaffingAlerts('open', {
    enabled: !!user && isPharmacyStaff,
    staleTime: 60_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: false,
  });

  const { data: requests } = useGetRequests(undefined, {
    query: {
      enabled: !!user && isHrLike,
      staleTime: 60_000,
      refetchInterval: 120_000,
      refetchOnWindowFocus: false,
    },
  } as any);

  const { data: draftVacancies } = useGetVacancies(
    { status: 'draft' },
    {
      query: {
        enabled: !!user && (isRecruiter || isHrManager(user?.role)),
        staleTime: 60_000,
        refetchInterval: 120_000,
        refetchOnWindowFocus: false,
      },
    } as any,
  );

  // Bo'limga kirganda shu bo'limga bog'liq bildirishnomalarni o'qilgan qilish
  useEffect(() => {
    if (!user || !unreadNotifications?.length) return;

    // Bildirishnomalar sahifasida hammasini o'qilgan qilish
    if (location.startsWith('/notifications')) {
      const ids = unreadNotifications.map((n) => n.id);
      const markKey = `all:${ids.slice().sort((a, b) => a - b).join(',')}`;
      if (markedPathsRef.current.has(markKey)) return;
      markedPathsRef.current.add(markKey);
      void fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
        .then((res) => {
          if (!res.ok) {
            markedPathsRef.current.delete(markKey);
            return;
          }
          queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetNotificationsQueryKey({ unreadOnly: true }),
          });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        })
        .catch(() => {
          markedPathsRef.current.delete(markKey);
        });
      return;
    }

    const currentNav = linkToNavPath(location);
    if (!currentNav) return;

    const ids = unreadNotifications
      .filter((n) => linkToNavPath(n.linkUrl) === currentNav)
      .map((n) => n.id);
    if (ids.length === 0) return;

    const markKey = `${currentNav}:${ids.slice().sort((a, b) => a - b).join(',')}`;
    if (markedPathsRef.current.has(markKey)) return;
    markedPathsRef.current.add(markKey);

    void fetch('/api/notifications/read-many', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
      .then((res) => {
        if (!res.ok) {
          markedPathsRef.current.delete(markKey);
          return;
        }
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetNotificationsQueryKey({ unreadOnly: true }),
        });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      })
      .catch(() => {
        markedPathsRef.current.delete(markKey);
      });
  }, [location, unreadNotifications, user, queryClient]);

  const badgeByPath = useMemo(() => {
    const counts: Record<string, number> = {};

    // Bildirishnomalar — Arizalar/Ish o'rinlaridan tashqari
    for (const n of unreadNotifications ?? []) {
      const navPath = linkToNavPath(n.linkUrl);
      if (!navPath || navPath === '/requests' || navPath === '/vacancies') {
        continue;
      }
      // Aptekalar badge — ochiq ogohlantirish/ariza soni (koordinator/mudir)
      if (navPath === '/pharmacy-network' && isPharmacyStaff) continue;
      counts[navPath] = (counts[navPath] ?? 0) + 1;
    }

    // Koordinator/mudir: ochiq ogohlantirishlar + ariza jarayonidagilar yig‘ilib turadi
    if (isPharmacyStaff) {
      const openCount = staffingAlerts?.length ?? 0;
      if (openCount > 0) counts['/pharmacy-network'] = openCount;
    }

    // Arizalar (eski Nazorat ham shu yerda): Yangi + Ko'rib chiqilmoqda
    if (isHrLike && requests) {
      const pendingHr = requests.filter(
        (r) => r.status === 'submitted' || r.status === 'reviewing',
      ).length;
      if (pendingHr > 0) counts['/requests'] = pendingHr;
    }

    // Ish o'rinlari: qabul qilinmagan (draft) — yangi ish o'rinlari
    const draftCount = draftVacancies?.length ?? 0;
    if (draftCount > 0) counts['/vacancies'] = draftCount;

    return counts;
  }, [unreadNotifications, requests, isHrLike, draftVacancies, isPharmacyStaff, staffingAlerts]);

  const totalUnread =
    dashboardStats?.unreadNotifications ??
    unreadNotifications?.length ??
    0;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      setLocation('/login');
      return;
    }
    if (
      isStajyor(user.role) &&
      !location.startsWith('/kirish') &&
      !location.startsWith('/tashkiliy-tuzilma') &&
      !location.startsWith('/davomat-face') &&
      location !== '/notifications'
    ) {
      setLocation('/kirish');
    }
    if (isHrRecruitmentPath(location) && !canSeeHrRecruitment(user.role)) {
      setLocation('/dashboard');
    }
  }, [isLoading, isAuthenticated, user, setLocation, location]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Yuklanmoqda...</div>;
  }

  if (!isAuthenticated || !user) {
    return <div className="min-h-screen flex items-center justify-center">Yuklanmoqda...</div>;
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setUser(null);
        window.location.href = '/login';
      },
      onError: () => {
        setUser(null);
        window.location.href = '/login';
      },
    });
  };

  const chatNav = { name: 'Chat', path: '/chat', icon: MessageCircle };
  const orgNav = { name: 'Tashkiliy tuzilma', path: '/tashkiliy-tuzilma', icon: Network };
  const davomatFaceNav = { name: 'Davomat', path: '/davomat-face', icon: ScanFace };
  const smenaNav = { name: 'Smena va filial', path: '/smena-filial', icon: AlarmClock };
  const davomatFarNav = { name: 'Masofaviy', path: '/davomat-uzoq', icon: MapPin };
  const oylikNav = { name: 'Oylik', path: '/oylik', icon: Banknote };
  const hisobNav = { name: 'Oylik hisob', path: '/hisobkitob', icon: Calculator };
  const reytingNav = { name: 'Reyting', path: '/reyting', icon: Trophy };

  function injectCommonNav(items: NavItem[]): NavItem[] {
    let next = [...items];
    if (!next.some((i) => i.path === '/oylik')) {
      const dashIdx = next.findIndex((i) => i.path === '/dashboard');
      const at = dashIdx >= 0 ? dashIdx + 1 : 0;
      next = [...next.slice(0, at), oylikNav, ...next.slice(at)];
    }
    return next;
  }

  const hrMenejerNav: NavItem[] = [
    { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
    { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
    chatNav,
    orgNav,
    { name: 'Arizalar', path: '/requests', icon: FileText },
    { name: "Ish o'rinlari", path: '/vacancies', icon: Briefcase },
    { name: 'Nomzodlar', path: '/candidates', icon: Users },
    { name: 'Suhbatlar', path: '/interviews', icon: Calendar },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: 'Davomat hisobot', path: '/davomat', icon: ClipboardCheck },
      davomatFarNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Cheklist holati', path: '/checklist-holati', icon: ClipboardList },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
      { name: 'Holat', path: '/admin/holat', icon: BarChart3 },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
      { name: 'Pipeline', path: '/pipeline', icon: Kanban },
      { name: 'Stajirovkalar', path: '/internships', icon: GraduationCap },
    ];

  const hrDirektorNav: NavItem[] = [
    { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
    { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
    chatNav,
    orgNav,
    { name: 'Arizalar', path: '/requests', icon: FileText },
    { name: "Ish o'rinlari", path: '/vacancies', icon: Briefcase },
    { name: 'Nomzodlar', path: '/candidates', icon: Users },
    { name: 'Suhbatlar', path: '/interviews', icon: Calendar },
    { name: 'Xodimlar', path: '/employees', icon: Users },
    { name: 'Davomat hisobot', path: '/davomat', icon: ClipboardCheck },
    davomatFarNav,
    davomatFaceNav,
    { name: 'Cheklist holati', path: '/checklist-holati', icon: ClipboardList },
    { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
    { name: 'Holat', path: '/admin/holat', icon: BarChart3 },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
      { name: 'Pipeline', path: '/pipeline', icon: Kanban },
      { name: 'Stajirovkalar', path: '/internships', icon: GraduationCap },
    ];

  const hrAuditorNav: NavItem[] = [
    { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
    chatNav,
    orgNav,
    davomatFaceNav,
    { name: "Ish o'rinlari", path: '/vacancies', icon: Briefcase },
    { name: 'Nomzodlar', path: '/candidates', icon: Users },
    { name: 'Suhbatlar', path: '/interviews', icon: Calendar },
    { name: 'Pipeline', path: '/pipeline', icon: Kanban },
  ];

  const roleNavigation: Record<string, NavItem[]> = {
    admin: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      orgNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: "Ish o'rinlari", path: '/vacancies', icon: Briefcase },
      { name: 'Nomzodlar', path: '/candidates', icon: Users },
      { name: 'Suhbatlar', path: '/interviews', icon: Calendar },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      hisobNav,
      { name: 'Davomat hisobot', path: '/davomat', icon: ClipboardCheck },
      davomatFarNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Cheklist holati', path: '/checklist-holati', icon: ClipboardList },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
      { name: 'Stajirovkalar', path: '/internships', icon: GraduationCap },
      { name: 'Foydalanuvchilar', path: '/admin/users', icon: Settings },
      { name: 'Face ID', path: '/admin/faces', icon: ScanFace },
      { name: 'Holat', path: '/admin/holat', icon: BarChart3 },
      { name: "Bo'limlar", path: '/admin/departments', icon: Settings },
      { name: 'Kirish materiallari', path: '/admin/kirish-videolar', icon: Video },
      { name: 'Pipeline', path: '/pipeline', icon: Kanban },
    ],
    recruiter: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      orgNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: "Ish o'rinlari", path: '/vacancies', icon: Briefcase },
      { name: 'Nomzodlar', path: '/candidates', icon: Users },
      { name: 'Suhbatlar', path: '/interviews', icon: Calendar },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
      { name: 'Pipeline', path: '/pipeline', icon: Kanban },
    ],
    director: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      orgNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: "Ish o'rinlari", path: '/vacancies', icon: Briefcase },
      { name: 'Nomzodlar', path: '/candidates', icon: Users },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      hisobNav,
      { name: 'Davomat hisobot', path: '/davomat', icon: ClipboardCheck },
      davomatFarNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Cheklist holati', path: '/checklist-holati', icon: ClipboardList },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
      { name: 'Holat', path: '/admin/holat', icon: BarChart3 },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
      { name: 'Suhbatlar', path: '/interviews', icon: Calendar },
      { name: 'Pipeline', path: '/pipeline', icon: Kanban },
      { name: 'Stajirovkalar', path: '/internships', icon: GraduationCap },
    ],
    hr: hrMenejerNav,
    hr_menejer: hrMenejerNav,
    hr_direktor: hrDirektorNav,
    hr_auditor: hrAuditorNav,
    trainer: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      davomatFaceNav,
      smenaNav,
      { name: "Ish o'rinlari", path: '/vacancies', icon: Briefcase },
      { name: 'Nomzodlar', path: '/candidates', icon: Users },
      { name: 'Suhbatlar', path: '/interviews', icon: Calendar },
      { name: 'Pipeline', path: '/pipeline', icon: Kanban },
      { name: 'Stajirovkalar', path: '/internships', icon: GraduationCap },
    ],
    mentor: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
    ],
    department_head: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
    ],
    mudir: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      orgNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
    ],
    koordinator: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      orgNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
      { name: 'Cheklist', path: '/checklist', icon: ClipboardCheck },
      { name: 'Reyting', path: '/checklist-holati', icon: Trophy },
    ],
    texnik: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
    ],
    ombor: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
    ],
    sb: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      orgNav,
      { name: 'Davomat hisobot', path: '/davomat', icon: ClipboardCheck },
      davomatFarNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
    ],
    sb_boshliq: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
      orgNav,
      { name: 'Davomat hisobot', path: '/davomat', icon: ClipboardCheck },
      davomatFarNav,
      davomatFaceNav,
      smenaNav,
      { name: 'Arizalar', path: '/requests', icon: FileText },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      { name: "Aptekalar tarmog'i", path: '/pharmacy-network', icon: Store },
    ],
    farmasevt: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Ehtiyoj', path: '/ehtiyoj', icon: ClipboardList },
      chatNav,
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      reytingNav,
      davomatFaceNav,
      smenaNav,
    ],
    moliya: [
      { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Oylik', path: '/oylik', icon: Banknote },
      { name: 'Oylik hisob', path: '/hisobkitob', icon: Calculator },
      { name: 'Xodimlar', path: '/employees', icon: Users },
      orgNav,
      { name: 'Davomat hisobot', path: '/davomat', icon: ClipboardCheck },
      davomatFaceNav,
      smenaNav,
      { name: 'Cheklist holati', path: '/checklist-holati', icon: ClipboardList },
      { name: 'Topshiriqlar', path: '/vazifalar', icon: ListTodo },
      { name: 'Eslatmalarim', path: '/eslatmalar', icon: AlarmClock },
      chatNav,
    ],
    stajyor: [
      { name: 'Kirish', path: '/kirish', icon: GraduationCap },
      reytingNav,
      davomatFaceNav,
      smenaNav,
    ],
  };

  const roleNav = injectCommonNav(roleNavigation[user.role] || [
    { name: 'Boshqaruv', path: '/dashboard', icon: LayoutDashboard },
  ]);
  const withFace = roleNav.some((item) => item.path === '/davomat-face')
    ? roleNav
    : [...roleNav, davomatFaceNav];
  const navItems = canSeeHrRecruitment(user.role)
    ? withFace
    : withFace.filter((item) => !isHrRecruitmentPath(item.path));

  const toggleNav = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      setDesktopCollapsed((v) => !v);
    } else {
      setMobileOpen((v) => !v);
    }
  };

  const navSections = groupNavItems(navItems);
  const pinnedSet = new Set(pinnedIds);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setOpenSectionId(id);
  };

  const renderNavItem = (
    item: NavItem,
    opts: { collapsed: boolean; onNavigate?: () => void; nested?: boolean; accentDot?: string },
  ) => {
    const count = badgeByPath[item.path] ?? 0;
    const active = pathIsActive(location, item.path);
    const pulse = item.path === '/pharmacy-network' && count > 0;
    return (
      <Link key={item.path} href={item.path}>
        <div
          role="link"
          onClick={opts.onNavigate}
          className={cn(
            'group relative flex items-center gap-3 rounded-xl cursor-pointer transition-all duration-200',
            opts.nested ? 'px-3 py-2.5 md:py-2' : 'px-3 py-3',
            active
              ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]'
              : 'text-white/75 hover:bg-white/[0.07] hover:text-white active:scale-[0.99]',
          )}
        >
          {active ? (
            <span
              className={cn(
                'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full',
                opts.accentDot || 'bg-sky-400',
              )}
            />
          ) : null}
          <span className="relative shrink-0">
            <item.icon
              className={cn(
                'h-5 w-5 min-w-[20px] transition-colors',
                active ? 'text-white' : 'text-white/55 group-hover:text-white/90',
              )}
            />
            {opts.collapsed && <NavBadge count={count} collapsed pulse={pulse} />}
          </span>
          {!opts.collapsed && (
            <>
              <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug break-words">
                {item.name}
              </span>
              <NavBadge count={count} pulse={pulse} />
            </>
          )}
        </div>
      </Link>
    );
  };

  const renderNavLinks = (opts: { collapsed: boolean; onNavigate?: () => void; mobile?: boolean }) =>
    navSections.map((section) => {
      const badgeSum = section.items.reduce((sum, item) => sum + (badgeByPath[item.path] ?? 0), 0);
      const hasActive = section.items.some((item) => pathIsActive(location, item.path));
      const pinned = pinnedSet.has(section.id);
      const open = opts.collapsed || pinned || openSectionId === section.id || (opts.mobile && hasActive);

      if (opts.collapsed) {
        return (
          <div key={section.id} className="flex flex-col gap-0.5">
            {section.id !== navSections[0]?.id ? (
              <div className={cn('mx-2.5 my-1.5 h-px rounded-full opacity-40', section.accent)} />
            ) : null}
            {section.items.map((item) =>
              renderNavItem(item, { ...opts, accentDot: section.accent }),
            )}
          </div>
        );
      }

      return (
        <div
          key={section.id}
          className={cn(
            'mb-1.5 overflow-hidden rounded-2xl transition-all duration-200',
            open
              ? 'bg-gradient-to-b from-white/[0.08] to-white/[0.03] ring-1 ring-white/10 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.55)]'
              : 'hover:bg-white/[0.04]',
          )}
        >
          <div className="flex items-center gap-0.5 pr-1.5">
            <button
              type="button"
              onClick={() =>
                setOpenSectionId((prev) => (prev === section.id && !pinned ? null : section.id))
              }
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left md:py-2',
                hasActive || open ? section.chip : 'text-white/45',
              )}
            >
              <span className={cn('h-5 w-1 shrink-0 rounded-full shadow-sm', section.accent)} />
              <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.16em]">
                {section.label}
              </span>
              {badgeSum > 0 ? (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm shadow-rose-900/40">
                  {badgeSum > 99 ? '99+' : badgeSum}
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-white/40 transition-transform duration-200',
                  open && 'rotate-180',
                )}
              />
            </button>
            {!opts.mobile ? (
              <button
                type="button"
                onClick={() => togglePin(section.id)}
                title={pinned ? 'Pinni yechish' : 'Ochiq tutib turish'}
                aria-label={pinned ? 'Pinni yechish' : 'Ochiq tutib turish'}
                className={cn(
                  'shrink-0 rounded-lg p-1.5 transition-colors',
                  pinned
                    ? 'bg-amber-400/20 text-amber-300'
                    : 'text-white/25 hover:bg-white/10 hover:text-white/65',
                )}
              >
                <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
              </button>
            ) : null}
          </div>
          {open ? (
            <div className="mb-2 ml-3.5 mr-2 flex flex-col gap-0.5 border-l border-white/10 pl-2">
              {section.items.map((item) =>
                renderNavItem(item, { ...opts, nested: true, accentDot: section.accent }),
              )}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <div className="flex h-[100dvh] bg-[#f4f6f9] overflow-hidden">
      {/* Mobil: fon (overlay) */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Menyuni yopish"
          className="fixed inset-0 z-40 bg-[#06101c]/65 backdrop-blur-[2px] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Sidebar: mobilda drawer, desktopda doimiy */}
      <aside
        className={cn(
          'text-sidebar-foreground flex flex-col transition-[transform,width] duration-300 ease-out',
          'fixed inset-y-0 left-0 z-50 w-[min(19.5rem,92vw)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:translate-x-0',
          desktopCollapsed ? 'md:w-[4.75rem]' : 'md:w-[16.5rem]',
          'border-r border-white/[0.06] shadow-[8px_0_40px_-20px_rgba(0,0,0,0.55)]',
          'rounded-none md:rounded-none',
          mobileOpen && 'rounded-r-[1.35rem]',
        )}
        style={{
          background:
            'linear-gradient(180deg, #0a1728 0%, #081323 42%, #070f1c 100%)',
        }}
      >
        <div className="relative shrink-0 overflow-hidden border-b border-white/[0.06] px-3.5 pt-[max(0.85rem,env(safe-area-inset-top))] pb-3.5 md:px-3 md:pt-4">
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-sky-500/15 blur-2xl"
            aria-hidden
          />
          <div className="relative flex items-center justify-between gap-2">
            <div className={cn('min-w-0', desktopCollapsed && 'md:hidden')}>
              <p className="text-[15px] font-bold tracking-tight text-white">VAKSINA MED</p>
              <p className="mt-0.5 text-[11px] font-medium tracking-wide text-sky-200/55">
                HR platforma
              </p>
            </div>
            {desktopCollapsed ? (
              <div className="mx-auto hidden h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[11px] font-bold text-sky-200 md:flex">
                VM
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white md:hidden"
              aria-label="Yopish"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 md:px-2.5">
          {/* Mobil: kattaroq touch, pin yo‘q */}
          <div className="flex flex-col gap-1 md:hidden">
            {renderNavLinks({
              collapsed: false,
              mobile: true,
              onNavigate: () => setMobileOpen(false),
            })}
          </div>
          {/* Desktop */}
          <div className="hidden md:flex md:flex-col md:gap-0.5">
            {renderNavLinks({ collapsed: desktopCollapsed })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/[0.07] bg-black/20 p-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] md:p-3">
          <div
            className={cn(
              'flex items-center gap-2 rounded-2xl bg-white/[0.05] p-2.5 ring-1 ring-white/10',
              desktopCollapsed && 'md:justify-center md:p-2',
            )}
          >
            <div className={cn('min-w-0 flex-1', desktopCollapsed && 'md:flex-none')}>
              <button
                type="button"
                onClick={openProfileEditor}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 rounded-xl text-left transition-colors hover:bg-white/[0.06]',
                  desktopCollapsed && 'md:justify-center',
                )}
                title="Profilni tahrirlash"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-sky-400/30 to-indigo-500/25 text-xs font-bold text-sky-100 ring-1 ring-white/15',
                    desktopCollapsed && 'md:h-8 md:w-8',
                  )}
                >
                  {facePhotoUrl ? (
                    <img src={facePhotoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (user.fullName || 'U').slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className={cn('min-w-0 flex-1', desktopCollapsed && 'md:hidden')}>
                  <span className="block truncate text-sm font-semibold text-white">{user.fullName}</span>
                  <span className="block truncate text-[11px] capitalize text-white/45">
                    {user.role.replace(/_/g, ' ')}
                  </span>
                </div>
              </button>
              <div className={cn(desktopCollapsed && 'md:hidden')}>
                <FaceIdEnroll compact onStatusChange={onFaceStatusChange} />
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-xl p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title="Chiqish"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="w-[calc(100%-1.25rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Profil va parol</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-3 rounded-xl border bg-slate-50 p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-200 text-lg font-bold text-slate-600">
                {facePhotoUrl ? (
                  <img src={facePhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (user.fullName || 'U').slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.login}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="profile-first">Ism</Label>
                <Input
                  id="profile-first"
                  value={profileFirst}
                  onChange={(e) => setProfileFirst(e.target.value)}
                  placeholder="Ism"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-last">Familiya</Label>
                <Input
                  id="profile-last"
                  value={profileLast}
                  onChange={(e) => setProfileLast(e.target.value)}
                  placeholder="Familiya"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-pass">Yangi parol</Label>
              <Input
                id="profile-pass"
                type="text"
                autoComplete="new-password"
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                placeholder="Yangi parol"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-pass2">Parolni tasdiqlang</Label>
              <Input
                id="profile-pass2"
                type="text"
                autoComplete="new-password"
                value={profilePassword2}
                onChange={(e) => setProfilePassword2(e.target.value)}
                placeholder="Qayta yozing"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saqlaganda ism/familiya va parol foydalanuvchilar bazasiga yoziladi. Excel eksportida yangi parol
              chiqadi.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
              Bekor
            </Button>
            <Button type="button" disabled={profileSaving} onClick={() => void saveProfile()}>
              {profileSaving ? 'Saqlanmoqda…' : 'Parolni almashtirish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden w-full">
        <header className="safe-top z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-md sm:h-16 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={toggleNav}
              className="shrink-0 -ml-1 rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100"
              aria-label="Menyu"
              aria-expanded={mobileOpen || !desktopCollapsed}
            >
              <Menu className="h-6 w-6" />
            </button>
            <img
              src={`${import.meta.env.BASE_URL}logo3d.png`}
              alt="VAKSINA MED HR"
              className="h-8 w-auto max-w-[min(48vw,168px)] object-contain object-left sm:h-10 sm:max-w-[200px]"
            />
          </div>

          <div className="flex shrink-0 items-center">
            <Link href="/notifications">
              <div className="relative cursor-pointer rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
                <Bell className="h-5 w-5" />
                {totalUnread > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
            </Link>
          </div>
        </header>

        <DavomatAttendanceBanner />

        <main
          className={cn(
            'min-h-0 min-w-0 flex-1',
            location === '/vazifalar' ||
              location === '/pipeline' ||
              location.startsWith('/chat') ||
              location.startsWith('/kirish') ||
              location.startsWith('/tashkiliy-tuzilma')
              ? 'overflow-hidden p-0'
              : 'overflow-x-hidden overflow-y-auto p-3 sm:p-6',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full min-w-0',
              location === '/pipeline' ||
                location === '/vazifalar' ||
                location === '/davomat' ||
                location === '/oylik' ||
                location === '/hisobkitob' ||
                location.startsWith('/employees') ||
                location.startsWith('/chat') ||
                location.startsWith('/kirish') ||
                location.startsWith('/tashkiliy-tuzilma')
                ? 'h-full max-w-none'
                : location === '/pharmacy-network'
                  ? 'max-w-none'
                  : 'max-w-7xl',
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
