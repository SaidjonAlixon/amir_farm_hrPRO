import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
  unloadModule?: (name: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
};

function hideYoutubeCaptions(player: YTPlayer | null) {
  if (!player) return;
  try {
    player.unloadModule?.("captions");
  } catch {
    /* ignore */
  }
  try {
    player.unloadModule?.("cc");
  } catch {
    /* ignore */
  }
  try {
    player.setOption?.("captions", "track", {});
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
          };
        },
      ) => YTPlayer;
      PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYoutubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector("script[data-yt-iframe-api]")) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.dataset.ytIframeApi = "1";
      document.head.appendChild(tag);
    }
    if (window.YT?.Player) resolve();
  });
  return ytApiPromise;
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function isFullyWatched(maxWatched: number, duration: number) {
  if (!Number.isFinite(duration) || duration < 2) return false;
  return maxWatched >= duration - 0.85 || maxWatched / duration >= 0.985;
}

const PLAY_HINT_KEY = "kirish-player-click-hint";

function FirstPlayHint({
  onPlay,
}: {
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/25"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPlay();
      }}
    >
      <div className="mb-2 flex animate-bounce flex-col items-center">
        <span className="rounded-full bg-[#F1C40F] px-3 py-1 text-xs font-bold text-[#0B1B2B] shadow-lg">
          Shu yerni bosing
        </span>
        <ArrowDown className="mt-1 h-10 w-10 text-[#F1C40F] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
      </div>
      <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-[0_0_0_8px_rgba(42,171,238,0.35)]">
        <Play className="ml-1 h-8 w-8 fill-white" />
      </span>
    </button>
  );
}

function CenterPlay({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/20"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPlay();
      }}
    >
      <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-[0_0_0_8px_rgba(42,171,238,0.35)]">
        <Play className="ml-1 h-8 w-8 fill-white" />
      </span>
    </button>
  );
}

export function RestrictedVideoPlayer({
  youtubeId,
  src,
  poster,
  onEnded,
  onProgress,
}: {
  youtubeId?: string | null;
  src?: string;
  poster?: string;
  onEnded?: () => void;
  onProgress?: (info: { current: number; duration: number; maxWatched: number; percent: number }) => void;
}) {
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem(PLAY_HINT_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const hideHint = () => {
    if (!showHint) return;
    setShowHint(false);
    try {
      localStorage.setItem(PLAY_HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative h-full w-full">
      {youtubeId ? (
        <YoutubeRestricted
          id={youtubeId}
          onEnded={onEnded}
          onProgress={onProgress}
          onPlaying={hideHint}
          showHint={showHint}
        />
      ) : (
        <Html5Restricted
          src={src || ""}
          poster={poster}
          onEnded={onEnded}
          onProgress={onProgress}
          onPlaying={hideHint}
          showHint={showHint}
        />
      )}
    </div>
  );
}

function useTransientControls() {
  const [showUi, setShowUi] = useState(false);
  const timer = useRef<number>();
  const reveal = useCallback(() => {
    setShowUi(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShowUi(false), 2800);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return { showUi, reveal };
}

function Controls({
  visible,
  current,
  duration,
  maxWatched,
  onRewind,
  onSeekBack,
  onInteract,
}: {
  visible: boolean;
  current: number;
  duration: number;
  maxWatched: number;
  onRewind: () => void;
  onSeekBack: (t: number) => void;
  onInteract?: () => void;
}) {
  const dur = duration || 1;
  const watchedPct = Math.min(100, (maxWatched / dur) * 100);
  const nowPct = Math.min(100, (current / dur) * 100);

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onPointerDown={onInteract}
    >
      <button
        type="button"
        className="relative mb-2 block h-2 w-full rounded-full bg-white/20"
        aria-label="Faqat orqaga o‘tish mumkin"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          const t = ratio * dur;
          if (t <= maxWatched + 0.05) onSeekBack(t);
        }}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${watchedPct}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-[#2AABEE]" style={{ width: `${nowPct}%` }} />
      </button>
      <div className="flex items-center gap-2 text-white">
        <button
          type="button"
          onClick={onRewind}
          className="flex h-9 items-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-medium hover:bg-white/20"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          10 s
        </button>
        <span className="ml-auto text-xs tabular-nums text-white/80">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] text-white/55">Oldinga o‘tkazish yo‘q · orqaga qaytish mumkin</p>
    </div>
  );
}

function Html5Restricted({
  src,
  poster,
  onEnded,
  onProgress,
  onPlaying,
  showHint,
}: {
  src: string;
  poster?: string;
  onEnded?: () => void;
  onProgress?: (info: { current: number; duration: number; maxWatched: number; percent: number }) => void;
  onPlaying?: () => void;
  showHint?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const maxRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [maxWatched, setMaxWatched] = useState(0);
  const endedOnce = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const { showUi, reveal } = useTransientControls();

  const report = (el: HTMLVideoElement) => {
    const d = el.duration || 0;
    const t = el.currentTime;
    const max = maxRef.current;
    const percent = d > 0 ? Math.min(100, Math.floor((max / d) * 100)) : 0;
    onProgressRef.current?.({ current: t, duration: d, maxWatched: max, percent });
    if (!endedOnce.current && isFullyWatched(max, d)) {
      endedOnce.current = true;
      onEndedRef.current?.();
    }
  };

  const clampSeek = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.currentTime > maxRef.current + 0.35) {
      el.currentTime = maxRef.current;
    }
  }, []);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={ref}
        className="h-full w-full object-contain"
        src={src}
        poster={poster}
        playsInline
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => {
          setPlaying(true);
          onPlaying?.();
        }}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={() => setDuration(ref.current?.duration || 0)}
        onTimeUpdate={() => {
          const el = ref.current;
          if (!el) return;
          if (el.currentTime > maxRef.current + 0.35) {
            el.currentTime = maxRef.current;
            return;
          }
          maxRef.current = Math.max(maxRef.current, el.currentTime);
          setMaxWatched(maxRef.current);
          setCurrent(el.currentTime);
          report(el);
        }}
        onSeeking={clampSeek}
        onSeeked={clampSeek}
        onEnded={() => {
          const el = ref.current;
          if (!el) return;
          maxRef.current = Math.max(maxRef.current, el.duration || 0);
          setMaxWatched(maxRef.current);
          report(el);
        }}
      />
      <div
        className="absolute inset-0 z-20 touch-manipulation bg-transparent"
        onPointerDown={(e) => {
          if (!playing) return;
          e.preventDefault();
          const el = ref.current;
          if (!el) return;
          reveal();
          el.pause();
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!playing ? (
        showHint ? (
          <FirstPlayHint
            onPlay={() => {
              const el = ref.current;
              if (!el) return;
              onPlaying?.();
              reveal();
              void el.play();
            }}
          />
        ) : (
          <CenterPlay
            onPlay={() => {
              const el = ref.current;
              if (!el) return;
              onPlaying?.();
              reveal();
              void el.play();
            }}
          />
        )
      ) : null}
      <Controls
        visible={showUi}
        current={current}
        duration={duration}
        maxWatched={maxWatched}
        onInteract={reveal}
        onRewind={() => {
          const el = ref.current;
          if (!el) return;
          el.currentTime = Math.max(0, el.currentTime - 10);
        }}
        onSeekBack={(t) => {
          const el = ref.current;
          if (!el) return;
          el.currentTime = Math.min(t, maxRef.current);
        }}
      />
    </div>
  );
}

function YoutubeRestricted({
  id,
  onEnded,
  onProgress,
  onPlaying,
  showHint,
}: {
  id: string;
  onEnded?: () => void;
  onProgress?: (info: { current: number; duration: number; maxWatched: number; percent: number }) => void;
  onPlaying?: () => void;
  showHint?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const maxRef = useRef(0);
  const endedOnce = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  const { showUi, reveal } = useTransientControls();
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [maxWatched, setMaxWatched] = useState(0);

  const finishIfWatched = (max: number, d: number) => {
    if (endedOnce.current || !isFullyWatched(max, d)) return;
    endedOnce.current = true;
    onEndedRef.current?.();
  };

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    void loadYoutubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      const player = new window.YT.Player(hostRef.current, {
        videoId: id,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            hideYoutubeCaptions(player);
            if (!cancelled) setReady(true);
          },
          onStateChange: (e) => {
            hideYoutubeCaptions(player);
            const ended = window.YT?.PlayerState?.ENDED;
            const playingSt = window.YT?.PlayerState?.PLAYING ?? 1;
            if (e.data === playingSt) {
              setPlaying(true);
              onPlayingRef.current?.();
            }
            else setPlaying(false);
            if (typeof ended === "number" && e.data === ended) {
              const d = player.getDuration?.() || 0;
              if (isFullyWatched(maxRef.current, d)) {
                maxRef.current = Math.max(maxRef.current, d);
                finishIfWatched(maxRef.current, d);
              } else if (player.seekTo && maxRef.current > 0) {
                player.seekTo(maxRef.current, true);
                player.playVideo?.();
              }
            }
          },
        },
      });
      playerRef.current = player;
      timer = window.setInterval(() => {
        const p = playerRef.current;
        if (!p?.getCurrentTime) return;
        hideYoutubeCaptions(p);
        const t = p.getCurrentTime();
        const d = p.getDuration() || 0;
        if (t > maxRef.current + 0.4) {
          p.seekTo(maxRef.current, true);
          return;
        }
        maxRef.current = Math.max(maxRef.current, t);
        setMaxWatched(maxRef.current);
        setCurrent(t);
        if (d) setDuration(d);
        const percent = d > 0 ? Math.min(100, Math.floor((maxRef.current / d) * 100)) : 0;
        onProgressRef.current?.({
          current: t,
          duration: d,
          maxWatched: maxRef.current,
          percent,
        });
        finishIfWatched(maxRef.current, d);
      }, 250);
    });
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [id]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div className="pointer-events-none h-full w-full [&>iframe]:pointer-events-none [&>iframe]:h-full [&>iframe]:w-full">
        <div ref={hostRef} className="h-full w-full" />
      </div>
      {!ready && (
        <div className="absolute inset-0 z-0 flex items-center justify-center text-sm text-white/70">
          Video yuklanmoqda...
        </div>
      )}
      <div
        className="absolute inset-0 z-20 touch-manipulation bg-transparent"
        onPointerDown={(e) => {
          if (!playing) return;
          e.preventDefault();
          const p = playerRef.current;
          if (!p || !ready) return;
          reveal();
          p.pauseVideo();
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!playing && ready ? (
        showHint ? (
          <FirstPlayHint
            onPlay={() => {
              const p = playerRef.current;
              if (!p || !ready) return;
              onPlaying?.();
              reveal();
              p.playVideo();
            }}
          />
        ) : (
          <CenterPlay
            onPlay={() => {
              const p = playerRef.current;
              if (!p || !ready) return;
              onPlaying?.();
              reveal();
              p.playVideo();
            }}
          />
        )
      ) : null}
      <Controls
        visible={showUi}
        current={current}
        duration={duration}
        maxWatched={maxWatched}
        onInteract={reveal}
        onRewind={() => {
          const p = playerRef.current;
          if (!p) return;
          p.seekTo(Math.max(0, p.getCurrentTime() - 10), true);
        }}
        onSeekBack={(t) => {
          const p = playerRef.current;
          if (!p) return;
          p.seekTo(Math.min(t, maxRef.current), true);
        }}
      />
    </div>
  );
}
