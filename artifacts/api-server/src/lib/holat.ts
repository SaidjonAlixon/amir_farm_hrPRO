import { asc } from "drizzle-orm";
import { db, employeesTable, usersTable, departmentsTable } from "@workspace/db";
import { displayBranchName } from "./geo-location";

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
  inactive: "Bo‘sh",
  blocked: "Bo‘sh",
};

export type HolatPerson = {
  employeeId: number | null;
  userId: number | null;
  firstName: string;
  lastName: string;
  fullName: string;
  position: string;
  orgRole: string | null;
  orgRoleLabel: string;
  loginRole: string | null;
  loginRoleLabel: string;
  login: string | null;
  phone: string | null;
  departmentId: number | null;
  departmentName: string;
  branch: string;
  hiredAt: string | null;
  createdAt: string | null;
  employmentStatus: string | null;
  employmentStatusLabel: string;
  reportsToEmployeeId: number | null;
  reportsToName: string | null;
  coordinatorEmployeeId: number | null;
  coordinatorName: string | null;
  mudirEmployeeId: number | null;
  mudirName: string | null;
  createdByUserId: number | null;
  createdByName: string | null;
  addedBySource: "created_by" | "tree" | "unknown";
};

export type HolatMudirNode = HolatPerson & {
  pharmacistCount: number;
  internCount: number;
  staffCount: number;
  staff: HolatPerson[];
};

export type HolatCoordNode = HolatPerson & {
  mudirCount: number;
  pharmacistCount: number;
  internCount: number;
  mudirs: HolatMudirNode[];
};

export type HolatBranch = {
  branch: string;
  mudirEmployeeId: number;
  mudirName: string;
  coordinatorName: string | null;
  pharmacistCount: number;
  internCount: number;
  staffCount: number;
  hasStaff: boolean;
};

export type HolatAddedBy = {
  userId: number | null;
  fullName: string;
  role: string | null;
  roleLabel: string;
  mudirs: number;
  pharmacists: number;
  interns: number;
  total: number;
};

export type HolatReport = {
  generatedAt: string;
  source:
    "employees.reports_to_id (koordinator→mudir→farmasevt/stajyor) + users + departments";
  scoped: boolean;
  pharmacyCounts: {
    coordinators: number;
    mudirs: number;
    pharmacists: number;
    interns: number;
    supervisors: number;
    total: number;
  };
  loginCounts: {
    koordinator: number;
    mudir: number;
    farmasevt: number;
    stajyor: number;
    other: number;
    total: number;
  };
  office: {
    departments: number;
    employeesTotal: number;
    usersTotal: number;
  };
  addedBy: HolatAddedBy[];
  coordinators: HolatCoordNode[];
  branchesWithStaff: HolatBranch[];
  branchesWithoutStaff: HolatBranch[];
  coordinatorsWithoutMudirs: HolatPerson[];
  orphans: {
    mudirs: HolatPerson[];
    staff: HolatPerson[];
  };
  networkPeople: HolatPerson[];
  allEmployees: HolatPerson[];
  departments: Array<{
    id: number;
    name: string;
    headId: number | null;
    headName: string | null;
    employeeCount: number;
    createdAt: string | null;
  }>;
  allUsers: Array<{
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    role: string;
    roleLabel: string;
    login: string;
    phone: string | null;
    departmentName: string;
    status: string;
    statusLabel: string;
    createdAt: string | null;
  }>;
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

function fmtTs(d: Date | string | null | undefined): string | null {
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

function isActiveEmp(status?: string | null) {
  return status !== "dismissed" && status !== "closed";
}

type Emp = {
  id: number;
  fullName: string;
  position: string;
  departmentId: number;
  hiredAt: string;
  orgRole: string | null;
  reportsToId: number | null;
  location: string | null;
  employmentStatus: string | null;
  userId: number | null;
  createdAt: Date;
  createdById: number | null;
};

function toPerson(
  e: Emp,
  ctx: {
    usersById: Map<number, { id: number; fullName: string; role: string; login: string; phone: string | null; status: string }>;
    deptById: Map<number, string>;
    empById: Map<number, Emp>;
  },
): HolatPerson {
  const u = e.userId != null ? ctx.usersById.get(e.userId) : undefined;
  const parent = e.reportsToId != null ? ctx.empById.get(e.reportsToId) : undefined;
  let coordinator: Emp | undefined;
  let mudir: Emp | undefined;
  if (e.orgRole === "coordinator") coordinator = e;
  else if (e.orgRole === "manager") {
    mudir = e;
    coordinator = parent;
  } else if (e.orgRole === "pharmacist" || e.orgRole === "intern" || e.orgRole === "supervisor") {
    mudir = parent;
    coordinator = mudir?.reportsToId != null ? ctx.empById.get(mudir.reportsToId) : undefined;
  }

  let createdByUserId = e.createdById;
  let addedBySource: HolatPerson["addedBySource"] = createdByUserId ? "created_by" : "unknown";
  if (!createdByUserId) {
    if (e.orgRole === "manager" && coordinator?.userId) {
      createdByUserId = coordinator.userId;
      addedBySource = "tree";
    } else if (
      (e.orgRole === "pharmacist" || e.orgRole === "intern" || e.orgRole === "supervisor") &&
      mudir?.userId
    ) {
      createdByUserId = mudir.userId;
      addedBySource = "tree";
    }
  }
  const creator = createdByUserId != null ? ctx.usersById.get(createdByUserId) : undefined;
  const names = splitName(e.fullName);
  const org = e.orgRole || "";
  return {
    employeeId: e.id,
    userId: e.userId,
    firstName: names.firstName,
    lastName: names.lastName,
    fullName: e.fullName,
    position: e.position || ORG_UZ[org] || "—",
    orgRole: e.orgRole,
    orgRoleLabel: ORG_UZ[org] || e.orgRole || "—",
    loginRole: u?.role ?? null,
    loginRoleLabel: u?.role ? LOGIN_UZ[u.role] || u.role : "—",
    login: u?.login ?? null,
    phone: u?.phone ?? null,
    departmentId: e.departmentId,
    departmentName: ctx.deptById.get(e.departmentId) || "—",
    branch: displayBranchName(e.location) || e.location || "—",
    hiredAt: e.hiredAt || null,
    createdAt: fmtTs(e.createdAt),
    employmentStatus: e.employmentStatus,
    employmentStatusLabel: EMP_STATUS_UZ[e.employmentStatus || ""] || e.employmentStatus || "—",
    reportsToEmployeeId: e.reportsToId,
    reportsToName: parent?.fullName ?? null,
    coordinatorEmployeeId: coordinator?.id ?? null,
    coordinatorName: coordinator?.fullName ?? null,
    mudirEmployeeId: mudir?.id ?? null,
    mudirName: mudir?.fullName ?? null,
    createdByUserId: createdByUserId ?? null,
    createdByName: creator?.fullName ?? null,
    addedBySource,
  };
}

export async function buildHolatReport(opts: {
  scopeRole?: string | null;
  scopeUserId?: number | null;
  full: boolean;
}): Promise<HolatReport> {
  const users = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      login: usersTable.login,
      phone: usersTable.phone,
      status: usersTable.status,
      departmentId: usersTable.departmentId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(asc(usersTable.fullName));

  const depts = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      headId: departmentsTable.headId,
      createdAt: departmentsTable.createdAt,
    })
    .from(departmentsTable)
    .orderBy(asc(departmentsTable.name));

  let empRows: Emp[] = [];
  try {
    empRows = (await db
      .select({
        id: employeesTable.id,
        fullName: employeesTable.fullName,
        position: employeesTable.position,
        departmentId: employeesTable.departmentId,
        hiredAt: employeesTable.hiredAt,
        orgRole: employeesTable.orgRole,
        reportsToId: employeesTable.reportsToId,
        location: employeesTable.location,
        employmentStatus: employeesTable.employmentStatus,
        userId: employeesTable.userId,
        createdAt: employeesTable.createdAt,
        createdById: employeesTable.createdById,
      })
      .from(employeesTable)
      .orderBy(asc(employeesTable.fullName))) as Emp[];
  } catch {
    const core = await db
      .select({
        id: employeesTable.id,
        fullName: employeesTable.fullName,
        position: employeesTable.position,
        departmentId: employeesTable.departmentId,
        hiredAt: employeesTable.hiredAt,
        orgRole: employeesTable.orgRole,
        reportsToId: employeesTable.reportsToId,
        location: employeesTable.location,
        employmentStatus: employeesTable.employmentStatus,
        userId: employeesTable.userId,
        createdAt: employeesTable.createdAt,
      })
      .from(employeesTable)
      .orderBy(asc(employeesTable.fullName));
    empRows = core.map((r) => ({ ...r, createdById: null }));
  }

  const usersById = new Map(users.map((u) => [u.id, u]));
  const deptById = new Map(depts.map((d) => [d.id, d.name]));
  const empById = new Map(empRows.map((e) => [e.id, e]));
  const ctx = { usersById, deptById, empById };

  const people = empRows.map((e) => toPerson(e, ctx));

  const active = people.filter((p) => isActiveEmp(p.employmentStatus));
  let coords = active.filter((p) => p.orgRole === "coordinator");
  const coordIds = new Set(coords.map((c) => c.employeeId));
  for (const p of active) {
    if (p.loginRole === "koordinator" && p.employeeId != null && !coordIds.has(p.employeeId)) {
      coords = [...coords, p];
      coordIds.add(p.employeeId);
    }
  }

  const mudirsAll = active.filter((p) => p.orgRole === "manager");
  const staffAll = active.filter(
    (p) => p.orgRole === "pharmacist" || p.orgRole === "intern" || p.orgRole === "supervisor",
  );

  let allowedCoordIds: Set<number> | null = null;
  let allowedMudirIds: Set<number> | null = null;
  let scoped = false;

  if (!opts.full && opts.scopeUserId) {
    scoped = true;
    if (opts.scopeRole === "koordinator") {
      const mine = coords.filter((c) => c.userId === opts.scopeUserId);
      allowedCoordIds = new Set(mine.map((c) => c.employeeId).filter((id): id is number => id != null));
      allowedMudirIds = new Set(
        mudirsAll
          .filter((m) => m.reportsToEmployeeId != null && allowedCoordIds!.has(m.reportsToEmployeeId))
          .map((m) => m.employeeId)
          .filter((id): id is number => id != null),
      );
    } else if (opts.scopeRole === "mudir") {
      const mine = mudirsAll.filter((m) => m.userId === opts.scopeUserId);
      allowedMudirIds = new Set(mine.map((m) => m.employeeId).filter((id): id is number => id != null));
      allowedCoordIds = new Set(
        mine
          .map((m) => m.coordinatorEmployeeId)
          .filter((id): id is number => id != null),
      );
    }
  }

  const inScopePerson = (p: HolatPerson) => {
    if (!scoped) return true;
    if (p.orgRole === "coordinator") return p.employeeId != null && allowedCoordIds?.has(p.employeeId);
    if (p.orgRole === "manager") return p.employeeId != null && allowedMudirIds?.has(p.employeeId);
    if (p.orgRole === "pharmacist" || p.orgRole === "intern" || p.orgRole === "supervisor") {
      return p.mudirEmployeeId != null && allowedMudirIds?.has(p.mudirEmployeeId);
    }
    return opts.full;
  };

  const coordsF = coords.filter(inScopePerson);
  const mudirsF = mudirsAll.filter(inScopePerson);
  const staffF = staffAll.filter(inScopePerson);
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

  const coordinatorNodes: HolatCoordNode[] = coordsF.map((c) => {
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

  const branches: HolatBranch[] = mudirsF.map((m) => {
    const staff = (m.employeeId != null ? staffByMudir.get(m.employeeId) : undefined) ?? [];
    const pc = staff.filter((s) => s.orgRole === "pharmacist").length;
    const ic = staff.filter((s) => s.orgRole === "intern").length;
    return {
      branch: m.branch,
      mudirEmployeeId: m.employeeId!,
      mudirName: m.fullName,
      coordinatorName: m.coordinatorName,
      pharmacistCount: pc,
      internCount: ic,
      staffCount: staff.length,
      hasStaff: staff.length > 0,
    };
  });

  const addedMap = new Map<string, HolatAddedBy>();
  for (const p of [...mudirsF, ...pharmacists, ...interns]) {
    const key = p.createdByUserId != null ? String(p.createdByUserId) : "unknown";
    const cur = addedMap.get(key) ?? {
      userId: p.createdByUserId,
      fullName: p.createdByName || "Noma’lum (daraxt/yozuv yo‘q)",
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

  const loginActive = users.filter((u) => u.status === "active" || u.status === "on_leave");
  const countRole = (role: string) => loginActive.filter((u) => u.role === role).length;

  const headName = (id: number | null) => {
    if (id == null) return null;
    return usersById.get(id)?.fullName ?? null;
  };

  const networkPeople = [...coordsF, ...mudirsF, ...staffF];

  return {
    generatedAt: fmtTs(new Date()) || new Date().toISOString(),
    source:
      "employees.reports_to_id (koordinator→mudir→farmasevt/stajyor) + users + departments",
    scoped,
    pharmacyCounts: {
      coordinators: coordsF.length,
      mudirs: mudirsF.length,
      pharmacists: pharmacists.length,
      interns: interns.length,
      supervisors: supervisors.length,
      total: coordsF.length + mudirsF.length + staffF.length,
    },
    loginCounts: {
      koordinator: countRole("koordinator"),
      mudir: countRole("mudir"),
      farmasevt: countRole("farmasevt"),
      stajyor: countRole("stajyor"),
      other: loginActive.filter(
        (u) => !["koordinator", "mudir", "farmasevt", "stajyor"].includes(u.role),
      ).length,
      total: loginActive.length,
    },
    office: {
      departments: depts.length,
      employeesTotal: people.length,
      usersTotal: users.length,
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
    networkPeople,
    allEmployees: opts.full ? people : people.filter(inScopePerson),
    departments: depts.map((d) => ({
      id: d.id,
      name: d.name,
      headId: d.headId,
      headName: headName(d.headId),
      employeeCount: people.filter((p) => p.departmentId === d.id).length,
      createdAt: fmtTs(d.createdAt),
    })),
    allUsers: users.map((u) => {
      const n = splitName(u.fullName);
      return {
        id: u.id,
        firstName: n.firstName,
        lastName: n.lastName,
        fullName: u.fullName,
        role: u.role,
        roleLabel: LOGIN_UZ[u.role] || u.role,
        login: u.login,
        phone: u.phone,
        departmentName: u.departmentId != null ? deptById.get(u.departmentId) || "—" : "—",
        status: u.status,
        statusLabel: USER_STATUS_UZ[u.status] || u.status,
        createdAt: fmtTs(u.createdAt),
      };
    }),
  };
}