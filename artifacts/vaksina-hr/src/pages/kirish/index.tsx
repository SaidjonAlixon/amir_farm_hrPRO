import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCompleteKirishSlides,
  useCompleteKirishVideo,
  useFinishKirish,
  useKirishMe,
  useSubmitKirishTest,
  type KirishFinishReport,
  type KirishStagePublic,
  type KirishStageState,
} from "@/lib/kirish-api";
import { RestrictedVideoPlayer } from "@/components/kirish/RestrictedVideoPlayer";
import { DrivePdfViewer } from "@/components/kirish/DrivePdfViewer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canAccessKirish } from "@/lib/roles";
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Lock,
  Play,
  Presentation,
  Video,
} from "lucide-react";

function stageState(
  stages: Record<string, KirishStageState> | undefined,
  n: number,
): KirishStageState {
  return (
    stages?.[String(n)] || {
      videoDone: false,
      slidesDone: false,
      score: null,
      attempts: 0,
      passed: false,
      passedAt: null,
    }
  );
}

function correctCountText(correct: number, total: number) {
  return `${total} ta savoldan ${correct} tasiga to‘g‘ri javob berildi`;
}

export default function KirishPage() {
  const { user } = useAuth();
  const me = useKirishMe();
  const completeVideo = useCompleteKirishVideo();
  const completeSlides = useCompleteKirishSlides();
  const submitTest = useSubmitKirishTest();
  const finish = useFinishKirish();

  const progress = me.data?.progress;
  const stageDefs = me.data?.stages ?? [];
  const [viewStage, setViewStage] = useState(1);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [lastResult, setLastResult] = useState<{
    score: number;
    passed: boolean;
    correct: number;
    total: number;
  } | null>(null);
  const [report, setReport] = useState<KirishFinishReport | null>(null);
  const testRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLElement>(null);
  const failAlertRef = useRef<HTMLDivElement>(null);
  const [sessionWatched, setSessionWatched] = useState(false);
  const [watchPercent, setWatchPercent] = useState(0);
  const [playerKey, setPlayerKey] = useState(0);

  useEffect(() => {
    if (progress?.currentStage) setViewStage(progress.currentStage);
  }, [progress?.currentStage]);

  useEffect(() => {
    setAnswers({});
    setLastResult(null);
    setSessionWatched(false);
    setWatchPercent(0);
  }, [viewStage]);

  const stageContent: KirishStagePublic | undefined = stageDefs.find(
    (s) => s.stage === viewStage,
  );
  const st = stageState(progress?.stages, viewStage);
  const locked = viewStage > (progress?.currentStage ?? 1);
  const canFinish = Boolean(progress?.allPassed);
  const finished = progress?.status === "ready_for_hire" || progress?.status === "hired";

  const testVisible = sessionWatched || st.passed;

  useEffect(() => {
    if (!sessionWatched) return;
    window.setTimeout(() => {
      testRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [sessionWatched]);

  const answeredCount = useMemo(
    () => Object.keys(answers).length,
    [answers],
  );

  useEffect(() => {
    if (locked || finished || !st.videoDone || st.slidesDone) return;
    void completeSlides.mutateAsync(viewStage).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat holat o‘zgaganda
  }, [locked, finished, st.videoDone, st.slidesDone, viewStage]);

  if (!canAccessKirish(user?.role)) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-slate-500">
        Bu bo‘lim faqat stajyor uchun.
      </div>
    );
  }

  if (me.isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Yuklanmoqda...
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="h-full flex items-center justify-center text-red-600 p-6">
        {(me.error as Error)?.message || "Xato"}
      </div>
    );
  }

  const onMarkVideo = async () => {
    try {
      await completeVideo.mutateAsync(viewStage);
      await completeSlides.mutateAsync(viewStage);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Xato");
    }
  };

  const onSubmit = async () => {
    if (!stageContent) return;
    if (!st.videoDone) {
      alert("Avval videoni oxirigacha ko‘ring");
      return;
    }
    if (answeredCount < stageContent.questions.length) {
      alert("Barcha savollarga javob bering");
      return;
    }
    try {
      if (!st.slidesDone) await completeSlides.mutateAsync(viewStage);
      const res = await submitTest.mutateAsync({
        stage: viewStage,
        answers,
      });
      setLastResult(res.result);
      if (res.result.passed) return;
      setAnswers({});
      setSessionWatched(false);
      setWatchPercent(0);
      setPlayerKey((k) => k + 1);
      window.setTimeout(() => {
        failAlertRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Xato");
    }
  };

  const onFinish = async () => {
    try {
      const res = await finish.mutateAsync();
      setReport(res.report);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Xato");
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#e8f4fc_0%,#f8fafc_45%,#eef2f7_100%)]">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-6">
        {lastResult && !lastResult.passed && !finished ? (
          <div
            ref={failAlertRef}
            role="alert"
            className="rounded-2xl border border-red-400 bg-red-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm sm:text-base"
          >
            Test o‘tilmadi: {correctCountText(lastResult.correct, lastResult.total)}.
            Kamida 50% kerak — videoni qayta ko‘ring.
          </div>
        ) : null}
        {finished || report ? (
          <section className="rounded-3xl border border-emerald-200 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {(report || { statusLabel: "Ishga qabulga tayyor" }).statusLabel}
                </h2>
                <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                  {report?.message ||
                    "Barcha bosqichlar yakunlangan. HR/admin ishga olishni ko‘rib chiqishi mumkin."}
                </p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(report?.stages ||
                Array.from({ length: progress?.stageCount ?? 8 }, (_, i) => i + 1).map((n) => ({
                  stage: n,
                  score: stageState(progress?.stages, n).score,
                  attempts: stageState(progress?.stages, n).attempts,
                  passedAt: stageState(progress?.stages, n).passedAt,
                }))).map((row) => (
                <div
                  key={row.stage}
                  className="rounded-2xl bg-slate-50 border border-slate-100 p-4"
                >
                  <div className="text-xs text-slate-500">Bosqich {row.stage}</div>
                  <div className="text-2xl font-semibold text-slate-900 mt-1">
                    {row.score ?? "—"}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Urinishlar: {row.attempts}
                  </div>
                </div>
              ))}
            </div>
            {report && (
              <p className="mt-4 text-sm font-medium text-emerald-700">
                O‘rtacha natija: {report.averageScore}%
              </p>
            )}
          </section>
        ) : null}

        {!finished && stageContent && !locked ? (
          <div className="space-y-5">
            <div className="grid grid-cols-8 gap-1.5">
              {Array.from({ length: progress?.stageCount ?? 8 }, (_, i) => i + 1).map((n) => {
                const passed = stageState(progress?.stages, n).passed;
                const isCurrent = n === viewStage;
                const isLocked = n > (progress?.currentStage ?? 1);
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={isLocked}
                    onClick={() => setViewStage(n)}
                    className={cn(
                      "rounded-xl py-2 text-sm font-semibold tabular-nums transition",
                      isCurrent && "bg-[#2AABEE] text-white shadow-sm",
                      !isCurrent &&
                        passed &&
                        "border border-emerald-200 bg-emerald-50 text-emerald-700",
                      !isCurrent &&
                        !passed &&
                        !isLocked &&
                        "border border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                      isLocked && "cursor-not-allowed bg-slate-100 text-slate-400",
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{stageContent.title}</h2>
              <p className="text-sm text-slate-500">{stageContent.subtitle}</p>
            </div>

            <section
              ref={videoRef}
              className="rounded-3xl border border-slate-200/80 bg-white shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                <Video className="h-4 w-4 text-[#2AABEE]" />
                <h3 className="text-sm font-semibold text-slate-900">Video</h3>
                {sessionWatched || st.passed ? (
                  <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
                ) : (
                  <span className="ml-auto text-xs font-medium tabular-nums text-slate-500">
                    {watchPercent}%
                  </span>
                )}
              </div>
              <div className="p-4 sm:p-5">
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
                  {stageContent.youtubeId ? (
                    <RestrictedVideoPlayer
                      key={`${stageContent.youtubeId}-${playerKey}`}
                      youtubeId={stageContent.youtubeId}
                      src={stageContent.videoUrl}
                      poster={`${import.meta.env.BASE_URL}kirish/stage1/poster.svg`}
                      onProgress={({ percent }) => setWatchPercent(percent)}
                      onEnded={() => {
                        setSessionWatched(true);
                        setWatchPercent(100);
                        void onMarkVideo();
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#0B1B2B] via-[#16324F] to-[#1B4F72]">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-2 ring-[#2AABEE]/40">
                        <Play className="h-7 w-7 text-[#F1C40F]" />
                      </div>
                      <p className="font-medium text-white">{stageContent.videoPosterHint}</p>
                      <p className="mt-2 max-w-sm text-sm text-slate-300">
                        Video hali biriktirilmagan. Admin YouTube havolasini qo‘shgach shu yerda ochiladi.
                      </p>
                    </div>
                  )}
                </div>
                {stageContent.youtubeId ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Play / pauza va orqaga qaytish mumkin. Oldinga o‘tkazish o‘chiq.
                    {sessionWatched
                      ? " Video tugadi — pastda test ochildi. Videoni qayta ko‘rishingiz mumkin."
                      : ` Test ochilishi uchun videoni 100% ko‘ring (${watchPercent}%).`}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                <Presentation className="h-4 w-4 text-[#2AABEE]" />
                <h3 className="text-sm font-semibold text-slate-900">Slaydlar</h3>
              </div>
              <div className="p-4 sm:p-5">
                {stageContent.driveFileId ? (
                  <DrivePdfViewer fileId={stageContent.driveFileId} />
                ) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center text-slate-500">
                    <Presentation className="mb-2 h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">PDF hali biriktirilmagan</p>
                    <p className="mt-1 max-w-sm text-xs">
                      Admin Google Drive havolasini qo‘shgach slayd shu yerda ochiladi.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {testVisible ? (
            <section
              ref={testRef}
              className="relative flex max-h-[min(70vh,40rem)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-5 py-3">
                <ClipboardList className="h-4 w-4 text-[#2AABEE]" />
                <h3 className="text-sm font-semibold text-slate-900">Test</h3>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {(lastResult || st.passed) && (
                  <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center">
                    <div
                      className={cn(
                        "mx-auto flex h-20 w-20 items-center justify-center rounded-full text-xl font-bold tabular-nums",
                        (lastResult?.passed ?? st.passed)
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700",
                      )}
                    >
                      {lastResult
                        ? `${lastResult.correct}/${lastResult.total}`
                        : `${lastResult?.score ?? st.score ?? 0}%`}
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {lastResult
                        ? correctCountText(lastResult.correct, lastResult.total)
                        : `${st.score ?? 0}%`}
                    </p>
                    {lastResult ? (
                      <p className="mt-1 text-sm text-slate-500">{lastResult.score}%</p>
                    ) : null}
                    <h3 className="mt-3 text-lg font-semibold text-slate-900">
                      {(lastResult?.passed ?? st.passed)
                        ? "Tabriklaymiz — bosqich o‘tildi!"
                        : "Test o‘tilmadi — videoni qayta ko‘ring"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {(lastResult?.passed ?? st.passed)
                        ? viewStage < (progress?.stageCount ?? 8)
                          ? "Keyingi bosqich ochildi."
                          : "Barcha bosqichlar tayyor — pastda «Tugatish»."
                        : "Kamida 50% (masalan 6 tadan 3 tasi) kerak."}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {(lastResult?.passed ?? st.passed) &&
                        viewStage < (progress?.stageCount ?? 8) && (
                          <Button
                            className="rounded-full bg-[#0B1B2B] hover:bg-slate-800"
                            onClick={() => setViewStage(viewStage + 1)}
                          >
                            Keyingi bosqich
                          </Button>
                        )}
                    </div>
                  </div>
                )}

                {(!st.passed || lastResult) && !(lastResult?.passed ?? st.passed) ? (
                  <div className="space-y-4">
                    {stageContent.questions.map((q, qi) => (
                      <div
                        key={q.id}
                        className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                      >
                        <p className="font-medium text-slate-900">
                          <span className="mr-2 text-[#2AABEE]">{qi + 1}.</span>
                          {q.text}
                        </p>
                        <div className="mt-3 grid gap-2">
                          {q.options.map((opt, oi) => {
                            const selected = answers[q.id] === oi;
                            return (
                              <button
                                key={oi}
                                type="button"
                                onClick={() =>
                                  setAnswers((prev) => ({ ...prev, [q.id]: oi }))
                                }
                                className={cn(
                                  "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                                  selected
                                    ? "border-[#2AABEE] bg-[#2AABEE]/10 text-slate-900"
                                    : "border-slate-200 text-slate-700 hover:border-slate-300",
                                )}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {(!st.passed || lastResult) && !(lastResult?.passed ?? st.passed) ? (
                <div className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3 sm:px-5">
                  <Button
                    className="h-11 rounded-full bg-[#2AABEE] px-6 hover:bg-[#229ED9]"
                    onClick={() => void onSubmit()}
                    disabled={submitTest.isPending}
                  >
                    {submitTest.isPending ? "Tekshirilmoqda..." : "Javoblarni yuborish"}
                  </Button>
                </div>
              ) : null}
            </section>
            ) : null}
          </div>
        ) : null}

        {!finished && locked && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-500">
            <Lock className="mx-auto mb-3 h-8 w-8 opacity-50" />
            Avval {viewStage - 1}-bosqichni kamida 50% natija bilan yakunlang.
          </div>
        )}

        {!finished && canFinish && (
          <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-[#2AABEE]/30 bg-gradient-to-r from-[#e8f6fd] to-white p-6 sm:flex-row">
            <div>
              <h3 className="font-semibold text-slate-900">Barcha bosqichlar yakunlandi</h3>
              <p className="text-sm text-slate-600">
                «Tugatish» — to‘liq holatni tizimga chiqaradi (ishga qabulga tayyor).
              </p>
            </div>
            <Button
              className="h-11 rounded-full bg-emerald-600 px-8 hover:bg-emerald-700"
              onClick={() => void onFinish()}
              disabled={finish.isPending}
            >
              {finish.isPending ? "..." : "Tugatish"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
