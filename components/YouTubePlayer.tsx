"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayer } from "@/lib/playerContext";
import { getArtwork } from "@/lib/track";

interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
declare global {
  interface Window {
    YT: {
      Player: new (el: HTMLElement | string, opts: object) => YTPlayer;
      PlayerState: {
        UNSTARTED: number; ENDED: number; PLAYING: number;
        PAUSED: number; BUFFERING: number; CUED: number;
      };
    };
    onYouTubeIframeAPIReady(): void;
  }
}

let apiState: "idle" | "loading" | "ready" = "idle";
const apiCallbacks: Array<() => void> = [];
function ensureYTApi(cb: () => void) {
  if (apiState === "ready") { cb(); return; }
  apiCallbacks.push(cb);
  if (apiState === "loading") return;
  apiState = "loading";
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
  window.onYouTubeIframeAPIReady = () => {
    apiState = "ready";
    apiCallbacks.forEach(f => f());
    apiCallbacks.length = 0;
  };
}

function safeCall<T>(player: YTPlayer | null, method: keyof YTPlayer, ...args: unknown[]): T | undefined {
  try {
    if (!player) return undefined;
    const fn = player[method];
    if (typeof fn !== "function") return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fn as (...a: any[]) => T).apply(player, args);
  } catch { return undefined; }
}

const CROSSFADE_MS = 400;

export default function YouTubePlayer() {
  const { state, currentSong, next, dispatch } = usePlayer();

  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const divRef           = useRef<HTMLDivElement>(null);
  const ytRef            = useRef<YTPlayer | null>(null);
  const playerReady      = useRef(false);
  const pendingVideoId   = useRef<string | null>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressSet  = useRef(0);
  const prevVideoId      = useRef<string | null>(null);
  const targetVolume     = useRef(state.volume);
  const nextRef          = useRef(next);
  const isPlayingRef     = useRef(state.isPlaying);
  const intentionalPause = useRef(false);

  // Which source is currently active — ONLY one plays at a time
  const modeRef = useRef<"native" | "iframe">("iframe");
  // videoId currently being played — used to guard stale callbacks
  const activeVideoId = useRef<string | null>(null);
  const audioUrlCache = useRef<Map<string, string | null>>(new Map());

  useEffect(() => { nextRef.current = next; }, [next]);
  useEffect(() => { isPlayingRef.current = state.isPlaying; }, [state.isPlaying]);
  useEffect(() => { targetVolume.current = state.volume; }, [state.volume]);

  /* ── Create native <audio> once ── */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("ended", () => {
      // Only fire if this audio element is the active source
      if (modeRef.current !== "native") return;
      dispatch({ type: "SET_PLAYING", payload: false });
      setTimeout(() => nextRef.current(), 300);
    });
    audio.addEventListener("canplay", () => {
      if (modeRef.current !== "native") return;
      dispatch({ type: "SET_YT_STATUS", payload: "ready" });
    });
    audio.addEventListener("playing", () => {
      if (modeRef.current !== "native") return;
      dispatch({ type: "SET_YT_STATUS", payload: "ready" });
    });
    // Don't auto-next on audio error — just fall back silently to iframe
    audio.addEventListener("error", () => {
      if (modeRef.current !== "native") return;
      modeRef.current = "iframe";
    });

    return () => { audio.pause(); audioRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Try fetching direct audio URL (non-blocking) ── */
  const tryNativeAudio = useCallback(async (videoId: string) => {
    if (audioUrlCache.current.has(videoId)) {
      const cached = audioUrlCache.current.get(videoId);
      if (cached && activeVideoId.current === videoId) {
        modeRef.current = "native";
        // Stop iframe
        safeCall(ytRef.current, "pauseVideo");
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = cached;
        audio.volume = targetVolume.current;
        audio.load();
        if (isPlayingRef.current) audio.play().catch(() => {});
      }
      return;
    }
    try {
      const res = await fetch(`/api/youtube/audio?v=${videoId}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = res.ok ? await res.json() : { url: null };
      audioUrlCache.current.set(videoId, data.url ?? null);
      // Only apply if this video is still what we want to play
      if (data.url && activeVideoId.current === videoId) {
        modeRef.current = "native";
        safeCall(ytRef.current, "pauseVideo"); // stop iframe
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = data.url;
        audio.volume = targetVolume.current;
        audio.load();
        if (isPlayingRef.current) audio.play().catch(() => {});
        dispatch({ type: "SET_YT_STATUS", payload: "ready" });
      }
    } catch { /* keep iframe mode */ }
  }, [dispatch]);

  /* ── YT iframe init ── */
  const initPlayer = useCallback(() => {
    if (!divRef.current || ytRef.current) return;
    ytRef.current = new window.YT.Player(divRef.current, {
      height: "1", width: "1",
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1,
        fs: 0, modestbranding: 1, playsinline: 1, rel: 0,
        origin: typeof window !== "undefined" ? window.location.origin : "",
      },
      events: {
        onReady: () => {
          playerReady.current = true;
          safeCall(ytRef.current, "setVolume", targetVolume.current * 100);
          if (pendingVideoId.current) {
            safeCall(ytRef.current, "loadVideoById", pendingVideoId.current);
            prevVideoId.current = pendingVideoId.current;
            pendingVideoId.current = null;
          } else if (state.ytVideoId) {
            safeCall(ytRef.current, "loadVideoById", state.ytVideoId);
            prevVideoId.current = state.ytVideoId;
          }
        },
        onStateChange: (e: { data: number }) => {
          // Ignore iframe events when native audio is active
          if (modeRef.current === "native") return;
          const S = window.YT.PlayerState;
          if (e.data === S.PLAYING || e.data === S.BUFFERING) {
            dispatch({ type: "SET_YT_STATUS", payload: "ready" });
          }
          if (e.data === S.ENDED) {
            dispatch({ type: "SET_PLAYING", payload: false });
            setTimeout(() => nextRef.current(), 300);
          }
          if (e.data === S.PAUSED) {
            if (isPlayingRef.current && !intentionalPause.current && !document.hidden) {
              setTimeout(() => {
                if (isPlayingRef.current && !intentionalPause.current && modeRef.current === "iframe") {
                  safeCall(ytRef.current, "playVideo");
                }
              }, 400);
            }
            intentionalPause.current = false;
          }
        },
        onError: () => {
          if (modeRef.current !== "iframe") return;
          dispatch({ type: "SET_YT_STATUS", payload: "error" });
          dispatch({ type: "SET_PLAYING", payload: false });
          setTimeout(() => nextRef.current(), 1200);
        },
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ensureYTApi(initPlayer); }, [initPlayer]);

  /* ── When video ID changes: load iframe first, try native in background ── */
  useEffect(() => {
    if (!state.ytVideoId) return;
    const videoId = state.ytVideoId;

    // Mark this as the active video
    activeVideoId.current = videoId;
    watchdogFired.current = false;

    lastProgressSet.current = 0;
    dispatch({ type: "SET_PROGRESS", payload: 0 });
    dispatch({ type: "SET_DURATION", payload: 0 });
    dispatch({ type: "SET_YT_STATUS", payload: "loading" });

    // Stop native audio from previous song
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    // Reset to iframe mode — native will take over if URL fetch succeeds
    modeRef.current = "iframe";
    intentionalPause.current = false;

    // Load iframe immediately (reliable fallback)
    const isSkip = !!prevVideoId.current && prevVideoId.current !== videoId;
    if (playerReady.current && ytRef.current) {
      if (isSkip && isPlayingRef.current && fadeTimerRef.current === null) {
        // Quick crossfade on skip
        const vol = targetVolume.current;
        let step = 0;
        const steps = 6;
        fadeTimerRef.current = setInterval(() => {
          step++;
          safeCall(ytRef.current, "setVolume", Math.max(0, vol * (1 - step / steps) * 100));
          if (step >= steps) {
            clearInterval(fadeTimerRef.current!);
            fadeTimerRef.current = null;
            safeCall(ytRef.current, "loadVideoById", videoId);
            setTimeout(() => {
              if (modeRef.current === "iframe") safeCall(ytRef.current, "playVideo");
              safeCall(ytRef.current, "setVolume", vol * 100);
            }, 150);
          }
        }, CROSSFADE_MS / steps);
      } else {
        safeCall(ytRef.current, "loadVideoById", videoId);
        if (state.isPlaying) setTimeout(() => {
          if (modeRef.current === "iframe") safeCall(ytRef.current, "playVideo");
        }, 500);
      }
    } else {
      pendingVideoId.current = videoId;
    }
    prevVideoId.current = videoId;

    // Try native audio in background — will take over if successful
    tryNativeAudio(videoId);
  }, [state.ytVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Play / pause ── */
  useEffect(() => {
    if (state.ytStatus !== "ready") return;
    if (state.isPlaying) {
      intentionalPause.current = false;
      if (modeRef.current === "native" && audioRef.current) {
        audioRef.current.play().catch(() => {});
      } else {
        safeCall(ytRef.current, "playVideo");
      }
    } else {
      intentionalPause.current = true;
      if (modeRef.current === "native" && audioRef.current) {
        audioRef.current.pause();
      } else {
        safeCall(ytRef.current, "pauseVideo");
      }
    }
  }, [state.isPlaying, state.ytStatus]);

  /* ── Volume ── */
  useEffect(() => {
    targetVolume.current = state.volume;
    if (modeRef.current === "native" && audioRef.current) {
      audioRef.current.volume = state.volume;
    } else if (!fadeTimerRef.current) {
      safeCall(ytRef.current, "setVolume", state.volume * 100);
    }
  }, [state.volume]);

  /* ── Seek ── */
  useEffect(() => {
    const diff = Math.abs(state.progress - lastProgressSet.current);
    if (diff > 0.015 && state.duration > 0) {
      const t = state.progress * state.duration;
      if (modeRef.current === "native" && audioRef.current) {
        audioRef.current.currentTime = t;
      } else {
        safeCall(ytRef.current, "seekTo", t, true);
      }
    }
  }, [state.progress, state.duration]);

  /* ── Progress polling ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!state.isPlaying) return;
    timerRef.current = setInterval(() => {
      let dur: number | undefined, cur: number | undefined;
      if (modeRef.current === "native" && audioRef.current && audioRef.current.src) {
        dur = audioRef.current.duration;
        cur = audioRef.current.currentTime;
      } else {
        dur = safeCall<number>(ytRef.current, "getDuration");
        cur = safeCall<number>(ytRef.current, "getCurrentTime");
      }
      if (dur && cur !== undefined && isFinite(dur) && dur > 0 && cur >= 0) {
        const prog = cur / dur;
        lastProgressSet.current = prog;
        dispatch({ type: "SET_PROGRESS",     payload: prog });
        dispatch({ type: "SET_DURATION",     payload: dur  });
        dispatch({ type: "SET_CURRENT_TIME", payload: cur  });
      }
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.isPlaying, dispatch]);

  /* ── Progress watchdog — fires next() when song ends even with screen off ── */
  /* The 'ended' event can be suppressed when the screen is locked on some devices.
     This polls progress and auto-advances when >= 99% to guarantee auto-next. */
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogFired = useRef(false);

  useEffect(() => {
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogFired.current = false;
    if (!state.isPlaying || !state.duration) return;

    watchdogRef.current = setInterval(() => {
      if (!isPlayingRef.current || watchdogFired.current) return;
      const progress = state.progress;
      const duration = state.duration;
      if (duration > 0 && progress >= 0.99) {
        watchdogFired.current = true;
        clearInterval(watchdogRef.current!);
        dispatch({ type: "SET_PLAYING", payload: false });
        setTimeout(() => nextRef.current(), 300);
      }
    }, 1000);

    return () => { if (watchdogRef.current) clearInterval(watchdogRef.current); };
  }, [state.isPlaying, state.duration, state.progress, dispatch]);

  /* ── Visibility resume ── */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden || !isPlayingRef.current) return;
      if (modeRef.current === "native" && audioRef.current) {
        if (audioRef.current.paused) audioRef.current.play().catch(() => {});
      } else if (ytRef.current) {
        setTimeout(() => {
          const ps = safeCall<number>(ytRef.current, "getPlayerState");
          if (ps !== 1 && ps !== 3) safeCall(ytRef.current, "playVideo");
          safeCall(ytRef.current, "setVolume", targetVolume.current * 100);
        }, 600);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  /* ── Media Session API ── */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentSong.trackName,
      artist: currentSong.artistName,
      album:  currentSong.collectionName,
      artwork: [
        { src: getArtwork(currentSong.artworkUrl100, 96),  sizes: "96x96",   type: "image/jpeg" },
        { src: getArtwork(currentSong.artworkUrl100, 256), sizes: "256x256", type: "image/jpeg" },
        { src: getArtwork(currentSong.artworkUrl100, 512), sizes: "512x512", type: "image/jpeg" },
      ],
    });
    navigator.mediaSession.setActionHandler("play", () => {
      intentionalPause.current = false;
      dispatch({ type: "SET_PLAYING", payload: true });
      if (modeRef.current === "native" && audioRef.current) audioRef.current.play().catch(() => {});
      else safeCall(ytRef.current, "playVideo");
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      intentionalPause.current = true;
      dispatch({ type: "SET_PLAYING", payload: false });
      if (modeRef.current === "native" && audioRef.current) audioRef.current.pause();
      else safeCall(ytRef.current, "pauseVideo");
    });
    navigator.mediaSession.setActionHandler("nexttrack",     () => nextRef.current());
    navigator.mediaSession.setActionHandler("previoustrack", () => dispatch({ type: "PREV" }));
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime !== undefined && state.duration > 0) {
        dispatch({ type: "SET_PROGRESS", payload: d.seekTime / state.duration });
        if (modeRef.current === "native" && audioRef.current) audioRef.current.currentTime = d.seekTime;
        else safeCall(ytRef.current, "seekTo", d.seekTime, true);
      }
    });
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
    return () => {
      try {
        (["play","pause","nexttrack","previoustrack","seekto"] as MediaSessionAction[]).forEach(a => {
          navigator.mediaSession.setActionHandler(a, null);
        });
      } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, state.isPlaying, state.duration]);

  /* ── Lock screen position ── */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        playbackRate: 1,
        position: Math.min(state.progress * state.duration, state.duration),
      });
    } catch { /* ignore */ }
  }, [state.progress, state.duration]);

  return (
    <div className="fixed -bottom-full -left-full w-1 h-1 overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
      <div ref={divRef} />
    </div>
  );
}
