"use client";

import { usePlayer } from "@/lib/playerContext";
import { usePlaylists } from "@/lib/playlistContext";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, Mic2, Loader2, Music2,
  Play, Pause, SkipBack, SkipForward,
  Shuffle, Repeat, Repeat1, Volume2, VolumeX,
  Heart, ListPlus, ListMusic,
} from "lucide-react";
import Image from "next/image";
import { getArtwork, formatTrackTime } from "@/lib/track";
import Link from "next/link";
import AddToPlaylistModal from "./AddToPlaylistModal";

type View = "player" | "lyrics" | "queue";

export default function NowPlayingModal({ onClose }: { onClose: () => void }) {
  const { state, currentSong, togglePlay, next, prev, setVolume, seek, toggleShuffle, cycleRepeat, dispatch } = usePlayer();
  const { toggleLiked, isLiked } = usePlaylists();
  const [showAddPl, setShowAddPl] = useState(false);
  const [view, setView]           = useState<View>("player");
  const activeRef   = useRef<HTMLParagraphElement>(null);
  const lyricsRef   = useRef<HTMLDivElement>(null);
  const barRef      = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  // Pause auto-scroll when user manually scrolls
  useEffect(() => {
    const el = lyricsRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrollingRef.current = true;
      setIsUserScrolling(true);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => {
        userScrollingRef.current = false;
        setIsUserScrolling(false);
      }, 4000);
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      setAtBottom(near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll active lyric into center
  useEffect(() => {
    if (!activeRef.current || !lyricsRef.current || userScrollingRef.current) return;
    const container = lyricsRef.current;
    const el = activeRef.current;
    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [state.currentLyricIndex]);

  // Escape key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  const handleBarTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX;
    seek(Math.max(0, Math.min(1, (x - r.left) / r.width)));
  };

  if (!currentSong) return null;

  const currentTime = state.progress * state.duration;
  const isLoading   = state.ytStatus === "loading";
  const liked       = isLiked(currentSong.id, currentSong.trackName, currentSong.artistName);
  const coverUrl    = getArtwork(currentSong.artworkUrl100, 600);

  return (
    <>
      {showAddPl && <AddToPlaylistModal track={currentSong} onClose={() => setShowAddPl(false)} />}

      {/* ── Full screen overlay ─────────────────────────── */}
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0f" }}>

        {/* Blurred album art background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 scale-110"
            style={{ backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(60px) saturate(2) brightness(0.4)" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
        </div>

        {/* ── Top bar ───────────────────────────────────── */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-safe pt-5 pb-2 flex-shrink-0">
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <ChevronDown size={24} />
          </button>
          <div className="text-center flex-1 mx-3">
            <p className="text-[11px] uppercase tracking-widest text-white/50 font-semibold">Now Playing</p>
            {currentSong.collectionName && (
              <Link href={`/album/${currentSong.collectionId}`} onClick={onClose}
                className="text-xs text-white/70 hover:text-white truncate block mt-0.5 transition-colors">
                {currentSong.collectionName}
              </Link>
            )}
          </div>
          <button onClick={() => setShowAddPl(true)} className="text-white/70 hover:text-white p-1">
            <ListPlus size={22} />
          </button>
        </div>

        {/* ── View tabs ─────────────────────────────────── */}
        <div className="relative z-10 flex justify-center gap-6 mb-3 flex-shrink-0">
          {(["player", "lyrics", "queue"] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs font-semibold uppercase tracking-widest pb-1 border-b-2 transition-all ${
                view === v ? "text-white border-white" : "text-white/30 border-transparent hover:text-white/60"
              }`}>
              {v === "player" ? "Player" : v === "lyrics" ? "Lyrics" : "Queue"}
            </button>
          ))}
        </div>

        {/* ── PLAYER VIEW ───────────────────────────────── */}
        {view === "player" && (
          <div className="relative z-10 flex flex-col items-center flex-1 px-6 overflow-hidden">

            {/* Album art — large, animated on play */}
            <div className="flex-1 flex items-center justify-center w-full py-2">
              <div className={`rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 ${
                state.isPlaying ? "w-[min(76vw,320px)] h-[min(76vw,320px)]" : "w-[min(64vw,268px)] h-[min(64vw,268px)]"
              }`}>
                {isLoading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-2xl">
                    <Loader2 size={28} className="animate-spin text-white" />
                  </div>
                )}
                <Image src={coverUrl} alt={currentSong.trackName}
                  width={320} height={320} className="w-full h-full object-cover" priority />
              </div>
            </div>

            {/* Song info + like */}
            <div className="w-full flex items-center gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <Link href={`/album/${currentSong.collectionId}`} onClick={onClose}
                  className="font-bold text-white text-xl leading-tight truncate block hover:underline">
                  {currentSong.trackName}
                </Link>
                <Link href={`/artist/${encodeURIComponent(currentSong.artistName)}`} onClick={onClose}
                  className="text-white/60 text-sm truncate block mt-0.5 hover:text-white transition-colors">
                  {currentSong.artistName}
                </Link>
              </div>
              <button onClick={() => toggleLiked(currentSong)}
                className={`p-2 flex-shrink-0 transition-all ${liked ? "text-green-400 scale-110" : "text-white/40 hover:text-white"}`}>
                <Heart size={24} fill={liked ? "currentColor" : "none"} />
              </button>
            </div>

            {/* Progress bar — touch-friendly */}
            <div className="w-full mb-2">
              <div ref={barRef} onClick={handleSeek} onTouchMove={handleBarTouch}
                className="w-full h-1 bg-white/20 rounded-full cursor-pointer group relative mb-1 touch-none">
                <div className="h-full rounded-full bg-white group-hover:bg-green-400 transition-colors" style={{ width: `${state.progress * 100}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white opacity-0 group-hover:opacity-100 -translate-x-1/2 pointer-events-none"
                  style={{ left: `${state.progress * 100}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-white/40 tabular-nums">
                <span>{formatTrackTime(Math.floor(currentTime * 1000))}</span>
                <span>{state.duration > 0 ? formatTrackTime(Math.floor(state.duration * 1000)) : formatTrackTime(currentSong.trackTimeMillis)}</span>
              </div>
            </div>

            {/* Main controls */}
            <div className="flex items-center justify-between w-full mb-5">
              <button onClick={toggleShuffle} className={`p-2 transition-colors ${state.shuffle ? "text-green-400" : "text-white/40"}`}>
                <Shuffle size={22} />
              </button>
              <button onClick={prev} className="p-2 text-white/80 hover:text-white transition-colors active:scale-95">
                <SkipBack size={30} fill="currentColor" />
              </button>
              <button onClick={togglePlay} disabled={isLoading}
                className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-transform shadow-2xl disabled:opacity-50">
                {isLoading ? <Loader2 size={22} className="animate-spin text-black" />
                  : state.isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
              </button>
              <button onClick={next} className="p-2 text-white/80 hover:text-white transition-colors active:scale-95">
                <SkipForward size={30} fill="currentColor" />
              </button>
              <button onClick={cycleRepeat} className={`p-2 transition-colors ${state.repeat !== "none" ? "text-green-400" : "text-white/40"}`}>
                {state.repeat === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 w-full mb-4">
              <button onClick={() => setVolume(state.volume === 0 ? 0.7 : 0)} className="text-white/40 hover:text-white flex-shrink-0">
                {state.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))} className="flex-1 h-1"
                style={{ background: `linear-gradient(to right,#1db954 ${state.volume*100}%,rgba(255,255,255,0.2) ${state.volume*100}%)` }} />
              <Volume2 size={18} className="text-white/40 flex-shrink-0" />
            </div>
          </div>
        )}

        {/* ── LYRICS VIEW ───────────────────────────────── */}
        {view === "lyrics" && (
          <div className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Top fade */}
            <div className="absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none bg-gradient-to-b from-black/60 to-transparent" />

            <div
              ref={lyricsRef}
              className="flex-1 min-h-0 overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <div className="px-6 pt-6 pb-32 space-y-0.5">
                {state.lyricsLoading ? (
                  <div className="flex flex-col items-center py-20 text-white/30">
                    <Loader2 size={24} className="animate-spin mb-3" />
                    <p className="text-sm">Finding lyrics…</p>
                  </div>
                ) : state.lyrics.length > 0 ? (
                  state.lyrics.map((line, i) => {
                    const isActive   = i === state.currentLyricIndex;
                    const isPast     = i < state.currentLyricIndex;
                    const isComing   = i === state.currentLyricIndex + 1;
                    const isUpcoming = i > state.currentLyricIndex + 1;
                    return (
                      <p
                        key={i}
                        ref={isActive ? activeRef : null}
                        className="select-none cursor-default w-full break-words transition-all duration-500"
                        style={{
                          fontSize:      isActive ? "1.35rem" : isPast ? "0.88rem" : "0.95rem",
                          fontWeight:    isActive ? 800 : isPast ? 400 : 500,
                          lineHeight:    isActive ? "1.6" : "1.45",
                          paddingTop:    isActive ? "10px" : isComing ? "4px" : "2px",
                          paddingBottom: isActive ? "10px" : "2px",
                          color: isActive   ? "#ffffff"
                               : isComing   ? "rgba(255,255,255,0.65)"
                               : isUpcoming ? "rgba(255,255,255,0.35)"
                               : isPast     ? "rgba(255,255,255,0.18)"
                                            : "rgba(255,255,255,0.35)",
                          wordBreak:   "break-word",
                          overflowWrap: "break-word",
                          textShadow:  isActive ? "0 0 24px rgba(255,255,255,0.18)" : "none",
                        }}
                      >
                        {line.text}
                      </p>
                    );
                  })
                ) : state.plainLyrics ? (
                  <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line">{state.plainLyrics}</p>
                ) : (
                  <div className="flex flex-col items-center py-20 text-white/30">
                    <Music2 size={32} className="mb-3 opacity-20" />
                    <p className="text-sm">No lyrics found</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom fade */}
            <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none bg-gradient-to-t from-black/70 to-transparent" />

            {/* Back to lyrics button */}
            {isUserScrolling && !atBottom && state.lyrics.length > 0 && (
              <button
                onClick={() => {
                  userScrollingRef.current = false;
                  setIsUserScrolling(false);
                  if (activeRef.current && lyricsRef.current) {
                    const container = lyricsRef.current;
                    const el = activeRef.current;
                    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
                    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
                  }
                }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-all whitespace-nowrap"
              >
                <Mic2 size={13} /> Back to lyrics
              </button>
            )}
          </div>
        )}

        {/* ── QUEUE VIEW ────────────────────────────────── */}
        {view === "queue" && (
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-2">
            <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3 px-2">
              Now Playing
            </p>
            {/* Current song */}
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/[0.08] mb-4">
              <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                <Image src={getArtwork(currentSong.artworkUrl100, 80)} alt={currentSong.trackName} width={40} height={40} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-400 truncate">{currentSong.trackName}</p>
                <p className="text-xs text-white/50 truncate">{currentSong.artistName}</p>
              </div>
              <div className="flex items-end gap-0.5 h-4 text-green-400">
                <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
              </div>
            </div>

            <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3 px-2">Next Up</p>
            {state.queue.slice(state.currentIndex + 1, state.currentIndex + 15).map((song, i) => (
              <div key={`${song.id}-${i}`} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.05] transition-colors">
                <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
                  <Image src={getArtwork(song.artworkUrl100, 80)} alt={song.trackName} width={40} height={40} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{song.trackName}</p>
                  <p className="text-xs text-white/40 truncate">{song.artistName}</p>
                </div>
              </div>
            ))}
            {state.queue.length <= state.currentIndex + 1 && (
              <div className="flex flex-col items-center py-10 text-white/25">
                <ListMusic size={32} className="mb-2 opacity-30" />
                <p className="text-sm">Queue is empty</p>
              </div>
            )}
          </div>
        )}

        {/* ── Bottom mini controls (always visible) ─────── */}
        <div className="relative z-10 flex-shrink-0 pb-safe pb-6" />
      </div>
    </>
  );
}
