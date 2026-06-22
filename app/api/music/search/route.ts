export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

export interface UnifiedTrack {
  id: string;
  trackName: string;
  artistName: string;
  artistId: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string | null;
  trackTimeMillis: number;
  releaseDate: string;
  collectionId: string;
  trackNumber: number;
  primaryGenreName: string;
  explicit: boolean;
  source: "itunes" | "musicbrainz" | "spotify";
}

/* ── Spotify ─────────────────────────────────────────────── */
async function searchSpotify(term: string, limit: number): Promise<UnifiedTrack[]> {
  try {
    const token = await getSpotifyToken();
    if (!token) return [];
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=track&limit=${Math.min(limit, 50)}&market=US`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.tracks?.items ?? []).map((t: any): UnifiedTrack => ({
      id:               `spotify-${t.id}`,
      trackName:        t.name ?? "",
      artistName:       t.artists?.[0]?.name ?? "",
      artistId:         t.artists?.[0]?.id ?? "",
      collectionName:   t.album?.name ?? "",
      artworkUrl100:    t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? "",
      previewUrl:       t.preview_url ?? null,
      trackTimeMillis:  t.duration_ms ?? 0,
      releaseDate:      t.album?.release_date ?? "",
      collectionId:     `spotify-${t.album?.id ?? ""}`,
      trackNumber:      t.track_number ?? 0,
      primaryGenreName: "",
      explicit:         t.explicit ?? false,
      source:           "spotify",
    }));
  } catch { return []; }
}

/* ── iTunes ──────────────────────────────────────────────── */
async function searchItunes(term: string, limit: number): Promise<UnifiedTrack[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}&media=music`;
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.results ?? []).map((t: any): UnifiedTrack => ({
      id:               `itunes-${t.trackId}`,
      trackName:        t.trackName ?? "",
      artistName:       t.artistName ?? "",
      artistId:         String(t.artistId ?? ""),
      collectionName:   t.collectionName ?? "",
      artworkUrl100:    t.artworkUrl100 ?? "",
      previewUrl:       t.previewUrl ?? null,
      trackTimeMillis:  t.trackTimeMillis ?? 0,
      releaseDate:      t.releaseDate ?? "",
      collectionId:     String(t.collectionId ?? ""),
      trackNumber:      t.trackNumber ?? 0,
      primaryGenreName: t.primaryGenreName ?? "",
      explicit:         t.trackExplicitness === "explicit",
      source:           "itunes",
    }));
  } catch { return []; }
}

/* ── MusicBrainz (underground/indie fallback) ────────────── */
async function searchMusicBrainz(term: string, limit: number): Promise<UnifiedTrack[]> {
  try {
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(term)}&limit=${limit}&fmt=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Melodique/1.0 (melodique-app)" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.recordings ?? []).filter((r: any) => r["artist-credit"]?.length > 0 && r.title)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any): UnifiedTrack => {
      const artistName = r["artist-credit"]
        ?.map((ac: { artist: { name: string }; name?: string }) => ac.name || ac.artist?.name)
        .join(", ") ?? "Unknown";
      const release = r.releases?.[0];
      const releaseGroupId = release?.["release-group"]?.id ?? "";
      return {
        id:               `mb-${r.id}`,
        trackName:        r.title,
        artistName,
        artistId:         "",
        collectionName:   release?.title ?? "Single",
        artworkUrl100:    releaseGroupId ? `https://coverartarchive.org/release-group/${releaseGroupId}/front-250` : "",
        previewUrl:       null,
        trackTimeMillis:  r.length ?? 0,
        releaseDate:      release?.date ?? "",
        collectionId:     `mb-${releaseGroupId || r.id}`,
        trackNumber:      1,
        primaryGenreName: r.tags?.[0]?.name ?? "",
        explicit:         false,
        source:           "musicbrainz",
      };
    });
  } catch { return []; }
}

function dedupe(tracks: UnifiedTrack[]): UnifiedTrack[] {
  const seen = new Set<string>();
  return tracks.filter(t => {
    const key = `${t.artistName.toLowerCase().trim()}::${t.trackName.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const term  = searchParams.get("q") || searchParams.get("term") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  if (!term) return NextResponse.json({ results: [] });

  // Spotify first (best catalog), iTunes second, MusicBrainz for underground
  const [spotifyTracks, itunesTracks, mbTracks] = await Promise.all([
    searchSpotify(term, limit),
    searchItunes(term, Math.min(limit, 50)),
    searchMusicBrainz(term, Math.min(limit, 25)),
  ]);

  // Filter MusicBrainz to only include tracks with artwork (slow CAA URLs cause blank covers)
  const mbWithArt = mbTracks.filter(t => t.artworkUrl100 && t.artworkUrl100.length > 10);

  // Merge: Spotify first (best artwork), iTunes second (has genre), MusicBrainz last
  // For Spotify tracks missing genre, try to fill from matching iTunes result
  const itunesGenreMap = new Map<string, string>();
  itunesTracks.forEach(t => {
    if (t.primaryGenreName) {
      const key = `${t.artistName.toLowerCase().trim()}::${t.trackName.toLowerCase().trim()}`;
      itunesGenreMap.set(key, t.primaryGenreName);
    }
  });

  const spotifyWithGenre = spotifyTracks.map(t => {
    if (t.primaryGenreName) return t;
    const key = `${t.artistName.toLowerCase().trim()}::${t.trackName.toLowerCase().trim()}`;
    const genre = itunesGenreMap.get(key);
    return genre ? { ...t, primaryGenreName: genre } : t;
  });

  const combined = dedupe([...spotifyWithGenre, ...itunesTracks, ...mbWithArt]).slice(0, limit);
  return NextResponse.json({ results: combined, resultCount: combined.length });
}
