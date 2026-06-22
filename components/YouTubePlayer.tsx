"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayer } from "@/lib/playerContext";
import { getArtwork } from "@/lib/track";

/* ─── YouTube iframe types ──────────────────────────── */
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

  /* ── Native <audio> element — primary for background play ── */
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  /* ── YT iframe — fallback when direct URL unavailable ── */
  const divRef          = useRef<HTMLDivElement>(null);
  const ytRef           = useRef<YTPlayer | null>(null);
  const playerReady     = useRef(false);
  const pendingVideoId  = useRef<string | null>(null);

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressSet = useRef(0);
  const prevVideoId     = useRef<string | null>(null);
  const targetVolume    = useRef(state.volume);
  const nextRef         = useRef(next);
  const isPlayingRef    = useRef(state.isPlaying);
  const intentionalPause = useRef(false);

  // "native" = using <audio> element, "iframe" = using YT iframe
  const modeRef = useRef<"native" | "iframe">("iframe");
  // Cache of videoId → direct audio URL
  const audioUrlCache = useRef<Map<string, string | null>>(new Map());

  useEffect(() => { nextRef.current = next; }, [next]);
  useEffect(() => { isPlayingRef.current = state.isPlaying; }, [state.isPlaying]);
  useEffect(() => { targetVolume.current = state.volume; }, [state.volume]);

  /* ── Create <audio> element once ── */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    audio.addEventListener("ended", () => {
      dispatch({ type: "SET_PLAYING", payload: false });
      setTimeout(() => nextRef.current(), 300);
    });
    audio.addEventListener("canplay", () => {
      dispatch({ type: "SET_YT_STATUS", payload: "ready" });
    });
    audio.addEventListener("error", () => {
      // Fall back to iframe mode
      modeRef.current = "iframe";
      dispatch({ type: "SET_YT_STATUS", payload: "error" });
      setTimeout(() => nextRef.current(), 1500);
    });
    audio.addEventListener("playing", () => {
      dispatch({ type: "SET_YT_STATUS", payload: "ready" });
      dispatch({ type: "SET_PLAYING", payload: true });
    });

    return () => { audio.pause(); audioRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fetch direct audio URL and switch to native mode ── */
  const tryNativeAudio = useCallback(async (videoId: string) => {
    // Check cache first
    if (audioUrlCache.current.has(videoId)) {
      const cached = audioUrlCache.current.get(videoId);
      if (cached) {
        modeRef.current = "native";
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = cached;
        audio.volume = targetVolume.current;
        audio.load();
        if (isPlayingRef.current) audio.play().catch(() => {});
        return;
      }
      return; // cached as null — use iframe
    }

    // Fetch from our proxy
    try {
      const res = await fetch(`/api/youtube/audio?v=${videoId}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = res.ok ? await res.json() : { url: null };
      audioUrlCache.current.set(videoId, data.url ?? null);

      if (data.url) {
        modeRef.current = "native";
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = data.url;
        audio.volume = targetVolume.current;
        audio.load();
        if (isPlayingRef.current) audio.play().catch(() => {});
        dispatch({ type: "SET_YT_STATUS", payload: "ready" });
      }
      // else stays in iframe mode
    } catch {
      audioUrlCache.current.set(videoId, null);
    }
  }, [dispatch]);

  /* ── YT iframe setup (fallback) ── */
  const loadVideoIframe = useCallback((videoId: string, withFade = false) => {
    if (!playerReady.current || !ytRef.current) {
      pendingVideoId.current = videoId;
      return;
    }
    if (withFade && prevVideoId.current && isPlayingRef.current) {
      // crossfade
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      const vol = targetVolume.current;
      let step = 0;
      const steps = 8;
      fadeTimerRef.current = setInterval(() => {
        step++;
        safeCall(ytRef.current, "setVolume", Math.max(0, vol * (1 - step / steps) * 100));
        if (step >= steps) {
          clearInterval(fadeTimerRef.current!);
          safeCall(ytRef.current, "setVolume", 0);
          safeCall(ytRef.current, "loadVideoById", videoId);
          setTimeout(() => {
            safeCall(ytRef.current, "playVideo");
            let s2 = 0;
            fadeTimerRef.current = setInterval(() => {
              s2++;
              safeCall(ytRef.current, "setVolume", Math.min(targetVolume.current * 100, targetVolume.current * (s2 / steps) * 100));
              if (s2 >= steps) {
                clearInterval(fadeTimerRef.current!);
                safeCall(ytRef.current, "setVolume", targetVolume.current * 100);
              }
            }, CROSSFADE_MS / steps);
          }, 150);
        }
      }, CROSSFADE_MS / steps);
    } else {
      safeCall(ytRef.current, "loadVideoById", videoId);
    }
    prevVideoId.current = videoId;
  }, []);

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
          const S = window.YT.PlayerState;
          if (modeRef.current !== "iframe") return; // ignore if native is active
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

  /* ── When video ID changes: try native first, iframe as fallback ── */
  useEffect(() => {
    if (!state.ytVideoId) return;
    lastProgressSet.current = 0;
    dispatch({ type: "SET_PROGRESS", payload: 0 });
    dispatch({ type: "SET_DURATION", payload: 0 });
    dispatch({ type: "SET_YT_STATUS", payload: "loading" });

    const videoId = state.ytVideoId;
    const isSkip = !!prevVideoId.current && prevVideoId.current !== videoId;
    prevVideoId.current = videoId;

    // Reset native audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    modeRef.current = "iframe"; // reset to iframe while we try to fetch

    // Try native audio URL (non-blocking)
    tryNativeAudio(videoId);

    // Also load iframe in parallel as fallback
    loadVideoIframe(videoId, isSkip);
    if (!isSkip && state.isPlaying) {
      setTimeout(() => {
        if (modeRef.current === "native" && audioRef.current) {
          audioRef.current.play().catch(() => {});
        } else {
          safeCall(ytRef.current, "playVideo");
        }
      }, 600);
    }
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
      const seekTime = state.progress * state.duration;
      if (modeRef.current === "native" && audioRef.current) {
        audioRef.current.currentTime = seekTime;
      } else {
        safeCall(ytRef.current, "seekTo", seekTime, true);
      }
    }
  }, [state.progress, state.duration]);

  /* ── Progress polling ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!state.isPlaying) return;
    timerRef.current = setInterval(() => {
      let dur: number | undefined, cur: number | undefined;
      if (modeRef.current === "native" && audioRef.current) {
        dur = audioRef.current.duration;
        cur = audioRef.current.currentTime;
      } else {
        dur = safeCall<number>(ytRef.current, "getDuration");
        cur = safeCall<number>(ytRef.current, "getCurrentTime");
      }
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

  /* ── Visibility resume (for iframe fallback) ── */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) return;
      if (!isPlayingRef.current) return;
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
        if (modeRef.current === "native" && audioRef.current) {
          audioRef.current.currentTime = d.seekTime;
        } else {
          safeCall(ytRef.current, "seekTo", d.seekTime, true);
        }
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

  /* ── Lock screen position sync ── */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        playbackRate: 1,
        position: Math.min(state.progress * state.duration, state.duration),
      });
    } catch { /* not all browsers support */ }
  }, [state.progress, state.duration]);

  return (
    <div className="fixed -bottom-full -left-full w-1 h-1 overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
      <div ref={divRef} />
    </div>
  );
}
