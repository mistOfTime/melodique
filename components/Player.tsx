"use client";

import { usePlayer } from "@/lib/playerContext";
import { formatTrackTime } from "@/lib/track";
import {
  Play, Pause, SkipBack, SkipForward,
  Shuffle, Repeat, Repeat1, Volume2, VolumeX,
  Mic2, Heart, Loader2, PlusCircle,
} from "lucide-react";
import Image from "next/image";
import { useRef, useCallback, useState } from "react";
import NowPlayingModal from "./NowPlayingModal";
import { usePlaylists } from "@/lib/playlistContext";

export default function Player() {
  const { state, currentSong, togglePlay, next, prev, setVolume, seek, toggleShuffle, cycleRepeat, toggleLyrics, addToQueue } = usePlayer();
  const { toggleLiked, isLiked } = usePlaylists();
  const [showModal, setShowModal] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  }, [seek]);

  const liked      = currentSong ? isLiked(currentSong.id) : false;
  const toggleLike = () => { if (currentSong) toggleLiked(currentSong); };

  const handleAddToQueue = () => {
    if (!currentSong) return;
    toggleLiked(currentSong);
    setAddedToQueue(true);
    setTimeout(() => setAddedToQueue(false), 1200);
  };

  const currentTime = state.progress * state.duration;
  const isLoading   = state.ytStatus === "loading";

  return (
    <footer className="border-t border-white/[0.06] bg-[#181818] flex-shrink-0">
      {/* Progress bar */}
      <div ref={barRef} onClick={handleSeek} className="w-full h-1 bg-white/10 cursor-pointer group relative">
        <div className="h-full bg-white/80 transition-all" style={{ width: `${state.progress * 100}%` }} />
      </div>

      {/* Modal */}
      {showModal && <NowPlayingModal onClose={() => setShowModal(false)} />}

      {/* ── Mobile player (compact) ───────────────────── */}
      <div className="flex md:hidden items-center gap-2 px-3 py-3">
        {currentSong ? (
          <>
            {/* Clickable song info opens modal */}
            <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setShowModal(true)}>
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
                <Image src={currentSong.artworkUrl100.replace("100x100", "200x200")}
                  alt={currentSong.trackName} width={40} height={40} className="w-full h-full object-cover" />
                {isLoading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 size={12} className="animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{currentSong.trackName}</p>
                <p className="text-xs text-white/40 truncate">{currentSong.artistName}</p>
              </div>
            </div>

            {/* + Like button mobile */}
            <button onClick={handleAddToQueue}
              className={`p-2 flex-shrink-0 transition-all ${liked || addedToQueue ? "text-green-400 scale-110" : "text-white/50"}`}
              title={liked ? "Unlike" : "Like song"}>
              {liked ? <Heart size={20} fill="currentColor" /> : <PlusCircle size={20} strokeWidth={1.5} />}
            </button>

            <button onClick={prev} className="p-1 text-white/70 flex-shrink-0">
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button onClick={togglePlay} className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-black flex-shrink-0">
              {isLoading
                ? <Loader2 size={14} className="animate-spin text-black" />
                : state.isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <button onClick={next} className="p-1 text-white/70 flex-shrink-0">
              <SkipForward size={20} fill="currentColor" />
            </button>
          </>
        ) : (
          <p className="text-white/30 text-sm px-2">Nothing playing</p>
        )}
      </div>

      {/* ── Desktop player (full) ──────────────────────── */}
      <div className="hidden md:flex items-center px-4 h-[72px] gap-4">

        {/* Left — song info */}
        <div className="flex items-center gap-3 w-72 min-w-0 flex-shrink-0">
          {currentSong ? (
            <>
              <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer group" onClick={() => setShowModal(true)}>
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-lg relative">
                  <Image src={currentSong.artworkUrl100.replace("100x100", "200x200")}
                    alt={currentSong.trackName} width={48} height={48}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  {isLoading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 size={12} className="animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate group-hover:text-green-400 transition-colors">{currentSong.trackName}</p>
                  <p className="text-xs text-white/50 truncate">{currentSong.artistName}</p>
                </div>
              </div>

              {/* + Like button — shows heart when liked */}
              <button onClick={handleAddToQueue}
                className={`flex-shrink-0 p-1.5 transition-all rounded-full ${
                  liked || addedToQueue ? "text-green-400 scale-110" : "text-white/30 hover:text-white"
                }`}
                title={liked ? "Unlike" : "Like song"}>
                {liked ? <Heart size={18} fill="currentColor" /> : <PlusCircle size={18} strokeWidth={1.5} />}
              </button>
            </>
          ) : (
            <p className="text-white/30 text-sm">Nothing playing</p>
          )}
        </div>

        {/* Center controls */}
        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-5">
            <button onClick={toggleShuffle} className={`p-1 transition-colors ${state.shuffle ? "text-green-400" : "text-white/40 hover:text-white"}`}>
              <Shuffle size={16} />
            </button>
            <button onClick={prev} className="text-white/70 hover:text-white transition-colors">
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button onClick={togglePlay} disabled={isLoading}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black hover:scale-105 transition-transform disabled:opacity-50 shadow">
              {isLoading
                ? <Loader2 size={14} className="animate-spin text-black" />
                : state.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button onClick={next} className="text-white/70 hover:text-white transition-colors">
              <SkipForward size={20} fill="currentColor" />
            </button>
            <button onClick={cycleRepeat} className={`p-1 transition-colors ${state.repeat !== "none" ? "text-green-400" : "text-white/40 hover:text-white"}`}>
              {state.repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          {/* Seek bar with time */}
          <div className="flex items-center gap-2 w-full max-w-sm">
            <span className="text-[10px] text-white/35 tabular-nums w-8 text-right flex-shrink-0">
              {formatTrackTime(Math.floor(currentTime * 1000))}
            </span>
            <div className="flex-1 h-1 bg-white/15 rounded-full cursor-pointer group relative" onClick={handleSeek}>
              <div className="h-full rounded-full bg-white/70 group-hover:bg-green-400 transition-colors" style={{ width: `${state.progress * 100}%` }} />
            </div>
            <span className="text-[10px] text-white/35 tabular-nums w-8 flex-shrink-0">
              {state.duration > 0
                ? formatTrackTime(Math.floor(state.duration * 1000))
                : currentSong ? formatTrackTime(currentSong.trackTimeMillis) : "0:00"}
            </span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 w-56 justify-end flex-shrink-0">
          <button onClick={toggleLyrics}
            className={`p-1.5 rounded transition-colors ${state.showLyrics ? "text-green-400" : "text-white/40 hover:text-white"}`}>
            <Mic2 size={16} />
          </button>
          <button onClick={() => setVolume(state.volume === 0 ? 0.7 : 0)} className="text-white/40 hover:text-white transition-colors">
            {state.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div className="w-24">
            <input type="range" min={0} max={1} step={0.01} value={state.volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ background: `linear-gradient(to right,#1db954 ${state.volume * 100}%,#3a3a4a ${state.volume * 100}%)` }} />
          </div>
        </div>
      </div>

      {state.ytStatus === "error" && (
        <p className="text-center text-[10px] text-yellow-500/60 pb-1">
          Could not load audio — try next song
        </p>
      )}
    </footer>
  );
}
