import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, MapPin, Search, Users, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useToast } from "../../hooks/use-toast";
import { cn } from "../../lib/utils";
import {
  assignSmenaBranch,
  fetchSmenaMe,
  saveMySmena,
  type SmenaAssignable,
  type SmenaBranch,
} from "../../lib/smena-api";

function orgLabel(org: string | null) {
  if (org === "pharmacist") return "Farmasevt";
  if (org === "intern") return "Stajyor";
  if (org === "manager") return "Mudir";
  return "Xodim";
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 pl-8" />
    </div>
  );
}

function CompactList({ children }: { children: React.ReactNode }) {
  return <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">{children}</div>;
}

export default function SmenaFilialPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["smena-me"], queryFn: fetchSmenaMe });
  const data = q.data;

  const [branchQ, setBranchQ] = useState("");
  const [peopleQ, setPeopleQ] = useState("");
  const [pickedBranchId, setPickedBranchId] = useState<number | null>(null);
  const [pickedPersonId, setPickedPersonId] = useState<number | null>(null);
  const [pickedShift, setPickedShift] = useState<"one" | "two">("one");

  const staff = useMemo(
    () => (data?.assignable ?? []).filter((p) => p.orgRole === "pharmacist" || p.orgRole === "intern"),
    [data?.assignable],
  );

  const branches = useMemo(() => {
    const list = data?.branches ?? [];
    const s = branchQ.trim().toLowerCase();
    if (!s) return list;
    return list.filter((b) => `${b.name} ${b.managerName}`.toLowerCase().includes(s));
  }, [data?.branches, branchQ]);

  const people = useMemo(() => {
    const s = peopleQ.trim().toLowerCase();
    if (!s) return staff;
    return staff.filter((p) =>
      `${p.fullName} ${orgLabel(p.orgRole)} ${p.assignedBranchName || ""}`.toLowerCase().includes(s),
    );
  }, [staff, peopleQ]);

  const picked = staff.find((p) => p.id === pickedPersonId) ?? null;
  const pickedBranch = (data?.branches ?? []).find((b) => b.id === pickedBranchId) ?? null;

  const saveMine = useMutation({
    mutationFn: (body: { shiftType?: "one" | "two"; assignedBranchId?: number }) => saveMySmena(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smena-me"] });
      toast({ title: "Saqlandi" });
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  const saveAssign = useMutation({
    mutationFn: (p: { id: number; assignedBranchId: number; shiftType: "one" | "two" }) =>
      assignSmenaBranch(p.id, p.assignedBranchId, p.shiftType),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["smena-me"] });
      toast({ title: "Saqlandi", description: r.assignedBranchName });
      cancelEdit();
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  function pickPerson(p: SmenaAssignable) {
    setPickedPersonId(p.id);
    setPickedShift(p.shiftType === "two" ? "two" : "one");
    setPickedBranchId(p.assignedBranchId);
    setBranchQ("");
  }

  function cancelEdit() {
    setPickedPersonId(null);
    setPickedBranchId(null);
    setPickedShift("one");
    setBranchQ("");
  }

  function onSaveTeam() {
    if (!pickedPersonId || !pickedBranchId) {
      toast({ title: "Tanlang", description: "Xodim va filialni tanlang.", variant: "destructive" });
      return;
    }
    saveAssign.mutate({ id: pickedPersonId, assignedBranchId: pickedBranchId, shiftType: pickedShift });
  }

  function renderBranchRow(b: SmenaBranch) {
    const on = pickedBranchId === b.id;
    return (
      <button
        key={b.id}
        type="button"
        onClick={() => setPickedBranchId(b.id)}
        className={cn(
          "flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-1.5 text-left last:border-0",
          on ? "bg-sky-50" : "hover:bg-slate-50",
        )}
      >
        <span className="min-w-0 truncate text-sm text-slate-800">{b.name}</span>
        {on ? <Check className="h-4 w-4 shrink-0 text-sky-600" /> : null}
      </button>
    );
  }

  if (q.isLoading) return <p className="p-6 text-sm text-slate-500">Yuklanmoqda…</p>;
  if (!data) return <p className="p-6 text-sm text-rose-600">Ma’lumot yuklanmadi</p>;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-28">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Smena va filial</h1>
        <p className="mt-1 text-sm text-slate-600">Xodimni tanlang, pastdan filial va smenani belgilang, Saqlash.</p>
      </div>

      {data.canPickShift ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4" />
              Mening smenam
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 pt-0">
            <Button
              size="sm"
              variant={data.shift.type === "one" ? "default" : "outline"}
              disabled={saveMine.isPending}
              onClick={() => saveMine.mutate({ shiftType: "one" })}
            >
              1-smena
            </Button>
            <Button
              size="sm"
              variant={data.shift.type === "two" ? "default" : "outline"}
              disabled={saveMine.isPending}
              onClick={() => saveMine.mutate({ shiftType: "two" })}
            >
              2-smena
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data.canAssignOthers ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Farmasevt va stajyorlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <SearchBox value={peopleQ} onChange={setPeopleQ} placeholder="Ism yozib qidirish…" />
            <CompactList>
              {people.map((p) => {
                const on = pickedPersonId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPerson(p)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 text-left last:border-0",
                      on ? "bg-sky-50" : "hover:bg-slate-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{p.fullName}</span>
                      <span className="text-[11px] text-slate-500">
                        {orgLabel(p.orgRole)} · {p.shiftType === "two" ? "2-smena" : "1-smena"} ·{" "}
                        {p.assignedBranchName || "filial yo‘q"}
                      </span>
                    </span>
                    {on ? <Check className="h-4 w-4 shrink-0 text-sky-600" /> : null}
                  </button>
                );
              })}
              {people.length === 0 ? <p className="px-3 py-4 text-center text-sm text-slate-400">Xodim topilmadi</p> : null}
            </CompactList>

            {picked ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{picked.fullName}</p>
                    <p className="text-[11px] text-slate-500">{orgLabel(picked.orgRole)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <MapPin className="h-3.5 w-3.5" />
                    Filial {pickedBranch ? `· ${pickedBranch.name}` : ""}
                  </p>
                  <SearchBox value={branchQ} onChange={setBranchQ} placeholder="Filial qidirish…" />
                  <CompactList>
                    {branches.map(renderBranchRow)}
                    {branches.length === 0 ? (
                      <p className="px-3 py-3 text-center text-xs text-slate-400">Filial topilmadi</p>
                    ) : null}
                  </CompactList>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={pickedShift === "one" ? "default" : "outline"} onClick={() => setPickedShift("one")}>
                    1-smena
                  </Button>
                  <Button size="sm" variant={pickedShift === "two" ? "default" : "outline"} onClick={() => setPickedShift("two")}>
                    2-smena
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    <X className="mr-1 h-4 w-4" />
                    Bekor qilish
                  </Button>
                  <Button type="button" disabled={saveAssign.isPending} onClick={onSaveTeam}>
                    Saqlash
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400">Xodimni bosing — pastda filial ochiladi</p>
            )}
          </CardContent>
        </Card>
      ) : data.canPickOwnBranch ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Mening filiali
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <p className="text-xs text-slate-500">
              Face ID: <b className="text-slate-800">{data.employee?.assignedBranchName || "—"}</b>
            </p>
            <SearchBox value={branchQ} onChange={setBranchQ} placeholder="Filial qidirish…" />
            <CompactList>{branches.map(renderBranchRow)}</CompactList>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { setPickedBranchId(data.employee?.assignedBranchId ?? null); setBranchQ(""); }}>
                Bekor qilish
              </Button>
              <Button
                disabled={!pickedBranchId || saveMine.isPending}
                onClick={() => pickedBranchId && saveMine.mutate({ assignedBranchId: pickedBranchId })}
              >
                Saqlash
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-slate-500">
          Filialingiz: <b>{data.employee?.assignedBranchName || "belgilanmagan"}</b>
        </p>
      )}
    </div>
  );
}
