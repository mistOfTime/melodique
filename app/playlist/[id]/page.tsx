"use client";

import { usePlaylists } from "@/lib/playlistContext";
import { usePlayer } from "@/lib/playerContext";
import SongRow from "@/components/SongRow";
import { PlaylistCoverGrid } from "@/components/PlaylistCoverGrid";
import {
  Play, Shuffle, ArrowLeft, Music2, Camera,
} from "lucide-react";
import { formatTrackTime } from "@/lib/track";
import { useRouter } from "next/navigation";
import { useRef } from "react";

export default function PlaylistPage({ params }: { params: { id: string } }) {
  const { id }    = params;
  const router    = useRouter();
  const { state, updatePlaylistCover } = usePlaylists();
  const { playQueue } = usePlayer();

  const coverInputRef = useRef<HTMLInputElement>(null);
  const playlist = state.playlists.find(p => p.id === id);

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updatePlaylistCover(id, reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (!playlist) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-white/30">
        <Music2 size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-semibold text-white mb-2">Playlist not found</p>
        <button onClick={() => router.back()} className="text-sm text-white/40 hover:text-white transition-colors flex items-center gap-1.5">
          <ArrowLeft size={14} /> Go back
        </button>
      </div>
    );
  }

  const tracks = playlist.tracks;
  const totalMs = tracks.reduce((a, t) => a + (t.trackTimeMillis || 0), 0);
  const totalMin = Math.floor(totalMs / 60000);

  return (
    <div className="min-h-full bg-[#121212] pb-8 animate-fade-in">

      {/* Hero */}
      <div className="relative px-4 sm:px-8 pt-5 pb-6 overflow-hidden">
        {/* Background blur from cover */}
        {playlist.cover && (
          <>
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: `url(${playlist.cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(80px)" }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#121212]" />
          </>
        )}

        <button onClick={() => router.back()}
          className="relative z-10 inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-5 transition-colors">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6">
          {/* Cover — click to change */}
          <div
            className="relative w-40 h-40 sm:w-52 sm:h-52 rounded-xl overflow-hidden flex-shrink-0 bg-white/10 cursor-pointer group shadow-2xl"
            onClick={() => coverInputRef.current?.click()}
          >
            <PlaylistCoverGrid playlist={playlist} size={208} />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1.5 transition-opacity rounded-xl">
              <Camera size={28} className="text-white" />
              <span className="text-xs text-white font-medium">Change cover</span>
            </div>
          </div>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />

          <div className="text-center sm:text-left">
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1 font-semibold">Playlist</p>
            <h1 className="font-bold text-2xl sm:text-4xl text-white mb-2 leading-tight">{playlist.name}</h1>
            <p className="text-xs sm:text-sm text-white/40 mb-4">
              {tracks.length} songs
              {totalMin > 0 && ` · about ${totalMin} min`}
            </p>

            {tracks.length > 0 ? (
              <div className="flex gap-3 justify-center sm:justify-start">
                <button onClick={() => playQueue(tracks, 0)}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-green-500 text-black font-bold text-sm hover:scale-105 transition-transform shadow-lg">
                  <Play size={15} fill="black" /> Play
                </button>
                <button onClick={() => playQueue([...tracks].sort(() => Math.random()-0.5), 0)}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors">
                  <Shuffle size={15} /> Shuffle
                </button>
              </div>
            ) : (
              <p className="text-sm text-white/30 italic">No songs yet — add songs using the + button on any track</p>
            )}
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="px-4 sm:px-8">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/25 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <Music2 size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-semibold mb-1">This playlist is empty</p>
            <p className="text-xs text-center px-6">Search for songs and use the ··· menu → &quot;Add to playlist&quot; to add them here</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden bg-white/[0.02]">
            {tracks.map((t, i) => (
              <SongRow key={t.id} song={t} index={i} queue={tracks} showArtwork showAlbum />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
