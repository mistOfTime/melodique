// Spotify data types and helpers

export interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images?: SpotifyImage[];
  genres?: string[];
  followers?: { total: number };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  images: SpotifyImage[];
  release_date: string;
  total_tracks: number;
  album_type: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  preview_url: string | null;
  track_number: number;
  popularity: number;
  explicit: boolean;
}

export function getBestImage(images: SpotifyImage[], size = 300): string {
  if (!images?.length) return "";
  // Find closest to desired size
  const sorted = [...images].sort((a, b) =>
    Math.abs(a.width - size) - Math.abs(b.width - size)
  );
  return sorted[0]?.url ?? images[0]?.url ?? "";
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

// Convert Spotify track to a shape compatible with our player
export interface UnifiedTrack {
  id: string;                  // Spotify track ID
  trackId: number;             // numeric hash for compatibility
  trackName: string;
  artistName: string;
  artistId: string;
  collectionName: string;
  collectionId: string;        // Spotify album ID
  artworkUrl100: string;
  previewUrl: string | null;
  trackTimeMillis: number;
  primaryGenreName: string;
  releaseDate: string;
  trackNumber: number;
  explicit: boolean;
  popularity: number;
  source: "spotify";
}

export function spotifyTrackToUnified(t: SpotifyTrack): UnifiedTrack {
  return {
    id:               t.id,
    trackId:          hashId(t.id),
    trackName:        t.name,
    artistName:       t.artists.map(a => a.name).join(", "),
    artistId:         t.artists[0]?.id ?? "",
    collectionName:   t.album.name,
    collectionId:     t.album.id,
    artworkUrl100:    getBestImage(t.album.images, 100),
    previewUrl:       t.preview_url,
    trackTimeMillis:  t.duration_ms,
    primaryGenreName: "",
    releaseDate:      t.album.release_date,
    trackNumber:      t.track_number,
    explicit:         t.explicit,
    popularity:       t.popularity,
    source:           "spotify",
  };
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
