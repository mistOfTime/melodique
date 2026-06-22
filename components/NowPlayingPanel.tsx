"use client";

import { usePlayer } from "@/lib/playerContext";
import { useEffect, useRef, useState, useCallback } from "react";
import { X, Mic2, Loader2, ExternalLink, Music2 } from "lucide-react";
import Image from "next/image";
import { getArtwork, formatTrackTime } from "@/lib/track";
import Link from "next/link";

export default function NowPlayingPanel() {
  const { state, currentSong, toggleLyrics } = usePlayer();
  const containerRef    = useRef<HTMLDivElement>(null);
  const listRef         = useRef<HTMLDivElement>(null);
  const lineRefs        = useRef<(HTMLParagraphElement | null)[]>([]);
  const userScrollingRef = useRef(false);
  const resumeTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  // translateY offset to slide the tape up/down
  const [translateY, setTranslateY] = useState(0);
  // manual scroll offset when user drags
  const [manualOffset, setManualOffset] = useState(0);
  const dragStart = useRef<{ y: number; offset: number } | null>(null);

  // Compute the translate needed to center the active line
  const recenter = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeLine = lineRefs.current[state.currentLyricIndex];
    if (!activeLine || !listRef.current) return;
    // offsetTop of line relative to list
    const lineTop    = activeLine.offsetTop;
    const lineHeight = activeLine.offsetHeight;
    const center     = container.clientHeight / 2;
    setTranslateY(center - lineTop - lineHeight / 2);
    setManualOffset(0);
    userScrollingRef.current = false;
  }, [state.currentLyricIndex]);

  // Auto-advance tape when lyric index changes
  useEffect(() => {
    if (userScrollingRef.current) return;
    recenter();
  }, [state.currentLyricIndex, recenter]);

  // Recenter when lyrics first load
  useEffect(() => {
    if (state.lyrics.length > 0) {
      setTimeout(recenter, 50);
    }
  }, [state.lyrics, recenter]);

  // Wheel scroll — shift tape manually
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userScrollingRef.current = true;
      setManualOffset(prev => prev + e.deltaY * -1);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        userScrollingRef.current = false;
        recenter();
      }, 4000);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [recenter]);

  // Touch drag scroll
  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = { y: e.touches[0].clientY, offset: manualOffset };
    userScrollingRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragStart.current) return;
    const dy = e.touches[0].clientY - dragStart.current.y;
    setManualOffset(dragStart.current.offset + dy);
  };
  const onTouchEnd = () => {
    dragStart.current = null;
    resumeTimer.current = setTimeout(() => {
      userScrollingRef.current = false;
      recenter();
    }, 4000);
  };

  if (!currentSong) return null;

  const totalY = translateY + manualOffset;

  return (
    <aside className="h-full flex flex-col bg-[#0d0d14] overflow-hidden animate-fade-in"
      style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <span className="text-sm font-semibold text-white">Now Playing</span>
        <button onClick={toggleLyrics}
          className="text-white/40 hover:text-white transition-colors p-1" title="Close">
          <X size={15} />
        </button>
      </div>

      {/* ── Album art ────────────────────────────────────── */}
      <div className="px-4 mb-3 flex-shrink-0">
        <div className="w-full aspect-square rounded-xl overflow-hidden shadow-xl">
          <Image src={getArtwork(currentSong.artworkUrl100, 600)} alt={currentSong.trackName}
            width={320} height={320}
            className={`w-full h-full object-cover transition-all duration-700 ${state.isPlaying ? "scale-[1.04]" : "scale-100"}`} />
        </div>
      </div>

      {/* ── Song info ────────────────────────────────────── */}
      <div className="px-4 mb-3 flex-shrink-0">
        <p className="font-bold text-white text-base leading-tight truncate">{currentSong.trackName}</p>
        <Link href={`/artist/${encodeURIComponent(currentSong.artistName)}`}
          className="text-sm text-white/50 hover:text-white transition-colors truncate block mt-0.5">
          {currentSong.artistName}
        </Link>
        <Link href={`/album/${currentSong.collectionId}`}
          className="text-xs text-white/30 hover:text-white/60 transition-colors truncate block mt-0.5">
          {currentSong.collectionName}
        </Link>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {currentSong.primaryGenreName && (
            <span className="text-[10px] text-white/30 bg-white/[0.05] px-2 py-0.5 rounded-full truncate max-w-[120px]">
              {currentSong.primaryGenreName}
            </span>
          )}
          <span className="text-[10px] text-white/30">{formatTrackTime(currentSong.trackTimeMillis)}</span>
          <a href={`https://music.apple.com/album/${currentSong.collectionId}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-white/20 hover:text-green-400 flex items-center gap-0.5 transition-colors">
            <ExternalLink size={9} /> Apple Music
          </a>
        </div>
      </div>

      {/* ── Lyrics toggle ────────────────────────────────── */}
      <div className="px-4 mb-2 flex-shrink-0">
        <button onClick={toggleLyrics}
          className={`w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            state.showLyrics
              ? "bg-green-500/15 text-green-400 border border-green-500/25"
              : "bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08]"
          }`}>
          <Mic2 size={12} />
          {state.showLyrics ? "Hide Lyrics" : "Show Lyrics"}
        </button>
      </div>

      {/* ── Lyrics ───────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative overflow-hidden" ref={containerRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

        {/* Top fade */}
        <div className="absolute top-0 left-0 right-0 h-12 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, #0d0d14 0%, transparent 100%)" }} />

        {/* The lyrics tape — translates as one unit */}
        {state.lyricsLoading ? (
          <div className="flex flex-col items-center py-12 text-white/30">
            <Loader2 size={18} className="animate-spin mb-2" />
            <p className="text-xs">Finding lyrics…</p>
          </div>
        ) : state.lyrics.length > 0 ? (
          <div
            ref={listRef}
            style={{
              transform: `translateY(${totalY}px)`,
              transition: userScrollingRef.current ? "none" : "transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              willChange: "transform",
              paddingLeft: "1rem",
              paddingRight: "1rem",
            }}
          >
            {state.lyrics.map((line, i) => {
              const isActive   = i === state.currentLyricIndex;
              const isPast     = i < state.currentLyricIndex;
              const isComing   = i === state.currentLyricIndex + 1;
              const isUpcoming = i > state.currentLyricIndex + 1;
              return (
                <p
                  key={i}
                  ref={el => { lineRefs.current[i] = el; }}
                  className="select-none cursor-default w-full break-words"
                  style={{
                    fontSize:      isActive ? "1.18rem" : isPast ? "0.82rem" : "0.88rem",
                    fontWeight:    isActive ? 800 : isPast ? 400 : 500,
                    lineHeight:    isActive ? "1.65" : "1.45",
                    paddingTop:    isActive ? "10px" : isComing ? "5px" : "3px",
                    paddingBottom: isActive ? "10px" : "3px",
                    color: isActive   ? "#ffffff"
                         : isComing   ? "rgba(255,255,255,0.65)"
                         : isUpcoming ? "rgba(255,255,255,0.32)"
                         : isPast     ? "rgba(255,255,255,0.16)"
                                      : "rgba(255,255,255,0.32)",
                    transition:    "font-size 0.45s ease, font-weight 0.45s ease, color 0.45s ease, padding 0.45s ease",
                    wordBreak:     "break-word",
                    overflowWrap:  "break-word",
                    textShadow:    isActive ? "0 0 24px rgba(255,255,255,0.18)" : "none",
                  }}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        ) : state.plainLyrics ? (
          <div className="px-4 py-4 overflow-y-auto h-full">
            <p className="text-white/55 text-sm leading-relaxed whitespace-pre-line break-words">
              {state.plainLyrics}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-12 text-white/30 px-4">
            <Music2 size={28} className="mb-3 opacity-20" />
            <p className="text-sm font-semibold text-center text-white/40">Lyrics unavailable</p>
            <p className="text-xs text-white/20 text-center mt-1.5 leading-relaxed">
              Lyrics for this song are not available in our database yet.
            </p>
          </div>
        )}

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10"
          style={{ background: "linear-gradient(to top, #0d0d14 0%, transparent 100%)" }} />
      </div>
    </aside>
  );
}
