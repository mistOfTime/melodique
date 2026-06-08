"use client";

import { useEffect, useState, useCallback } from "react";
import { Track, apiToTrack, getArtwork, dedupeAlbums } from "@/lib/track";
import { usePlayer } from "@/lib/playerContext";
import { usePlaylists } from "@/lib/playlistContext";
import { useAuth } from "@/lib/authContext";
import { Play, Loader2, Heart, ChevronRight, Radio, Mic2, TrendingUp, Flame } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PlaylistCoverGrid } from "@/components/PlaylistCoverGrid";

/* ── Types ─────────────────────────────────────────────── */
interface SpotifyAlbum {
  id: string; name: string;
  artists: { name: string; id: string }[];
  images: { url: string }[];
  release_date: string; album_type: string;
}

interface AlbumCard {
  collectionId: string; title: string; artist: string;
  cover: string; year: string; tracks: Track[];
}

function buildAlbums(tracks: Track[]): AlbumCard[] {
  const map = new Map<string, AlbumCard>();
  for (const t of tracks) {
    const key = t.collectionId || t.collectionName;
    if (!map.has(key)) {
      map.set(key, { collectionId: t.collectionId, title: t.collectionName, artist: t.artistName, cover: t.artworkUrl100, year: t.releaseDate?.slice(0, 4) ?? "", tracks: [] });
    }
    map.get(key)!.tracks.push(t);
  }
  return dedupeAlbums(Array.from(map.values()));
}

const STATION_COLORS = [
  ["#1a0533", "#7c3aed"], ["#0c2340", "#2563eb"], ["#330d1a", "#e11d48"],
  ["#0d2b0d", "#16a34a"], ["#2d1b00", "#d97706"], ["#1a1a3a", "#6366f1"],
];
const STATION_ARTISTS = [
  "Drake", "Taylor Swift", "The Weeknd", "Kendrick Lamar",
  "Billie Eilish", "SZA", "Post Malone", "Travis Scott",
  "Bad Bunny", "Doja Cat", "Playboi Carti", "Ariana Grande",
];

const MOOD_SECTIONS = [
  { title: "Chill & Relax",    query: "chill lofi relax",           color: "from-blue-900/60 to-transparent" },
  { title: "Workout & Energy", query: "workout gym motivation",      color: "from-orange-900/60 to-transparent" },
  { title: "Focus & Study",    query: "focus study instrumental",    color: "from-green-900/60 to-transparent" },
  { title: "Party & Hype",     query: "party hype 2025",            color: "from-purple-900/60 to-transparent" },
];

export default function HomePage() {
  const { playQueue } = usePlayer();
  const { state: plState } = usePlaylists();
  const { user } = useAuth();

  const [newReleases, setNewReleases]   = useState<SpotifyAlbum[]>([]);
  const [stations, setStations]         = useState<{ artist: string; tracks: Track[]; cover: string; color: string[] }[]>([]);
  const [moodSections, setMoodSections] = useState<{ title: string; albums: AlbumCard[]; tracks: Track[]; color: string }[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [featuredAlbum, setFeaturedAlbum]   = useState<SpotifyAlbum | null>(null);
  const [loading, setLoading]           = useState(true);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const [releasesData, trendingData, stationResults, moodResults] = await Promise.all([
        // New releases from Spotify
        fetch("/api/spotify/browse?type=new-releases&limit=18")
          .then(r => r.json()).then(d => d.albums?.items ?? []).catch(() => []),

        // Trending
        fetch("/api/music/search?q=trending+hits+2025&limit=24")
          .then(r => r.json()).then(d => (d.results ?? []).map(apiToTrack) as Track[]).catch(() => []),

        // Radio stations
        Promise.all(
          [...STATION_ARTISTS].sort(() => Math.random() - 0.5).slice(0, 6).map(async (artist, i) => {
            const res = await fetch(`/api/music/search?q=${encodeURIComponent(artist)}&limit=20`)
              .then(r => r.json()).catch(() => ({ results: [] }));
            const tracks = (res.results ?? []).map(apiToTrack) as Track[];
            const cover = tracks.find(t => t.artworkUrl100)?.artworkUrl100 ?? "";
            return { artist, tracks, cover, color: STATION_COLORS[i % STATION_COLORS.length] };
          })
        ),

        // Mood sections
        Promise.all(
          MOOD_SECTIONS.map(async m => {
            const res = await fetch(`/api/music/search?q=${encodeURIComponent(m.query)}&limit=20`)
              .then(r => r.json()).catch(() => ({ results: [] }));
            const tracks = (res.results ?? []).map(apiToTrack) as Track[];
            return { title: m.title, albums: buildAlbums(tracks).slice(0, 5), tracks, color: m.color };
          })
        ),
      ]);

      setNewReleases(releasesData);
      if (releasesData.length > 0) setFeaturedAlbum(releasesData[0]);
      setTrendingTracks(trendingData);
      setStations(stationResults);
      setMoodSections(moodResults.filter(m => m.albums.length > 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHome(); }, [loadHome]);

  const likedTracks   = plState.likedTracks;
  const recentLiked   = likedTracks.slice(-8).reverse();
  const userPlaylists = plState.playlists.filter(p => p.id !== "liked" && p.tracks.length > 0);

  // Build tracks from a Spotify album for playing
  const playSpotifyAlbum = async (album: SpotifyAlbum) => {
    const data = await fetch(`/api/spotify/album?id=${album.id}`).then(r => r.json()).catch(() => null);
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks = (data.tracks?.items ?? []).map((t: any): Track => ({
      id: `spotify-${t.id}`, trackId: 0,
      trackName: t.name,
      artistName: t.artists?.[0]?.name ?? "",
      artistId: "", collectionName: album.name,
      collectionId: `spotify-${album.id}`,
      artworkUrl100: album.images?.[0]?.url ?? "",
      previewUrl: t.preview_url ?? null,
      trackTimeMillis: t.duration_ms ?? 0,
      primaryGenreName: "", releaseDate: album.release_date,
      trackNumber: t.track_number ?? 0,
      explicit: t.explicit ?? false,
      source: "spotify" as const,
    }));
    if (tracks.length) playQueue(tracks, 0);
  };

  return (
    <div className="min-h-full bg-[#121212] animate-fade-in">

      {/* ── HERO BANNER ───────────────────────────────────── */}
      {featuredAlbum && !loading && (
        <div className="relative overflow-hidden h-64 sm:h-80 flex-shrink-0">
          {/* Background */}
          <div className="absolute inset-0"
            style={{ backgroundImage: `url(${featuredAlbum.images?.[0]?.url})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(30px) brightness(0.4) saturate(1.8)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent" />

          {/* Content */}
          <div className="relative z-10 flex items-end gap-5 h-full px-5 sm:px-8 pb-6">
            <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-xl overflow-hidden shadow-2xl flex-shrink-0 ring-1 ring-white/10">
              <Image src={featuredAlbum.images?.[0]?.url ?? ""} alt={featuredAlbum.name}
                width={176} height={176} className="w-full h-full object-cover" priority />
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">
                {featuredAlbum.album_type === "single" ? "New Single" : "New Album"}
              </p>
              <h2 className="font-black text-2xl sm:text-4xl text-white leading-tight mb-1 line-clamp-2">
                {featuredAlbum.name}
              </h2>
              <p className="text-white/60 text-sm mb-3">
                {featuredAlbum.artists?.map(a => a.name).join(", ")}
              </p>
              <div className="flex items-center gap-3">
                <button onClick={() => playSpotifyAlbum(featuredAlbum)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500 text-black font-bold text-sm hover:scale-105 transition-transform shadow-lg">
                  <Play size={14} fill="black" /> Play
                </button>
                <Link href={`/album/spotify-${featuredAlbum.id}`}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/30 text-white font-semibold text-sm hover:border-white hover:bg-white/10 transition-all">
                  View Album
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GREETING + QUICK SHORTCUTS ─────────────────── */}
      <div className={`px-4 sm:px-6 ${featuredAlbum ? "pt-5" : "pt-7"} pb-5`}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-bold text-xl sm:text-2xl text-white">
            {user ? `${greeting}, ${user.displayName.split(" ")[0]}` : greeting}
          </h1>
        </div>

        {/* Quick access tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Link href="/liked"
            className="flex items-center gap-3 bg-white/[0.1] hover:bg-white/[0.18] rounded-lg overflow-hidden transition-colors group relative h-14">
            <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-br from-purple-600 to-blue-400 flex items-center justify-center">
              <Heart size={20} className="text-white" fill="white" />
            </div>
            <span className="text-sm font-bold text-white pr-2 truncate">Liked Songs</span>
            {likedTracks.length > 0 && (
              <button onClick={e => { e.preventDefault(); playQueue(likedTracks, 0); }}
                className="absolute right-2 w-8 h-8 rounded-full bg-green-500 text-black opacity-0 group-hover:opacity-100 transition-all hover:scale-105 flex items-center justify-center shadow-lg">
                <Play size={11} fill="currentColor" />
              </button>
            )}
          </Link>
          {userPlaylists.slice(0, 5).map(pl => (
            <div key={pl.id}
              className="flex items-center gap-3 bg-white/[0.07] hover:bg-white/[0.14] rounded-lg overflow-hidden transition-colors cursor-pointer group relative h-14"
              onClick={() => playQueue(pl.tracks, 0)}>
              <div className="w-14 h-14 flex-shrink-0 overflow-hidden">
                <PlaylistCoverGrid playlist={pl} size={56} />
              </div>
              <span className="text-sm font-bold text-white pr-2 truncate">{pl.name}</span>
              <button onClick={e => { e.stopPropagation(); playQueue(pl.tracks, 0); }}
                className="absolute right-2 w-8 h-8 rounded-full bg-green-500 text-black opacity-0 group-hover:opacity-100 transition-all hover:scale-105 flex items-center justify-center shadow-lg">
                <Play size={11} fill="currentColor" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-white/40">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : (
        <div className="px-4 sm:px-6 pb-12 space-y-10">

          {/* ── RECENTLY LIKED ─────────────────────────── */}
          {recentLiked.length > 0 && (
            <Section title="Recently Liked" href="/liked" icon={<Heart size={18} className="text-pink-400" fill="currentColor" />}>
              <ScrollRow>
                {recentLiked.map(t => (
                  <SmallCard key={t.id}
                    cover={getArtwork(t.artworkUrl100, 200)} title={t.trackName} subtitle={t.artistName}
                    onPlay={() => playQueue(recentLiked, recentLiked.findIndex(x => x.id === t.id))}
                    href={`/album/${t.collectionId}`} round={false} />
                ))}
              </ScrollRow>
            </Section>
          )}

          {/* ── NEW RELEASES ───────────────────────────── */}
          {newReleases.length > 0 && (
            <Section title="New Releases" icon={<Flame size={18} className="text-orange-400" />}>
              <CardGrid cols={6}>
                {newReleases.slice(1, 7).map(a => (
                  <AlbumCardItem key={a.id}
                    cover={a.images?.[0]?.url ?? ""}
                    title={a.name}
                    subtitle={a.artists?.map(x => x.name).join(", ") ?? ""}
                    onPlay={() => playSpotifyAlbum(a)}
                    href={`/album/spotify-${a.id}`}
                    artistHref={`/artist/${encodeURIComponent(a.artists?.[0]?.name ?? "")}`}
                    badge={a.album_type === "single" ? "Single" : undefined}
                  />
                ))}
              </CardGrid>
            </Section>
          )}

          {/* ── TRENDING NOW ───────────────────────────── */}
          {trendingTracks.length > 0 && (
            <Section title="Trending Now" icon={<TrendingUp size={18} className="text-green-400" />}>
              <CardGrid cols={6}>
                {buildAlbums(trendingTracks).slice(0, 6).map(a => (
                  <AlbumCardItem key={a.collectionId}
                    cover={getArtwork(a.cover, 300)} title={a.title} subtitle={a.artist}
                    onPlay={() => playQueue(a.tracks, 0)} href={`/album/${a.collectionId}`}
                    artistHref={`/artist/${encodeURIComponent(a.artist)}`} />
                ))}
              </CardGrid>
            </Section>
          )}

          {/* ── UPCOMING ───────────────────────────────── */}
          {newReleases.length > 7 && (
            <Section title="Upcoming Releases">
              <ScrollRow>
                {newReleases.slice(7, 15).map(a => (
                  <SmallCard key={a.id}
                    cover={a.images?.[0]?.url ?? ""} title={a.name}
                    subtitle={a.artists?.[0]?.name ?? ""}
                    onPlay={() => playSpotifyAlbum(a)}
                    href={`/album/spotify-${a.id}`} round={false} />
                ))}
              </ScrollRow>
            </Section>
          )}

          {/* ── RECOMMENDED STATIONS ───────────────────── */}
          {stations.length > 0 && (
            <Section title="Radio Stations" icon={<Radio size={18} className="text-blue-400" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {stations.map(({ artist, tracks, cover, color }) => (
                  <div key={artist}
                    className="group rounded-xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-all relative aspect-square"
                    style={{ background: `linear-gradient(145deg, ${color[0]}, ${color[1]})` }}
                    onClick={() => tracks.length && playQueue(tracks, 0)}>
                    {/* Artist photo */}
                    {cover && (
                      <div className="absolute inset-0">
                        <Image src={getArtwork(cover, 300)} alt={artist} fill className="object-cover opacity-40 group-hover:opacity-50 transition-opacity" />
                      </div>
                    )}
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    {/* Content */}
                    <div className="relative z-10 h-full flex flex-col justify-between p-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 bg-black/30 px-1.5 py-0.5 rounded w-fit">RADIO</span>
                      <div>
                        <p className="font-bold text-white text-sm leading-tight mb-1">{artist}</p>
                      </div>
                    </div>
                    {/* Play button */}
                    <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-green-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all shadow-xl">
                      <Play size={14} fill="currentColor" />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── MOOD SECTIONS ──────────────────────────── */}
          {moodSections.map(mood => (
            <section key={mood.title}>
              <div className={`rounded-2xl overflow-hidden bg-gradient-to-r ${mood.color} border border-white/[0.06] mb-4 px-5 py-4`}>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-bold text-xl text-white">{mood.title}</h2>
                </div>
                <p className="text-xs text-white/50">Based on your vibe</p>
              </div>
              <CardGrid cols={5}>
                {mood.albums.map(a => (
                  <AlbumCardItem key={a.collectionId}
                    cover={getArtwork(a.cover, 300)} title={a.title} subtitle={a.artist}
                    onPlay={() => playQueue(a.tracks, 0)} href={`/album/${a.collectionId}`}
                    artistHref={`/artist/${encodeURIComponent(a.artist)}`} />
                ))}
              </CardGrid>
            </section>
          ))}

          {/* ── CHARTS TEASER ──────────────────────────── */}
          <section>
            <Link href="/charts"
              className="group flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-yellow-900/30 to-transparent border border-yellow-500/10 hover:border-yellow-500/30 transition-all">
              <div className="w-14 h-14 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={28} className="text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base">Top Charts</p>
                <p className="text-xs text-white/50 mt-0.5">See what&apos;s topping the charts right now</p>
              </div>
              <ChevronRight size={20} className="text-white/40 group-hover:text-white transition-colors flex-shrink-0" />
            </Link>
          </section>

          {/* ── LYRICS CTA ─────────────────────────────── */}
          <section>
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-green-900/30 to-transparent border border-green-500/10">
              <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Mic2 size={28} className="text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base">Sing Along</p>
                <p className="text-xs text-white/50 mt-0.5">Real-time synced lyrics for any song you play</p>
              </div>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}

/* ── Section wrapper ─────────────────────────────────── */
function Section({ title, href, icon, children }: { title: string; href?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold text-xl text-white">{title}</h2>
        </div>
        {href && (
          <Link href={href} className="text-sm text-white/40 hover:text-white transition-colors flex items-center gap-1">
            Show all <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/* ── Card grids ─────────────────────────────────────── */
function CardGrid({ children, cols = 6 }: { children: React.ReactNode; cols?: number }) {
  const colClass = cols === 5
    ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
  return <div className={`grid ${colClass} gap-4`}>{children}</div>;
}

/* ── Horizontal scroll row ──────────────────────────── */
function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar -mx-1 px-1">
      {children}
    </div>
  );
}

/* ── Small scroll card ──────────────────────────────── */
function SmallCard({ cover, title, subtitle, onPlay, href, round }: {
  cover: string; title: string; subtitle: string;
  onPlay: () => void; href: string; round: boolean;
}) {
  return (
    <div className="flex-shrink-0 w-32 sm:w-36 group flex flex-col gap-1.5">
      <div className={`relative w-32 h-32 sm:w-36 sm:h-36 overflow-hidden bg-white/10 ${round ? "rounded-full" : "rounded-xl"}`}>
        <Link href={href}>
          {cover && <Image src={cover} alt={title} fill className="object-cover group-hover:scale-[1.04] transition-transform duration-300" />}
        </Link>
        <button onClick={e => { e.preventDefault(); onPlay(); }}
          className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-green-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all shadow-xl">
          <Play size={12} fill="currentColor" />
        </button>
      </div>
      <Link href={href} className="text-xs font-semibold text-white truncate hover:underline">{title}</Link>
      <p className="text-[11px] text-white/40 truncate">{subtitle}</p>
    </div>
  );
}

/* ── Standard album card ────────────────────────────── */
function AlbumCardItem({ cover, title, subtitle, onPlay, href, artistHref, badge }: {
  cover: string; title: string; subtitle: string;
  onPlay: () => void; href: string; artistHref?: string; badge?: string;
}) {
  return (
    <div className="group flex flex-col gap-2">
      <div className="relative aspect-square rounded-lg overflow-hidden bg-white/[0.06]">
        <Link href={href}>
          {cover
            ? <Image src={cover} alt={title} fill className="object-cover group-hover:scale-[1.04] transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center"><span className="text-white/20 text-4xl font-bold">{title[0]}</span></div>}
        </Link>
        {badge && <span className="absolute top-2 left-2 text-[9px] font-bold uppercase bg-black/60 text-white px-1.5 py-0.5 rounded">{badge}</span>}
        <button onClick={e => { e.preventDefault(); onPlay(); }}
          className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-green-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200 shadow-xl hover:scale-105">
          <Play size={14} fill="currentColor" />
        </button>
      </div>
      <div className="min-w-0">
        <Link href={href} className="text-sm font-semibold text-white truncate block hover:underline">{title}</Link>
        {artistHref
          ? <Link href={artistHref} className="text-xs text-white/50 truncate block mt-0.5 hover:underline hover:text-white transition-colors">{subtitle}</Link>
          : <p className="text-xs text-white/50 truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
