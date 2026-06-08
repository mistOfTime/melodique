"use client";

import React, {
  createContext, useContext, useReducer,
  useEffect, useRef, useCallback,
} from "react";
import { Track, apiToTrack } from "./track";

export interface LyricLine { time: number; text: string; }

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  shuffleHistory: number[];  // tracks already played in shuffle mode
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  currentTime: number;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  showLyrics: boolean;
  lyrics: LyricLine[];
  currentLyricIndex: number;
  lyricsLoading: boolean;
  plainLyrics: string | null;
  ytVideoId: string | null;
  ytStatus: "idle" | "loading" | "ready" | "error";
}

type Action =
  | { type: "SET_QUEUE";         payload: { songs: Track[]; startIndex?: number } }
  | { type: "PLAY_SONG";         payload: Track }
  | { type: "ADD_TO_QUEUE";      payload: Track }
  | { type: "TOGGLE_PLAY" }
  | { type: "SET_PLAYING";       payload: boolean }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "SET_VOLUME";        payload: number }
  | { type: "SET_PROGRESS";      payload: number }
  | { type: "SET_DURATION";      payload: number }
  | { type: "SET_CURRENT_TIME";  payload: number }
  | { type: "TOGGLE_SHUFFLE" }
  | { type: "CYCLE_REPEAT" }
  | { type: "TOGGLE_LYRICS" }
  | { type: "SET_LYRICS";        payload: { synced: LyricLine[]; plain: string | null } }
  | { type: "SET_LYRICS_LOADING"; payload: boolean }
  | { type: "SET_LYRIC_INDEX";   payload: number }
  | { type: "SET_YT_VIDEO";      payload: { videoId: string | null; status: PlayerState["ytStatus"] } }
  | { type: "SET_YT_STATUS";     payload: PlayerState["ytStatus"] }
  | { type: "SET_FADE";         payload: number }; // 0-1 volume multiplier for crossfade

const PLAYER_STORAGE_KEY = "melodique_player_state_v1";
const LISTEN_HISTORY_KEY  = "melodique_listen_history";

// Track a play in listening history (for "Top Artists" feature)
export function recordPlay(track: Track) {
  if (typeof window === "undefined") return;
  try {
    const raw  = localStorage.getItem(LISTEN_HISTORY_KEY);
    const hist = raw ? JSON.parse(raw) as { id: string; artistName: string; artistId: string; artworkUrl100: string; ts: number }[] : [];
    hist.unshift({ id: track.id, artistName: track.artistName, artistId: track.artistId, artworkUrl100: track.artworkUrl100, ts: Date.now() });
    // Keep last 500 plays
    localStorage.setItem(LISTEN_HISTORY_KEY, JSON.stringify(hist.slice(0, 500)));
  } catch { /* ignore */ }
}

export function getTopArtists(days = 30, limit = 10): { name: string; id: string; image: string; playCount: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw  = localStorage.getItem(LISTEN_HISTORY_KEY);
    if (!raw) return [];
    const hist = JSON.parse(raw) as { artistName: string; artistId: string; artworkUrl100: string; ts: number }[];
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const counts = new Map<string, { name: string; id: string; image: string; count: number }>();
    for (const h of hist) {
      if (h.ts < since) continue;
      const key = h.artistName.toLowerCase().trim();
      const existing = counts.get(key);
      if (existing) { existing.count++; }
      else { counts.set(key, { name: h.artistName, id: h.artistId ?? h.artistName, image: h.artworkUrl100 ?? "", count: 1 }); }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(a => ({ name: a.name, id: a.id, image: a.image, playCount: a.count }));
  } catch { return []; }
}

interface PersistedPlayerState {
  queue: Track[];
  currentIndex: number;
  volume: number;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
}

function loadPlayerState(): Partial<PlayerState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as PersistedPlayerState;
    return {
      queue:        p.queue ?? [],
      currentIndex: p.currentIndex ?? 0,
      volume:       p.volume ?? 0.8,
      shuffle:      p.shuffle ?? false,
      repeat:       p.repeat ?? "none",
      isPlaying:    false, // always start paused on reload
    };
  } catch { return {}; }
}

function savePlayerState(state: PlayerState) {
  if (typeof window === "undefined") return;
  try {
    const p: PersistedPlayerState = {
      queue:        state.queue,
      currentIndex: state.currentIndex,
      volume:       state.volume,
      shuffle:      state.shuffle,
      repeat:       state.repeat,
    };
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(p));
  } catch { /* storage full */ }
}

const initialState: PlayerState = {
  queue: [], currentIndex: 0,
  shuffleHistory: [],
  isPlaying: false, volume: 0.8,
  progress: 0, duration: 0, currentTime: 0,
  shuffle: false, repeat: "none",
  showLyrics: false,
  lyrics: [], currentLyricIndex: 0,
  lyricsLoading: false, plainLyrics: null,
  ytVideoId: null, ytStatus: "idle",
};

function clearSong(): Partial<PlayerState> {
  return { progress: 0, currentTime: 0, duration: 0, lyrics: [], plainLyrics: null, ytVideoId: null, ytStatus: "loading" };
}

function pickRandom(queueLen: number, current: number, history: number[]): number {
  if (queueLen <= 1) return 0;
  // Avoid replaying recently played songs (keep last 40% of queue in history)
  const maxHistory = Math.max(1, Math.floor(queueLen * 0.4));
  const recent = history.slice(-maxHistory);
  const candidates = Array.from({ length: queueLen }, (_, i) => i)
    .filter(i => i !== current && !recent.includes(i));
  // If all songs have been played recently, reset and just avoid current
  const pool = candidates.length > 0 ? candidates : Array.from({ length: queueLen }, (_, i) => i).filter(i => i !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case "SET_QUEUE":
      return { ...state, ...clearSong(), queue: action.payload.songs, currentIndex: action.payload.startIndex ?? 0, shuffleHistory: [], isPlaying: true, showLyrics: true };
    case "PLAY_SONG": {
      const idx = state.queue.findIndex(s => s.id === action.payload.id);
      if (idx !== -1) return { ...state, ...clearSong(), currentIndex: idx, shuffleHistory: [...state.shuffleHistory, idx], isPlaying: true, showLyrics: true };
      return { ...state, ...clearSong(), queue: [action.payload, ...state.queue], currentIndex: 0, shuffleHistory: [0], isPlaying: true, showLyrics: true };
    }
    case "ADD_TO_QUEUE":    return { ...state, queue: [...state.queue, action.payload] };
    case "TOGGLE_PLAY":     return { ...state, isPlaying: !state.isPlaying };
    case "SET_PLAYING":     return { ...state, isPlaying: action.payload };
    case "NEXT": {
      if (!state.queue.length) return state;
      if (state.shuffle) {
        const next = pickRandom(state.queue.length, state.currentIndex, state.shuffleHistory);
        return { ...state, ...clearSong(), currentIndex: next, shuffleHistory: [...state.shuffleHistory, next], isPlaying: true };
      }
      let next = state.currentIndex + 1;
      if (next >= state.queue.length) next = state.repeat === "all" ? 0 : state.queue.length - 1;
      return { ...state, ...clearSong(), currentIndex: next, isPlaying: true };
    }
    case "PREV": {
      if (!state.queue.length) return state;
      if (state.currentTime > 3) return { ...state, ...clearSong(), currentIndex: state.currentIndex, isPlaying: true };
      // In shuffle mode, go back in history
      if (state.shuffle && state.shuffleHistory.length > 1) {
        const newHistory = state.shuffleHistory.slice(0, -1);
        const prev = newHistory[newHistory.length - 1];
        return { ...state, ...clearSong(), currentIndex: prev, shuffleHistory: newHistory, isPlaying: true };
      }
      let prev = state.currentIndex - 1;
      if (prev < 0) prev = state.repeat === "all" ? state.queue.length - 1 : 0;
      return { ...state, ...clearSong(), currentIndex: prev, isPlaying: true };
    }
    case "SET_VOLUME":       return { ...state, volume: action.payload };
    case "SET_PROGRESS":     return { ...state, progress: action.payload };
    case "SET_DURATION":     return { ...state, duration: action.payload };
    case "SET_CURRENT_TIME": return { ...state, currentTime: action.payload };
    case "TOGGLE_SHUFFLE":   return { ...state, shuffle: !state.shuffle, shuffleHistory: [state.currentIndex] };
    case "CYCLE_REPEAT": {
      const order: PlayerState["repeat"][] = ["none","all","one"];
      return { ...state, repeat: order[(order.indexOf(state.repeat) + 1) % 3] };
    }
    case "TOGGLE_LYRICS":    return { ...state, showLyrics: !state.showLyrics };
    case "SET_LYRICS":       return { ...state, lyrics: action.payload.synced, plainLyrics: action.payload.plain, lyricsLoading: false };
    case "SET_LYRICS_LOADING": return { ...state, lyricsLoading: action.payload };
    case "SET_LYRIC_INDEX":  return { ...state, currentLyricIndex: action.payload };
    case "SET_YT_VIDEO":     return { ...state, ytVideoId: action.payload.videoId, ytStatus: action.payload.status };
    case "SET_YT_STATUS":    return { ...state, ytStatus: action.payload };
    case "SET_FADE":         return { ...state, volume: state.volume }; // handled in YouTubePlayer directly
    default: return state;
  }
}

function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const line of lrc.split("\n")) {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (m) {
      const time = parseInt(m[1]) * 60 + parseFloat(`${m[2]}.${m[3]}`);
      const text = m[4].trim();
      if (text) lines.push({ time, text });
    }
  }
  return lines;
}

const videoIdCache = new Map<string, string | null>();

async function fetchYouTubeId(artist: string, title: string, id: string): Promise<string | null> {
  if (videoIdCache.has(id)) return videoIdCache.get(id)!;
  try {
    const res = await fetch(
      `/api/ytid?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (res.ok) {
      const data = await res.json();
      videoIdCache.set(id, data.videoId ?? null);
      return data.videoId ?? null;
    }
  } catch { /* ignore */ }
  videoIdCache.set(id, null);
  return null;
}

interface PlayerContextValue {
  state: PlayerState;
  currentSong: Track | null;
  playSong:    (song: Track) => void;
  playQueue:   (songs: Track[], startIndex?: number) => void;
  addToQueue:  (song: Track) => void;
  togglePlay:  () => void;
  next:        () => void;
  prev:        () => void;
  setVolume:   (v: number) => void;
  seek:        (fraction: number) => void;
  toggleShuffle: () => void;
  cycleRepeat:   () => void;
  toggleLyrics:  () => void;
  dispatch: React.Dispatch<Action>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const currentSong = state.queue[state.currentIndex] ?? null;
  const hydrated = useRef(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const saved = loadPlayerState();
    if (saved.queue && saved.queue.length > 0) {
      // Restore queue without auto-playing — patch directly to avoid SET_QUEUE resetting isPlaying
      dispatch({ type: "SET_QUEUE", payload: { songs: saved.queue, startIndex: saved.currentIndex ?? 0 } });
      // Immediately pause — SET_QUEUE sets isPlaying:true, so override it
      setTimeout(() => dispatch({ type: "SET_PLAYING", payload: false }), 0);
      if (saved.volume !== undefined) dispatch({ type: "SET_VOLUME", payload: saved.volume });
      // Restore shuffle state
      if (saved.shuffle) dispatch({ type: "TOGGLE_SHUFFLE" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist queue/index/volume/shuffle/repeat whenever they change
  useEffect(() => {
    if (!hydrated.current) return;
    savePlayerState(state);
  }, [state.queue, state.currentIndex, state.volume, state.shuffle, state.repeat]);

  // Fetch YouTube ID when song changes + record play
  useEffect(() => {
    if (!currentSong) return;
    // Record this play in listening history
    recordPlay(currentSong);
    dispatch({ type: "SET_YT_STATUS", payload: "loading" });
    fetchYouTubeId(currentSong.artistName, currentSong.trackName, currentSong.id)
      .then(id => dispatch({ type: "SET_YT_VIDEO", payload: { videoId: id, status: id ? "ready" : "error" } }));
  }, [currentSong?.id]);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!currentSong) return;
    dispatch({ type: "SET_LYRICS_LOADING", payload: true });
    fetch(`/api/lyrics?artist=${encodeURIComponent(currentSong.artistName)}&title=${encodeURIComponent(currentSong.trackName)}`)
      .then(r => r.json())
      .then(data => {
        const synced = data.synced ? parseLRC(data.synced) : [];
        dispatch({ type: "SET_LYRICS", payload: { synced, plain: data.plain } });
      })
      .catch(() => dispatch({ type: "SET_LYRICS", payload: { synced: [], plain: null } }));
  }, [currentSong?.id]);

  // Sync active lyric line using real currentTime
  useEffect(() => {
    if (!state.lyrics.length) return;
    const t = state.currentTime;
    let idx = 0;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (t >= state.lyrics[i].time) idx = i;
      else break;
    }
    if (idx !== state.currentLyricIndex) {
      dispatch({ type: "SET_LYRIC_INDEX", payload: idx });
    }
  }, [state.currentTime, state.lyrics, state.currentLyricIndex]);

  // Genre radio — when within 2 songs of queue end, auto-fetch more from same genre
  const radioFetching = useRef(false);
  useEffect(() => {
    if (!currentSong) return;
    const remaining = state.queue.length - 1 - state.currentIndex;
    if (remaining > 2 || radioFetching.current) return;

    const rawGenre = currentSong.primaryGenreName ?? "";
    const artist   = currentSong.artistName ?? "";

    // Map iTunes genre tags → popular search queries for better results
    const GENRE_QUERIES: Record<string, string[]> = {
      "Metal":              ["metal bands", "heavy metal", "death metal"],
      "Nu-Metal":           ["nu metal", "korn linkin park", "nu metal bands"],
      "Hard Rock":          ["hard rock bands", "classic hard rock"],
      "Rock":               ["rock bands", "classic rock hits"],
      "Alternative":        ["alternative rock", "indie rock"],
      "Indie Rock":         ["indie rock", "indie alternative"],
      "Pop":                ["pop hits", "top pop songs"],
      "Hip-Hop/Rap":        ["hip hop rap", "rap songs"],
      "Hip-Hop":            ["hip hop", "trap rap"],
      "Rap":                ["rap", "trap music"],
      "R&B/Soul":           ["rnb soul", "r&b music"],
      "Electronic":         ["electronic music", "edm"],
      "Dance":              ["dance music", "edm hits"],
      "K-Pop":              ["kpop", "korean pop"],
      "Latin":              ["latin pop", "reggaeton"],
      "Reggae":             ["reggae", "dancehall"],
      "Country":            ["country music", "country hits"],
      "Jazz":               ["jazz music", "jazz songs"],
      "Classical":          ["classical music", "orchestra"],
      "Punk":               ["punk rock", "punk bands"],
      "Emo":                ["emo music", "emo bands"],
      "Screamo":            ["screamo bands", "post-hardcore"],
      "Metalcore":          ["metalcore bands", "metalcore"],
      "Indie Pop":          ["indie pop", "indie music"],
      "Dream Pop":          ["dream pop", "shoegaze"],
      "Lo-Fi":              ["lo-fi hip hop", "chill lo-fi"],
    };

    // Find matching query, fallback to artist + genre, then just genre
    const matchedKey = Object.keys(GENRE_QUERIES).find(k =>
      rawGenre.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(rawGenre.toLowerCase())
    );
    const queries = matchedKey ? GENRE_QUERIES[matchedKey] : null;
    const query = queries
      ? queries[Math.floor(Math.random() * queries.length)]
      : rawGenre || artist;

    if (!query) return;
    radioFetching.current = true;
    fetch(`/api/music/search?q=${encodeURIComponent(query)}&limit=25`)
      .then(r => r.json())
      .then(data => {
        if (!data.results?.length) return;
        const incoming: Track[] = data.results.map(apiToTrack);
        const existingIds = new Set(state.queue.map((s: Track) => s.id));
        const fresh = incoming.filter((s: Track) => !existingIds.has(s.id));
        if (fresh.length > 0) {
          fresh.forEach((s: Track) => dispatch({ type: "ADD_TO_QUEUE", payload: s }));
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => { radioFetching.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentIndex, state.queue.length]);

  const playSong     = useCallback((song: Track)  => dispatch({ type: "PLAY_SONG",  payload: song }), []);
  const playQueue    = useCallback((songs: Track[], startIndex?: number) =>
    dispatch({ type: "SET_QUEUE", payload: { songs, startIndex } }), []);
  const addToQueue   = useCallback((song: Track)  => dispatch({ type: "ADD_TO_QUEUE", payload: song }), []);
  const togglePlay   = useCallback(() => dispatch({ type: "TOGGLE_PLAY" }), []);
  const next         = useCallback(() => dispatch({ type: "NEXT" }), []);
  const prev         = useCallback(() => dispatch({ type: "PREV" }), []);
  const setVolume    = useCallback((v: number) => dispatch({ type: "SET_VOLUME", payload: v }), []);
  const seek         = useCallback((f: number) => dispatch({ type: "SET_PROGRESS", payload: f }), []);
  const toggleShuffle = useCallback(() => dispatch({ type: "TOGGLE_SHUFFLE" }), []);
  const cycleRepeat  = useCallback(() => dispatch({ type: "CYCLE_REPEAT" }), []);
  const toggleLyrics = useCallback(() => dispatch({ type: "TOGGLE_LYRICS" }), []);

  return (
    <PlayerContext.Provider value={{
      state, currentSong,
      playSong, playQueue, addToQueue,
      togglePlay, next, prev,
      setVolume, seek,
      toggleShuffle, cycleRepeat, toggleLyrics,
      dispatch,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
