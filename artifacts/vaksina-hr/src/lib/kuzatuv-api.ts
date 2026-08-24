import { useQuery } from "@tanstack/react-query";

export type KuzatuvPersonListItem = {
  id: number;
  fullName: string;
  login: string;
  role: string;
  roleLabel: string;
  phone?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  tasksOpen: number;
  tasksDone: number;
};

export type OrgEmployeeView = {
  id: number;
  fullName: string;
  position: string | null;
  orgRole: string | null;
  orgRoleLabel: string;
  location: string | null;
  employmentStatus: string;
  employmentStatusLabel: string;
  shiftType: string | null;
  shiftLabel: string | null;
  shiftDisplay: string;
  userId: number | null;
  hiredAt: string | null;
  reportsToId: number | null;
  createdAt: string;
  managerName?: string | null;
  departmentId?: number | null;
};

export type KuzatuvPeopleResponse = {
  people: KuzatuvPersonListItem[];
  roles: Array<{ value: string; label: string }>;
};

export type KuzatuvRecruiter = {
  id: number;
  fullName: string;
  login?: string;
  vacanciesTotal: number;
  vacanciesPublished: number;
  vacanciesClosed?: number;
  candidatesActive: number;
  candidatesHired: number;
  candidatesRejected?: number;
  candidatesTotal?: number;
  phoneInterviews: number;
  offlineInterviews?: number;
  tasksOpen: number;
  tasksDone: number;
  tasksTotal?: number;
};

export type KuzatuvTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  assigneeId?: number | null;
  assigneeName: string;
  assigneeKind: string;
  createdById?: number;
  createdByName: string;
  updatedAt: string;
  description?: string | null;
  completedAt?: string | null;
  completionNote?: string | null;
  createdAt?: string;
};

export type KuzatuvResponse = {
  level: "full" | "summary";
  summary: {
    openRequests: number;
    activeVacancies: number;
    activeCandidates: number;
    hiredCandidates: number;
    phoneInterviews: number;
    onlineInterviews?: number;
    offlineInterviews?: number;
    tasksOpen: number;
    tasksDone: number;
    recruitersCount: number;
  };
  recruiters: KuzatuvRecruiter[];
  tasks: KuzatuvTask[];
  pipeline?: { stage: string; count: number }[];
};

export type PersonDetail = {
  level: "full" | "summary";
  person: {
    id: number;
    fullName: string;
    login?: string;
    role: string;
    roleLabel?: string;
    status: string;
    phone?: string | null;
    departmentId?: number | null;
    departmentName?: string | null;
  };
  employee?: OrgEmployeeView | null;
  reportsTo?: OrgEmployeeView | null;
  /** Mudir uchun — uning koordinatori */
  coordinator?: (OrgEmployeeView & { label?: string }) | null;
  managedManagers?: OrgEmployeeView[];
  managedStaff?: OrgEmployeeView[];
  branches?: Array<{
    managerEmployeeId: number;
    managerName: string;
    location: string | null;
    orgRoleLabel: string;
    employmentStatus: string;
    employmentStatusLabel: string;
    shiftDisplay: string;
    userId: number | null;
    staffCount: number;
    auditsCount: number;
    needsOpen: number;
    needsTotal: number;
    tasksOpen: number;
    tasksDone: number;
    latestAudit: {
      id: number;
      visitDate: string;
      visitName: string;
      scorePercent: number;
      yesCount: number;
      noCount: number;
      totalCount: number;
      status: string;
    } | null;
  }>;
  audits?: Array<{
    id: number;
    managerEmployeeId: number;
    branchLocation: string | null;
    managerName: string | null;
    visitDate: string;
    visitName: string;
    scorePercent: number;
    yesCount: number;
    noCount: number;
    answeredCount: number;
    totalCount: number;
    status: string;
    createdAt: string | null;
  }>;
  needs?: Array<{
    id: number;
    needType: string;
    branchLocation: string | null;
    managerEmployeeId: number | null;
    managerName: string | null;
    note: string | null;
    status: string;
    statusLabel: string;
    taskId: number | null;
    createdAt: string | null;
    confirmedAt: string | null;
    completedAt: string | null;
    verifiedAt: string | null;
  }>;
  networkTasks?: Array<{
    id: number;
    title: string;
    status: string;
    statusLabel: string;
    priority: string;
    dueAt: string | null;
    assigneeId: number;
    assigneeName: string;
    createdByName: string;
    completionNote?: string | null;
    completedAt: string | null;
    createdAt: string | null;
  }>;
  summary: {
    vacanciesTotal: number;
    vacanciesPublished: number;
    vacanciesClosed: number;
    vacanciesDraft: number;
    candidatesTotal: number;
    candidatesActive: number;
    candidatesHired: number;
    candidatesRejected: number;
    phoneInterviews: number;
    onlineInterviews: number;
    offlineInterviews: number;
    tasksAssignedOpen: number;
    tasksAssignedDone: number;
    tasksCreated: number;
    mudirsCount?: number;
    staffCount?: number;
    staffWorking?: number;
    staffNeedHire?: number;
    branchesCount?: number;
    auditsCount?: number;
    auditsAvgScore?: number | null;
    needsOpen?: number;
    needsTotal?: number;
    networkTasksOpen?: number;
    networkTasksDone?: number;
  };
  vacancies: Array<{
    id: number;
    title: string;
    status: string;
    statusLabel: string;
    location: string | null;
    deadline: string | null;
    publishedAt: string | null;
    assignedAt: string | null;
    acceptedAt: string | null;
    createdAt: string;
  }>;
  candidates: Array<{
    id: number;
    fullName: string;
    phone?: string;
    stage: string;
    stageLabel: string;
    status: string;
    statusLabel: string;
    vacancyTitle: string;
    vacancyId: number;
    createdAt: string;
    updatedAt: string;
  }>;
  phoneInterviews: Array<{
    id: number;
    candidateName: string;
    candidateId: number;
    interviewDate: string | null;
    status: string;
    statusLabel: string;
    notes?: string | null;
    rejectReason?: string | null;
    createdAt: string;
  }>;
  onlineInterviews: Array<{
    id: number;
    candidateName: string;
    candidateId: number;
    interviewDate: string | null;
    score: number | null;
    experienceLevel: string | null;
    notes?: string | null;
    createdAt: string;
  }>;
  offlineInterviews: Array<{
    id: number;
    roleInInterview: "hr" | "trainer";
    candidateName: string;
    candidateId: number;
    scheduledDate: string;
    scheduledTime: string | null;
    attendanceStatus: string;
    result: string | null;
    hrScore?: number | null;
    trainerScore?: number | null;
    resultNotes?: string | null;
    createdAt: string;
  }>;
  tasksAssigned: Array<{
    id: number;
    title: string;
    description?: string | null;
    status: string;
    statusLabel: string;
    priority: string;
    dueAt: string | null;
    assigneeName: string;
    createdByName: string;
    completionNote?: string | null;
    completedAt: string | null;
    acceptedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  tasksCreated: Array<{
    id: number;
    title: string;
    description?: string | null;
    status: string;
    statusLabel: string;
    priority: string;
    dueAt: string | null;
    assigneeName: string;
    createdByName: string;
    completionNote?: string | null;
    completedAt: string | null;
    acceptedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

async function fetchKuzatuv(): Promise<KuzatuvResponse> {
  const res = await fetch("/api/kuzatuv", { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || "Kuzatuv yuklanmadi");
  }
  return res.json();
}

async function fetchPerson(id: number): Promise<PersonDetail> {
  const res = await fetch(`/api/kuzatuv/person/${id}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || "Ma'lumot yuklanmadi");
  }
  return res.json();
}

async function fetchPeople(params?: { q?: string; role?: string }): Promise<KuzatuvPeopleResponse> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.role && params.role !== "all") sp.set("role", params.role);
  const qs = sp.toString();
  const res = await fetch(`/api/kuzatuv/people${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || "Xodimlar yuklanmadi");
  }
  return res.json();
}

export function useKuzatuvPeople(
  params: { q?: string; role?: string } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ["kuzatuv-people", params.q ?? "", params.role ?? "all"],
    queryFn: () => fetchPeople(params),
    enabled,
    refetchInterval: 45_000,
  });
}

export function useKuzatuv(enabled = true) {
  return useQuery({
    queryKey: ["kuzatuv"],
    queryFn: fetchKuzatuv,
    enabled,
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: false,
  });
}

export function useKuzatuvPerson(personId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["kuzatuv-person", personId],
    queryFn: () => fetchPerson(personId!),
    enabled: enabled && personId != null,
  });
}
