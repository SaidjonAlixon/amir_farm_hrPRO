import React, { useCallback, useEffect, useState } from "react";
import { ScanFace, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  enrollFace,
  fetchFaceIdStatus,
  isFaceIdSupported,
  removeFaceId,
  type FaceLivenessProof,
} from "@/lib/face-id";
import { FaceScanDialog } from "@/components/FaceScanDialog";
import { cn } from "@/lib/utils";

export function FaceIdEnroll({
  compact = false,
  onStatusChange,
}: {
  compact?: boolean;
  onStatusChange?: (status: { registered: boolean; photoUrl?: string | null }) => void;
}) {
  const { toast } = useToast();
  const supported = isFaceIdSupported();
  const [registered, setRegistered] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFaceIdStatus()
      .then((s) => {
        if (!cancelled) {
          setRegistered(s.registered);
          setPhotoUrl(s.photoUrl ?? null);
          onStatusChange?.({ registered: s.registered, photoUrl: s.photoUrl ?? null });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onStatusChange]);

  const onCaptured = useCallback(
    async (descriptor: number[] | number[][], snapshot?: string, liveness?: FaceLivenessProof) => {
      try {
        const saved = await enrollFace(descriptor, snapshot, liveness);
        setRegistered(true);
        const status = await fetchFaceIdStatus().catch(() => null);
        const nextPhoto = status?.photoUrl ?? saved.photoUrl ?? snapshot ?? null;
        setPhotoUrl(nextPhoto);
        onStatusChange?.({
          registered: true,
          photoUrl: nextPhoto,
        });
        toast({
          title: "Face ID ulandi",
          description: "Yuzingiz faqat shu profilingizga biriktirildi",
        });
      } catch (err) {
        const e = err as Error & { code?: string; fullName?: string };
        if (e.code !== "face_already_taken") {
          toast({
            title: "Ulanmadi",
            description: e.message,
            variant: "destructive",
          });
        }
        throw err;
      }
    },
    [onStatusChange, toast],
  );

  const onRemove = async () => {
    if (!window.confirm("Face ID ni o‘chirasizmi? Keyin login/parol bilan kirasiz.")) return;
    setLoading(true);
    try {
      await removeFaceId();
      setRegistered(false);
      setPhotoUrl(null);
      onStatusChange?.({ registered: false, photoUrl: null });
      toast({ title: "Face ID o‘chirildi" });
    } catch (err) {
      toast({
        title: "O‘chirilmadi",
        description: (err as Error)?.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;
  if (!supported && !registered) return null;

  return (
    <>
      <FaceScanDialog open={scanOpen} onOpenChange={setScanOpen} mode="enroll" onCaptured={onCaptured} />
      {compact ? (
        <div className="mt-1.5 space-y-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (registered) void onRemove();
              else setScanOpen(true);
            }}
            disabled={loading}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[10px] font-medium transition-colors",
              registered
                ? "text-emerald-300/95 hover:bg-emerald-400/10"
                : "text-sky-200/70 hover:bg-white/10 hover:text-sky-100",
            )}
            title={registered ? "Face ID o‘chirish" : "Face ID ulash"}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanFace className="h-3 w-3" />}
            <span className="truncate">{registered ? "Face ID ulangan" : "Face ID ni ulash"}</span>
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Face ID"
                  className="h-full w-full object-cover"
                  crossOrigin="use-credentials"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ScanFace className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Face ID
                {registered ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" /> Ulangan
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kameraga qarab, boshni chap, o‘ng va tepaga burang.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={loading || !supported} onClick={() => setScanOpen(true)}>
                  <ScanFace className="mr-1.5 h-3.5 w-3.5" />
                  {registered ? "Qayta ulash" : "Face ID ni ulash"}
                </Button>
                {registered ? (
                  <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void onRemove()}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    O‘chirish
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          {!supported ? (
            <p className="mt-2 text-[11px] text-amber-700">
              Face ID uchun kamera va localhost/HTTPS kerak.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
