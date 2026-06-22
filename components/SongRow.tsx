"use client";

import { Track, getArtwork, formatTrackTime } from "@/lib/track";
import { usePlayer } from "@/lib/playerContext";
import { usePlaylists } from "@/lib/playlistContext";
import { Play, Pause, MoreHorizontal, Heart, ListPlus, ListEnd, PlusCircle } from "lucide-react";import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import AddToPlaylistModal from "./AddToPlaylistModal";

interface SongRowProps {
  song: Track;
  index?: number;
  queue?: Track[];
  showAlbum?: boolean;
  showArtwork?: boolean;
}

export default function SongRow({ song, index, queue, showAlbum = false, showArtwork = true }: SongRowProps) {
  const { state, currentSong, playSong, playQueue, togglePlay, addToQueue } = usePlayer();
  const { toggleLiked, isLiked } = usePlaylists();
  const [showMenu, setShowMenu] = useState(false);
  const [showAddPl, setShowAddPl] = useState(false);
  const [menuPos, setMenuPos]   = useState({ x: 0, y: 0 });
  const [added, setAdded]       = useState(false);    // +  button animation
  const menuRef   = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isActive  = currentSong?.id === song.id;
  const liked     = isLiked(song.id, song.trackName, song.artistName);

  const handlePlay = () => {
    if (isActive) { togglePlay(); return; }
    if (queue) {
      const idx = queue.findIndex(s => s.id === song.id);
      playQueue(queue, idx >= 0 ? idx : 0);
    } else {
      playSong(song);
    }
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLiked(song);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({ x: rect.right, y: rect.top });
    setShowMenu(s => !s);
  };

  useEffect(() => {
    if (!showMenu) return;
    const fn = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [showMenu]);

  // Portal dropdown
  const dropdownMenu = showMenu && typeof document !== "undefined" ? createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] w-52 rounded-xl overflow-hidden shadow-2xl"
      style={{
        background: "rgba(30,30,40,0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        right: `calc(100vw - ${menuPos.x}px)`,
        // Smart positioning: if button is in bottom half of screen, open upward
        ...(menuPos.y > window.innerHeight * 0.6
          ? { bottom: `calc(100vh - ${menuPos.y}px)` }
          : { top: menuPos.y + 8 }),
      }}
    >
      <button onClick={() => { setShowAddPl(true); setShowMenu(false); }}
        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/[0.07] transition-colors">
        <ListPlus size={14} /> Add to playlist
      </button>
      <button onClick={() => { addToQueue(song); setShowMenu(false); }}
        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/[0.07] transition-colors">
        <ListEnd size={14} /> Add to queue
      </button>
      <button onClick={() => { toggleLiked(song); setShowMenu(false); }}
        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/[0.07] transition-colors">
        <Heart size={14} fill={liked ? "currentColor" : "none"} className={liked ? "text-green-400" : ""} />
        {liked ? "Unlike" : "Like song"}
      </button>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {showAddPl && <AddToPlaylistModal track={song} onClose={() => setShowAddPl(false)} />}
      {dropdownMenu}

      <div
        className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer ${
          isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
        }`}
        onClick={handlePlay}
      >
        {/* Index / eq */}
        <div className="w-6 flex-shrink-0 flex items-center justify-center">
          {isActive && state.isPlaying ? (
            <div className="flex items-end gap-0.5 h-3.5 text-green-400">
              <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
            </div>
          ) : (
            <>
              <span className={`text-xs tabular-nums group-hover:hidden ${isActive ? "text-green-400 hidden" : "text-white/40"}`}>
                {index !== undefined ? index + 1 : ""}
              </span>
              <span className="hidden group-hover:flex text-white">
                {isActive && !state.isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
              </span>
            </>
          )}
        </div>

        {/* Artwork */}
        {showArtwork && (
          <div className="hidden sm:block w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
            {song.artworkUrl100 && (
              <Image
                src={getArtwork(song.artworkUrl100, 80)}
                alt={song.trackName}
                width={36} height={36}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>
        )}

        {/* Title + artist */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {/* Song title → album page */}
            <Link
              href={`/album/${song.collectionId}`}
              onClick={e => e.stopPropagation()}
              className={`text-sm font-medium truncate hover:underline ${isActive ? "text-green-400" : "text-white"}`}
            >
              {song.trackName}
            </Link>
            {song.explicit && (
              <span className="text-[9px] bg-white/20 text-white/60 px-1 py-0.5 rounded flex-shrink-0">E</span>
            )}
          </div>
          <Link
            href={`/artist/${encodeURIComponent(song.artistName)}`}
            onClick={e => e.stopPropagation()}
            className="text-xs text-white/40 hover:text-white hover:underline truncate block transition-colors"
          >
            {song.artistName}
          </Link>
        </div>

        {/* Album name */}
        {showAlbum && (
          <Link
            href={`/album/${song.collectionId}`}
            onClick={e => e.stopPropagation()}
            className="hidden lg:block text-xs text-white/40 hover:text-white hover:underline truncate w-36 transition-colors"
          >
            {song.collectionName}
          </Link>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>

          {/* + Like button */}
          <button
            onClick={handleAdd}
            className={`p-2 rounded-full transition-all ${
              liked || added
                ? "text-green-400 scale-110"
                : "text-white/50 sm:text-white/0 sm:group-hover:text-white/60 hover:text-white"
            }`}
            title={liked ? "Unlike" : "Like"}
          >
            {liked
              ? <Heart size={17} fill="currentColor" />
              : <PlusCircle size={17} />}
          </button>

          {/* 3-dot — visible on mobile, appears on hover on desktop */}
          <button
            ref={buttonRef}
            onClick={openMenu}
            className="p-2 text-white/50 sm:text-white/0 sm:group-hover:text-white/60 hover:text-white transition-colors rounded-full"
            title="More options"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        {/* Duration */}
        <span className="text-xs text-white/40 tabular-nums flex-shrink-0 w-9 text-right">
          {formatTrackTime(song.trackTimeMillis)}
        </span>
      </div>
    </>
  );
}
