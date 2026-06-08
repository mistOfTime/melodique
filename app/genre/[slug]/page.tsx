"use client";

import { useEffect, useState } from "react";
import { Track, apiToTrack, getArtwork, dedupeAlbums } from "@/lib/track";
import SongRow from "@/components/SongRow";
import { usePlayer } from "@/lib/playerContext";
import { Play, Shuffle, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const SLUG_MAP: Record<string, { label: string; q: string }> = {
  pop:        { label: "Pop",        q: "pop hits 2025" },
  hiphop:     { label: "Hip-Hop",    q: "hip hop rap 2025" },
  rnb:        { label: "R&B",        q: "rnb soul 2025" },
  rock:       { label: "Rock",       q: "rock alternative 2025" },
  electronic: { label: "Electronic", q: "electronic dance edm 2025" },
  latin:      { label: "Latin",      q: "latin reggaeton 2025" },
  kpop:       { label: "K-Pop",      q: "kpop 2025" },
  indie:      { label: "Indie",      q: "indie folk 2025" },
  drill:      { label: "Drill",      q: "drill trap uk drill 2025" },
  rage:       { label: "Rage",       q: "rage phonk bladee yung lean 2024 2025" },
};

interface AlbumItem { collectionId: string; title: string; artist: string; cover: string; year: string; }

function getAlbums(tracks: Track[]): AlbumItem[] {
  const seen = new Map<string, AlbumItem>();
  for (const t of tracks) {
    if (!seen.has(t.collectionId)) {
      seen.set(t.collectionId, { collectionId: t.collectionId, title: t.collectionName, artist: t.artistName, cover: t.artworkUrl100, year: t.releaseDate?.slice(0,4) ?? "" });
    }
  }
  return dedupeAlbums(Array.from(seen.values()));
}

export default function GenrePage({ params }: { params: { slug: string } }) {
  const info  = SLUG_MAP[params.slug] ?? { label: params.slug, q: params.slug };
  const [tracks, setTracks]   = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const { playQueue }         = usePlayer();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/music/search?q=${encodeURIComponent(info.q)}&limit=50`)
      .then(r => r.json())
      .then(d => setTracks((d.results ?? []).map(apiToTrack)))
      .finally(() => setLoading(false));
  }, [info.q]);

  const albums = getAlbums(tracks);

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-4 animate-fade-in">
      <div className="px-4 sm:px-8 pt-6 pb-6 bg-gradient-to-b from-green-900/30 to-transparent">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Genre</p>
        <h1 className="font-bold text-3xl sm:text-5xl text-white mb-4">{info.label}</h1>
        <div className="flex gap-3">
          <button onClick={() => playQueue(tracks, 0)} disabled={!tracks.length}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500 text-black font-bold text-sm hover:scale-105 disabled:opacity-40">
            <Play size={14} fill="black" /> Play All
          </button>
          <button onClick={() => playQueue([...tracks].sort(() => Math.random()-0.5), 0)} disabled={!tracks.length}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white font-semibold text-sm hover:bg-white/20 disabled:opacity-40">
            <Shuffle size={14} /> Shuffle
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/40"><Loader2 size={28} className="animate-spin" /></div>
        ) : (
          <>
            {albums.length > 0 && (
              <section>
                <h2 className="font-bold text-lg text-white mb-4">Albums</h2>
                <div className="flex gap-4 overflow-x-auto pb-3 hide-scrollbar">
                  {albums.slice(0, 12).map(a => (
                    <Link key={a.collectionId} href={`/album/${a.collectionId}`} className="flex-shrink-0 w-36 sm:w-44 group">
                      <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-xl overflow-hidden mb-2 bg-white/10 group-hover:scale-[1.03] transition-transform">
                        {a.cover
                          ? <Image src={getArtwork(a.cover, 300)} alt={a.title} width={176} height={176} className="w-full h-full object-cover" />
                          : <div className="w-full h-full" />}
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-white truncate">{a.title}</p>
                      <p className="text-xs text-white/40 mt-0.5">{a.year} · {a.artist}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="font-bold text-lg text-white mb-3">Tracks</h2>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] overflow-hidden">
                {tracks.map((t, i) => <SongRow key={t.id} song={t} index={i} queue={tracks} showAlbum />)}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
