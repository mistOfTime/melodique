"use client";

import { useEffect, useState } from "react";
import { Track, spotifyToTrack, getArtwork, formatTrackTime } from "@/lib/track";
import SongRow from "@/components/SongRow";
import { usePlayer } from "@/lib/playerContext";
import { usePlaylists } from "@/lib/playlistContext";
import {
  Play, Shuffle, ArrowLeft, Loader2, Music2,
  Heart, MoreHorizontal, Clock,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface AlbumMeta {
  name: string;
  artist: string;
  artistId: string;
  artistImage?: string;
  cover: string;
  year: string;
  total: number;
  type: string;
  label?: string;
  copyrights?: string;
  genres?: string[];
  popularity?: number;
  spotifyId?: string;
}

export default function AlbumPage({ params }: { params: { id: string } }) {
  const { id }       = params;
  const router       = useRouter();
  const searchParams = useSearchParams();
  const isSpotify    = id.startsWith("spotify-") || searchParams.get("source") === "spotify" || !/^\d+$/.test(id);
  const cleanId      = id.replace(/^spotify-/, "");

  const [tracks, setTracks]   = useState<Track[]>([]);
  const [meta, setMeta]       = useState<AlbumMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const { playQueue }         = usePlayer();
  const { saveAlbum, unsaveAlbum, isAlbumSaved } = usePlaylists();

  useEffect(() => {
    setLoading(true);
    setTracks([]);
    setMeta(null);

    if (isSpotify) {
      fetch(`/api/spotify/album?id=${cleanId}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) return;
          setMeta({
            name:       data.name,
            artist:     data.artists?.map((a: { name: string }) => a.name).join(", ") ?? "",
            artistId:   data.artists?.[0]?.id ?? "",
            cover:      data.images?.[0]?.url ?? "",
            year:       data.release_date?.slice(0, 4) ?? "",
            total:      data.total_tracks ?? 0,
            type:       data.album_type ?? "album",
            label:      data.label,
            copyrights: data.copyrights?.map((c: { text: string }) => c.text).join(" · "),
            genres:     data.genres ?? [],
            popularity: data.popularity,
            spotifyId:  cleanId,
          });
          const items = data.tracks?.items ?? [];
          setTracks(items.map((t: Record<string, unknown>) => spotifyToTrack({ ...t, album: data })));
        })
        .finally(() => setLoading(false));
    } else {
      fetch(`/api/lookup?id=${cleanId}&entity=song`)
        .then(r => r.json())
        .then(d => {
          const results = d.results ?? [];
          const info  = results.find((r: { wrapperType: string }) => r.wrapperType === "collection");
          const songs = results.filter((r: { wrapperType: string }) => r.wrapperType === "track");
          const first = info ?? songs[0];
          if (first) {
            setMeta({
              name:     first.collectionName ?? first.trackName,
              artist:   first.artistName,
              artistId: "",
              cover:    first.artworkUrl100 ?? "",
              year:     first.releaseDate?.slice(0, 4) ?? "",
              total:    songs.length,
              type:     "album",
              genres:   first.primaryGenreName ? [first.primaryGenreName] : [],
            });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setTracks(songs.sort((a: any, b: any) => (a.trackNumber||0)-(b.trackNumber||0)).map((t: any): Track => ({
            id:               String(t.trackId),
            trackId:          t.trackId,
            trackName:        t.trackName,
            artistName:       t.artistName,
            artistId:         "",
            collectionName:   t.collectionName,
            collectionId:     String(t.collectionId),
            artworkUrl100:    t.artworkUrl100 ?? "",
            previewUrl:       t.previewUrl ?? null,
            trackTimeMillis:  t.trackTimeMillis ?? 0,
            primaryGenreName: t.primaryGenreName ?? "",
            releaseDate:      t.releaseDate ?? "",
            trackNumber:      t.trackNumber ?? 0,
            explicit:         t.trackExplicitness === "explicit",
            source:           "itunes",
          })));
        })
        .finally(() => setLoading(false));
    }
  }, [id, isSpotify, cleanId]);

  const totalMs  = tracks.reduce((a, t) => a + (t.trackTimeMillis || 0), 0);
  const totalMin = Math.floor(totalMs / 60000);
  const totalSec = Math.floor((totalMs % 60000) / 1000);

  return (
    <div className="min-h-full bg-[#121212] pb-10 animate-fade-in">

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative px-4 sm:px-8 pt-5 pb-8 overflow-hidden">
        {meta?.cover && (
          <>
            <div className="absolute inset-0"
              style={{ backgroundImage: `url(${meta.cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(80px) brightness(0.35)" }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#121212]" />
          </>
        )}

        <button onClick={() => router.back()}
          className="relative z-10 inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-5 transition-colors">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-7">
          {/* Cover */}
          <div className="w-44 h-44 sm:w-56 sm:h-56 rounded-lg overflow-hidden shadow-2xl flex-shrink-0">
            {meta?.cover
              ? <Image src={getArtwork(meta.cover, 600)} alt={meta.name} width={224} height={224} className="w-full h-full object-cover" priority />
              : <div className="w-full h-full bg-white/10 flex items-center justify-center"><Music2 size={40} className="text-white/20" /></div>}
          </div>

          {/* Info */}
          <div className="text-center sm:text-left flex-1 min-w-0">
            {loading && !meta ? (
              <Loader2 size={24} className="animate-spin text-white/40 mx-auto sm:mx-0" />
            ) : meta ? (
              <>
                <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-2 capitalize">{meta.type}</p>
                <h1 className="font-black text-3xl sm:text-5xl text-white mb-3 leading-tight">{meta.name}</h1>

                {/* Artist row */}
                <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                  {meta.artistImage && (
                    <Image src={meta.artistImage} alt={meta.artist} width={24} height={24}
                      className="w-6 h-6 rounded-full object-cover" />
                  )}
                  {meta.artistId
                    ? <Link href={`/artist/${encodeURIComponent(meta.artist)}`}
                        className="text-white font-semibold text-sm hover:underline">{meta.artist}</Link>
                    : <span className="text-white font-semibold text-sm">{meta.artist}</span>}
                </div>

                {/* Meta row */}
                <p className="text-sm text-white/50">
                  {meta.year}
                  {tracks.length > 0 && ` · ${tracks.length} song${tracks.length !== 1 ? "s" : ""}`}
                  {totalMin > 0 && `, ${totalMin} min ${totalSec} sec`}
                </p>

                {/* Genre chips */}
                {meta.genres && meta.genres.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2 justify-center sm:justify-start">
                    {meta.genres.map(g => (
                      <span key={g} className="text-xs bg-white/10 text-white/50 px-2.5 py-0.5 rounded-full capitalize">{g}</span>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────── */}
      {!loading && tracks.length > 0 && meta && (
        <div className="flex items-center gap-4 px-4 sm:px-8 mb-6">
          <button onClick={() => playQueue(tracks, 0)}
            className="w-14 h-14 rounded-full bg-green-500 text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl">
            <Play size={22} fill="currentColor" />
          </button>
          <button onClick={() => playQueue([...tracks].sort(() => Math.random()-0.5), 0)}
            className="p-2 text-white/50 hover:text-white transition-colors">
            <Shuffle size={22} />
          </button>

          {/* Save / unsave album — syncs to library */}
          <button
            onClick={() => {
              const albumId = meta.spotifyId ? `spotify-${meta.spotifyId}` : cleanId;
              if (isAlbumSaved(albumId)) {
                unsaveAlbum(albumId);
              } else {
                saveAlbum({ id: albumId, name: meta.name, artist: meta.artist, cover: meta.cover, year: meta.year });
              }
            }}
            className={`p-2 transition-colors rounded-full ${
              isAlbumSaved(meta.spotifyId ? `spotify-${meta.spotifyId}` : cleanId)
                ? "text-green-400 hover:text-green-300"
                : "text-white/50 hover:text-white"
            }`}
            title={isAlbumSaved(meta.spotifyId ? `spotify-${meta.spotifyId}` : cleanId) ? "Remove from library" : "Save to library"}
          >
            <Heart size={22} fill={isAlbumSaved(meta.spotifyId ? `spotify-${meta.spotifyId}` : cleanId) ? "currentColor" : "none"} />
          </button>

          <button className="p-2 text-white/50 hover:text-white transition-colors">
            <MoreHorizontal size={22} />
          </button>
        </div>
      )}

      {/* ── Track table ───────────────────────────────────── */}
      <div className="px-4 sm:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/40">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <Music2 size={40} className="mx-auto mb-3 opacity-20" />
            <p>No tracks found</p>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="flex items-center gap-3 px-3 mb-2 text-xs text-white/30 uppercase tracking-widest border-b border-white/[0.06] pb-2">
              <span className="w-6 text-center">#</span>
              <span className="flex-1">Title</span>
              <span className="hidden lg:block w-36">Album</span>
              <span className="w-9 text-right flex items-center justify-end">
                <Clock size={13} />
              </span>
            </div>

            {/* Tracks */}
            <div>
              {tracks.map((t, i) => (
                <SongRow key={t.id} song={t} index={i} queue={tracks} showArtwork={false} />
              ))}
            </div>

            {/* Footer info */}
            <div className="mt-8 px-3 space-y-1">
              {meta?.year && (
                <p className="text-xs text-white/25">{meta.year}</p>
              )}
              {meta?.copyrights && (
                <p className="text-xs text-white/20 leading-relaxed">{meta.copyrights}</p>
              )}
              {meta?.label && (
                <p className="text-xs text-white/20">{meta.label}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
