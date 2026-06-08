"use client";

import { useEffect, useState, useCallback } from "react";
import { Track, apiToTrack, getArtwork } from "@/lib/track";
import SongRow from "@/components/SongRow";
import { usePlayer } from "@/lib/playerContext";
import { usePlaylists } from "@/lib/playlistContext";
import { Play, Shuffle, ArrowLeft, Loader2, Disc3, UserCheck, UserPlus, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ── Types ─────────────────────────────────────────────── */
type DiscTab = "popular" | "albums" | "singles" | "compilations";

interface AlbumItem {
  collectionId: string;
  title: string;
  cover: string;
  year: string;
  type: string;
  trackCount: number;
  isLatest: boolean;
}

interface SpotifyArtist {
  id: string;
  image: string;
  followers: number;
  genres: string[];
}

interface RelatedArtist {
  id: string; name: string; image: string;
}

/* ── Helpers ────────────────────────────────────────────── */
async function findSpotifyArtist(name: string): Promise<SpotifyArtist | null> {
  try {
    const res  = await fetch(`/api/spotify/search?q=${encodeURIComponent(name)}&type=artist&limit=10`);
    const data = await res.json();
    const list = data.artists?.items ?? [];
    const match =
      list.find((a: { name: string }) => a.name.toLowerCase() === name.toLowerCase()) ??
      list.sort((a: { followers: { total: number } }, b: { followers: { total: number } }) =>
        b.followers.total - a.followers.total)[0];
    if (!match) return null;
    return {
      id:        match.id,
      image:     match.images?.[0]?.url ?? "",
      followers: match.followers?.total ?? 0,
      genres:    match.genres ?? [],
    };
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSpotifyTopTracks(artistId: string): Promise<Track[]> {
  try {
    const res  = await fetch(`/api/spotify/artist?id=${artistId}&action=toptracks`);
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.tracks ?? []).map((t: any): Track => ({
      id: `spotify-${t.id}`, trackId: 0,
      trackName: t.name, artistName: t.artists?.[0]?.name ?? "",
      artistId: artistId,
      collectionName: t.album?.name ?? "",
      collectionId: `spotify-${t.album?.id ?? ""}`,
      artworkUrl100: t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? "",
      previewUrl: t.preview_url ?? null,
      trackTimeMillis: t.duration_ms ?? 0,
      primaryGenreName: "", releaseDate: t.album?.release_date ?? "",
      trackNumber: t.track_number ?? 0, explicit: t.explicit ?? false, source: "spotify",
    }));
  } catch { return []; }
}

async function fetchRelated(artistId: string): Promise<RelatedArtist[]> {
  try {
    const res  = await fetch(`/api/spotify/artist?id=${artistId}&action=related`);
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.artists ?? []).slice(0, 6).map((a: any) => ({
      id: a.id, name: a.name, image: a.images?.[0]?.url ?? "",
    }));
  } catch { return []; }
}

/* Build discography from iTunes tracks — always works */
function buildFromItunes(tracks: Track[]) {
  const map = new Map<string, AlbumItem>();
  for (const t of tracks) {
    const key = t.collectionId;
    if (!key || key === "0") continue;
    if (!map.has(key)) {
      map.set(key, { collectionId: key, title: t.collectionName, cover: t.artworkUrl100, year: t.releaseDate?.slice(0, 4) ?? "", type: "album", trackCount: 0, isLatest: false });
    }
    map.get(key)!.trackCount++;
  }

  const seen = new Set<string>();
  const all  = Array.from(map.values())
    .sort((a, b) => b.year.localeCompare(a.year))
    .filter(a => {
      const k = a.title.toLowerCase().replace(/\s*\(.*?\)/g, "").replace(/\s*-\s*(deluxe|remaster.*|special.*)/gi, "").trim();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

  if (all.length) all[0].isLatest = true;

  const albums  = all.filter(a => a.trackCount >= 5);
  const singles = all.filter(a => a.trackCount < 5).map(a => ({ ...a, type: a.trackCount === 1 ? "single" : "single" }));

  return {
    popular:      all.slice(0, 6),
    albums,
    singles,
    compilations: [] as AlbumItem[],
    appearsOn:    [] as AlbumItem[],
  };
}

/* Try Spotify discography, fall back to iTunes */
async function getDiscography(artistId: string, name: string, itunesTracks: Track[]) {
  try {
    const [a, s, c, ao] = await Promise.all([
      fetch(`/api/spotify/artist?id=${artistId}&action=albums_only`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/spotify/artist?id=${artistId}&action=singles`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/spotify/artist?id=${artistId}&action=compilations`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/spotify/artist?id=${artistId}&action=appears_on`).then(r => r.json()).catch(() => ({ items: [] })),
    ]);

    const hasData = (a.items?.length ?? 0) + (s.items?.length ?? 0) > 0;
    if (hasData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toItem = (x: any, i: number): AlbumItem => ({
        collectionId: `spotify-${x.id}`,
        title: x.name,
        cover: x.images?.[0]?.url ?? "",
        year:  x.release_date?.slice(0, 4) ?? "",
        type:  x.album_type ?? "album",
        trackCount: x.total_tracks ?? 0,
        isLatest: i === 0,
      });
      const albums  = (a.items ?? []).map(toItem);
      const singles = (s.items ?? []).map(toItem);
      const comps   = (c.items ?? []).map(toItem);
      const appears = (ao.items ?? []).map(toItem);
      const popular = [...albums, ...singles, ...comps].sort((x, y) => y.year.localeCompare(x.year)).slice(0, 6);
      return { popular, albums, singles, compilations: comps, appearsOn: appears };
    }
  } catch { /* fall through */ }

  // Fallback: build from iTunes
  return buildFromItunes(itunesTracks);
}

/* ── Component ─────────────────────────────────────────── */
export default function ArtistPage({ params }: { params: { name: string } }) {
  const name   = decodeURIComponent(params.name);
  const router = useRouter();
  const { playQueue }                       = usePlayer();
  const { followArtist, unfollowArtist, isFollowing } = usePlaylists();

  const [spotifyArtist, setSpotifyArtist] = useState<SpotifyArtist | null>(null);
  const [topTracks, setTopTracks]         = useState<Track[]>([]);
  const [allTracks, setAllTracks]         = useState<Track[]>([]);
  const [discography, setDiscography]     = useState<ReturnType<typeof buildFromItunes> | null>(null);
  const [related, setRelated]             = useState<RelatedArtist[]>([]);
  const [loading, setLoading]             = useState(true);
  const [discTab, setDiscTab]             = useState<DiscTab>("popular");
  const [showAllSongs, setShowAllSongs]   = useState(false);
  const [showAllDisc, setShowAllDisc]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSpotifyArtist(null); setTopTracks([]); setAllTracks([]); setDiscography(null); setRelated([]);

    // Always fetch iTunes tracks first (broad coverage)
    const itunesRes = await fetch(`/api/music/search?q=${encodeURIComponent(name)}&limit=200`)
      .then(r => r.json()).then(d => (d.results ?? []).map(apiToTrack) as Track[]).catch(() => [] as Track[]);

    const nameLow = name.toLowerCase();
    const itunesTracks = itunesRes.filter(t =>
      t.artistName.toLowerCase().includes(nameLow.split(" ")[0]) ||
      nameLow.includes(t.artistName.toLowerCase().split(" ")[0])
    );
    const itunes = itunesTracks.length > 0 ? itunesTracks : itunesRes;

    // Try Spotify in parallel
    const artist = await findSpotifyArtist(name);

    if (artist) {
      setSpotifyArtist(artist);
      const [spotifyTop, rel] = await Promise.all([
        fetchSpotifyTopTracks(artist.id),
        fetchRelated(artist.id),
      ]);
      setRelated(rel);

      const merged = new Map<string, Track>();
      [...spotifyTop, ...itunes].forEach(t => { if (!merged.has(t.id)) merged.set(t.id, t); });
      const all = Array.from(merged.values());

      setTopTracks(spotifyTop.length > 0 ? spotifyTop : itunes.slice(0, 10));
      setAllTracks(all);

      const disc = await getDiscography(artist.id, name, all);
      setDiscography(disc);
    } else {
      setTopTracks(itunes.slice(0, 10));
      setAllTracks(itunes);
      setDiscography(buildFromItunes(itunes));
    }

    setLoading(false);
  }, [name]);

  useEffect(() => { load(); }, [load]);

  const followed      = isFollowing(spotifyArtist?.id ?? name);
  const artistImage   = spotifyArtist?.image || allTracks.find(t => t.artworkUrl100)?.artworkUrl100 || "";
  const playable      = topTracks.length > 0 ? topTracks : allTracks;

  const fmt = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n);

  const discItems = discography
    ? discTab === "popular"      ? discography.popular
    : discTab === "albums"       ? discography.albums
    : discTab === "singles"      ? discography.singles
    : discography.compilations
    : [];

  const visibleDisc = showAllDisc ? discItems : discItems.slice(0, 6);

  return (
    <div className="min-h-full bg-[#121212] pb-12 animate-fade-in">

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative h-56 sm:h-72 overflow-hidden">
        {artistImage ? (
          <>
            <div className="absolute inset-0"
              style={{ backgroundImage: `url(${getArtwork(artistImage, 800)})`, backgroundSize: "cover", backgroundPosition: "center top", filter: "saturate(1.2) brightness(0.6)" }} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-[#121212]" />
          </>
        ) : <div className="absolute inset-0 bg-gradient-to-b from-[#2a2a3a] to-[#121212]" />}

        <button onClick={() => router.back()}
          className="absolute top-4 left-4 z-20 flex items-center gap-2 text-white/80 hover:text-white text-sm bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full transition-colors">
          <ArrowLeft size={13} /> Back
        </button>

        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-5 z-10">
          <div className="flex items-end gap-4">
            <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden shadow-2xl flex-shrink-0 ring-2 ring-white/20">
              {artistImage
                ? <Image src={getArtwork(artistImage, 300)} alt={name} width={112} height={112} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-white/10 flex items-center justify-center text-3xl font-black text-white/30">{name[0]}</div>}
            </div>
            <div className="pb-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-0.5">Artist</p>
              <h1 className="font-black text-2xl sm:text-4xl text-white leading-none truncate">{name}</h1>
              {spotifyArtist && (
                <p className="text-sm text-white/50 mt-1">{fmt(spotifyArtist.followers)} followers</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action bar ───────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4">
        <button onClick={() => playQueue(playable, 0)} disabled={loading || !playable.length}
          className="w-14 h-14 rounded-full bg-green-500 text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl disabled:opacity-40">
          <Play size={22} fill="currentColor" />
        </button>
        <button onClick={() => playQueue([...playable].sort(() => Math.random()-0.5), 0)} disabled={loading || !playable.length}
          className="p-2 text-white/50 hover:text-white transition-colors disabled:opacity-40">
          <Shuffle size={22} />
        </button>
        {spotifyArtist && (
          <button
            onClick={() => {
              if (followed) unfollowArtist(spotifyArtist.id);
              else followArtist({ id: spotifyArtist.id, name, image: spotifyArtist.image, followers: spotifyArtist.followers });
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition-all ${
              followed ? "border-white/40 text-white hover:border-red-400 hover:text-red-400"
                       : "border-white/30 text-white/70 hover:border-white hover:text-white"
            }`}>
            {followed ? <><UserCheck size={15} /> Following</> : <><UserPlus size={15} /> Follow</>}
          </button>
        )}
      </div>

      {/* ── Genre chips ──────────────────────────────────── */}
      {spotifyArtist?.genres && spotifyArtist.genres.length > 0 && (
        <div className="flex gap-2 px-4 sm:px-6 mb-4 overflow-x-auto hide-scrollbar">
          {spotifyArtist.genres.slice(0, 4).map(g => (
            <span key={g} className="text-xs bg-white/10 text-white/60 px-3 py-1 rounded-full flex-shrink-0 capitalize">{g}</span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-20 text-white/40 gap-3">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Loading…</p>
        </div>
      ) : (
        <div className="px-4 sm:px-6 space-y-10">

          {/* ── Popular tracks ───────────────────────────── */}
          {topTracks.length > 0 && (
            <section>
              <h2 className="font-bold text-xl text-white mb-3">Popular</h2>
              <div className="rounded-xl overflow-hidden">
                {(showAllSongs ? topTracks : topTracks.slice(0, 5)).map((t, i) => (
                  <SongRow key={t.id} song={t} index={i} queue={topTracks} showArtwork />
                ))}
              </div>
              {topTracks.length > 5 && (
                <button onClick={() => setShowAllSongs(s => !s)}
                  className="mt-2 text-sm text-white/40 hover:text-white transition-colors px-3 py-1">
                  {showAllSongs ? "Show less" : `See all ${topTracks.length} songs`}
                </button>
              )}
            </section>
          )}

          {/* ── Discography ──────────────────────────────── */}
          {discography && (discography.popular.length > 0 || discography.albums.length > 0 || discography.singles.length > 0) && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-xl text-white">Discography</h2>
                <button onClick={() => setShowAllDisc(s => !s)}
                  className="text-sm text-white/40 hover:text-white transition-colors flex items-center gap-1">
                  {showAllDisc ? "Show less" : `Show all`} <ChevronRight size={14} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-5 overflow-x-auto hide-scrollbar">
                {([
                  { key: "popular",      label: "Popular releases", count: discography.popular.length },
                  { key: "albums",       label: "Albums",           count: discography.albums.length },
                  { key: "singles",      label: "Singles and EPs",  count: discography.singles.length },
                  { key: "compilations", label: "Compilations",     count: discography.compilations.length },
                ] as { key: DiscTab; label: string; count: number }[]).map(({ key, label, count }) => {
                  if (count === 0 && key !== "popular") return null;
                  return (
                    <button key={key}
                      onClick={() => { setDiscTab(key); setShowAllDisc(false); }}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold flex-shrink-0 transition-all ${
                        discTab === key ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Album grid */}
              {visibleDisc.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">No releases found</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {visibleDisc.map(a => (
                    <div key={a.collectionId} className="group flex flex-col gap-2">
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-white/[0.06]">
                        <Link href={`/album/${a.collectionId}`}>
                          {a.cover
                            ? <Image src={a.cover} alt={a.title} fill className="object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                            : <div className="w-full h-full flex items-center justify-center"><Disc3 size={32} className="text-white/20" /></div>}
                        </Link>
                        <button
                          onClick={e => {
                            e.preventDefault();
                            const id = a.collectionId.replace(/^spotify-/, "");
                            fetch(`/api/spotify/album?id=${id}`).then(r => r.json()).then(data => {
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const tracks = (data.tracks?.items ?? []).map((t: any): Track => ({
                                id: `spotify-${t.id}`, trackId: 0,
                                trackName: t.name, artistName: t.artists?.[0]?.name ?? name,
                                artistId: spotifyArtist?.id ?? "",
                                collectionName: data.name, collectionId: a.collectionId,
                                artworkUrl100: data.images?.[0]?.url ?? a.cover,
                                previewUrl: t.preview_url ?? null, trackTimeMillis: t.duration_ms ?? 0,
                                primaryGenreName: "", releaseDate: data.release_date ?? "",
                                trackNumber: t.track_number ?? 0, explicit: t.explicit ?? false, source: "spotify",
                              }));
                              if (tracks.length) playQueue(tracks, 0);
                              else {
                                // fallback: play from allTracks filtered by collectionId
                                const local = allTracks.filter(t => t.collectionId === a.collectionId);
                                if (local.length) playQueue(local, 0);
                              }
                            }).catch(() => {
                              const local = allTracks.filter(t => t.collectionId === a.collectionId);
                              if (local.length) playQueue(local, 0);
                            });
                          }}
                          className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-green-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all shadow-xl hover:scale-105">
                          <Play size={14} fill="currentColor" />
                        </button>
                      </div>
                      <div className="min-w-0">
                        <Link href={`/album/${a.collectionId}`}
                          className="text-sm font-semibold text-white truncate block hover:underline">
                          {a.title}
                        </Link>
                        <p className="text-xs text-white/50 mt-0.5 capitalize">
                          {a.isLatest ? "Latest Release · " : ""}{a.year} · {
                            a.type === "single" ? (a.trackCount > 2 ? "EP" : "Single")
                            : a.type === "compilation" ? "Compilation"
                            : "Album"
                          }
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {discItems.length > 6 && !showAllDisc && (
                <button onClick={() => setShowAllDisc(true)}
                  className="mt-3 text-sm text-white/40 hover:text-white transition-colors">
                  See all {discItems.length} release{discItems.length !== 1 ? "s" : ""}
                </button>
              )}
            </section>
          )}

          {/* ── All Songs tab ────────────────────────────── */}
          {allTracks.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-xl text-white">All Songs</h2>
                <span className="text-sm text-white/40">{allTracks.length} total</span>
              </div>
              <div className="rounded-xl overflow-hidden">
                {allTracks.slice(0, 20).map((t, i) => (
                  <SongRow key={t.id} song={t} index={i} queue={allTracks} showArtwork showAlbum />
                ))}
              </div>
            </section>
          )}

          {/* ── Fans also like ───────────────────────────── */}
          {related.length > 0 && (
            <section>
              <h2 className="font-bold text-xl text-white mb-4">Fans also like</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {related.map(a => (
                  <Link key={a.id} href={`/artist/${encodeURIComponent(a.name)}`}
                    className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/[0.06] transition-colors">
                    <div className="w-full aspect-square rounded-full overflow-hidden bg-white/10">
                      {a.image
                        ? <Image src={a.image} alt={a.name} fill className="object-cover group-hover:scale-105 transition-transform" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white/20">{a.name[0]}</div>}
                    </div>
                    <p className="text-sm font-semibold text-white text-center truncate w-full">{a.name}</p>
                    <p className="text-xs text-white/40">Artist</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
