"use client";

import { usePlaylists } from "@/lib/playlistContext";
import { usePlayer } from "@/lib/playerContext";
import SongRow from "@/components/SongRow";
import { PlaylistCoverGrid } from "@/components/PlaylistCoverGrid";
import { Heart, Play, Shuffle } from "lucide-react";

export default function LikedPage() {
  const { state } = usePlaylists();
  const { playQueue } = usePlayer();
  const liked = state.likedTracks;

  // Build a fake "playlist" object so PlaylistCoverGrid can render the mosaic
  const likedPlaylist = { tracks: liked, cover: undefined };

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-8 animate-fade-in">

      {/* ── Hero header ──────────────────────────────── */}
      <div className="relative px-4 sm:px-8 pt-6 pb-6 overflow-hidden">
        {/* Background blur from first track art */}
        {liked.length > 0 && (
          <>
            <div className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `url(${liked[0].artworkUrl100.replace("100x100", "400x400")})`,
                backgroundSize: "cover", backgroundPosition: "center", filter: "blur(80px)"
              }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0a0f]" />
          </>
        )}

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6">
          {/* Cover — mosaic if 4+ tracks, gradient heart otherwise */}
          <div className="w-40 h-40 sm:w-52 sm:h-52 rounded-xl overflow-hidden flex-shrink-0 shadow-2xl">
            {liked.length >= 4 ? (
              <PlaylistCoverGrid playlist={likedPlaylist} size={208} />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-600 via-purple-500 to-blue-400 flex items-center justify-center">
                <Heart size={64} className="text-white" fill="white" />
              </div>
            )}
          </div>

          <div className="text-center sm:text-left">
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1 font-semibold">Playlist</p>
            <h1 className="font-bold text-2xl sm:text-4xl text-white mb-2 leading-tight">Liked Songs</h1>
            <p className="text-xs sm:text-sm text-white/40 mb-4">{liked.length} songs</p>

            {liked.length > 0 && (
              <div className="flex gap-3 justify-center sm:justify-start">
                <button onClick={() => playQueue(liked, 0)}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-green-500 text-black font-bold text-sm hover:scale-105 transition-transform shadow-lg">
                  <Play size={15} fill="black" /> Play
                </button>
                <button onClick={() => playQueue([...liked].sort(() => Math.random() - 0.5), 0)}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors">
                  <Shuffle size={15} /> Shuffle
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Track list ───────────────────────────────── */}
      <div className="px-4 sm:px-8">
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
    </div>
  );
}
