"use client";

import { usePlayer } from "@/lib/playerContext";
import { useEffect, useRef } from "react";
import { X, Mic2, Loader2 } from "lucide-react";

export default function LyricsPanel() {
  const { state, currentSong, toggleLyrics } = usePlayer();
  const activeRef     = useRef<HTMLParagraphElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const userScrolling = useRef(false);
  const scrollTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect user manual scroll to pause auto-scroll for 3s
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolling.current = true;
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => { userScrolling.current = false; }, 3000);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll active lyric into center of the lyrics panel only
  useEffect(() => {
    if (!activeRef.current || !containerRef.current || userScrolling.current) return;
    const container = containerRef.current;
    const el = activeRef.current;
    const containerTop    = container.getBoundingClientRect().top;
    const elTop           = el.getBoundingClientRect().top;
    const targetScrollTop = container.scrollTop + (elTop - containerTop) - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
  }, [state.currentLyricIndex]);

  if (!state.showLyrics) return null;

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-[#0d0d14] overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Mic2 size={15} className="text-green-400" />
          <span className="text-sm font-semibold text-white">Lyrics</span>
        </div>
        <button onClick={toggleLyrics} className="text-white/40 hover:text-white transition-colors p-1">
          <X size={15} />
        </button>
      </div>

      {currentSong && (
        <div className="px-5 mb-4 flex-shrink-0">
          <p className="text-xs text-white/40 mb-0.5 truncate">{currentSong.artistName}</p>
          <p className="font-bold text-white text-base truncate">{currentSong.trackName}</p>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-y-auto px-5 pb-24 space-y-3">
        {state.lyricsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
            <Loader2 size={24} className="animate-spin mb-3" />
            <p className="text-sm">Loading lyrics…</p>
          </div>
        ) : state.lyrics.length > 0 ? (
          state.lyrics.map((line, i) => {
            const isActive = i === state.currentLyricIndex;
            const isPast = i < state.currentLyricIndex;
            return (
              <p
                key={i}
                ref={isActive ? activeRef : null}
                className={`lyric-line leading-snug select-none cursor-default ${
                  isActive ? "text-white font-bold text-lg" : isPast ? "text-white/30 text-sm" : "text-white/50 text-sm"
                }`}
              >
                {line.text}
              </p>
            );
          })
        ) : state.plainLyrics ? (
          <div className="text-white/60 text-sm leading-relaxed whitespace-pre-line">
            {state.plainLyrics}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
            <Mic2 size={32} className="mb-3 opacity-30" />
            <p className="text-sm text-center">
              {currentSong ? "No lyrics found for this song" : "Play a song to see lyrics"}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
