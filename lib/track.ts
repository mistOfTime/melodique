// Universal track — works for iTunes and MusicBrainz

export interface Track {
  id: string;
  trackId: number;          // numeric hash
  trackName: string;
  artistName: string;
  artistId: string;
  collectionName: string;
  collectionId: string;
  artworkUrl100: string;
  previewUrl: string | null;
  trackTimeMillis: number;
  primaryGenreName: string;
  releaseDate: string;
  trackNumber: number;
  explicit?: boolean;
  source: "itunes" | "musicbrainz" | "spotify";
}

export function formatTrackTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

// Convert unified search result → Track
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apiToTrack(t: any): Track {
  return {
    id:              t.id ?? String(t.trackId ?? Math.random()),
    trackId:         t.trackId ?? strHash(t.id ?? ""),
    trackName:       t.trackName ?? t.name ?? "",
    artistName:      t.artistName ?? "",
    artistId:        t.artistId ?? "",
    collectionName:  t.collectionName ?? "",
    collectionId:    String(t.collectionId ?? ""),
    artworkUrl100:   t.artworkUrl100 ?? "",
    previewUrl:      t.previewUrl ?? null,
    trackTimeMillis: t.trackTimeMillis ?? 0,
    primaryGenreName: t.primaryGenreName ?? "",
    releaseDate:     t.releaseDate ?? "",
    trackNumber:     t.trackNumber ?? 0,
    explicit:        t.explicit ?? false,
    source:          t.source ?? "itunes",
  };
}

// Kept for compatibility
export function spotifyToTrack(t: Record<string, unknown>): Track {
  return apiToTrack(t);
}

export function dedupeAlbums<T extends { collectionId: string; collectionName?: string; artistName?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(t => {
    const artist = (t.artistName ?? "").toLowerCase().trim();
    const album  = (t.collectionName ?? "").toLowerCase().trim()
      .replace(/\s*\(.*?\)/g, "")
      .replace(/\s*\[.*?\]/g, "");
    const key = `${artist}::${album}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getArtwork(url: string, size = 300): string {
  if (!url || url.trim() === "") {
    // Dark music note SVG as data URI — instant, no network request
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%231a1a2e'/%3E%3Cpath d='M40 30v28a8 8 0 1 0 6 0V38l18-5v22a8 8 0 1 0 6 0V26z' fill='%23ffffff20'/%3E%3C/svg%3E`;
  }
  // iTunes URL pattern — replace any size
  const itunesMatch = url.match(/(\d+x\d+bb)/);
  if (itunesMatch) return url.replace(itunesMatch[1], `${size}x${size}bb`);
  if (url.includes("100x100")) return url.replace(/100x100/g, `${size}x${size}`);
  // Spotify CDN — already full size, return as-is
  if (url.includes("i.scdn.co") || url.includes("mosaic.scdn.co")) return url;
  // MusicBrainz cover art archive
  if (url.includes("coverartarchive.org")) {
    return url.replace(/front-\d+/, `front-${size >= 400 ? 1200 : 500}`);
  }
  return url;
}
