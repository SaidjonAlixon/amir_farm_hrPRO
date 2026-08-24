import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, UserRoundMinus, Users } from "lucide-react";
import { getGetEmployeesQueryKey } from "@workspace/api-client-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { useToast } from "../../hooks/use-toast";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import { EmployeesTabs } from "./employees-tabs";

type DuplicateMember = {
  id: number;
  fullName: string;
  position: string;
  orgRole: string | null;
  employmentStatus: string;
  location: string | null;
  shiftType: string | null;
  shiftLabel: string | null;
  hiredAt: string;
  departmentName: string | null;
  userId: number | null;
  userLogin: string | null;
  userPhone: string | null;
  userStatus: string | null;
  hasTelegram: boolean;
  hasFace: boolean;
  attendanceCount: number;
  usedSystem: boolean;
  suggestedKeep: boolean;
};

type DuplicateGroup = {
  key: string;
  keepId: number;
  members: DuplicateMember[];
};

const ORG_ROLE_UZ: Record<string, string> = {
  coordinator: "Koordinator",
  manager: "Mudir",
  pharmacist: "Farmasevt",
  intern: "Stajyor",
  supervisor: "Nazoratchi",
};

const STATUS_UZ: Record<string, string> = {
  working: "Ishlayapti",
  new: "Yangi",
  dismissed: "Bo‘shatilgan",
  on_leave: "Ta’tilda",
  need_hire: "Yollash kerak",
  searching: "Qidiruvda",
  no_manager: "Mudir yo‘q",
  closed: "Yopilgan",
};

function canCleanupDuplicates(role?: string | null) {
  return ["admin", "hr", "hr_direktor", "hr_menejer", "hr_auditor"].includes(role || "");
}

function shiftText(m: DuplicateMember) {
  if (m.shiftType === "custom" && m.shiftLabel) return m.shiftLabel;
  if (m.shiftType === "one") return "1 smena";
  if (m.shiftType === "two") return "2 smena";
  return m.shiftType || "—";
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || "Xatolik");
  return body;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default function EmployeeDuplicatesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const allowed = canCleanupDuplicates(user?.role);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["employees", "duplicates"],
    queryFn: () =>
      apiJson<{ groups: DuplicateGroup[]; groupCount: number; extraCount: number }>("/api/employees/duplicates"),
    enabled: allowed,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["employees", "duplicates"] });
    await qc.invalidateQueries({ queryKey: getGetEmployeesQueryKey() });
    await q.refetch();
  };

  const cleanAll = async () => {
    if (busy) return;
    if (!window.confirm("Barcha dublikatlarda tavsiya etilgan yozuv qoladi, qolganlari o‘chiriladi. Davom etasizmi?")) {
      return;
    }
    setBusy("all");
    try {
      const body = await apiJson<{ removedCount?: number; groups?: number }>("/api/employees/cleanup-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await refresh();
      toast({
        title: "Barchasi tozalandi",
        description: `${body.removedCount ?? 0} ta akkount o‘chirildi (${body.groups ?? 0} ta guruh)`,
      });
    } catch (err) {
      toast({ title: "Tozalanmadi", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const cleanOne = async (keepId: number, dropId: number, name: string, isSuggestedKeep: boolean) => {
    if (busy) return;
    const msg = isSuggestedKeep
      ? `${name} (ID ${dropId}) yashil “qoladi” yozuvi. O‘chirilsinmi? ID ${keepId} qoladi.`
      : `${name} (ID ${dropId}) o‘chirilsinmi? ID ${keepId} qoladi.`;
    if (!window.confirm(msg)) return;
    setBusy(`${keepId}-${dropId}`);
    try {
      await apiJson("/api/employees/cleanup-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, dropId }),
      });
      await refresh();
      toast({ title: "O‘chirildi", description: `${name} dublikati olib tashlandi` });
    } catch (err) {
      toast({ title: "O‘chmadi", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-xl font-bold">Dublikatlar</h1>
        <p className="mt-2 text-sm text-slate-500">Faqat HR va admin ko‘radi.</p>
      </div>
    );
  }

  const groups = q.data?.groups ?? [];

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl bg-[#0b3a5c] px-4 py-4 text-white shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <Users className="h-6 w-6 opacity-90" />
            Dublikatlar
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Bir xil ism-familiya · {q.isLoading ? "…" : `${q.data?.groupCount ?? 0} guruh, ${q.data?.extraCount ?? 0} ta ortiqcha`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EmployeesTabs />
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-white text-[#0b3a5c] hover:bg-white/90"
            disabled={!!busy || q.isLoading || groups.length === 0}
            onClick={() => void cleanAll()}
          >
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundMinus className="h-4 w-4" />}
            Barchasini tozalash
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : q.isError ? (
        <p className="text-sm text-rose-700">{(q.error as Error).message}</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            Dublikat topilmadi — har ismdan bitta yozuv.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
              <div className="border-b bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{g.members[0]?.fullName}</p>
                <p className="text-xs text-slate-500">{g.members.length} ta akkount · qolishi tavsiya: ID {g.keepId}</p>
              </div>
              <div className="grid gap-3 p-4 lg:grid-cols-2">
                {g.members.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl border p-3",
                      m.suggestedKeep ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#0b3a5c]">{m.fullName}</p>
                        <p className="text-xs text-slate-500">ID {m.id}</p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          m.suggestedKeep ? "bg-emerald-600 text-white" : "bg-rose-100 text-rose-800",
                        )}
                      >
                        {m.suggestedKeep ? "Qoladi" : "Dublikat"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Fact label="Lavozim" value={m.position} />
                      <Fact label="Rol" value={m.orgRole ? ORG_ROLE_UZ[m.orgRole] || m.orgRole : "—"} />
                      <Fact label="Holat" value={STATUS_UZ[m.employmentStatus] || m.employmentStatus} />
                      <Fact label="Bo‘lim" value={m.departmentName} />
                      <Fact label="Filial" value={m.location} />
                      <Fact label="Smena" value={shiftText(m)} />
                      <Fact label="Ishga olingan" value={m.hiredAt} />
                      <Fact label="Login" value={m.userLogin || (m.userId ? `user #${m.userId}` : "akkaunt yo‘q")} />
                      <Fact label="Telefon" value={m.userPhone} />
                      <Fact label="User holati" value={m.userStatus} />
                      <Fact label="Telegram" value={m.hasTelegram ? "Bor" : "Yo‘q"} />
                      <Fact label="Face ID" value={m.hasFace ? "Bor" : "Yo‘q"} />
                      <Fact label="Davomat" value={`${m.attendanceCount} ta`} />
                      <Fact label="Tizimga kirgan" value={m.usedSystem ? "Ha" : "Yo‘q"} />
                    </div>
                    {g.members.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3 h-8 gap-1.5 text-rose-700"
                        disabled={!!busy}
                        onClick={() => {
                          const keepId =
                            m.id === g.keepId
                              ? g.members.find((x) => x.id !== m.id)!.id
                              : g.keepId;
                          void cleanOne(keepId, m.id, m.fullName, m.suggestedKeep);
                        }}
                      >
                        {busy && busy !== "all" && busy.endsWith(`-${m.id}`) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Shu yozuvni o‘chirish
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
