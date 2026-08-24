import { displayBranchName } from "./pharmacy-staff-api";
import type {
  HolatCoordNode,
  HolatMudirNode,
  HolatPerson,
  HolatReport,
} from "./holat-api";

const ORG_UZ: Record<string, string> = {
  coordinator: "Koordinator",
  manager: "Mudir",
  pharmacist: "Farmasevt",
  intern: "Stajyor",
  supervisor: "Nazoratchi",
};

const LOGIN_UZ: Record<string, string> = {
  admin: "Admin",
  recruiter: "Rekruter",
  hr: "HR",
  hr_direktor: "HR Direktor",
  hr_auditor: "HR Auditor",
  hr_menejer: "HR Menejer",
  trainer: "Trener",
  mentor: "Mentor",
  director: "Direktor",
  department_head: "Bo‘lim boshlig‘i",
  mudir: "Mudir",
  koordinator: "Koordinator",
  texnik: "Texnik",
  ombor: "Ombor",
  sb: "SB operatori",
  sb_boshliq: "SB bo‘limi boshlig‘i",
  farmasevt: "Farmasevt",
  stajyor: "Stajyor",
};

const EMP_STATUS_UZ: Record<string, string> = {
  working: "Ishlayapti",
  new: "Yangi",
  dismissed: "Bo‘shagan",
  need_hire: "Yollash kerak",
  searching: "Qidiruvda",
  no_manager: "Mudir yo‘q",
  closed: "Yopilgan",
};

const USER_STATUS_UZ: Record<string, string> = {
  active: "Faol",
  vacant: "Bo‘sh",
  terminated: "Tugatilgan",
  on_leave: "Tatilda",
};

type EmpIn = {
  id: number;
  fullName: string;
  position?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  hiredAt?: string | null;
  orgRole?: string | null;
  reportsToId?: number | null;
  location?: string | null;
  employmentStatus?: string | null;
  userId?: number | null;
  createdAt?: string | null;
};

type UserIn = {
  id: number;
  fullName: string;
  role: string;
  login?: string | null;
  phone?: string | null;
  status?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  createdAt?: string | Date | null;
};

type DeptIn = {
  id: number;
  name: string;
  headId?: number | null;
  headName?: string | null;
  createdAt?: string | null;
};

function splitName(full: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: "—", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function fmtTs(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function orgFromLogin(role?: string | null) {
  if (role === "koordinator") return "coordinator";
  if (role === "mudir") return "manager";
  if (role === "farmasevt") return "pharmacist";
  if (role === "stajyor") return "intern";
  return null;
}

export function assembleHolatReport(opts: {
  employees: EmpIn[];
  users: UserIn[];
  departments: DeptIn[];
}): HolatReport {
  const usersById = new Map(opts.users.map((u) => [u.id, u]));
  const deptById = new Map(opts.departments.map((d) => [d.id, d.name]));
  const empById = new Map(opts.employees.map((e) => [e.id, e]));

  const people: HolatPerson[] = opts.employees.map((e) => {
    const u = e.userId != null ? usersById.get(e.userId) : undefined;
    const org = e.orgRole || orgFromLogin(u?.role) || "";
    const parent = e.reportsToId != null ? empById.get(e.reportsToId) : undefined;
    let coordinator = org === "coordinator" ? e : undefined;
    let mudir = org === "manager" ? e : undefined;
    if (org === "manager") coordinator = parent;
    if (org === "pharmacist" || org === "intern" || org === "supervisor") {
      mudir = parent;
      coordinator = mudir?.reportsToId != null ? empById.get(mudir.reportsToId) : undefined;
    }
    let createdByUserId: number | null = null;
    let addedBySource: HolatPerson["addedBySource"] = "unknown";
    if (org === "manager" && coordinator?.userId) {
      createdByUserId = coordinator.userId;
      addedBySource = "tree";
    } else if (
      (org === "pharmacist" || org === "intern" || org === "supervisor") &&
      mudir?.userId
    ) {
      createdByUserId = mudir.userId;
      addedBySource = "tree";
    }
    const creator = createdByUserId != null ? usersById.get(createdByUserId) : undefined;
    const names = splitName(e.fullName);
    return {
      employeeId: e.id,
      userId: e.userId ?? null,
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: e.fullName,
      position: e.position || ORG_UZ[org] || "—",
      orgRole: org || null,
      orgRoleLabel: ORG_UZ[org] || org || "—",
      loginRole: u?.role ?? null,
      loginRoleLabel: u?.role ? LOGIN_UZ[u.role] || u.role : "—",
      login: u?.login ?? null,
      phone: u?.phone ?? null,
      departmentId: e.departmentId ?? null,
      departmentName: e.departmentName || (e.departmentId != null ? deptById.get(e.departmentId) : undefined) || "—",
      branch: displayBranchName(e.location) || e.location || "—",
      hiredAt: e.hiredAt || null,
      createdAt: fmtTs(e.createdAt),
      employmentStatus: e.employmentStatus ?? null,
      employmentStatusLabel: EMP_STATUS_UZ[e.employmentStatus || ""] || e.employmentStatus || "—",
      reportsToEmployeeId: e.reportsToId ?? null,
      reportsToName: parent?.fullName ?? null,
      coordinatorEmployeeId: coordinator?.id ?? null,
      coordinatorName: coordinator?.fullName ?? null,
      mudirEmployeeId: mudir?.id ?? null,
      mudirName: mudir?.fullName ?? null,
      createdByUserId,
      createdByName: creator?.fullName ?? null,
      addedBySource,
    };
  });

  const active = people.filter((p) => p.employmentStatus !== "dismissed" && p.employmentStatus !== "closed");
  let coords = active.filter((p) => p.orgRole === "coordinator");
  const coordIds = new Set(coords.map((c) => c.employeeId));
  for (const p of active) {
    if (p.loginRole === "koordinator" && p.employeeId != null && !coordIds.has(p.employeeId)) {
      coords.push(p);
      coordIds.add(p.employeeId);
    }
  }
  const mudirsF = active.filter((p) => p.orgRole === "manager");
  const staffF = active.filter(
    (p) => p.orgRole === "pharmacist" || p.orgRole === "intern" || p.orgRole === "supervisor",
  );
  const pharmacists = staffF.filter((p) => p.orgRole === "pharmacist");
  const interns = staffF.filter((p) => p.orgRole === "intern");
  const supervisors = staffF.filter((p) => p.orgRole === "supervisor");

  const staffByMudir = new Map<number, HolatPerson[]>();
  for (const s of staffF) {
    const mid = s.mudirEmployeeId ?? s.reportsToEmployeeId;
    if (mid == null) continue;
    const list = staffByMudir.get(mid) ?? [];
    list.push(s);
    staffByMudir.set(mid, list);
  }
  const mudirsByCoord = new Map<number, HolatPerson[]>();
  for (const m of mudirsF) {
    const cid = m.coordinatorEmployeeId ?? m.reportsToEmployeeId;
    if (cid == null) continue;
    const list = mudirsByCoord.get(cid) ?? [];
    list.push(m);
    mudirsByCoord.set(cid, list);
  }

  const coordinatorNodes: HolatCoordNode[] = coords.map((c) => {
    const mudirPeople = (c.employeeId != null ? mudirsByCoord.get(c.employeeId) : undefined) ?? [];
    const mudirNodes: HolatMudirNode[] = mudirPeople.map((m) => {
      const staff = (m.employeeId != null ? staffByMudir.get(m.employeeId) : undefined) ?? [];
      return {
        ...m,
        pharmacistCount: staff.filter((s) => s.orgRole === "pharmacist").length,
        internCount: staff.filter((s) => s.orgRole === "intern").length,
        staffCount: staff.length,
        staff,
      };
    });
    return {
      ...c,
      mudirCount: mudirNodes.length,
      pharmacistCount: mudirNodes.reduce((n, m) => n + m.pharmacistCount, 0),
      internCount: mudirNodes.reduce((n, m) => n + m.internCount, 0),
      mudirs: mudirNodes,
    };
  });

  const branches = mudirsF
    .filter((m) => m.employeeId != null)
    .map((m) => {
      const staff = staffByMudir.get(m.employeeId!) ?? [];
      return {
        branch: m.branch,
        mudirEmployeeId: m.employeeId!,
        mudirName: m.fullName,
        coordinatorName: m.coordinatorName,
        pharmacistCount: staff.filter((s) => s.orgRole === "pharmacist").length,
        internCount: staff.filter((s) => s.orgRole === "intern").length,
        staffCount: staff.length,
        hasStaff: staff.length > 0,
      };
    });

  const addedMap = new Map<string, HolatReport["addedBy"][number]>();
  for (const p of [...mudirsF, ...pharmacists, ...interns]) {
    const key = p.createdByUserId != null ? String(p.createdByUserId) : "unknown";
    const cur = addedMap.get(key) ?? {
      userId: p.createdByUserId,
      fullName: p.createdByName || "Noma’lum (daraxt)",
      role: p.createdByUserId != null ? usersById.get(p.createdByUserId)?.role ?? null : null,
      roleLabel: "—",
      mudirs: 0,
      pharmacists: 0,
      interns: 0,
      total: 0,
    };
    if (cur.role) cur.roleLabel = LOGIN_UZ[cur.role] || cur.role;
    if (p.orgRole === "manager") cur.mudirs += 1;
    else if (p.orgRole === "pharmacist") cur.pharmacists += 1;
    else if (p.orgRole === "intern") cur.interns += 1;
    cur.total = cur.mudirs + cur.pharmacists + cur.interns;
    addedMap.set(key, cur);
  }

  const loginActive = opts.users.filter((u) => u.status === "active" || u.status === "on_leave");
  const countRole = (role: string) => loginActive.filter((u) => u.role === role).length;

  return {
    generatedAt: fmtTs(new Date()) || new Date().toISOString(),
    source: "employees.reports_to_id + users + departments (tizim fakt)",
    scoped: false,
    pharmacyCounts: {
      coordinators: coords.length,
      mudirs: mudirsF.length,
      pharmacists: pharmacists.length,
      interns: interns.length,
      supervisors: supervisors.length,
      total: coords.length + mudirsF.length + staffF.length,
    },
    loginCounts: {
      koordinator: countRole("koordinator"),
      mudir: countRole("mudir"),
      farmasevt: countRole("farmasevt"),
      stajyor: countRole("stajyor"),
      other: loginActive.filter((u) => !["koordinator", "mudir", "farmasevt", "stajyor"].includes(u.role)).length,
      total: loginActive.length,
    },
    office: {
      departments: opts.departments.length,
      employeesTotal: people.length,
      usersTotal: opts.users.length,
    },
    addedBy: [...addedMap.values()].sort((a, b) => b.total - a.total),
    coordinators: coordinatorNodes.sort((a, b) => a.fullName.localeCompare(b.fullName, "uz")),
    branchesWithStaff: branches.filter((b) => b.hasStaff),
    branchesWithoutStaff: branches.filter((b) => !b.hasStaff),
    coordinatorsWithoutMudirs: coordinatorNodes.filter((c) => c.mudirCount === 0),
    orphans: {
      mudirs: mudirsF.filter((m) => m.coordinatorEmployeeId == null),
      staff: staffF.filter((s) => s.mudirEmployeeId == null),
    },
    networkPeople: [...coords, ...mudirsF, ...staffF],
    allEmployees: people,
    departments: opts.departments.map((d) => ({
      id: d.id,
      name: d.name,
      headId: d.headId ?? null,
      headName: d.headName ?? (d.headId != null ? usersById.get(d.headId)?.fullName ?? null : null),
      employeeCount: people.filter((p) => p.departmentId === d.id).length,
      createdAt: fmtTs(d.createdAt),
    })),
    allUsers: opts.users.map((u) => {
      const n = splitName(u.fullName);
      return {
        id: u.id,
        firstName: n.firstName,
        lastName: n.lastName,
        fullName: u.fullName,
        role: u.role,
        roleLabel: LOGIN_UZ[u.role] || u.role,
        login: u.login || "—",
        phone: u.phone ?? null,
        departmentName: u.departmentName || (u.departmentId != null ? deptById.get(u.departmentId) || "—" : "—"),
        status: u.status || "—",
        statusLabel: USER_STATUS_UZ[u.status || ""] || u.status || "—",
        createdAt: fmtTs(u.createdAt),
      };
    }),
  };
}
