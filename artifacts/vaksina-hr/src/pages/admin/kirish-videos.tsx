import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Link2, Plus, Trash2, Video } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  useClearKirishVideo,
  useKirishAdminVideos,
  useSaveKirishVideo,
  type KirishAdminQuestion,
} from "@/lib/kirish-api";

function previewYoutubeId(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0] || "";
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") &&
        parts[1] &&
        /^[\w-]{11}$/.test(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function emptyQuestion(): KirishAdminQuestion {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    options: ["", "", "", ""],
    correctIndex: 0,
  };
}

type Draft = { youtube: string; pdf: string; questions: KirishAdminQuestion[] };

export default function AdminKirishVideosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const list = useKirishAdminVideos(isAdmin);
  const save = useSaveKirishVideo();
  const clear = useClearKirishVideo();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [activeStage, setActiveStage] = useState(1);

  useEffect(() => {
    if (!list.data?.videos) return;
    const next: Record<number, Draft> = {};
    for (const v of list.data.videos) {
      next[v.stage] = {
        youtube: v.youtubeUrl,
        pdf: v.pdfUrl || "",
        questions: v.questions?.length ? v.questions : [emptyQuestion()],
      };
    }
    setDrafts(next);
  }, [list.data]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">Kirish materiallari</h1>
        <p className="mt-2 text-muted-foreground">Bu bo‘lim faqat admin uchun.</p>
      </div>
    );
  }

  const patch = (stage: number, part: Partial<Draft>) => {
    setDrafts((prev) => {
      const cur = prev[stage] || { youtube: "", pdf: "", questions: [emptyQuestion()] };
      return { ...prev, [stage]: { ...cur, ...part } };
    });
  };

  const onSave = (stage: number) => {
    const draft = drafts[stage] || { youtube: "", pdf: "", questions: [] };
    const questions = draft.questions
      .map((q) => ({
        ...q,
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean),
      }))
      .filter((q) => q.text && q.options.length >= 2);
    if (!draft.youtube.trim() && !draft.pdf.trim() && questions.length === 0) {
      toast({
        title: "Bo‘sh",
        description: "YouTube, PDF yoki test savolini yozing",
        variant: "destructive",
      });
      return;
    }
    save.mutate(
      {
        stage,
        youtubeUrl: draft.youtube.trim(),
        pdfUrl: draft.pdf.trim(),
        questions,
      },
      {
        onSuccess: () =>
          toast({ title: "Saqlandi", description: `${stage}-bosqich yangilandi` }),
        onError: (err) =>
          toast({
            title: "Xatolik",
            description: err instanceof Error ? err.message : "Saqlanmadi",
            variant: "destructive",
          }),
      },
    );
  };

  const onClear = (stage: number) => {
    clear.mutate(stage, {
      onSuccess: () => {
        setDrafts((prev) => ({
          ...prev,
          [stage]: { youtube: "", pdf: "", questions: [emptyQuestion()] },
        }));
        toast({ title: "O‘chirildi", description: `${stage}-bosqich materiallari olib tashlandi` });
      },
      onError: (err) =>
        toast({
          title: "Xatolik",
          description: err instanceof Error ? err.message : "O‘chirilmadi",
          variant: "destructive",
        }),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10 sm:space-y-5">
      <div className="overflow-hidden rounded-2xl bg-[#0b3a5c] px-4 py-4 text-white shadow-sm sm:px-6 sm:py-5">
        <Link
          href="/dashboard"
          className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/25"
        >
          <ArrowLeft className="h-4 w-4" />
          Chiqish
        </Link>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Kirish materiallari</h1>
        <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-sky-100/85 sm:text-sm">
          Bosqichga YouTube, Drive PDF va test qo‘shing. Drive faylini «Havola orqali ko‘ra
          oladiganlar» qiling.
        </p>
      </div>

      {list.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : list.isError ? (
        <p className="text-red-600">{(list.error as Error)?.message || "Yuklanmadi"}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-8 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            {(list.data?.videos ?? []).map((item) => (
              <button
                key={item.stage}
                type="button"
                onClick={() => setActiveStage(item.stage)}
                className={cn(
                  "flex h-12 min-w-[3.35rem] shrink-0 flex-col items-center justify-center rounded-xl px-2 text-center transition sm:min-w-0 sm:w-full",
                  activeStage === item.stage
                    ? "bg-[#0b3a5c] text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-[#0b3a5c]/30 hover:bg-slate-50",
                )}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">
                  Bosqich
                </span>
                <span className="text-base font-bold tabular-nums leading-none">{item.stage}</span>
              </button>
            ))}
          </div>
          {(() => {
            const v = (list.data?.videos ?? []).find((item) => item.stage === activeStage);
            if (!v) return null;
            const draft = drafts[v.stage] ?? {
              youtube: v.youtubeUrl,
              pdf: v.pdfUrl || "",
              questions: v.questions?.length ? v.questions : [emptyQuestion()],
            };
            const previewId = previewYoutubeId(draft.youtube) || v.youtubeId;
            const busy =
              (save.isPending && save.variables?.stage === v.stage) ||
              (clear.isPending && clear.variables === v.stage);
            return (
              <Card key={v.stage} className="overflow-hidden border-slate-200/80 shadow-sm">
                <CardHeader className="space-y-1 px-4 pb-3 pt-4 sm:px-6">
                  <CardTitle className="flex items-center gap-2 text-base text-[#0b3a5c]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0b3a5c] text-white">
                      <Video className="h-3.5 w-3.5" />
                    </span>
                    {v.stage}-bosqich
                  </CardTitle>
                  <p className="text-sm font-medium text-slate-700">{v.title}</p>
                </CardHeader>
                <CardContent className="space-y-4 px-4 pb-5 sm:space-y-5 sm:px-6">
                  {previewId ? (
                    <img
                      src={`https://img.youtube.com/vi/${previewId}/hqdefault.jpg`}
                      alt={`${v.stage}-bosqich preview`}
                      className="aspect-video w-full rounded-xl border object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed bg-slate-50 text-slate-400">
                      <Link2 className="h-8 w-8" />
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`yt-${v.stage}`}>YouTube video</Label>
                      <Input
                        id={`yt-${v.stage}`}
                        className="h-11 rounded-xl text-base md:h-9 md:text-sm"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={draft.youtube}
                        onChange={(e) => patch(v.stage, { youtube: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`pdf-${v.stage}`} className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        PDF slayd (Google Drive)
                      </Label>
                      <Input
                        id={`pdf-${v.stage}`}
                        className="h-11 rounded-xl text-base md:h-9 md:text-sm"
                        placeholder="https://drive.google.com/file/d/..."
                        value={draft.pdf}
                        onChange={(e) => patch(v.stage, { pdf: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Test savollari</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl border-[#0b3a5c]/20 text-[#0b3a5c]"
                        onClick={() =>
                          patch(v.stage, { questions: [...draft.questions, emptyQuestion()] })
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Savol
                      </Button>
                    </div>
                    {draft.questions.map((q, qi) => (
                      <div
                        key={q.id}
                        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-2 text-xs font-semibold text-[#0b3a5c]">{qi + 1}.</span>
                          <Textarea
                            className="min-h-[64px] bg-white"
                            placeholder="Savol matni"
                            value={q.text}
                            onChange={(e) => {
                              const questions = draft.questions.map((item, i) =>
                                i === qi ? { ...item, text: e.target.value } : item,
                              );
                              patch(v.stage, { questions });
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-slate-500"
                            disabled={draft.questions.length <= 1}
                            onClick={() =>
                              patch(v.stage, {
                                questions: draft.questions.filter((_, i) => i !== qi),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-[11px] text-slate-500">To‘g‘ri javobni belgilang</p>
                        <div className="grid gap-2">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${v.stage}-${q.id}`}
                                className="h-4 w-4 accent-[#0b3a5c]"
                                checked={q.correctIndex === oi}
                                onChange={() => {
                                  const questions = draft.questions.map((item, i) =>
                                    i === qi ? { ...item, correctIndex: oi } : item,
                                  );
                                  patch(v.stage, { questions });
                                }}
                              />
                              <Input
                                className="h-11 rounded-xl bg-white text-base md:h-9 md:text-sm"
                                placeholder={`${oi + 1}-variant`}
                                value={opt}
                                onChange={(e) => {
                                  const questions = draft.questions.map((item, i) => {
                                    if (i !== qi) return item;
                                    const options = [...item.options];
                                    options[oi] = e.target.value;
                                    return { ...item, options };
                                  });
                                  patch(v.stage, { questions });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:max-w-md">
                    <Button
                      className="h-11 rounded-xl bg-[#0b3a5c] hover:bg-[#0a314d] sm:min-w-[8rem]"
                      disabled={busy}
                      onClick={() => onSave(v.stage)}
                    >
                      {busy && save.variables?.stage === v.stage ? "Saqlanmoqda..." : "Saqlash"}
                    </Button>
                    {v.youtubeId || v.driveFileId || (v.questions && v.questions.length > 0) ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl"
                        disabled={busy}
                        onClick={() => onClear(v.stage)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Tozalash
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}
    </div>
  );
}

