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
      PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
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

/* ── Silent audio keepalive ─────────────────────────────
 * Uses AudioContext to create a real (but silent) looping buffer.
 * Must be started from a user gesture — iOS/Android require this.
 * This keeps the browser's audio session alive when the screen is off.
 */
let silentAudioCtx: AudioContext | null = null;

function startSilentAudio() {
  if (silentAudioCtx) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    silentAudioCtx = new Ctx();
    const buf = silentAudioCtx.createBuffer(1, silentAudioCtx.sampleRate, silentAudioCtx.sampleRate);
    const src = silentAudioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = silentAudioCtx.createGain();
    gain.gain.value = 0.001;
    src.connect(gain);
    gain.connect(silentAudioCtx.destination);
    src.start(0);
  } catch { /* ignore */ }
}

function resumeSilentAudio() {
  if (silentAudioCtx?.state === "suspended") silentAudioCtx.resume().catch(() => {});
}

export default function YouTubePlayer() {
  const { state, currentSong, next, dispatch } = usePlayer();
  const divRef          = useRef<HTMLDivElement>(null);
  const ytRef           = useRef<YTPlayer | null>(null);
  const playerReady     = useRef(false);
  const pendingVideoId  = useRef<string | null>(null);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressSet = useRef(0);
  const prevProgress    = useRef(0);
  const prevVideoId     = useRef<string | null>(null);
  const targetVolume    = useRef(state.volume);
  // Keep a stable ref to next() so the onStateChange closure always calls the latest version
  const nextRef         = useRef(next);
  const isPlayingRef    = useRef(state.isPlaying);
  // Tracks whether WE intentionally paused — prevents the S.PAUSED handler from fighting us
  const intentionalPause = useRef(false);

  useEffect(() => { nextRef.current = next; }, [next]);
  useEffect(() => { isPlayingRef.current = state.isPlaying; }, [state.isPlaying]);
  useEffect(() => { targetVolume.current = state.volume; }, [state.volume]);

  /* ── Start silent audio on first user tap (required for iOS/Android) ── */
  useEffect(() => {
    const onFirstInteraction = () => {
      startSilentAudio();
      document.removeEventListener("touchstart", onFirstInteraction, true);
      document.removeEventListener("click",      onFirstInteraction, true);
    };
    document.addEventListener("touchstart", onFirstInteraction, { capture: true, passive: true });
    document.addEventListener("click",      onFirstInteraction, { capture: true, passive: true });
    return () => {
      document.removeEventListener("touchstart", onFirstInteraction, true);
      document.removeEventListener("click",      onFirstInteraction, true);
    };
  }, []);

  /* ── Resume when page becomes visible again (home button → back to app) ── */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) return;
      resumeSilentAudio();
      if (!isPlayingRef.current || !ytRef.current) return;
      setTimeout(() => {
        if (!isPlayingRef.current || !ytRef.current) return;
        const ps = safeCall<number>(ytRef.current, "getPlayerState");
        // 1 = PLAYING, 3 = BUFFERING — if neither, force resume
        if (ps !== 1 && ps !== 3) safeCall(ytRef.current, "playVideo");
        // Re-sync volume (gets reset on some Android browsers)
        safeCall(ytRef.current, "setVolume", targetVolume.current * 100);
      }, 600);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  /* Crossfade: fade out → swap → fade in */
  const crossfadeTo = useCallback((videoId: string) => {
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    const vol = targetVolume.current;
    let step = 0;
    const steps = 8;
    const intervalMs = CROSSFADE_MS / steps;
    fadeTimerRef.current = setInterval(() => {
      step++;
      const faded = vol * (1 - step / steps);
      safeCall(ytRef.current, "setVolume", Math.max(0, faded * 100));
      if (step >= steps) {
        clearInterval(fadeTimerRef.current!);
        safeCall(ytRef.current, "setVolume", 0);
        safeCall(ytRef.current, "loadVideoById", videoId);
        pendingVideoId.current = null;
        dispatch({ type: "SET_YT_STATUS", payload: "ready" });
        setTimeout(() => {
          safeCall(ytRef.current, "playVideo");
          let s2 = 0;
          fadeTimerRef.current = setInterval(() => {
            s2++;
            const v = targetVolume.current * (s2 / steps);
            safeCall(ytRef.current, "setVolume", Math.min(targetVolume.current * 100, v * 100));
            if (s2 >= steps) {
              clearInterval(fadeTimerRef.current!);
              safeCall(ytRef.current, "setVolume", targetVolume.current * 100);
            }
          }, intervalMs);
        }, 150);
      }
    }, intervalMs);
  }, [dispatch]);

  const loadVideo = useCallback((videoId: string, withFade = false) => {
    if (playerReady.current && ytRef.current) {
      if (withFade && prevVideoId.current && isPlayingRef.current) {
        crossfadeTo(videoId);
      } else {
        safeCall(ytRef.current, "loadVideoById", videoId);
      }
      pendingVideoId.current = null;
    } else {
      pendingVideoId.current = videoId;
    }
    prevVideoId.current = videoId;
  }, [crossfadeTo]);

  const initPlayer = useCallback(() => {
    if (!divRef.current || ytRef.current) return;
    ytRef.current = new window.YT.Player(divRef.current, {
      height: "1", width: "1",
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1,
        fs: 0, modestbranding: 1,
        playsinline: 1, // essential for iOS background/inline play
        rel: 0,
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
          const S = window.YT.PlayerState;
          if (e.data === S.PLAYING || e.data === S.BUFFERING) {
            dispatch({ type: "SET_YT_STATUS", payload: "ready" });
          }
          if (e.data === S.ENDED) {
            // Use ref so we always call the latest next() even from stale closure
            dispatch({ type: "SET_PLAYING", payload: false });
            setTimeout(() => nextRef.current(), 300);
          }
          if (e.data === S.PAUSED) {
            // Only auto-resume if: we intend to be playing AND it wasn't us who paused
            if (isPlayingRef.current && !intentionalPause.current && !document.hidden) {
              setTimeout(() => {
                if (isPlayingRef.current && !intentionalPause.current) {
                  safeCall(ytRef.current, "playVideo");
                }
              }, 400);
            }
            intentionalPause.current = false;
          }
        },
        onError: () => {
          dispatch({ type: "SET_YT_STATUS", payload: "error" });
          dispatch({ type: "SET_PLAYING", payload: false });
          // Auto-skip on error after a moment
          setTimeout(() => nextRef.current(), 1200);
        },
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ensureYTApi(initPlayer); }, [initPlayer]);

  /* Load new video with crossfade when videoId changes */
  useEffect(() => {
    if (!state.ytVideoId) return;
    lastProgressSet.current = 0;
    dispatch({ type: "SET_PROGRESS", payload: 0 });
    dispatch({ type: "SET_DURATION", payload: 0 });
    const isSkip = !!prevVideoId.current && prevVideoId.current !== state.ytVideoId;
    loadVideo(state.ytVideoId, isSkip);
    if (!isSkip && state.isPlaying) {
      setTimeout(() => safeCall(ytRef.current, "playVideo"), 600);
    }
  }, [state.ytVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Play / pause — mark intentional so S.PAUSED handler doesn't auto-resume */
  useEffect(() => {
    if (!ytRef.current || state.ytStatus !== "ready") return;
    if (state.isPlaying) {
      intentionalPause.current = false;
      safeCall(ytRef.current, "playVideo");
    } else {
      intentionalPause.current = true;
      safeCall(ytRef.current, "pauseVideo");
    }
  }, [state.isPlaying, state.ytStatus]);

  /* Volume */
  useEffect(() => {
    targetVolume.current = state.volume;
    if (!fadeTimerRef.current) {
      safeCall(ytRef.current, "setVolume", state.volume * 100);
    }
  }, [state.volume]);

  /* Seek */
  useEffect(() => {
    if (!ytRef.current) return;
    const diff = Math.abs(state.progress - lastProgressSet.current);
    if (diff > 0.015 && state.duration > 0) {
      safeCall(ytRef.current, "seekTo", state.progress * state.duration, true);
    }
    prevProgress.current = state.progress;
  }, [state.progress, state.duration]);

  /* Progress polling */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!state.isPlaying) return;
    timerRef.current = setInterval(() => {
      if (!ytRef.current) return;
      const dur = safeCall<number>(ytRef.current, "getDuration");
      const cur = safeCall<number>(ytRef.current, "getCurrentTime");
      if (dur && cur !== undefined && dur > 0 && cur >= 0) {
        const prog = cur / dur;
        lastProgressSet.current = prog;
        dispatch({ type: "SET_PROGRESS",     payload: prog });
        dispatch({ type: "SET_DURATION",     payload: dur  });
        dispatch({ type: "SET_CURRENT_TIME", payload: cur  });
      }
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.isPlaying, dispatch]);

  /* ── Media Session API — lock screen / notification controls ── */
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
      safeCall(ytRef.current, "playVideo");
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      intentionalPause.current = true;
      dispatch({ type: "SET_PLAYING", payload: false });
      safeCall(ytRef.current, "pauseVideo");
    });
    navigator.mediaSession.setActionHandler("nexttrack",     () => nextRef.current());
    navigator.mediaSession.setActionHandler("previoustrack", () => dispatch({ type: "PREV" }));
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime !== undefined && state.duration > 0) {
        dispatch({ type: "SET_PROGRESS", payload: d.seekTime / state.duration });
        safeCall(ytRef.current, "seekTo", d.seekTime, true);
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

  /* ── Sync seek position to OS media controls ── */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration:     state.duration,
        playbackRate: 1,
        position:     Math.min(state.progress * state.duration, state.duration),
      });
    } catch { /* not all browsers support this */ }
  }, [state.progress, state.duration]);

  return (
    <div className="fixed -bottom-full -left-full w-1 h-1 overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
      <div ref={divRef} />
    </div>
  );
}
