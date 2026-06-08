"use client";

import { albums, songs as allSongs, getSongById, getAlbumById } from "@/lib/data";
import { usePlayer } from "@/lib/playerContext";
import SongRow from "@/components/SongRow";
import { Play, Shuffle, ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use } from "react";

export default function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const album = getAlbumById(id);
  const { playQueue } = usePlayer();

  if (!album) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-mist-3">
        <p className="text-lg mb-4">Album not found</p>
        <Link href="/albums" className="text-violet-light hover:underline">
          ← Back to albums
        </Link>
      </div>
    );
  }

  const albumSongs = album.songs
    .map((id) => getSongById(id))
    .filter(Boolean) as typeof allSongs;

  const totalDuration = albumSongs.reduce((a, s) => a + s.duration, 0);
  const minutes = Math.floor(totalDuration / 60);

  return (
    <div className="min-h-full bg-ink pb-32 animate-fade-in">
      {/* Hero */}
      <div
        className="relative px-8 pt-8 pb-10 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${album.color}25 0%, transparent 80%)`,
        }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url(${album.cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px)",
          }}
        />

        <Link
          href="/albums"
          className="relative z-10 inline-flex items-center gap-2 text-mist-3 hover:text-mist transition-colors text-sm mb-6"
        >
          <ArrowLeft size={14} /> Albums
        </Link>

        <div className="relative z-10 flex items-end gap-8">
          <div
            className="w-52 h-52 rounded-3xl overflow-hidden shadow-2xl flex-shrink-0"
            style={{ boxShadow: `0 30px 60px ${album.color}50` }}
          >
            <Image
              src={album.cover}
              alt={album.title}
              width={208}
              height={208}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-mist-3 mb-2 font-semibold">
              Album
            </p>
            <h1 className="font-display text-5xl text-mist leading-tight mb-3">
              {album.title}
            </h1>
            <p className="text-mist-2 text-lg mb-1">{album.artist}</p>
            <p className="text-sm text-mist-3 mb-6">
              {album.year} · {album.genre} · {albumSongs.length} songs ·{" "}
              {minutes} min
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => playQueue(albumSongs, 0)}
                className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm text-ink transition-all hover:scale-105 active:scale-95"
                style={{ background: album.color }}
              >
                <Play size={16} fill="currentColor" />
                Play
              </button>
              <button
                onClick={() => {
                  const shuffled = [...albumSongs].sort(() => Math.random() - 0.5);
                  playQueue(shuffled, 0);
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm text-mist bg-ink-3 hover:bg-ink-2 transition-all"
              >
                <Shuffle size={16} />
                Shuffle
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="px-8 pt-6">
        <div className="rounded-2xl bg-ink-1 border border-ink-3 overflow-hidden p-2">
          {albumSongs.map((song, i) => (
            <SongRow
              key={song.id}
              song={song}
              index={i}
              queue={albumSongs}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
