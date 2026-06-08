export interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  artworkUrl60: string;
  previewUrl: string | null;
  trackTimeMillis: number;
  primaryGenreName: string;
  releaseDate: string;
  collectionId: number;
  trackNumber: number;
  collectionArtistName?: string;
}

export interface ItunesResult {
  resultCount: number;
  results: ItunesTrack[];
}

export function getArtwork(url: string, size = 400): string {
  return url.replace("100x100", `${size}x${size}`);
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Popular search terms covering 2010–2026
export const FEATURED_SEARCHES = [
  "Taylor Swift",
  "The Weeknd",
  "Billie Eilish",
  "Drake",
  "Ariana Grande",
  "Olivia Rodrigo",
  "Bad Bunny",
  "Harry Styles",
  "Doja Cat",
  "Post Malone",
  "Kendrick Lamar",
  "SZA",
  "Dua Lipa",
  "Ed Sheeran",
  "Sabrina Carpenter",
  "Beyoncé",
  "Bruno Mars",
  "Rihanna",
  "Justin Bieber",
  "Adele",
];

export const GENRE_SEARCHES: Record<string, string> = {
  "Pop":       "pop hits 2024",
  "Hip-Hop":   "hip hop rap 2024",
  "R&B":       "rnb soul 2024",
  "Rock":      "rock alternative 2024",
  "Electronic":"electronic dance 2024",
  "Latin":     "latin reggaeton 2024",
  "K-Pop":     "kpop 2024",
  "Indie":     "indie folk 2024",
};
