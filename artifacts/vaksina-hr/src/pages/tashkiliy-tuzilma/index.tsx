import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useGetEmployees, useGetUsers, type Employee, type User } from "@workspace/api-client-react";
import { displayBranchName } from "@/lib/pharmacy-staff-api";
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crown,
  ShieldCheck,
  Briefcase,
  UserSearch,
  GraduationCap,
  Waypoints,
  Store,
  Pill,
  Landmark,
  Building2,
  Truck,
  Wallet,
  Users,
  Cpu,
  ClipboardCheck,
  Warehouse,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  X,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ToneKey = keyof typeof TONES;

type OrgNode = {
  id: string;
  label: string;
  hint?: string;
  tone: ToneKey;
  icon: React.ComponentType<{ className?: string }>;
  children?: OrgNode[];
  mergePair?: OrgNode[];
  count?: number;
  expandable?: boolean;
  expandHint?: string;
  inChart?: boolean;
};

const TONES = {
  founder: {
    ink: "#071E33",
    fill: "from-[#071E33] via-[#0B3A5C] to-[#145A8A]",
    soft: "bg-[#0B3A5C]/10 text-[#0B3A5C]",
    chip: "bg-[#0B3A5C]/10 text-[#0B3A5C]",
  },
  director: {
    ink: "#0B3A5C",
    fill: "from-[#0B3A5C] to-[#1D6AA5]",
    soft: "bg-[#0B3A5C]/10 text-[#0B3A5C]",
    chip: "bg-[#0B3A5C]/10 text-[#0B3A5C]",
  },
  taminot: {
    ink: "#C2410C",
    fill: "from-[#C2410C] to-[#EA580C]",
    soft: "bg-orange-50 text-orange-800",
    chip: "bg-orange-100 text-orange-700",
    lane: "bg-orange-50/80 ring-orange-200/80",
  },
  moliya: {
    ink: "#047857",
    fill: "from-[#047857] to-[#10B981]",
    soft: "bg-emerald-50 text-emerald-800",
    chip: "bg-emerald-100 text-emerald-700",
    lane: "bg-emerald-50/80 ring-emerald-200/80",
  },
  hrDept: {
    ink: "#1D4E89",
    fill: "from-[#1D4E89] to-[#3B82C4]",
    soft: "bg-sky-50 text-sky-900",
    chip: "bg-sky-100 text-sky-800",
    lane: "bg-sky-50/80 ring-sky-200/80",
  },
  cbit: {
    ink: "#0E7490",
    fill: "from-[#0E7490] to-[#22D3EE]",
    soft: "bg-cyan-50 text-cyan-900",
    chip: "bg-cyan-100 text-cyan-800",
    lane: "bg-cyan-50/80 ring-cyan-200/80",
  },
  reviziya: {
    ink: "#6D28D9",
    fill: "from-[#6D28D9] to-[#A78BFA]",
    soft: "bg-violet-50 text-violet-900",
    chip: "bg-violet-100 text-violet-800",
    lane: "bg-violet-50/80 ring-violet-200/80",
  },
  axogpp: {
    ink: "#BE185D",
    fill: "from-[#BE185D] to-[#F472B6]",
    soft: "bg-pink-50 text-pink-900",
    chip: "bg-pink-100 text-pink-800",
    lane: "bg-pink-50/80 ring-pink-200/80",
  },
  sb: {
    ink: "#1E3A5F",
    fill: "from-[#1E3A5F] to-[#334155]",
    soft: "bg-slate-100 text-slate-800",
    chip: "bg-slate-200 text-slate-800",
    lane: "bg-slate-50/80 ring-slate-200/80",
  },
  manager: {
    ink: "#1D4E89",
    fill: "from-[#1D4E89] to-[#2E6FAF]",
    soft: "bg-[#1D4E89]/10 text-[#1D4E89]",
    chip: "bg-[#1D4E89]/10 text-[#1D4E89]",
  },
  specialist: {
    ink: "#5B4B8A",
    fill: "from-[#5B4B8A] to-[#7A68B0]",
    soft: "bg-[#5B4B8A]/10 text-[#5B4B8A]",
    chip: "bg-[#5B4B8A]/10 text-[#5B4B8A]",
  },
  coord: {
    ink: "#0F766E",
    fill: "from-[#0F766E] to-[#14B8A6]",
    soft: "bg-teal-50 text-teal-800",
    chip: "bg-teal-50 text-teal-700",
  },
  branch: {
    ink: "#9A6B3F",
    fill: "from-[#9A6B3F] to-[#C48A54]",
    soft: "bg-amber-50 text-amber-900",
    chip: "bg-amber-50 text-amber-800",
  },
  lead: {
    ink: "#2F6B4F",
    fill: "from-[#2F6B4F] to-[#3F8F6A]",
    soft: "bg-emerald-50 text-emerald-900",
    chip: "bg-emerald-50 text-emerald-800",
  },
  intern: {
    ink: "#4338CA",
    fill: "from-[#4338CA] to-[#6366F1]",
    soft: "bg-indigo-50 text-indigo-900",
    chip: "bg-indigo-50 text-indigo-700",
  },
  staff: {
    ink: "#B4535A",
    fill: "from-[#B4535A] to-[#D4737A]",
    soft: "bg-rose-50 text-rose-900",
    chip: "bg-rose-50 text-rose-800",
  },
} as const;

const DEPT_TONES = new Set<ToneKey>(["taminot", "moliya", "hrDept", "cbit", "sb", "reviziya", "axogpp"]);
const DEPT_IDS = new Set(["taminot", "moliya", "hr-bolimi", "cb-it", "xavfsizlik", "reviziya", "axo-gpp"]);

const DEPT_META: Array<{
  id: string;
  label: string;
  hint: string;
  tone: ToneKey;
  icon: React.ComponentType<{ className?: string }>;
  keys: string[];
  head: string;
  staff: string;
}> = [
  { id: "taminot", label: "Ta’minot", hint: "Logistika", tone: "taminot", icon: Truck, keys: ["taminot", "logistika"], head: "Ta’minot rahbari", staff: "Logistika" },
  { id: "moliya", label: "Moliya", hint: "Moliya bo‘limi", tone: "moliya", icon: Wallet, keys: ["moliya", "moliyachi", "hisob"], head: "Moliya rahbari", staff: "Moliyachi" },
  { id: "hr-bolimi", label: "HR bo‘limi", hint: "Kadrlar", tone: "hrDept", icon: Users, keys: ["hr", "kadr"], head: "HR rahbari", staff: "Kadrlar" },
  { id: "cb-it", label: "CB va IT", hint: "IT / texnika", tone: "cbit", icon: Cpu, keys: ["cb", "it"], head: "CB / IT rahbari", staff: "Texnika" },
  { id: "xavfsizlik", label: "Xavfsizlik (SB)", hint: "Ob’ekt / navbatchilik", tone: "sb", icon: ShieldCheck, keys: ["xavfsizlik", "sb", "security"], head: "SB bo‘limi boshlig‘i", staff: "SB operatori" },
  { id: "reviziya", label: "Reviziya", hint: "Ichki audit", tone: "reviziya", icon: ClipboardCheck, keys: ["reviziya", "audit"], head: "Reviziya rahbari", staff: "Ichki auditor" },
  { id: "axo-gpp", label: "AXO va GPP", hint: "Ma’muriyat / GPP", tone: "axogpp", icon: Warehouse, keys: ["axo", "gpp", "mamuriyat"], head: "AXO / GPP rahbari", staff: "Ma’muriyat" },
];

const ALLOWED_ROLES = new Set([
  "admin",
  "director",
  "hr",
  "hr_direktor",
  "hr_auditor",
  "hr_menejer",
  "recruiter",
  "koordinator",
  "mudir",
  "farmasevt",
  "stajyor",
  "sb",
  "sb_boshliq",
  "moliya",
]);

function isPharmacyOrg(e: Employee, usersById: Map<number, User>) {
  const k = empKind(e, usersById);
  return k === "coordinator" || k === "manager" || k === "pharmacist" || k === "intern" || k === "supervisor";
}

function normDept(s: string) {
  return s.toLowerCase().replace(/[''`‘’]/g, "").replace(/\s+/g, " ").trim();
}

function officePeopleForDept(
  people: Employee[],
  usersById: Map<number, User>,
  keys: string[],
  tone: ToneKey,
  icon: React.ComponentType<{ className?: string }>,
): OrgNode[] {
  return people
    .filter((e) => {
      if (isPharmacyOrg(e, usersById)) return false;
      const u = e.userId != null ? usersById.get(e.userId) : undefined;
      if (keys.includes("sb") && (u?.role === "sb" || u?.role === "sb_boshliq")) return true;
      const name = normDept(String(e.departmentName || ""));
      return keys.some((k) => name.includes(k));
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"))
    .map((e) => ({
      id: `emp-${e.id}`,
      label: e.fullName,
      hint: e.position || "Bo‘lim xodimi",
      tone,
      icon,
    }));
}

function makeDeptFallback(
  id: string,
  tone: ToneKey,
  icon: React.ComponentType<{ className?: string }>,
  head: string,
  staff: string,
): OrgNode[] {
  return [
    {
      id: `${id}-boshliq`,
      label: "Bo‘lim boshlig‘i",
      hint: head,
      tone,
      icon: Briefcase,
      children: [
        {
          id: `${id}-xodim`,
          label: "Bo‘lim xodimi",
          hint: staff,
          tone,
          icon: icon === Cpu || icon === ClipboardCheck ? icon : UserIcon,
        },
      ],
    },
  ];
}

function isActiveEmp(e: Employee) {
  return e.employmentStatus !== "dismissed";
}

function empKind(e: Employee, usersById: Map<number, User>): string {
  const role = String(e.orgRole || "");
  if (role === "coordinator" || role === "manager" || role === "pharmacist" || role === "intern" || role === "supervisor") {
    return role;
  }
  const u = e.userId != null ? usersById.get(e.userId) : undefined;
  if (u?.role === "koordinator") return "coordinator";
  if (u?.role === "mudir") return "manager";
  if (u?.role === "farmasevt") return "pharmacist";
  if (u?.role === "stajyor") return "intern";
  return role;
}

function activeUsers(users: User[] | undefined, role: string) {
  return (users ?? []).filter((u) => u.role === role && u.status === "active");
}

function staffHint(role?: string | null) {
  if (role === "intern") return "Stajyor · o‘quv / amaliyot";
  if (role === "supervisor") return "Nazoratchi";
  return "Farmasevt · smena / savdo";
}

function staffTone(role?: string | null): ToneKey {
  return role === "intern" ? "intern" : "staff";
}

function staffIcon(role?: string | null) {
  return role === "intern" ? GraduationCap : Pill;
}

function assignCoordinatorLanes(coords: Employee[], hrMgrEmps: Employee[]): [Employee[], Employee[]] {
  const sorted = [...coords].sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
  const lanes: [Employee[], Employee[]] = [[], []];
  const id0 = hrMgrEmps[0]?.id;
  const id1 = hrMgrEmps[1]?.id;
  if (id0 || id1) {
    const rest: Employee[] = [];
    for (const c of sorted) {
      if (id0 && c.reportsToId === id0) lanes[0].push(c);
      else if (id1 && c.reportsToId === id1) lanes[1].push(c);
      else rest.push(c);
    }
    rest.forEach((c, i) => lanes[i % 2].push(c));
    return lanes;
  }
  const mid = Math.ceil(sorted.length / 2);
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

function buildStaffNodes(staff: Employee[], usersById: Map<number, User>): OrgNode[] {
  return staff.map((p) => {
    const role = empKind(p, usersById);
    return {
      id: `emp-${p.id}`,
      label: p.fullName,
      hint: staffHint(role),
      tone: staffTone(role),
      icon: staffIcon(role),
      inChart: false,
    };
  });
}

function buildMudirNode(
  m: Employee,
  staff: Employee[],
  usersById: Map<number, User>,
): OrgNode {
  const id = `emp-${m.id}`;
  const loc = displayBranchName(m.location);
  const generic = !loc || loc === "Filial" || loc === m.fullName;
  return {
    id,
    label: generic ? m.fullName : loc,
    hint: generic ? "Filial mudiri · apteka rahbari" : `Mudir · ${m.fullName}`,
    tone: "branch",
    icon: Store,
    count: staff.length,
    expandable: staff.length > 0,
    expandHint: `${staff.length} ta xodim`,
    inChart: false,
    children: buildStaffNodes(staff, usersById),
  };
}

function buildCoordinatorNode(
  c: Employee,
  mudirs: Employee[],
  staffByMgr: Map<number, Employee[]>,
  usersById: Map<number, User>,
): OrgNode {
  return {
    id: `emp-${c.id}`,
    label: c.fullName,
    hint: "Koordinator · filiallar nazorati",
    tone: "coord",
    icon: Waypoints,
    count: mudirs.length,
    expandable: mudirs.length > 0,
    expandHint: `${mudirs.length} ta filial`,
    inChart: false,
    children: mudirs.map((m) => buildMudirNode(m, staffByMgr.get(m.id) ?? [], usersById)),
  };
}

function makeManagerBranchLive(
  n: number,
  managerUser: User | undefined,
  coords: Employee[],
  mudirsByCoord: Map<number, Employee[]>,
  staffByMgr: Map<number, Employee[]>,
  recruiters: User[],
  trainers: User[],
  usersById: Map<number, User>,
): OrgNode {
  const rec = recruiters[n - 1];
  const tr = trainers[n - 1];
  const coordNodes = coords.map((c) => ({
    ...buildCoordinatorNode(c, mudirsByCoord.get(c.id) ?? [], staffByMgr, usersById),
    inChart: true,
  }));
  return {
    id: `hr-menejer-${n}`,
    label: managerUser?.fullName || "HR Menejer",
    hint: `${n}-yo‘nalish`,
    tone: "manager",
    icon: Briefcase,
    mergePair: [
      {
        id: `rekruter-${n}`,
        label: rec?.fullName || "Rekruter",
        hint: rec ? "Rekruter · tanlov" : "Tanlov",
        tone: "specialist",
        icon: UserSearch,
      },
      {
        id: `koordinatorlar-${n}`,
        label: "Koordinatorlar",
        hint: "Filiallar nazorati",
        tone: "coord",
        icon: Waypoints,
        count: coordNodes.length,
        expandable: coordNodes.length > 0,
        expandHint: `${coordNodes.length} ta koordinator · bosing`,
        children: coordNodes,
      },
      {
        id: `trener-${n}`,
        label: tr?.fullName || "Trener",
        hint: tr ? "Trener · o‘qitish" : "O‘qitish",
        tone: "specialist",
        icon: GraduationCap,
      },
    ],
  };
}

function buildHrTree(employees: Employee[], users: User[]): OrgNode {
  const usersById = new Map((users ?? []).map((u) => [u.id, u]));
  const people = employees.filter(isActiveEmp);
  const coords = people.filter((e) => empKind(e, usersById) === "coordinator");
  const mudirs = people.filter((e) => empKind(e, usersById) === "manager");
  const staff = people.filter((e) => {
    const role = empKind(e, usersById);
    return role === "pharmacist" || role === "intern" || role === "supervisor";
  });

  const hrMgrUsers = activeUsers(users, "hr_menejer");
  const hrMgrEmps = people.filter((e) => hrMgrUsers.some((u) => u.id === e.userId));
  const lanes = assignCoordinatorLanes(coords, hrMgrEmps);

  const mudirsByCoord = new Map<number, Employee[]>();
  for (const m of mudirs) {
    if (m.reportsToId == null) continue;
    const list = mudirsByCoord.get(m.reportsToId) ?? [];
    list.push(m);
    mudirsByCoord.set(m.reportsToId, list);
  }
  for (const [, list] of mudirsByCoord) {
    list.sort((a, b) =>
      (displayBranchName(a.location) || a.fullName).localeCompare(
        displayBranchName(b.location) || b.fullName,
        "uz",
      ),
    );
  }

  const staffByMgr = new Map<number, Employee[]>();
  for (const p of staff) {
    if (p.reportsToId == null) continue;
    const list = staffByMgr.get(p.reportsToId) ?? [];
    list.push(p);
    staffByMgr.set(p.reportsToId, list);
  }
  for (const [, list] of staffByMgr) {
    list.sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
  }

  const direktor = activeUsers(users, "hr_direktor")[0];
  const auditor = activeUsers(users, "hr_auditor")[0];
  const recruiters = activeUsers(users, "recruiter");
  const trainers = activeUsers(users, "trainer");

  return {
    id: "hr-direktor",
    label: direktor?.fullName || "HR Direktor",
    hint: "Strategiya",
    tone: "director",
    icon: Crown,
    children: [
      {
        id: "hr-auditor",
        label: auditor?.fullName || "HR Auditor",
        hint: "Nazorat",
        tone: "director",
        icon: ShieldCheck,
        children: [
          makeManagerBranchLive(1, hrMgrUsers[0], lanes[0], mudirsByCoord, staffByMgr, recruiters, trainers, usersById),
          makeManagerBranchLive(2, hrMgrUsers[1], lanes[1], mudirsByCoord, staffByMgr, recruiters, trainers, usersById),
        ],
      },
    ],
  };
}

function makeOrgTree(hr: OrgNode, employees: Employee[], users: User[]): OrgNode {
  const usersById = new Map((users ?? []).map((u) => [u.id, u]));
  const people = employees.filter(isActiveEmp);
  return {
    id: "tasischi",
    label: "Ta’sischi",
    hint: "Muassis",
    tone: "founder",
    icon: Landmark,
    children: [
      {
        id: "direktor",
        label: "Direktor",
        hint: "Umumiy rahbar",
        tone: "director",
        icon: Building2,
        children: DEPT_META.map((d) => {
          let kids =
            d.id === "hr-bolimi"
              ? [hr]
              : officePeopleForDept(people, usersById, d.keys, d.tone, d.icon);
          if (d.id === "xavfsizlik") {
            const linked = new Set(
              people.filter((e) => e.userId != null).map((e) => e.userId as number),
            );
            const extra = (users ?? [])
              .filter(
                (u) =>
                  (u.role === "sb" || u.role === "sb_boshliq") &&
                  (u.status === "active" || u.status === "on_leave"),
              )
              .filter((u) => !linked.has(u.id))
              .sort((a, b) => {
                if (a.role !== b.role) return a.role === "sb_boshliq" ? -1 : 1;
                return a.fullName.localeCompare(b.fullName, "uz");
              })
              .map((u) => ({
                id: `user-${u.id}`,
                label: u.fullName,
                hint: u.role === "sb_boshliq" ? "SB bo‘limi boshlig‘i" : "SB operatori",
                tone: d.tone,
                icon: ShieldCheck,
              }));
            kids = [...kids, ...extra];
          }
          return {
            id: d.id,
            label: d.label,
            hint: d.hint,
            tone: d.tone,
            icon: d.icon,
            expandable: true,
            expandHint: d.id === "hr-bolimi" ? "Tuzilma · bosing" : `${Math.max(kids.length, 1)} ta · bosing`,
            count: kids.length,
            children: d.id === "hr-bolimi" ? [hr] : kids.length ? kids : makeDeptFallback(d.id, d.tone, d.icon, d.head, d.staff),
          };
        }),
      },
    ],
  };
}

type OrgBus = { from: string[]; to: string[] };

function busesFor(tree: OrgNode) {
  const buses: OrgBus[] = [];
  collectBuses(tree, buses);
  return buses;
}

function chartChildren(node: OrgNode): OrgNode[] {
  return (node.children ?? []).filter((c) => c.inChart !== false);
}

function drillChildren(node: OrgNode): OrgNode[] {
  return (node.children ?? []).filter((c) => c.inChart === false);
}

function collectBuses(node: OrgNode, buses: OrgBus[]) {
  if (node.mergePair?.length) {
    buses.push({ from: [node.id], to: node.mergePair.map((p) => p.id) });
    for (const side of node.mergePair) collectBuses(side, buses);
    for (const child of chartChildren(node)) collectBuses(child, buses);
    return;
  }
  const kids = chartChildren(node);
  if (kids.length) {
    buses.push({ from: [node.id], to: kids.map((k) => k.id) });
    for (const child of kids) collectBuses(child, buses);
  }
}

type Box = { cx: number; top: number; bottom: number };

function drawBus(from: Box[], to: Box[]) {
  const lines: string[] = [];
  const dots: Array<[number, number]> = [];
  if (!from.length || !to.length) return { lines, dots };

  const parentBottom = Math.max(...from.map((b) => b.bottom));
  const childTop = Math.min(...to.map((b) => b.top));
  const busY = Math.round(parentBottom + (childTop - parentBottom) * 0.48);
  const xs = [...from.map((b) => b.cx), ...to.map((b) => b.cx)];
  const minX = Math.round(Math.min(...xs));
  const maxX = Math.round(Math.max(...xs));

  for (const a of from) {
    const x = Math.round(a.cx);
    lines.push(`M ${x} ${Math.round(a.bottom)} L ${x} ${busY}`);
    dots.push([x, Math.round(a.bottom)]);
  }
  if (maxX - minX > 2) {
    lines.push(`M ${minX} ${busY} L ${maxX} ${busY}`);
  }
  dots.push([Math.round((minX + maxX) / 2), busY]);
  for (const b of to) {
    const x = Math.round(b.cx);
    lines.push(`M ${x} ${busY} L ${x} ${Math.round(b.top)}`);
    dots.push([x, Math.round(b.top)]);
  }
  return { lines, dots };
}

function findNode(node: OrgNode, id: string): OrgNode | null {
  if (node.id === id) return node;
  if (node.mergePair) {
    for (const side of node.mergePair) {
      const hit = findNode(side, id);
      if (hit) return hit;
    }
  }
  for (const child of node.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

function NodeCard({
  node,
  highlight,
  onSelect,
  size = "md",
  expanded = false,
}: {
  node: OrgNode;
  highlight: boolean;
  onSelect: (id: string) => void;
  size?: "sm" | "md" | "lg";
  expanded?: boolean;
}) {
  const tone = TONES[node.tone];
  const Icon = node.icon;
  const exec = node.id === "tasischi" || node.id === "direktor";
  const dept = DEPT_TONES.has(node.tone);

  return (
    <button
      type="button"
      data-org-id={node.id}
      onClick={() => onSelect(node.id)}
      className={cn(
        "group relative z-[2] text-left transition-shadow duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3a5c]/35 focus-visible:ring-offset-2",
        exec && "min-w-[228px] rounded-[22px]",
        dept && "min-w-[158px] rounded-[18px]",
        !exec && !dept && "rounded-[16px]",
        !exec && size === "lg" && "min-w-[200px]",
        !exec && size === "md" && "min-w-[176px]",
        !exec && size === "sm" && "min-w-[158px]",
        highlight && "ring-2 ring-offset-2",
        highlight && (exec ? "ring-white/70" : "ring-[#0b3a5c]/25"),
      )}
    >
      {exec ? (
        <div
          className={cn(
            "relative overflow-hidden rounded-[22px] bg-gradient-to-br px-4 py-3.5 text-white shadow-[0_18px_40px_-18px_rgba(7,30,51,0.7)]",
            tone.fill,
          )}
        >
          <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight tracking-tight">{node.label}</span>
              {node.hint ? (
                <span className="mt-0.5 block text-[11px] text-white/75">{node.hint}</span>
              ) : null}
            </span>
          </div>
        </div>
      ) : dept ? (
        <div
          className={cn(
            "overflow-hidden rounded-[18px] shadow-[0_10px_28px_-16px_rgba(15,58,92,0.35)] ring-1 ring-black/5",
            tone.soft,
          )}
        >
          <div className={cn("h-2.5 bg-gradient-to-r", tone.fill)} />
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone.chip)}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-400">Bo‘lim</span>
              <span className="block text-[14px] font-semibold leading-tight text-slate-900">{node.label}</span>
              {node.hint ? <span className="mt-0.5 block text-[11px] text-slate-500">{node.hint}</span> : null}
              {node.expandable ? (
                <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {expanded ? "Yig‘ish" : "Struktura · bosing"}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
                </span>
              ) : null}
            </span>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-[16px] bg-white shadow-[0_8px_24px_-16px_rgba(15,58,92,0.38)] ring-1 ring-slate-200/70 transition-shadow group-hover:shadow-[0_14px_30px_-16px_rgba(15,58,92,0.42)]">
          <span className={cn("absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b", tone.fill)} />
          <div className="flex items-center gap-2.5 py-2.5 pl-3.5 pr-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone.chip)}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight tracking-tight text-slate-900">
                {node.label}
              </span>
              {node.hint ? (
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">{node.hint}</span>
              ) : null}
              {node.expandable ? (
                <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {expanded ? "Yig‘ish" : node.expandHint || `${node.count} ta · bosing`}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
                </span>
              ) : null}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

function MergePair({
  nodes,
  selectedId,
  activeIds,
  onSelect,
  openCoordGroupId,
}: {
  nodes: OrgNode[];
  selectedId: string | null;
  activeIds: Set<string>;
  onSelect: (id: string) => void;
  openCoordGroupId: string | null;
}) {
  return (
    <div className="flex items-start justify-center gap-6 sm:gap-10">
      {nodes.map((n) => (
        <div key={n.id} className="flex flex-col items-center pt-14">
          <NodeCard
            node={n}
            highlight={activeIds.has(n.id) || selectedId === n.id || openCoordGroupId === n.id}
            expanded={openCoordGroupId === n.id}
            onSelect={onSelect}
            size="sm"
          />
        </div>
      ))}
    </div>
  );
}

function OrgTree({
  node,
  selectedId,
  activeIds,
  onSelect,
  openDeptId,
  openCoordGroupId,
  depth = 0,
}: {
  node: OrgNode;
  selectedId: string | null;
  activeIds: Set<string>;
  onSelect: (id: string) => void;
  openDeptId: string | null;
  openCoordGroupId: string | null;
  depth?: number;
}) {
  const kids = chartChildren(node);
  const hasMerge = !!node.mergePair?.length;
  const coordHub = node.mergePair?.find((p) => p.id.startsWith("koordinatorlar-"));
  const coordKids =
    coordHub && openCoordGroupId === coordHub.id ? chartChildren(coordHub) : [];
  const size = depth === 0 ? "lg" : depth <= 2 ? "md" : "sm";
  const isDirektor = node.id === "direktor";
  const deptRow = isDirektor ? kids : null;
  const openDept = deptRow?.find((d) => d.id === openDeptId) ?? null;
  const hrInner = openDeptId === "hr-bolimi" && openDept ? chartChildren(openDept) : [];
  const otherKids = openDept && openDeptId !== "hr-bolimi" ? chartChildren(openDept) : [];

  return (
    <div className="flex flex-col items-center">
      <NodeCard
        node={node}
        highlight={activeIds.has(node.id) || selectedId === node.id}
        onSelect={onSelect}
        size={size}
      />

      {deptRow ? (
        <div className="flex flex-col items-center pt-10">
          <div className="flex flex-nowrap items-start justify-center gap-3 sm:gap-4">
            {deptRow.map((child) => (
              <NodeCard
                key={child.id}
                node={child}
                highlight={openDeptId === child.id || activeIds.has(child.id) || selectedId === child.id}
                expanded={openDeptId === child.id}
                onSelect={onSelect}
                size="md"
              />
            ))}
          </div>
          {hrInner.map((h) => (
            <div key={h.id} className="pt-10">
              <OrgTree
                node={h}
                selectedId={selectedId}
                activeIds={activeIds}
                onSelect={onSelect}
                openDeptId={openDeptId}
                openCoordGroupId={openCoordGroupId}
                depth={depth + 1}
              />
            </div>
          ))}
          {otherKids.length > 0 ? (
            <div className="flex flex-wrap items-start justify-center gap-4 pt-10">
              {otherKids.map((child) => (
                <OrgTree
                  key={child.id}
                  node={child}
                  selectedId={selectedId}
                  activeIds={activeIds}
                  onSelect={onSelect}
                  openDeptId={openDeptId}
                  openCoordGroupId={openCoordGroupId}
                  depth={depth + 1}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : hasMerge || kids.length > 0 ? (
        <div className="flex flex-col items-center pt-10">
          {hasMerge && node.mergePair ? (
            <>
              <MergePair
                nodes={node.mergePair}
                selectedId={selectedId}
                activeIds={activeIds}
                onSelect={onSelect}
                openCoordGroupId={openCoordGroupId}
              />
              {coordKids.length > 0 ? (
                <div className="flex max-w-[920px] flex-wrap items-start justify-center gap-x-6 gap-y-8 pt-10">
                  {coordKids.map((child) => (
                    <div key={child.id} className="flex flex-col items-center px-1">
                      <OrgTree
                        node={child}
                        selectedId={selectedId}
                        activeIds={activeIds}
                        onSelect={onSelect}
                        openDeptId={openDeptId}
                        openCoordGroupId={openCoordGroupId}
                        depth={depth + 2}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-start">
              {kids.map((child) => (
                <div
                  key={child.id}
                  className={cn(
                    "flex flex-col items-center",
                    kids.length > 4 ? "px-4 sm:px-5" : "px-6 sm:px-8 md:px-10",
                  )}
                >
                  <OrgTree
                    node={child}
                    selectedId={selectedId}
                    activeIds={activeIds}
                    onSelect={onSelect}
                    openDeptId={openDeptId}
                    openCoordGroupId={openCoordGroupId}
                    depth={depth + 1}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TeamCard({
  node,
  selected,
  onOpen,
}: {
  node: OrgNode;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const tone = TONES[node.tone];
  const Icon = node.icon;
  const deeper = drillChildren(node).length > 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(node.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-left shadow-sm transition",
        "hover:border-slate-300 hover:shadow-md",
        selected ? "border-[#0b3a5c]/40 ring-2 ring-[#0b3a5c]/15" : "border-slate-200/80",
      )}
    >
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone.chip)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-tight text-slate-900">{node.label}</span>
        {node.hint ? (
          <span className="mt-0.5 block truncate text-[12px] text-slate-500">{node.hint}</span>
        ) : null}
        {deeper ? (
          <span className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {node.expandHint || `${node.count} ta`}
          </span>
        ) : null}
      </span>
      {deeper ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /> : null}
    </button>
  );
}

function TeamPanel({
  crumbs,
  title,
  hint,
  countLabel,
  items,
  selectedId,
  onOpen,
  onCrumb,
  onBack,
  onClose,
}: {
  crumbs: { id: string; label: string }[];
  title: string;
  hint?: string;
  countLabel: string;
  items: OrgNode[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onCrumb: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <aside
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[58%] flex-col overflow-hidden rounded-t-3xl border border-white/80 bg-white/96 shadow-[0_-18px_50px_-24px_rgba(15,58,92,0.45)] backdrop-blur-md sm:inset-y-3 sm:bottom-auto sm:left-auto sm:right-3 sm:max-h-none sm:w-[min(100%-1.5rem,420px)] sm:rounded-3xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2 border-b border-slate-100 px-4 py-3">
        <Button type="button" variant="ghost" size="icon" className="mt-0.5 h-8 w-8 shrink-0" onClick={onBack} aria-label="Orqaga">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
            {crumbs.map((c, i) => (
              <span key={c.id} className="inline-flex items-center gap-1">
                {i > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                <button type="button" className="max-w-[9rem] truncate hover:text-slate-700" onClick={() => onCrumb(c.id)}>
                  {c.label}
                </button>
              </span>
            ))}
          </div>
          <p className="mt-1 truncate text-[16px] font-semibold leading-tight text-slate-900">{title}</p>
          {hint ? <p className="truncate text-[12px] text-slate-500">{hint}</p> : null}
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#0b3a5c]">{countLabel}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Yopish">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.length ? (
          items.map((item) => (
            <TeamCard key={item.id} node={item} selected={selectedId === item.id} onOpen={onOpen} />
          ))
        ) : (
          <p className="px-2 py-8 text-center text-sm text-slate-400">Hali xodim biriktirilmagan</p>
        )}
      </div>
    </aside>
  );
}

const LEGEND: { label: string; tone: ToneKey }[] = [
  { label: "Ta’minot", tone: "taminot" },
  { label: "Moliya", tone: "moliya" },
  { label: "HR bo‘limi", tone: "hrDept" },
  { label: "CB va IT", tone: "cbit" },
  { label: "Xavfsizlik (SB)", tone: "sb" },
  { label: "Reviziya", tone: "reviziya" },
  { label: "AXO va GPP", tone: "axogpp" },
];

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.4;

export default function TashkiliyTuzilmaPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>("tasischi");
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [openDeptId, setOpenDeptId] = useState<string | null>(null);
  const [openCoordGroupId, setOpenCoordGroupId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.92);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [paths, setPaths] = useState<{ lines: string[]; dots: Array<[number, number]> }>({
    lines: [],
    dots: [],
  });
  const [dragging, setDragging] = useState(false);

  const allowed = useMemo(() => (user?.role ? ALLOWED_ROLES.has(user.role) : false), [user?.role]);
  const { data: employees = [] } = useGetEmployees(undefined, { query: { enabled: allowed } });
  const { data: users = [] } = useGetUsers(undefined, { query: { enabled: allowed } });

  const orgTree = useMemo(
    () => makeOrgTree(buildHrTree(employees as Employee[], users as User[]), employees as Employee[], users as User[]),
    [employees, users],
  );
  const orgBuses = useMemo(() => busesFor(orgTree), [orgTree]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const didFit = useRef(false);
  const busesRef = useRef(orgBuses);
  busesRef.current = orgBuses;

  zoomRef.current = zoom;
  panRef.current = pan;

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (DEPT_IDS.has(id)) {
        setOpenDeptId((prev) => (prev === id ? null : id));
        setOpenCoordGroupId(null);
        setFocusPath([]);
        return;
      }
      if (id.startsWith("koordinatorlar-")) {
        setOpenCoordGroupId((prev) => (prev === id ? null : id));
        setFocusPath([]);
        return;
      }
      const node = findNode(orgTree, id);
      const kids = node ? drillChildren(node) : [];
      if (!kids.length) return;
      setFocusPath((prev) => {
        if (prev[prev.length - 1] === id) return prev;
        const idx = prev.indexOf(id);
        if (idx >= 0) return prev.slice(0, idx + 1);
        if (prev.length === 0) return [id];
        return [...prev, id];
      });
    },
    [orgTree],
  );

  const redrawLines = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const wr = world.getBoundingClientRect();
    if (wr.width < 8 || world.offsetWidth < 8) return;
    const z = wr.width / world.offsetWidth;

    const box = (id: string): Box | null => {
      const el = world.querySelector(`[data-org-id="${id}"]`) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        cx: (r.left + r.width / 2 - wr.left) / z,
        top: (r.top - wr.top) / z,
        bottom: (r.bottom - wr.top) / z,
      };
    };

    const lines: string[] = [];
    const dots: Array<[number, number]> = [];
    for (const bus of busesRef.current) {
      const from = bus.from.map(box).filter((b): b is Box => !!b);
      const to = bus.to.map(box).filter((b): b is Box => !!b);
      if (from.length !== bus.from.length || to.length !== bus.to.length) continue;
      const drawn = drawBus(from, to);
      lines.push(...drawn.lines);
      dots.push(...drawn.dots);
    }
    setPaths((prev) => {
      if (
        prev.lines.length === lines.length &&
        prev.dots.length === dots.length &&
        prev.lines.every((d, i) => d === lines[i]) &&
        prev.dots.every((d, i) => d[0] === dots[i][0] && d[1] === dots[i][1])
      ) {
        return prev;
      }
      return { lines, dots };
    });
  }, []);

  const fitToView = useCallback(() => {
    const vp = viewportRef.current;
    const world = worldRef.current;
    if (!vp || !world) return;
    if (vp.clientWidth < 80 || vp.clientHeight < 80) return;
    const zNow = zoomRef.current || 1;
    const wr = world.getBoundingClientRect();
    const naturalW = wr.width / zNow;
    if (naturalW < 40) return;
    const nextZ = Math.min((vp.clientWidth - 48) / naturalW, 1);
    const z = Math.max(MIN_ZOOM, Number(nextZ.toFixed(3)));
    const x = (vp.clientWidth - naturalW * z) / 2;
    const y = 20;
    setZoom(z);
    setPan({ x, y });
  }, []);

  useLayoutEffect(() => {
    redrawLines();
  }, [zoom, pan, selectedId, openDeptId, openCoordGroupId, allowed, orgTree, redrawLines]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      redrawLines();
      if (!didFit.current) {
        didFit.current = true;
        fitToView();
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [allowed, orgTree, openDeptId, openCoordGroupId, redrawLines, fitToView]);

  useEffect(() => {
    const onResize = () => redrawLines();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redrawLines]);

  useEffect(() => {
    if (user && !allowed) setLocation("/dashboard");
  }, [user, allowed, setLocation]);

  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const rect = vp.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const worldX = (mx - panRef.current.x) / zoomRef.current;
    const worldY = (my - panRef.current.y) / zoomRef.current;
    setZoom(Number(z.toFixed(3)));
    setPan({ x: mx - worldX * z, y: my - worldY * z });
  }, []);

  const zoomFromCenter = (next: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    applyZoomAt(r.left + r.width / 2, r.top + r.height / 2, next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheelNative = (ev: WheelEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      applyZoomAt(ev.clientX, ev.clientY, zoomRef.current * (ev.deltaY > 0 ? 0.92 : 1.08));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [allowed, applyZoomAt]);

  if (!user || !allowed) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-slate-500">Ruxsat yo‘q…</div>
    );
  }

  const focusId = focusPath[focusPath.length - 1] ?? null;
  const focusNode = focusId ? findNode(orgTree, focusId) : null;
  const focusItems = focusNode ? drillChildren(focusNode) : [];
  const crumbs = focusPath
    .map((id) => findNode(orgTree, id))
    .filter((n): n is OrgNode => !!n)
    .map((n) => ({ id: n.id, label: n.label }));

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] flex-col bg-[#E8EEF4]">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-3 sm:px-6">
        <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <Network className="h-3.5 w-3.5 text-[#0b3a5c]" />
          VAKSINA MED
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0b3a5c] sm:text-2xl">Tashkiliy tuzilma</h1>
        <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 text-[12px] font-medium sm:text-[13px]">
          <span className="shrink-0 rounded-full bg-[#071E33] px-2.5 py-1 text-white">Ta’sischi</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          <span className="shrink-0 rounded-full bg-[#0B3A5C] px-2.5 py-1 text-white">Direktor</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
                TONES[item.tone].chip,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full bg-gradient-to-br", TONES[item.tone].fill)} />
              {item.label}
            </span>
          ))}
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          <span className="shrink-0 rounded-full bg-[#0b3a5c] px-2.5 py-1 text-white">HR Menejer</span>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden touch-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 45% at 50% -8%, rgba(11,58,92,0.09), transparent 55%), radial-gradient(circle at 1px 1px, rgba(15,58,92,0.06) 1px, transparent 0)",
            backgroundSize: "auto, 26px 26px",
          }}
        />

        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px)` }}
        >
          <div
            ref={worldRef}
            className="relative w-max [text-rendering:geometricPrecision]"
            style={{ zoom }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              {paths.lines.map((d, i) => (
                <path
                  key={`h-${i}`}
                  d={d}
                  fill="none"
                  stroke="#F8FAFC"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {paths.lines.map((d, i) => (
                <path
                  key={`l-${i}`}
                  d={d}
                  fill="none"
                  stroke="#0B3A5C"
                  strokeOpacity="0.92"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  shapeRendering="geometricPrecision"
                />
              ))}
              {paths.dots.map(([x, y], i) => (
                <circle key={`d-${i}`} cx={x} cy={y} r="3.5" fill="#0B3A5C" stroke="#F8FAFC" strokeWidth="1.5" />
              ))}
            </svg>
            <div className="relative px-10 py-12">
              <OrgTree
                node={orgTree}
                selectedId={selectedId}
                activeIds={new Set([...focusPath, selectedId, openDeptId, openCoordGroupId].filter((x): x is string => !!x))}
                onSelect={handleSelect}
                openDeptId={openDeptId}
                openCoordGroupId={openCoordGroupId}
              />
            </div>
          </div>
        </div>

        {focusNode ? (
          <TeamPanel
            crumbs={crumbs}
            title={focusNode.label}
            hint={focusNode.hint}
            countLabel={
              focusNode.expandHint
                ? focusNode.expandHint
                : focusItems.length
                  ? `${focusItems.length} ta`
                  : "Bo‘sh"
            }
            items={focusItems}
            selectedId={selectedId}
            onOpen={handleSelect}
            onCrumb={(id) => {
              const idx = focusPath.indexOf(id);
              if (idx >= 0) {
                setFocusPath(focusPath.slice(0, idx + 1));
                setSelectedId(id);
              }
            }}
            onBack={() => {
              if (focusPath.length <= 1) {
                setFocusPath([]);
                return;
              }
              const next = focusPath.slice(0, -1);
              setFocusPath(next);
              setSelectedId(next[next.length - 1] ?? null);
            }}
            onClose={() => setFocusPath([])}
          />
        ) : null}

        <div
          className={cn(
            "absolute bottom-4 z-10 sm:bottom-5",
            focusNode ? "left-4 sm:left-5" : "right-4 sm:right-5",
          )}
        >
          <div className="flex items-center gap-1 rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-[0_12px_32px_-18px_rgba(15,58,92,0.5)] backdrop-blur-md">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => zoomFromCenter(zoomRef.current - 0.1)}
              aria-label="Kichiklashtirish"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => zoomFromCenter(zoomRef.current + 0.1)}
              aria-label="Kattalashtirish"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => fitToView()}
              aria-label="Ekranga sig‘dirish"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
