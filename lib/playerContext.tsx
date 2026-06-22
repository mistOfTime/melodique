"use client";

import React, {
  createContext, useContext, useReducer,
  useEffect, useRef, useCallback,
} from "react";
import { Track, apiToTrack } from "./track";
import { saveListenHistoryToFirestore, loadListenHistoryFromFirestore, subscribeListenHistory, saveNowPlayingToFirestore, subscribeNowPlaying } from "./firestoreSync";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

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
const LISTEN_HISTORY_KEY = "melodique_listen_history";
const RECENT_SONGS_KEY   = "melodique_recent_songs";

/* ── Listening history helpers ─────────────────────────── */
interface PlayRecord {
  artistName: string;
  artistId:   string;
  image:      string;
  genre:      string;
  count:      number;
  lastTs:     number;
}

export function recordPlay(track: Track, fromUser = false) {
  if (typeof window === "undefined") return;
  try {
    const raw     = localStorage.getItem(LISTEN_HISTORY_KEY);
    const records: Record<string, PlayRecord> = raw ? JSON.parse(raw) : {};
    const key     = track.artistName.toLowerCase().trim();
    if (records[key]) {
      records[key].count++;
      records[key].lastTs = Date.now();
      if (track.artworkUrl100) records[key].image = track.artworkUrl100;
    } else {
      records[key] = {
        artistName: track.artistName,
        artistId:   track.artistId ?? "",
        image:      track.artworkUrl100 ?? "",
        genre:      track.primaryGenreName ?? "",
        count:      1,
        lastTs:     Date.now(),
      };
    }
    localStorage.setItem(LISTEN_HISTORY_KEY, JSON.stringify(records));

    // Sync to Firestore if user is signed in
    const uid = auth.currentUser?.uid;
    if (uid) saveListenHistoryToFirestore(uid, records).catch(() => {});

    if (fromUser) {
      const recentRaw  = localStorage.getItem(RECENT_SONGS_KEY);
      const recent: Track[] = recentRaw ? JSON.parse(recentRaw) : [];
      const deduped = [track, ...recent.filter(t => t.id !== track.id)].slice(0, 50);
      localStorage.setItem(RECENT_SONGS_KEY, JSON.stringify(deduped));
    }
  } catch { /* ignore */ }
}

export function getTopArtists(limit = 10): { name: string; id: string; image: string; playCount: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LISTEN_HISTORY_KEY);
    if (!raw) return [];
    const records: Record<string, PlayRecord> = JSON.parse(raw);
    return Object.values(records)
      .filter(r => r.count > 0 && r.artistName)
      .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
      .slice(0, limit)
      // Deduplicate by normalized name
      .filter((r, i, arr) => {
        const normalized = r.artistName.toLowerCase().trim();
        return arr.findIndex(x => x.artistName.toLowerCase().trim() === normalized) === i;
      })
      .map(r => ({
        name:      r.artistName,
        id:        r.artistId || r.artistName,
        // Use best quality image — prefer non-empty, non-default
        image:     r.image && r.image.length > 10 ? r.image : "",
        playCount: r.count,
      }));
  } catch { return []; }
}

export function getRecentSongs(limit = 20): Track[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SONGS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Track[]).slice(0, limit);
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
  // Parse [mm:ss.xx] or [mm:ss.xxx] timestamps
  for (const line of lrc.split("\n")) {
    const m = line.match(/\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (m) {
      const time = parseInt(m[1]) * 60 + parseFloat(`${m[2]}.${m[3]}`);
      const text = m[4].trim();
      if (text) lines.push({ time, text });
    }
  }
  // Remove duplicate timestamps (some LRC files have [00:00.00] header lines)
  return lines.filter((l, i) => i === 0 || l.time !== lines[i - 1].time);
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

  // Hydrate listen history from Firestore on sign-in + subscribe to now-playing from other devices
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
    let unsubNowPlaying: (() => void) | null = null;
    const lastUpdateRef = { ts: 0 }; // prevent echo from our own writes

    const unsub = onAuthStateChanged(auth, async (fb) => {
      if (unsubNowPlaying) { unsubNowPlaying(); unsubNowPlaying = null; }
      if (fb) {
        // Load listen history from Firestore
        try {
          const remote = await loadListenHistoryFromFirestore(fb.uid);
          if (remote) {
            const localRaw = localStorage.getItem(LISTEN_HISTORY_KEY);
            const local: Record<string, PlayRecord> = localRaw ? JSON.parse(localRaw) : {};
            const merged = { ...local };
            Object.entries(remote).forEach(([k, r]) => {
              const rec = r as PlayRecord;
              if (merged[k]) {
                merged[k] = { ...merged[k], count: Math.max(merged[k].count, rec.count), lastTs: Math.max(merged[k].lastTs, rec.lastTs) };
              } else { merged[k] = rec; }
            });
            localStorage.setItem(LISTEN_HISTORY_KEY, JSON.stringify(merged));
          }
        } catch { /* ignore */ }

        // Subscribe to now-playing from other devices
        unsubNowPlaying = subscribeNowPlaying(fb.uid, (np) => {
          // Only apply if it's from another device (not our own write from last 3s)
          if (Date.now() - lastUpdateRef.ts < 3000) return;
          if (!np?.queue?.length) return;
          dispatch({ type: "SET_QUEUE", payload: { songs: np.queue, startIndex: np.currentIndex ?? 0 } });
          dispatch({ type: "SET_PLAYING", payload: false }); // don't auto-play on remote device
        });
      }
    });
    return () => { unsub(); if (unsubNowPlaying) unsubNowPlaying(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  // Fetch YouTube ID when song changes + record play + sync now-playing to Firestore
  useEffect(() => {
    if (!currentSong) return;
    recordPlay(currentSong, state.currentIndex < state.queue.length - 20);
    dispatch({ type: "SET_YT_STATUS", payload: "loading" });
    fetchYouTubeId(currentSong.artistName, currentSong.trackName, currentSong.id)
      .then(id => dispatch({ type: "SET_YT_VIDEO", payload: { videoId: id, status: id ? "ready" : "error" } }));
    // Save to Firestore so other devices know what's playing
    const uid = auth.currentUser?.uid;
    if (uid) {
      saveNowPlayingToFirestore(uid, {
        queue:        state.queue.slice(0, 50),
        currentIndex: state.currentIndex,
        trackName:    currentSong.trackName,
        artistName:   currentSong.artistName,
      }).catch(() => {});
    }
  }, [currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch lyrics when song changes — pass duration for better matching
  useEffect(() => {
    if (!currentSong) return;
    dispatch({ type: "SET_LYRICS_LOADING", payload: true });
    const params = new URLSearchParams({
      artist: currentSong.artistName,
      title:  currentSong.trackName,
    });
    if (currentSong.trackTimeMillis) {
      params.set("duration", String(currentSong.trackTimeMillis));
    }
    fetch(`/api/lyrics?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        const synced = data.synced ? parseLRC(data.synced) : [];
        dispatch({ type: "SET_LYRICS", payload: { synced, plain: data.plain } });
      })
      .catch(() => dispatch({ type: "SET_LYRICS", payload: { synced: [], plain: null } }));
  }, [currentSong?.id]);

  // Preload artwork for next 3 upcoming songs (reduces blank cover flash)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const upcoming = state.queue.slice(state.currentIndex + 1, state.currentIndex + 4);
    upcoming.forEach(song => {
      if (!song.artworkUrl100) return;
      const sizes = [300, 600];
      sizes.forEach(size => {
        const url = song.artworkUrl100
          .replace("100x100bb", `${size}x${size}bb`)
          .replace("100x100", `${size}x${size}`);
        if (url) {
          const img = new window.Image();
          img.src = url;
        }
      });
    });
  }, [state.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active lyric line using real currentTime
  // Use a 0.3s look-ahead so lyrics highlight just before the line is spoken (Spotify-style)
  useEffect(() => {
    if (!state.lyrics.length) return;
    const t = state.currentTime + 0.3; // slight look-ahead
    let idx = 0;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (t >= state.lyrics[i].time) idx = i;
      else break;
    }
    if (idx !== state.currentLyricIndex) {
      dispatch({ type: "SET_LYRIC_INDEX", payload: idx });
    }
  }, [state.currentTime, state.lyrics, state.currentLyricIndex]);

  // ── Smart Radio System ─────────────────────────────────────────
  // Maintains a 50-song play history to avoid replays.
  // Pre-fills 20 recommended songs in advance using /api/radio.
  // Uses Spotify Recommendations API → Spotify Search → iTunes charts as fallback.
  const radioFetching    = useRef(false);
  const playHistoryRef   = useRef<string[]>([]); // last 50 played track IDs

  // Track every played song in history
  useEffect(() => {
    if (!currentSong) return;
    playHistoryRef.current = [
      currentSong.id,
      ...playHistoryRef.current.filter(id => id !== currentSong.id),
    ].slice(0, 50);
  }, [currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger radio fill: keep at least 8 songs ahead, pre-fill up to 20
  useEffect(() => {
    if (!currentSong) return;
    const remaining = state.queue.length - 1 - state.currentIndex;
    if (remaining > 8 || radioFetching.current) return;

    const genre  = currentSong.primaryGenreName || "Pop";
    const artist = currentSong.artistName ?? "";
    const track  = currentSong.trackName ?? "";

    // Detect Japanese/Korean — override genre for better results
    const isJapanese = /[\u3040-\u30FF\u4E00-\u9FFF]/.test(artist + track);
    const isKorean   = /[\uAC00-\uD7A3]/.test(artist + track);
    const effectiveGenre = isKorean ? "K-Pop" : isJapanese ? "J-Pop" : genre;

    // Build exclude list: current queue IDs + play history
    const queueIds    = state.queue.map((s: Track) => s.id);
    const recentIds   = playHistoryRef.current;
    const excludeIds  = Array.from(new Set([...queueIds, ...recentIds])).slice(0, 100);

    // Artist frequency check — avoid same artist more than twice in next 10
    const upcomingArtists = state.queue
      .slice(state.currentIndex + 1, state.currentIndex + 11)
      .map((s: Track) => s.artistName.toLowerCase());
    const artistCounts = new Map<string, number>();
    upcomingArtists.forEach(a => artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1));

    radioFetching.current = true;

    const params = new URLSearchParams({
      artist:  artist,
      track:   track,
      genre:   effectiveGenre,
      limit:   "25",
      exclude: excludeIds.join(","),
    });

    fetch(`/api/radio?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        const incoming: Track[] = (data.tracks ?? []).map(apiToTrack);

        // Final filtering: ensure artwork, not in history, not duplicate artist too often
        const existingSet = new Set(queueIds);
        const historySet  = new Set(recentIds);

        const filtered = incoming.filter((s: Track) => {
          if (!s.artworkUrl100 || s.artworkUrl100.length < 10) return false;
          if (existingSet.has(s.id)) return false;
          if (historySet.has(s.id)) return false;
          // Max 2 of same artist in upcoming queue
          const count = artistCounts.get(s.artistName.toLowerCase()) ?? 0;
          if (count >= 2) return false;
          artistCounts.set(s.artistName.toLowerCase(), count + 1);
          existingSet.add(s.id);
          return true;
        });

        // Add up to 20 fresh songs to queue
        filtered.slice(0, 20).forEach((s: Track) =>
          dispatch({ type: "ADD_TO_QUEUE", payload: s })
        );
      })
      .catch(() => {})
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
