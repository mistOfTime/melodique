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

const CROSSFADE_MS = 400; // ms for fade out + fade in

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
  const targetVolume    = useRef(state.volume); // actual user volume

  // Keep targetVolume in sync with user's volume setting
  useEffect(() => { targetVolume.current = state.volume; }, [state.volume]);

  /* Crossfade: fade out → swap → fade in */
  const crossfadeTo = useCallback((videoId: string) => {
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);

    const vol = targetVolume.current;
    let step = 0;
    const steps = 8;
    const intervalMs = CROSSFADE_MS / steps;

    // Fade out
    fadeTimerRef.current = setInterval(() => {
      step++;
      const faded = vol * (1 - step / steps);
      safeCall(ytRef.current, "setVolume", Math.max(0, faded * 100));
      if (step >= steps) {
        clearInterval(fadeTimerRef.current!);
        // Load new video at volume 0
        safeCall(ytRef.current, "setVolume", 0);
        safeCall(ytRef.current, "loadVideoById", videoId);
        pendingVideoId.current = null;
        dispatch({ type: "SET_YT_STATUS", payload: "ready" });

        // Small delay then fade in
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
      if (withFade && prevVideoId.current && state.isPlaying) {
        crossfadeTo(videoId);
      } else {
        safeCall(ytRef.current, "loadVideoById", videoId);
      }
      pendingVideoId.current = null;
    } else {
      pendingVideoId.current = videoId;
    }
    prevVideoId.current = videoId;
  }, [crossfadeTo, state.isPlaying]);

  const initPlayer = useCallback(() => {
    if (!divRef.current || ytRef.current) return;
    ytRef.current = new window.YT.Player(divRef.current, {
      height: "1", width: "1",
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1, rel: 0 },
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
            dispatch({ type: "SET_PLAYING", payload: false });
            next();
          }
        },
        onError: () => {
          dispatch({ type: "SET_YT_STATUS", payload: "error" });
          dispatch({ type: "SET_PLAYING", payload: false });
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

  /* Play / pause */
  useEffect(() => {
    if (!ytRef.current || state.ytStatus !== "ready") return;
    if (state.isPlaying) safeCall(ytRef.current, "playVideo");
    else safeCall(ytRef.current, "pauseVideo");
  }, [state.isPlaying, state.ytStatus]);

  /* Volume (only update if no fade is running) */
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

  /* ── Media Session API — lock screen controls ───────── */
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

    navigator.mediaSession.setActionHandler("play",          () => dispatch({ type: "SET_PLAYING", payload: true }));
    navigator.mediaSession.setActionHandler("pause",         () => dispatch({ type: "SET_PLAYING", payload: false }));
    navigator.mediaSession.setActionHandler("nexttrack",     () => dispatch({ type: "NEXT" }));
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

  /* ── Sync seek position to OS media controls ─────────── */
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
