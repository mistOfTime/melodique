"use client";

import { usePlayer } from "@/lib/playerContext";
import { useEffect, useRef, useState } from "react";
import { X, Mic2, Loader2, ExternalLink, Music2 } from "lucide-react";
import Image from "next/image";
import { getArtwork, formatTrackTime } from "@/lib/track";
import Link from "next/link";

export default function NowPlayingPanel() {
  const { state, currentSong, toggleLyrics } = usePlayer();
  const activeRef       = useRef<HTMLParagraphElement>(null);
  const scrollRef       = useRef<HTMLDivElement>(null);
  const userScrolling   = useRef(false);
  const resumeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [atBottom, setAtBottom] = useState(false);

  // Detect manual scroll — pause auto-scroll for 4s
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolling.current = true;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => { userScrolling.current = false; }, 4000);
      // Check if at bottom
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      setAtBottom(near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll active lyric into center — only when user isn't scrolling
  useEffect(() => {
    if (!activeRef.current || !scrollRef.current || userScrolling.current) return;
    const container = scrollRef.current;
    const el = activeRef.current;
    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [state.currentLyricIndex]);

  if (!currentSong) return null;

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col bg-[#0d0d14] overflow-hidden animate-fade-in"
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
      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {/* Top fade */}
        <div className="absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none bg-gradient-to-b from-[#0d0d14] to-transparent" />

        {/* Scrollable container — no overflow-hidden on parent, proper padding */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
        >
          <div className="px-4 pt-4 pb-32 space-y-0.5">
            {state.lyricsLoading ? (
              <div className="flex flex-col items-center py-12 text-white/30">
                <Loader2 size={18} className="animate-spin mb-2" />
                <p className="text-xs">Finding lyrics…</p>
              </div>
            ) : state.lyrics.length > 0 ? (
              state.lyrics.map((line, i) => {
                const isActive = i === state.currentLyricIndex;
                const isPast   = i < state.currentLyricIndex;
                const isComing = i === state.currentLyricIndex + 1;
                return (
                  <p
                    key={i}
                    ref={isActive ? activeRef : null}
                    className="select-none cursor-default w-full break-words"
                    style={{
                      fontSize:      isActive ? "1.05rem" : "0.85rem",
                      fontWeight:    isActive ? 700 : 400,
                      lineHeight:    isActive ? "1.55" : "1.45",
                      padding:       isActive ? "5px 0" : "2px 0",
                      color:         isActive  ? "#ffffff"
                                   : isPast    ? "rgba(255,255,255,0.18)"
                                   : isComing  ? "rgba(255,255,255,0.55)"
                                               : "rgba(255,255,255,0.32)",
                      // No transform — avoids clipping
                      transition:    "all 0.3s ease",
                      display:       "block",
                      wordBreak:     "break-word",
                      overflowWrap:  "break-word",
                    }}
                  >
                    {line.text}
                  </p>
                );
              })
            ) : state.plainLyrics ? (
              <p className="text-white/55 text-sm leading-relaxed whitespace-pre-line break-words">
                {state.plainLyrics}
              </p>
            ) : (
              <div className="flex flex-col items-center py-12 text-white/30">
                <Music2 size={22} className="mb-2 opacity-20" />
                <p className="text-xs text-center">No lyrics found</p>
                <p className="text-[10px] text-white/20 text-center mt-1 px-4">
                  Try searching for the song on lrclib.net
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom fade — pointer-events-none so it doesn't block scrolling */}
        <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-[#0d0d14] to-transparent" />

        {/* "Jump to current" button — shows when user has scrolled away */}
        {userScrolling.current && !atBottom && state.lyrics.length > 0 && (
          <button
            onClick={() => {
              userScrolling.current = false;
              if (activeRef.current && scrollRef.current) {
                const target = activeRef.current.offsetTop - scrollRef.current.clientHeight / 2;
                scrollRef.current.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
              }
            }}
            className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-all"
          >
            <Mic2 size={11} /> Back to lyrics
          </button>
        )}
      </div>
    </aside>
  );
}
