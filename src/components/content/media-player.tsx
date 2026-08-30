"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent,
  ReactNode,
  SyntheticEvent,
} from "react";
import type { MediaKind } from "@prisma/client";
import {
  AlertTriangle,
  FileQuestion,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatDuration } from "@/lib/utils/format";
import { hasNativeHlsSupport } from "@/lib/media/hls";
import { cn } from "@/lib/utils/cn";

export type PlayerState =
  | "unavailable"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "failed";

export type QualityLevel = {
  index: number;
  label: string;
  height: number;
};

export type MediaPlayerProps = {
  kind: MediaKind;
  src: string | null;
  hlsSrc?: string | null;
  poster?: string | null;
  title: string;
  autoplay?: boolean;
  startAt?: number;
  onProgress?: (seconds: number, completed: boolean) => void;
  onPlaybackStart?: () => void;
  className?: string;
};

function StateOverlay({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[#08080d]/85 px-6 text-center backdrop-blur-sm">
      <span
        aria-hidden="true"
        className="text-white/45"
      >
        {icon}
      </span>

      <p className="font-display text-card font-semibold text-white">
        {title}
      </p>

      {description ? (
        <p className="max-w-xs text-meta text-white/45">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function MediaPlayer({
  kind,
  src,
  hlsSrc,
  poster,
  title,
  autoplay = false,
  startAt = 0,
  onProgress,
  onPlaybackStart,
  className,
}: MediaPlayerProps) {
  const mediaRef =
    useRef<HTMLVideoElement>(null);

  const containerRef =
    useRef<HTMLDivElement>(null);

  const lastReported =
    useRef(0);

  const hasStarted =
    useRef(false);

  const controlsTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] =
    useState<PlayerState>(
      src || hlsSrc
        ? "loading"
        : "unavailable",
    );

  const [duration, setDuration] =
    useState(0);

  const [current, setCurrent] =
    useState(0);

  /*
   * Audio preference is shared by all
   * MediaPlayer instances.
   *
   * Changing video keeps the same
   * volume and mute state.
   */
  const AUDIO_VOLUME_KEY =
    "archive-player-volume";

  const AUDIO_MUTED_KEY =
    "archive-player-muted";

  const [muted, setMuted] =
    useState(false);

  const [volume, setVolume] =
    useState(1);

  const lastVolumeRef =
    useRef(1);

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const [showControls, setShowControls] =
    useState(true);

  const [levels, setLevels] =
    useState<QualityLevel[]>([]);

  const [currentLevel, setCurrentLevel] =
    useState(-1);

  const [speed, setSpeed] =
    useState(1);

  const [reloadAttempt, setReloadAttempt] =
    useState(0);

  const retryCountRef =
    useRef(0);

  const retryTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const hlsGenerationRef =
    useRef(0);

  /*
   * Invalidates stale play promises
   * after a seek or source change.
   */
  const playAttemptRef =
    useRef(0);

  const [isSeeking, setIsSeeking] =
    useState(false);

  const hlsRef = useRef<{
    destroy: () => void;
    levels: unknown[];
    currentLevel: number;
  } | null>(null);

  // If the stored HLS playlist is missing/corrupt, fall back to the original
  // media URL instead of leaving the player spinning forever. This is also
  // useful for older local records whose HLS files were removed while the
  // database still contains hlsMasterKey.
  const hlsFallbackRef = useRef(false);

  const progressId = useId();

  const isAudio =
    kind === "AUDIO";

  const busy =
    state === "loading" ||
    state === "buffering";

  const progressMax =
    Number.isFinite(duration) &&
    duration > 0
      ? duration
      : 0;

  /*
   * Restore saved audio preference.
   */
  useEffect(() => {
    try {
      const storedVolume =
        Number(
          window.localStorage.getItem(
            AUDIO_VOLUME_KEY,
          ),
        );

      const storedMuted =
        window.localStorage.getItem(
          AUDIO_MUTED_KEY,
        ) === "true";

      const nextVolume =
        Number.isFinite(storedVolume) &&
        storedVolume >= 0
          ? Math.min(
              storedVolume,
              1,
            )
          : 1;

      lastVolumeRef.current =
        nextVolume > 0
          ? nextVolume
          : 1;

      setVolume(nextVolume);

      setMuted(
        storedMuted ||
          nextVolume === 0,
      );

      const media =
        mediaRef.current;

      if (media) {
        media.volume =
          nextVolume;

        media.muted =
          storedMuted ||
          nextVolume === 0;
      }
    } catch {
      // Storage may be unavailable.
    }
  }, []);

  /*
   * Reset playback lifecycle when
   * the source changes.
   *
   * Volume and mute are preserved.
   */
  useEffect(() => {
    setState(
      src || hlsSrc
        ? "loading"
        : "unavailable",
    );

    setCurrent(0);
    setDuration(0);
    setLevels([]);
    setCurrentLevel(-1);
    setSpeed(1);

    retryCountRef.current = 0;
    setReloadAttempt(0);

    hasStarted.current = false;
    lastReported.current = 0;

    if (retryTimerRef.current) {
      clearTimeout(
        retryTimerRef.current,
      );

      retryTimerRef.current =
        null;
    }

    hlsGenerationRef.current +=
      1;

    playAttemptRef.current +=
      1;
  }, [src, hlsSrc]);

  /*
   * Re-apply saved audio preference
   * whenever the media source changes.
   */
  useEffect(() => {
    const media =
      mediaRef.current;

    if (!media) {
      return;
    }

    media.volume = volume;
    media.muted = muted;
  }, [
    src,
    hlsSrc,
    volume,
    muted,
  ]);

  /*
   * HLS setup and recovery.
   */
  useEffect(() => {
    const media =
      mediaRef.current;

    if (!media || !hlsSrc) {
      return;
    }

    // Reset fallback whenever the actual media source changes.
    hlsFallbackRef.current = false;

    let cancelled = false;

    const generation =
      ++hlsGenerationRef.current;

    const clearRetryTimer =
      () => {
        if (
          retryTimerRef.current
        ) {
          clearTimeout(
            retryTimerRef.current,
          );

          retryTimerRef.current =
            null;
        }
      };

    const fallbackToOriginal = () => {
      if (cancelled || !src || hlsFallbackRef.current) {
        return false;
      }

      hlsFallbackRef.current = true;
      clearRetryTimer();
      hlsRef.current?.destroy();
      hlsRef.current = null;

      media.pause();
      media.src = src;
      media.load();
      setLevels([]);
      setCurrentLevel(-1);
      setState("loading");
      return true;
    };

    const scheduleFullRetry =
      (delayMs: number) => {
        if (
          cancelled ||
          retryCountRef.current >= 3
        ) {
          if (
            !cancelled &&
            retryCountRef.current >= 3
          ) {
            setState("failed");
          }

          return;
        }

        clearRetryTimer();

        retryTimerRef.current =
          setTimeout(() => {
            retryTimerRef.current =
              null;

            if (
              cancelled ||
              generation !==
                hlsGenerationRef.current
            ) {
              return;
            }

            retryCountRef.current +=
              1;

            setState("loading");
            setLevels([]);
            setCurrentLevel(-1);

            setReloadAttempt(
              (value) =>
                value + 1,
            );
          }, delayMs);
      };

    clearRetryTimer();

    hlsRef.current?.destroy();
    hlsRef.current = null;

    media.pause();
    media.removeAttribute("src");
    media.load();

    media.volume = volume;
    media.muted = muted;

    /*
     * If HLS already failed for this source, use the original MP4/source.
     */
    if (hlsFallbackRef.current && src) {
      media.src = src;
      media.load();
      return () => {
        cancelled = true;
        clearRetryTimer();
        media.pause();
        media.removeAttribute("src");
      };
    }

    /*
     * Safari / native HLS.
     */
    if (hasNativeHlsSupport(media)) {
      media.src = hlsSrc;
      media.load();

      return () => {
        cancelled = true;

        clearRetryTimer();

        media.pause();
        media.removeAttribute(
          "src",
        );

        /*
         * Do not call load() during
         * native-HLS teardown.
         */
      };
    }

    /*
     * HLS.js fallback.
     */
    void (async () => {
      try {
        const { default: Hls } =
          await import("hls.js");

        if (
          cancelled ||
          generation !==
            hlsGenerationRef.current
        ) {
          return;
        }

        if (!Hls.isSupported()) {
          setState("failed");
          return;
        }

        const hls =
          new Hls({
            enableWorker: true,
            lowLatencyMode: false,

            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            backBufferLength: 30,

            nudgeOffset: 0.1,
            nudgeMaxRetry: 5,
            maxFragLookUpTolerance:
              0.25,

            startLevel: -1,

            manifestLoadingMaxRetry:
              4,

            levelLoadingMaxRetry:
              4,

            fragLoadingMaxRetry:
              4,

            manifestLoadingRetryDelay:
              1000,

            levelLoadingRetryDelay:
              1000,

            fragLoadingRetryDelay:
              1000,
          });

        hlsRef.current =
          hls as unknown as typeof hlsRef.current;

        hls.loadSource(hlsSrc);
        hls.attachMedia(media);

        hls.on(
          Hls.Events.MANIFEST_PARSED,
          () => {
            if (
              cancelled ||
              generation !==
                hlsGenerationRef.current
            ) {
              return;
            }

            setLevels(
              hls.levels
                .map(
                  (
                    level,
                    index,
                  ) => ({
                    index,
                    height:
                      level.height,
                    label:
                      `${level.height}p`,
                  }),
                )
                .filter(
                  (level) =>
                    Number.isFinite(
                      level.height,
                    ) &&
                    level.height > 0,
                )
                .sort(
                  (a, b) =>
                    a.height -
                    b.height,
                ),
            );

            setState(
              (previous) =>
                previous ===
                  "failed" ||
                previous ===
                  "loading"
                  ? "loading"
                  : previous,
            );
          },
        );

        hls.on(
          Hls.Events.ERROR,
          (_event, data) => {
            if (
              cancelled ||
              generation !==
                hlsGenerationRef.current ||
              !data.fatal
            ) {
              return;
            }

            /*
             * Network error:
             * keep the same HLS instance.
             */
            if (
              data.type ===
              Hls.ErrorTypes.NETWORK_ERROR
            ) {
              // A missing local master playlist is a permanent source error,
              // not a transient network outage. Prefer the original source
              // when one is available so older records remain playable.
              if (fallbackToOriginal()) {
                return;
              }

              try {
                hls.startLoad();

                setState(
                  "buffering",
                );
              } catch {
                scheduleFullRetry(
                  1200,
                );
              }

              return;
            }

            /*
             * Decoder/media error:
             * recover without destroying
             * the entire HLS pipeline.
             */
            if (
              data.type ===
              Hls.ErrorTypes.MEDIA_ERROR
            ) {
              try {
                hls.recoverMediaError();
              } catch {
                scheduleFullRetry(
                  800,
                );
              }

              return;
            }

            /*
             * Unknown fatal error.
             */
            scheduleFullRetry(800);
          },
        );
      } catch {
        if (!cancelled) {
          scheduleFullRetry(800);
        }
      }
    })();

    return () => {
      cancelled = true;

      clearRetryTimer();

      hlsRef.current?.destroy();
      hlsRef.current = null;

      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [
    src,
    hlsSrc,
    reloadAttempt,
    volume,
    muted,
  ]);

  /*
   * Seek recovery.
   *
   * Do not rebuild HLS on every seek.
   * Let HLS.js load the fragment required
   * for the new playback position.
   */
  const recoverAfterSeek =
    useCallback(() => {
      const media =
        mediaRef.current;

      if (!media || !hlsSrc) {
        return;
      }

      if (retryTimerRef.current) {
        clearTimeout(
          retryTimerRef.current,
        );

        retryTimerRef.current =
          null;
      }

      try {
        const hls =
          hlsRef.current as {
            startLoad?: (
              startPosition?: number,
            ) => void;
          } | null;

        hls?.startLoad?.();
      } catch {
        // HLS error handler handles recovery.
      }

      if (
        !media.paused &&
        media.readyState < 3
      ) {
        setState("buffering");
      }
    }, [hlsSrc]);

  /*
   * Manual retry.
   */
  const retryPlayback =
    useCallback(() => {
      if (retryTimerRef.current) {
        clearTimeout(
          retryTimerRef.current,
        );

        retryTimerRef.current =
          null;
      }

      if (
        retryCountRef.current >= 3
      ) {
        retryCountRef.current = 0;
      }

      retryCountRef.current +=
        1;

      hlsGenerationRef.current +=
        1;

      playAttemptRef.current +=
        1;

      const media =
        mediaRef.current;

      if (media) {
        media.pause();
        media.removeAttribute(
          "src",
        );
        media.load();

        media.volume = volume;
        media.muted = muted;
      }

      setState("loading");
      setLevels([]);
      setCurrentLevel(-1);
      setCurrent(0);

      setReloadAttempt(
        (value) => value + 1,
      );
    }, [volume, muted]);

  /*
   * Fullscreen state.
   */
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(
        document.fullscreenElement ===
          containerRef.current,
      );
    }

    document.addEventListener(
      "fullscreenchange",
      onFullscreenChange,
    );

    return () =>
      document.removeEventListener(
        "fullscreenchange",
        onFullscreenChange,
      );
  }, []);

  /*
   * Auto-hide controls.
   */
  const scheduleControlsHide =
    useCallback(() => {
      if (controlsTimer.current) {
        clearTimeout(
          controlsTimer.current,
        );
      }

      setShowControls(true);

      if (state !== "playing") {
        return;
      }

      controlsTimer.current =
        setTimeout(() => {
          setShowControls(false);
        }, 2200);
    }, [state]);

  useEffect(() => {
    return () => {
      if (controlsTimer.current) {
        clearTimeout(
          controlsTimer.current,
        );
      }

      if (retryTimerRef.current) {
        clearTimeout(
          retryTimerRef.current,
        );

        retryTimerRef.current =
          null;
      }

      hlsGenerationRef.current +=
        1;
    };
  }, []);

  /*
   * Play / pause.
   */
  const togglePlay =
    useCallback(() => {
      const media =
        mediaRef.current;

      if (!media) {
        return;
      }

      if (!media.paused) {
        media.pause();
        return;
      }

      const attempt =
        ++playAttemptRef.current;

      /*
       * Ask HLS to continue loading
       * before calling play().
       */
      if (hlsSrc) {
        try {
          const hls =
            hlsRef.current as {
              startLoad?: (
                startPosition?: number,
              ) => void;
            } | null;

          hls?.startLoad?.();
        } catch {
          // Media element will still attempt playback.
        }
      }

      setState(
        media.readyState >= 3
          ? "ready"
          : "loading",
      );

      const tryPlay = () => {
        if (
          playAttemptRef.current !==
            attempt ||
          mediaRef.current !== media
        ) {
          return;
        }

        void media
          .play()
          .then(() => {
            if (
              playAttemptRef.current ===
                attempt &&
              mediaRef.current === media
            ) {
              setState("playing");
            }
          })
          .catch(() => {
            if (
              playAttemptRef.current !==
                attempt ||
              mediaRef.current !== media
            ) {
              return;
            }

            /*
             * Temporary HLS loading race.
             */
            if (hlsSrc && !hlsFallbackRef.current) {
              try {
                const hls =
                  hlsRef.current as {
                    startLoad?: (
                      startPosition?: number,
                    ) => void;
                  } | null;

                hls?.startLoad?.(
                  media.currentTime,
                );
              } catch {
                // Timed retry below.
              }

              setState("loading");

              window.setTimeout(() => {
                if (
                  playAttemptRef.current ===
                    attempt &&
                  mediaRef.current === media
                ) {
                  tryPlay();
                }
              }, 350);

              return;
            }

            setState("failed");
            setShowControls(true);
          });
      };

      tryPlay();
    }, [hlsSrc]);

  /*
   * Seek.
   */
  const seekTo =
    useCallback(
      (value: number) => {
        const media =
          mediaRef.current;

        if (
          !media ||
          !Number.isFinite(
            media.duration,
          )
        ) {
          return;
        }

        const next =
          Math.max(
            0,
            Math.min(
              value,
              media.duration,
            ),
          );

        /*
         * Stay slightly inside the
         * actual media timeline.
         */
        const safeNext =
          Math.max(
            0,
            Math.min(
              next,
              Math.max(
                0,
                media.duration -
                  0.05,
              ),
            ),
          );

        try {
          media.currentTime =
            safeNext;

          setCurrent(
            safeNext,
          );
        } catch {
          // HLS recovery handles transient seek errors.
        }
      },
      [],
    );

  /*
   * Skip forward/backward.
   */
  const skip =
    useCallback(
      (seconds: number) => {
        const media =
          mediaRef.current;

        if (!media) {
          return;
        }

        seekTo(
          media.currentTime +
            seconds,
        );

        scheduleControlsHide();
      },
      [
        seekTo,
        scheduleControlsHide,
      ],
    );

  /*
   * Mute.
   */
  const toggleMute =
    useCallback(() => {
      const media =
        mediaRef.current;

      if (!media) {
        return;
      }

      const nextMuted =
        !media.muted;

      if (
        !nextMuted &&
        media.volume === 0
      ) {
        const restoreVolume =
          lastVolumeRef.current > 0
            ? lastVolumeRef.current
            : 1;

        media.volume =
          restoreVolume;

        setVolume(
          restoreVolume,
        );
      }

      media.muted =
        nextMuted;

      setMuted(
        nextMuted,
      );

      try {
        window.localStorage.setItem(
          AUDIO_MUTED_KEY,
          String(
            nextMuted,
          ),
        );

        if (media.volume > 0) {
          window.localStorage.setItem(
            AUDIO_VOLUME_KEY,
            String(
              media.volume,
            ),
          );
        }
      } catch {
        // Ignore storage failures.
      }

      scheduleControlsHide();
    }, [scheduleControlsHide]);

  /*
   * Volume.
   */
  function changeVolume(
    value: number,
  ) {
    const media =
      mediaRef.current;

    if (!media) {
      return;
    }

    const nextVolume =
      Math.max(
        0,
        Math.min(
          value,
          1,
        ),
      );

    if (nextVolume > 0) {
      lastVolumeRef.current =
        nextVolume;
    }

    media.volume =
      nextVolume;

    media.muted =
      nextVolume === 0;

    setVolume(
      nextVolume,
    );

    setMuted(
      nextVolume === 0,
    );

    try {
      window.localStorage.setItem(
        AUDIO_VOLUME_KEY,
        String(
          nextVolume > 0
            ? nextVolume
            : lastVolumeRef.current,
        ),
      );

      window.localStorage.setItem(
        AUDIO_MUTED_KEY,
        String(
          nextVolume === 0,
        ),
      );
    } catch {
      // Ignore storage failures.
    }

    scheduleControlsHide();
  }

  /*
   * Playback speed.
   */
  function changeSpeed(
    rate: number,
  ) {
    const media =
      mediaRef.current;

    if (!media) {
      return;
    }

    media.playbackRate =
      rate;

    setSpeed(rate);
  }

  /*
   * Quality.
   */
  function selectQuality(
    index: number,
  ) {
    setCurrentLevel(index);

    const hls =
      hlsRef.current as {
        currentLevel: number;
      } | null;

    if (hls) {
      hls.currentLevel =
        index;
    }
  }

  /*
   * Fullscreen.
   */
  const toggleFullscreen =
    useCallback(async () => {
      const container =
        containerRef.current;

      if (!container) {
        return;
      }

      try {
        if (
          document.fullscreenElement
        ) {
          await document.exitFullscreen();
        } else {
          await container.requestFullscreen();
        }
      } catch {
        // Fullscreen may be blocked by browser policy.
      }
    }, []);

  /*
   * Time updates.
   */
  function handleTimeUpdate(
    event: SyntheticEvent<HTMLVideoElement>,
  ) {
    const media =
      event.currentTarget;

    if (!isSeeking) {
      setCurrent(
        media.currentTime,
      );
    }

    const seconds =
      Math.floor(
        media.currentTime,
      );

    if (
      !onProgress ||
      seconds -
        lastReported.current <
        10
    ) {
      return;
    }

    lastReported.current =
      seconds;

    const completed =
      media.duration > 0 &&
      media.currentTime /
        media.duration >
        0.92;

    onProgress(
      seconds,
      completed,
    );
  }

  /*
   * Keyboard shortcuts.
   */
  function handleKeyDown(
    event: KeyboardEvent,
  ) {
    const media =
      mediaRef.current;

    if (!media) {
      return;
    }

    switch (event.key) {
      case " ":
      case "k":
        event.preventDefault();
        togglePlay();
        scheduleControlsHide();
        break;

      case "ArrowRight":
        event.preventDefault();
        skip(10);
        break;

      case "ArrowLeft":
        event.preventDefault();
        skip(-10);
        break;

      case "m":
      case "M":
        event.preventDefault();
        toggleMute();
        break;

      case "f":
      case "F":
        event.preventDefault();
        void toggleFullscreen();
        break;

      case "Home":
        event.preventDefault();
        seekTo(0);
        break;

      case "End":
        event.preventDefault();

        if (media.duration) {
          seekTo(
            media.duration,
          );
        }

        break;

      default:
        break;
    }
  }

  /*
   * No media.
   */
  if (!src && !hlsSrc) {
    return (
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-card border border-line bg-sunken",
          className,
        )}
      >
        <StateOverlay
          icon={
            <FileQuestion className="size-8" />
          }
          title="Media unavailable"
          description="This record has no playable source attached."
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseMove={
        scheduleControlsHide
      }
      onMouseEnter={() => {
        setShowControls(true);
      }}
      onMouseLeave={() => {
        if (state === "playing") {
          setShowControls(false);
        }
      }}
      onClick={(event) => {
        /*
         * Clicking the actual video
         * toggles playback.
         */
        if (
          event.target ===
          mediaRef.current
        ) {
          togglePlay();
          scheduleControlsHide();
        }
      }}
      className={cn(
        "group/player relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#050507] shadow-[0_12px_50px_rgba(0,0,0,0.28)] outline-none",
        "transition-[border-color,box-shadow] duration-300 ease-out",
        "hover:border-white/[0.14]",
        "focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/70",
        isAudio
          ? "p-4"
          : "aspect-video",
        className,
      )}
    >
      {/* Video */}
      <video
        ref={mediaRef}
        {...(hlsSrc
          ? {}
          : {
              src:
                src ??
                undefined,
            })}
        poster={
          poster ??
          undefined
        }
        autoPlay={autoplay}
        playsInline
        preload="auto"
        aria-label={title}
        className={cn(
          "size-full object-contain bg-black",
          "select-none",
          isAudio &&
            "h-16",
        )}
        onLoadedMetadata={(
          event,
        ) => {
          const media =
            event.currentTarget;

          setDuration(
            media.duration,
          );

          if (
            startAt > 0 &&
            startAt <
              media.duration
          ) {
            media.currentTime =
              startAt;

            setCurrent(
              startAt,
            );
          }

          setState(
            autoplay
              ? "playing"
              : "ready",
          );
        }}
        onCanPlay={() => {
          const media =
            mediaRef.current;

          setState(
            (previous) => {
              if (
                media &&
                !media.paused
              ) {
                return "playing";
              }

              return previous ===
                "buffering"
                ? "ready"
                : previous;
            },
          );
        }}
        onPlay={() => {
          setState("playing");
          scheduleControlsHide();

          if (
            !hasStarted.current
          ) {
            hasStarted.current =
              true;

            onPlaybackStart?.();
          }
        }}
        onPause={() => {
          setState(
            (previous) =>
              previous ===
                "failed"
                ? previous
                : "paused",
          );

          setShowControls(true);
        }}
        onWaiting={() => {
          const media =
            mediaRef.current;

          setState(
            (previous) =>
              previous ===
                "failed"
                ? previous
                : media &&
                    !media.paused
                  ? "buffering"
                  : previous,
          );
        }}
        onSeeking={() => {
          recoverAfterSeek();
        }}
        onSeeked={() => {
          const media =
            mediaRef.current;

          if (!media) {
            return;
          }

          if (
            !media.paused &&
            media.readyState >= 3
          ) {
            setState(
              "playing",
            );
          }
        }}
        onPlaying={() => {
          setState(
            "playing",
          );
        }}
        onTimeUpdate={
          handleTimeUpdate
        }
        onEnded={() => {
          setState("paused");
          setShowControls(true);
        }}
        onError={() => {
          if (hlsSrc) {
            // Native HLS reports a missing master playlist through the video
            // element's error event. Fall back to the original source when
            // available instead of retrying a URL that can never succeed.
            if (src && !hlsFallbackRef.current) {
              hlsFallbackRef.current = true;
              hlsRef.current?.destroy();
              hlsRef.current = null;
              const media = mediaRef.current;
              if (media) {
                media.pause();
                media.src = src;
                media.load();
              }
              setLevels([]);
              setCurrentLevel(-1);
              setState("loading");
              return;
            }

            /*
             * HLS errors remain recoverable.
             */
            setState(
              "buffering",
            );

            try {
              const hls =
                hlsRef.current as {
                  startLoad?: (
                    startPosition?: number,
                  ) => void;
                } | null;

              hls?.startLoad?.();
            } catch {
              // HLS.js handles final recovery.
            }

            return;
          }

          setState("failed");
          setShowControls(true);
        }}
      />

      {/* Failed */}
      {state === "failed" ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#08080d]/85 px-6 text-center backdrop-blur-sm">
          <span
            aria-hidden="true"
            className="text-[#F59E0B]"
          >
            <AlertTriangle className="size-8" />
          </span>

          <div>
            <p className="font-display text-card font-semibold text-white">
              This recording did not load
            </p>

            <p className="mx-auto mt-1 max-w-sm text-meta text-white/45">
              The media source could not be reached. Try loading it again.
            </p>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              retryPlayback();
            }}
            className="
              rounded-lg border border-white/10
              bg-white/[0.06] px-4 py-2
              text-xs font-medium text-white/80
              shadow-lg
              transition-[transform,background-color,border-color]
              duration-150 ease-out
              hover:border-[#8B5CF6]/50
              hover:bg-[#8B5CF6]/15
              hover:text-white
              active:scale-[0.98]
            "
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* Loading */}
      {busy ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-black/55 shadow-xl backdrop-blur-md">
            <Loader2
              className="size-6 animate-spin text-[#A78BFA]"
              aria-hidden="true"
            />
          </span>

          <span className="sr-only">
            {state === "loading"
              ? "Loading media"
              : "Buffering"}
          </span>
        </div>
      ) : null}

      {/* Center play button */}
      {state === "ready" ||
      state === "paused" ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            togglePlay();
            scheduleControlsHide();
          }}
          aria-label={`Play ${title}`}
          className="
            absolute
            left-1/2
            top-1/2
            z-20
            flex
            size-16
            -translate-x-1/2
            -translate-y-1/2
            items-center
            justify-center
            rounded-full
            border
            border-white/15
            bg-black/55
            text-white
            shadow-[0_10px_35px_rgba(0,0,0,0.35)]
            backdrop-blur-md
            transition-[transform,background-color,box-shadow]
            duration-200
            ease-out
            hover:scale-105
            hover:bg-[#8B5CF6]
            hover:shadow-[0_12px_40px_rgba(139,92,246,0.30)]
            active:scale-95
          "
        >
          <Play
            className="ml-1 size-7 fill-current"
            aria-hidden="true"
          />
        </button>
      ) : null}

      {/* Bottom controls */}
      {state !== "failed" ? (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-20",
            "bg-gradient-to-t from-black/95 via-black/55 to-transparent",
            "px-3 pb-3 pt-14",
            "transition-[opacity,transform] duration-300 ease-out",
            showControls
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-1 opacity-0",
          )}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {/* Progress */}
          <label
            htmlFor={progressId}
            className="sr-only"
          >
            Seek through {title}
          </label>

          <input
            id={progressId}
            type="range"
            min={0}
            max={progressMax || 1}
            step={0.1}
            value={Math.min(
              current,
              progressMax || 1,
            )}
            disabled={
              progressMax === 0
            }
            onPointerDown={() =>
              setIsSeeking(true)
            }
            onPointerUp={() =>
              setIsSeeking(false)
            }
            onChange={(event) =>
              seekTo(
                Number(
                  event.target.value,
                ),
              )
            }
            aria-valuetext={`${formatDuration(
              current,
            )} of ${formatDuration(
              progressMax,
            )}`}
            className="
              mb-2
              h-1.5
              w-full
              cursor-pointer
              appearance-none
              rounded-full
              bg-white/20
              accent-[#8B5CF6]
              transition-[height]
              duration-150
              hover:h-2
            "
          />

          {/* Control row */}
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Play */}
            <button
              type="button"
              onClick={() => {
                togglePlay();
                scheduleControlsHide();
              }}
              aria-label={
                state === "playing"
                  ? "Pause"
                  : "Play"
              }
              className="
                flex
                size-9
                shrink-0
                items-center
                justify-center
                rounded-lg
                text-white/80
                transition-all
                duration-150
                hover:bg-white/10
                hover:text-white
                active:scale-95
              "
            >
              {state ===
              "playing" ? (
                <Pause
                  className="size-4"
                  aria-hidden="true"
                />
              ) : (
                <Play
                  className="size-4 fill-current"
                  aria-hidden="true"
                />
              )}
            </button>

            {/* Back 10 */}
            <button
              type="button"
              onClick={() =>
                skip(-10)
              }
              aria-label="Back 10 seconds"
              title="Back 10 seconds"
              className="
                relative
                flex
                size-9
                shrink-0
                items-center
                justify-center
                rounded-lg
                text-white/70
                transition-all
                duration-150
                hover:bg-white/10
                hover:text-white
                active:scale-95
              "
            >
              <RotateCcw
                className="size-4"
                aria-hidden="true"
              />

              <span className="absolute text-[7px] font-bold">
                10
              </span>
            </button>

            {/* Forward 10 */}
            <button
              type="button"
              onClick={() =>
                skip(10)
              }
              aria-label="Forward 10 seconds"
              title="Forward 10 seconds"
              className="
                relative
                flex
                size-9
                shrink-0
                items-center
                justify-center
                rounded-lg
                text-white/70
                transition-all
                duration-150
                hover:bg-white/10
                hover:text-white
                active:scale-95
              "
            >
              <RotateCw
                className="size-4"
                aria-hidden="true"
              />

              <span className="absolute text-[7px] font-bold">
                10
              </span>
            </button>

            {/* Volume */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={
                  toggleMute
                }
                aria-label={
                  muted
                    ? "Unmute"
                    : "Mute"
                }
                className="
                  flex
                  size-9
                  shrink-0
                  items-center
                  justify-center
                  rounded-lg
                  text-white/75
                  transition-all
                  duration-150
                  hover:bg-white/10
                  hover:text-white
                  active:scale-95
                "
              >
                {muted ? (
                  <VolumeX
                    className="size-4"
                    aria-hidden="true"
                  />
                ) : (
                  <Volume2
                    className="size-4"
                    aria-hidden="true"
                  />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={
                  muted
                    ? 0
                    : volume
                }
                onChange={(
                  event,
                ) =>
                  changeVolume(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
                aria-label="Volume"
                className="
                  hidden
                  h-1
                  w-16
                  cursor-pointer
                  appearance-none
                  rounded-full
                  bg-white/20
                  accent-[#8B5CF6]
                  sm:block
                "
              />
            </div>

            {/* Time */}
            <span className="ml-1 whitespace-nowrap font-mono text-[10px] tabular-nums text-white/55">
              {formatDuration(
                current,
              )}

              <span className="mx-1 text-white/25">
                /
              </span>

              {formatDuration(
                progressMax,
              )}
            </span>

            {/* Right controls */}
            <div className="ml-auto flex items-center gap-1">
              {/* Speed */}
              <select
                aria-label="Playback speed"
                value={speed}
                onChange={(event) =>
                  changeSpeed(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
                className="
                  h-8
                  cursor-pointer
                  rounded-lg
                  border
                  border-white/10
                  bg-black/45
                  px-2
                  font-mono
                  text-[10px]
                  text-white/75
                  outline-none
                  transition-colors
                  hover:border-white/20
                  hover:text-white
                "
              >
                {[
                  0.5,
                  0.75,
                  1,
                  1.25,
                  1.5,
                  2,
                ].map(
                  (rate) => (
                    <option
                      key={rate}
                      value={rate}
                    >
                      {rate}x
                    </option>
                  ),
                )}
              </select>

              {/* Quality */}
              {levels.length >
              1 ? (
                <select
                  aria-label="Video quality"
                  value={
                    currentLevel
                  }
                  onChange={(
                    event,
                  ) =>
                    selectQuality(
                      Number(
                        event.target
                          .value,
                      ),
                    )
                  }
                  className="
                    h-8
                    max-w-20
                    cursor-pointer
                    rounded-lg
                    border
                    border-white/10
                    bg-black/45
                    px-2
                    font-mono
                    text-[10px]
                    text-white/75
                    outline-none
                    transition-colors
                    hover:border-white/20
                    hover:text-white
                  "
                >
                  <option value={-1}>
                    Auto
                  </option>

                  {levels.map(
                    (level) => (
                      <option
                        key={
                          level.index
                        }
                        value={
                          level.index
                        }
                      >
                        {level.label}
                      </option>
                    ),
                  )}
                </select>
              ) : null}

              {/* Fullscreen */}
              {!isAudio ? (
                <button
                  type="button"
                  onClick={() =>
                    void toggleFullscreen()
                  }
                  aria-label={
                    isFullscreen
                      ? "Exit full screen"
                      : "Full screen"
                  }
                  className="
                    flex
                    size-9
                    items-center
                    justify-center
                    rounded-lg
                    text-white/75
                    transition-all
                    duration-150
                    hover:bg-white/10
                    hover:text-white
                    active:scale-95
                  "
                >
                  {isFullscreen ? (
                    <Minimize
                      className="size-4"
                      aria-hidden="true"
                    />
                  ) : (
                    <Maximize
                      className="size-4"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Screen reader state */}
      <span
        aria-live="polite"
        className="sr-only"
      >
        {state === "playing"
          ? "Playing"
          : state === "paused"
            ? "Paused"
            : state ===
                "buffering"
              ? "Buffering"
              : ""}
      </span>
    </div>
  );
}