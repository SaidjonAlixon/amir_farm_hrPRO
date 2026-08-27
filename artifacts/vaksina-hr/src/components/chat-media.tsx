import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatAttachment } from "@/lib/chat-api";

export function pickRecorderMime(candidates: string[]) {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function formatRecSec(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function isMediaPlaceholder(
  content: string,
  attachments?: ChatAttachment[],
) {
  if (!content) return true;
  if (!attachments?.length) return false;
  return (
    content === "📎 Fayl" ||
    content.startsWith("📎 ") ||
    content === "🎤 Ovozli xabar" ||
    content === "🔵 Video xabar" ||
    content === "🎬 Video" ||
    content === "🖼 Rasm"
  );
}

export function VoiceBubble({
  attachment,
  mine,
}: {
  attachment: ChatAttachment;
  mine?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(attachment.durationSec || 0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (el.duration && Number.isFinite(el.duration)) {
        setProgress(el.currentTime / el.duration);
        setDur(el.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    el.addEventListener("loadedmetadata", onTime);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 min-w-[180px] max-w-[240px] rounded-2xl px-2 py-1.5",
        mine ? "bg-black/15" : "bg-black/25",
      )}
    >
      <audio ref={audioRef} src={attachment.url} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        className="h-9 w-9 shrink-0 rounded-full bg-[#2AABEE] text-white flex items-center justify-center"
        aria-label={playing ? "Pauza" : "Play"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-[#2AABEE] transition-[width] duration-100"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-[#8b9aab]">
          <Mic className="h-3 w-3" />
          <span>{formatRecSec(dur || attachment.durationSec || 0)}</span>
        </div>
      </div>
    </div>
  );
}

export function VideoNoteBubble({ attachment }: { attachment: ChatAttachment }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="relative h-[200px] w-[200px] shrink-0 overflow-hidden rounded-full ring-2 ring-[#2AABEE]/40 shadow-lg"
      aria-label="Video xabar"
    >
      <video
        ref={videoRef}
        src={attachment.url}
        className="h-full w-full object-cover"
        playsInline
        loop
        muted={false}
        onEnded={() => setPlaying(false)}
      />
      {!playing && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="h-12 w-12 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="h-6 w-6 text-white ml-0.5" />
          </span>
        </span>
      )}
      {attachment.durationSec != null && attachment.durationSec > 0 && (
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
          {formatRecSec(attachment.durationSec)}
        </span>
      )}
    </button>
  );
}
