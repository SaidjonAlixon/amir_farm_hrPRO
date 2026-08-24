import { useQuery } from "@tanstack/react-query";
import { downloadHolatXlsxFile, type HolatExcelSection } from "./holat-excel";

export type { HolatExcelSection };

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

export type HolatReport = {
  generatedAt: string;
  source: string;
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
  office: { departments: number; employeesTotal: number; usersTotal: number };
  addedBy: Array<{
    userId: number | null;
    fullName: string;
    role: string | null;
    roleLabel: string;
    mudirs: number;
    pharmacists: number;
    interns: number;
    total: number;
  }>;
  coordinators: HolatCoordNode[];
  branchesWithStaff: Array<{
    branch: string;
    mudirEmployeeId: number;
    mudirName: string;
    coordinatorName: string | null;
    pharmacistCount: number;
    internCount: number;
    staffCount: number;
    hasStaff: boolean;
  }>;
  branchesWithoutStaff: Array<{
    branch: string;
    mudirEmployeeId: number;
    mudirName: string;
    coordinatorName: string | null;
    pharmacistCount: number;
    internCount: number;
    staffCount: number;
    hasStaff: boolean;
  }>;
  coordinatorsWithoutMudirs: HolatPerson[];
  orphans: { mudirs: HolatPerson[]; staff: HolatPerson[] };
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

async function jsonOrThrow(res: Response, fallback: string) {
  if (res.ok) return res.json();
  let message = res.statusText || fallback;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* ignore */
  }
  throw new Error(message);
}

export async function loadHolatReport(): Promise<HolatReport> {
  const direct = await fetch("/api/holat", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (direct.ok) return direct.json();

  const [empRes, userRes, deptRes] = await Promise.all([
    fetch("/api/employees", { credentials: "include", headers: { Accept: "application/json" } }),
    fetch("/api/users", { credentials: "include", headers: { Accept: "application/json" } }),
    fetch("/api/departments", { credentials: "include", headers: { Accept: "application/json" } }),
  ]);
  if (!empRes.ok) {
    throw new Error("Xodimlar ro‘yxati yuklanmadi — Holat ochilmadi");
  }
  const employees = await jsonOrThrow(empRes, "Xodimlar yuklanmadi");
  const users = userRes.ok ? await userRes.json() : [];
  const departments = deptRes.ok ? await deptRes.json() : [];
  const { assembleHolatReport } = await import("./holat-assemble");
  return assembleHolatReport({ employees, users, departments });
}

export function useHolat(enabled = true) {
  return useQuery({
    queryKey: ["holat"],
    queryFn: loadHolatReport,
    enabled,
    staleTime: 30_000,
  });
}

export async function downloadHolatExcel(
  report: HolatReport | undefined,
  section: HolatExcelSection,
  coordinatorEmployeeId?: number | null,
) {
  const data = report ?? (await loadHolatReport());
  await downloadHolatXlsxFile(data, section, coordinatorEmployeeId);
}
