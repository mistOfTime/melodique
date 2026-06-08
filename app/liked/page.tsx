"use client";

import { usePlaylists } from "@/lib/playlistContext";
import { usePlayer } from "@/lib/playerContext";
import SongRow from "@/components/SongRow";
import { Heart, Play, Shuffle } from "lucide-react";

export default function LikedPage() {
  const { state } = usePlaylists();
  const { playQueue } = usePlayer();
  const liked = state.likedTracks;

  return (
    <div className="min-h-full bg-[#0a0a0f] px-4 sm:px-8 pt-6 pb-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-400 flex items-center justify-center shadow-lg">
          <Heart size={28} className="text-white" fill="white" />
        </div>
        <div>
          <h1 className="font-bold text-2xl sm:text-3xl text-white">Liked Songs</h1>
          <p className="text-white/40 text-sm">{liked.length} songs</p>
        </div>
      </div>

      {liked.length > 0 && (
        <div className="flex gap-3 my-5">
          <button onClick={() => playQueue(liked, 0)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500 text-black font-bold text-sm hover:scale-105 transition-transform">
            <Play size={14} fill="black" /> Play
          </button>
          <button onClick={() => playQueue([...liked].sort(() => Math.random() - 0.5), 0)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white font-semibold text-sm hover:bg-white/20">
            <Shuffle size={14} /> Shuffle
          </button>
        </div>
      )}

      {liked.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-white/30">
          <Heart size={56} className="mb-4 opacity-20" />
          <p className="text-lg font-semibold mb-1">No liked songs yet</p>
          <p className="text-sm">Hit the heart on any song to save it here</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] overflow-hidden">
          {liked.map((t, i) => (
            <SongRow key={t.id} song={t} index={i} queue={liked} showAlbum />
          ))}
        </div>
      )}
    </div>
  );
}
