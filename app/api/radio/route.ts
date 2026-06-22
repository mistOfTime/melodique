export const dynamic = "force-dynamic";
/**
 * Smart Radio Recommendation API
 *
 * Uses Spotify's /v1/recommendations endpoint (client credentials — no user auth needed)
 * to generate genre-matched, popularity-weighted song recommendations.
 *
 * Fallback chain:
 *  1. Spotify /v1/recommendations (best — seeds by artist + genre, popularity filter)
 *  2. Spotify /v1/search with genre:artist query (good — still genre-matched)
 *  3. iTunes genre chart RSS (reliable — always has popular songs)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

interface RadioTrack {
  id: string;
  trackName: string;
  artistName: string;
  artistId: string;
  collectionName: string;
  collectionId: string;
  artworkUrl100: string;
  previewUrl: string | null;
  trackTimeMillis: number;
  releaseDate: string;
  primaryGenreName: string;
  explicit: boolean;
  popularity: number;
  source: "spotify" | "itunes";
}

// Map our genre names to Spotify genre seeds
const GENRE_SEED_MAP: Record<string, string[]> = {
  "Pop":          ["pop", "dance-pop"],
  "Indie Pop":    ["indie-pop", "indie"],
  "Dance Pop":    ["dance-pop", "pop"],
  "Teen Pop":     ["pop"],
  "Hip-Hop/Rap":  ["hip-hop", "rap"],
  "Hip-Hop":      ["hip-hop"],
  "Rap":          ["hip-hop", "rap"],
  "Trap":         ["hip-hop", "trap"],
  "R&B/Soul":     ["r-n-b", "soul"],
  "R&B":          ["r-n-b"],
  "Soul":         ["soul", "r-n-b"],
  "Rock":         ["rock", "classic-rock"],
  "Alternative":  ["alternative", "grunge"],
  "Indie Rock":   ["indie", "alternative"],
  "Hard Rock":    ["hard-rock", "rock"],
  "Metal":        ["metal", "heavy-metal"],
  "Nu-Metal":     ["metal", "alternative"],
  "Metalcore":    ["metal", "alternative"],
  "Punk":         ["punk", "punk-rock"],
  "Pop Punk":     ["punk-rock", "alternative"],
  "Emo":          ["emo", "punk-rock"],
  "Electronic":   ["electronic", "edm"],
  "Dance":        ["dance", "edm"],
  "House":        ["house", "deep-house"],
  "EDM":          ["edm", "electro"],
  "Lo-Fi":        ["lo-fi", "chill"],
  "K-Pop":        ["k-pop"],
  "J-Pop":        ["j-pop"],
  "J-Rock":       ["j-rock"],
  "Latin":        ["latin", "reggaeton"],
  "Reggaeton":    ["reggaeton", "latin"],
  "Country":      ["country"],
  "Classical":    ["classical"],
  "Jazz":         ["jazz"],
  "Blues":        ["blues"],
  "Reggae":       ["reggae"],
  "Anime":        ["anime", "j-pop"],
  "City Pop":     ["j-pop", "city-pop"],
  "OPM":          ["pop", "philippines"],
};

// iTunes genre IDs for chart fallback
const ITUNES_GENRE_IDS: Record<string, number> = {
  "Pop": 14, "Dance Pop": 14, "Teen Pop": 14, "Indie Pop": 14,
  "Hip-Hop/Rap": 18, "Hip-Hop": 18, "Rap": 18, "Trap": 18,
  "R&B/Soul": 15, "R&B": 15, "Soul": 15,
  "Rock": 21, "Alternative": 20, "Indie Rock": 20, "Hard Rock": 21,
  "Metal": 21, "Nu-Metal": 21, "Punk": 21, "Pop Punk": 21, "Emo": 21,
  "Electronic": 7, "Dance": 7, "House": 7, "EDM": 7,
  "K-Pop": 51, "J-Pop": 27, "J-Rock": 27, "Anime": 27,
  "Latin": 12, "Reggaeton": 12,
  "Country": 6,
  "Classical": 5,
  "Jazz": 11,
  "Reggae": 24,
};

async function getSpotifyArtistId(artistName: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.artists?.items?.[0]?.id ?? null;
  } catch { return null; }
}

async function getSpotifyTrackId(artist: string, title: string, token: string): Promise<string | null> {
  try {
    const q = `track:${title.slice(0, 50)} artist:${artist.slice(0, 50)}`;
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.tracks?.items?.[0]?.id ?? null;
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function spotifyTrackToRadio(t: any, genre: string): RadioTrack {
  return {
    id:               `spotify-${t.id}`,
    trackName:        t.name ?? "",
    artistName:       t.artists?.[0]?.name ?? "",
    artistId:         t.artists?.[0]?.id ?? "",
    collectionName:   t.album?.name ?? "",
    collectionId:     `spotify-${t.album?.id ?? ""}`,
    artworkUrl100:    t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? "",
    previewUrl:       t.preview_url ?? null,
    trackTimeMillis:  t.duration_ms ?? 0,
    releaseDate:      t.album?.release_date ?? "",
    primaryGenreName: genre,
    explicit:         t.explicit ?? false,
    popularity:       t.popularity ?? 0,
    source:           "spotify",
  };
}

async function spotifyRecommendations(
  token: string,
  seedArtistId: string | null,
  seedTrackId: string | null,
  seedGenres: string[],
  genre: string,
  limit: number
): Promise<RadioTrack[]> {
  try {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("min_popularity", "40"); // Only popular songs
    params.set("market", "US");

    // Use up to 5 seeds total (Spotify limit)
    if (seedTrackId) params.append("seed_tracks", seedTrackId);
    if (seedArtistId) params.append("seed_artists", seedArtistId);
    seedGenres.slice(0, Math.max(0, 5 - (seedTrackId ? 1 : 0) - (seedArtistId ? 1 : 0))).forEach(g => {
      params.append("seed_genres", g);
    });

    const res = await fetch(
      `https://api.spotify.com/v1/recommendations?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tracks ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => spotifyTrackToRadio(t, genre))
      .filter((t: RadioTrack) => t.artworkUrl100 && t.trackName);
  } catch { return []; }
}

async function spotifySearchRadio(
  token: string,
  query: string,
  genre: string,
  limit: number
): Promise<RadioTrack[]> {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&market=US`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tracks?.items ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((t: any) => t.popularity >= 35 && t.album?.images?.length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => spotifyTrackToRadio(t, genre))
      .sort((a: RadioTrack, b: RadioTrack) => b.popularity - a.popularity);
  } catch { return []; }
}

async function itunesChartFallback(genre: string, limit: number): Promise<RadioTrack[]> {
  const genreId = ITUNES_GENRE_IDS[genre] ?? 14; // default pop
  try {
    const res = await fetch(
      `https://itunes.apple.com/us/rss/topsongs/limit=${limit}/genre=${genreId}/json`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = data.feed?.entry ?? [];
    return entries.map(e => ({
      id:               `itunes-chart-${e.id?.attributes?.["im:id"] ?? Math.random()}`,
      trackName:        e["im:name"]?.label ?? "",
      artistName:       e["im:artist"]?.label ?? "",
      artistId:         "",
      collectionName:   e["im:collection"]?.["im:name"]?.label ?? "",
      collectionId:     e.id?.attributes?.["im:id"] ?? "",
      artworkUrl100:    (e["im:image"]?.[2]?.label ?? "").replace("55x55bb", "300x300bb"),
      previewUrl:       null,
      trackTimeMillis:  0,
      releaseDate:      e["im:releaseDate"]?.label ?? "",
      primaryGenreName: genre,
      explicit:         false,
      popularity:       80, // chart songs are popular by definition
      source:           "itunes" as const,
    })).filter(t => t.trackName && t.artistName && t.artworkUrl100);
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist    = (searchParams.get("artist") ?? "").trim();
  const trackName = (searchParams.get("track") ?? "").trim();
  const genre     = (searchParams.get("genre") ?? "Pop").trim();
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "25"), 50);
  const excludeIds = (searchParams.get("exclude") ?? "").split(",").filter(Boolean);

  const token = await getSpotifyToken();
  let tracks: RadioTrack[] = [];

  if (token) {
    // Resolve seed IDs in parallel
    const [seedArtistId, seedTrackId] = await Promise.all([
      artist ? getSpotifyArtistId(artist, token) : Promise.resolve(null),
      (artist && trackName) ? getSpotifyTrackId(artist, trackName, token) : Promise.resolve(null),
    ]);

    const genreSeeds = GENRE_SEED_MAP[genre]
      ?? GENRE_SEED_MAP[Object.keys(GENRE_SEED_MAP).find(k => genre.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(genre.toLowerCase())) ?? ""]
      ?? ["pop"];

    // Strategy 1: Spotify recommendations (most accurate)
    if (seedArtistId || seedTrackId || genreSeeds.length) {
      tracks = await spotifyRecommendations(token, seedArtistId, seedTrackId, genreSeeds, genre, limit + 10);
    }

    // Strategy 2: Spotify search with artist + genre query
    if (tracks.length < 10) {
      const searchQueries = [
        artist ? `artist:${artist} genre:${genreSeeds[0] ?? "pop"}` : `genre:${genreSeeds[0] ?? "pop"}`,
        `${genre} popular hits`,
        artist ? `${artist} similar` : `${genre} top tracks`,
      ];
      const searchResults = await Promise.all(
        searchQueries.map(q => spotifySearchRadio(token, q, genre, 20))
      );
      const merged = searchResults.flat();
      tracks = [...tracks, ...merged];
    }
  }

  // Strategy 3: iTunes chart fallback
  if (tracks.length < 10) {
    const chartTracks = await itunesChartFallback(genre, limit);
    tracks = [...tracks, ...chartTracks];
  }

  // Deduplicate by track+artist key, filter excluded IDs, sort by popularity
  const seen = new Set<string>();
  const excludeSet = new Set(excludeIds);
  const result = tracks
    .filter(t => {
      if (!t.trackName || !t.artworkUrl100) return false;
      if (excludeSet.has(t.id)) return false;
      const key = `${t.artistName.toLowerCase().trim()}::${t.trackName.toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);

  return NextResponse.json(
    { tracks: result },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
