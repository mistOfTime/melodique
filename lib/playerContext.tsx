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

  // Genre radio — when within 2 songs of queue end, fetch more genre-matched songs
  const radioFetching = useRef(false);
  useEffect(() => {
    if (!currentSong) return;
    const remaining = state.queue.length - 1 - state.currentIndex;
    if (remaining > 2 || radioFetching.current) return;

    const genre  = currentSong.primaryGenreName ?? "";
    const artist = currentSong.artistName ?? "";
    const lang   = /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]/.test(artist + currentSong.trackName);

    // Popular artist + era queries per genre — 2000s to 2026
    const GENRE_POPULAR: Record<string, string[]> = {
      "Metal":        ["Metallica Master of Puppets", "Slayer Raining Blood", "Iron Maiden Run to the Hills", "Pantera Walk", "Black Sabbath Paranoid", "Lamb of God popular", "Megadeth Symphony of Destruction"],
      "Nu-Metal":     ["Linkin Park In the End", "Korn Freak on a Leash", "System of a Down Chop Suey", "Slipknot Duality", "Papa Roach Last Resort", "Limp Bizkit Nookie", "Disturbed Down with the Sickness"],
      "Hard Rock":    ["AC DC Back in Black", "Guns N Roses Welcome to the Jungle", "Aerosmith Dream On", "Led Zeppelin Stairway to Heaven", "Bon Jovi Livin on a Prayer", "Queen Bohemian Rhapsody", "Van Halen Jump"],
      "Alternative":  ["Nirvana Smells Like Teen Spirit", "Foo Fighters Best of You", "Pearl Jam Alive", "Soundgarden Black Hole Sun", "Alice in Chains Rooster", "Red Hot Chili Peppers Californication", "Stone Temple Pilots Plush"],
      "Indie Rock":   ["Arctic Monkeys Do I Wanna Know", "The Strokes Last Nite", "Tame Impala The Less I Know the Better", "Radiohead Creep", "The 1975 Somebody Else", "Vampire Weekend A Punk", "Interpol Obstacle 1"],
      "Rock":         ["Green Day Boulevard of Broken Dreams", "The Killers Mr Brightside", "Coldplay The Scientist", "U2 With or Without You", "Muse Supermassive Black Hole", "Oasis Wonderwall", "Beck Loser"],
      "Metalcore":    ["Bring Me The Horizon Throne", "Asking Alexandria The Final Episode", "A Day To Remember Homesick", "Of Mice and Men popular", "Parkway Drive Carrion", "August Burns Red popular"],
      "Emo":          ["My Chemical Romance Welcome to the Black Parade", "Fall Out Boy Sugar We're Goin Down", "Panic at the Disco I Write Sins Not Tragedies", "Dashboard Confessional Vindicated", "Taking Back Sunday MakeDamnSure"],
      "Punk":         ["Green Day American Idiot", "Blink-182 All the Small Things", "Sum 41 Fat Lip", "The Offspring Come Out and Play", "Bad Religion popular", "NOFX popular"],
      "Pop Punk":     ["Paramore Misery Business", "New Found Glory popular", "Simple Plan Perfect", "Good Charlotte The Anthem", "All Time Low Dear Maria Count Me In"],

      "Hip-Hop/Rap":  ["Drake God's Plan", "Kendrick Lamar HUMBLE", "J Cole No Role Modelz", "Travis Scott Sicko Mode", "Post Malone Rockstar", "Cardi B WAP", "Nicki Minaj Super Bass", "Kanye West Gold Digger", "Jay-Z 99 Problems", "Lil Wayne How to Love", "Wiz Khalifa Work Hard Play Hard", "Meek Mill Dreams and Nightmares"],
      "Hip-Hop":      ["Eminem Lose Yourself", "Jay Z Empire State of Mind", "Lil Wayne A Milli", "50 Cent In Da Club", "Snoop Dogg Beautiful", "Outkast Hey Ya", "Missy Elliott Work It", "Ludacris Stand Up", "T.I. Whatever You Like", "Fabolous Make Me Better", "Rick Ross Stay Schemin", "Big Sean Blessings"],
      "Rap":          ["21 Savage Rockstar", "Future Mask Off", "Lil Uzi Vert XO Tour Llif3", "Roddy Ricch The Box", "Gunna Drip Too Hard", "Young Thug Wyclef Jean", "Playboi Carti Magnolia"],
      "Trap":         ["Migos Bad and Boujee", "Gucci Mane popular", "Chief Keef I Don't Like", "Fetty Wap Trap Queen", "2 Chainz No Lie", "Rae Sremmurd No Flex Zone"],

      "R&B/Soul":     ["Ne-Yo So Sick", "Mariah Carey We Belong Together", "Usher Yeah", "Beyonce Crazy in Love", "Alicia Keys No One", "John Legend All of Me", "Bruno Mars Treasure", "The Weeknd Earned It", "SZA Kill Bill", "Frank Ocean Thinkin Bout You", "Mary J Blige Real Love", "R Kelly Ignition", "Destiny's Child Say My Name"],
      "R&B":          ["Ne-Yo Because of You", "Mariah Carey Obsessed", "Usher Confessions Part II", "Chris Brown No Guidance", "Trey Songz Mr Steal Your Girl", "Mario Let Me Love You", "Omarion Ice Box", "Ciara Goodies", "Fantasia When I See U", "Tank When We", "Ginuwine Pony", "Joe All That I Am", "Maxwell Fortunate"],
      "Soul":         ["Amy Winehouse Back to Black", "Adele Rolling in the Deep", "Sam Cooke A Change Is Gonna Come", "Marvin Gaye Sexual Healing", "Al Green Lets Stay Together", "Stevie Wonder Superstition", "Aretha Franklin Respect", "Ray Charles Georgia on My Mind", "Otis Redding Try a Little Tenderness", "Bill Withers Lovely Day"],

      "Pop":          ["Taylor Swift Shake It Off", "Dua Lipa Levitating", "Ariana Grande thank u next", "Ed Sheeran Shape of You", "Harry Styles As It Was", "Billie Eilish Bad Guy", "Olivia Rodrigo drivers license", "Sabrina Carpenter Espresso"],
      "Indie Pop":    ["Clairo Pretty Girl", "Rex Orange County Loving Is Easy", "Still Woozy Goodie Bag", "Phoebe Bridgers Motion Sickness", "Maggie Rogers Alaska"],
      "Dance Pop":    ["Doja Cat Say So", "Charli XCX Boom Clap", "Bebe Rexha Meant to Be", "Lizzo Truth Hurts", "Meghan Trainor All About That Bass"],
      "Teen Pop":     ["One Direction What Makes You Beautiful", "Justin Bieber Baby", "Miley Cyrus Wrecking Ball", "Selena Gomez Come and Get It"],

      "Electronic":   ["Daft Punk Get Lucky", "Calvin Harris Summer", "Martin Garrix Animals", "Avicii Wake Me Up", "Zedd Clarity", "Flume Holdin On", "Odesza A Moment Apart"],
      "Dance":        ["The Chainsmokers Closer", "David Guetta Titanium", "Kygo Firestone", "Clean Bandit Rather Be", "Marshmello Happier", "Major Lazer Lean On"],
      "House":        ["Fisher Losing It", "Chris Lake popular", "Eric Prydz Call On Me", "Disclosure Latch", "Duke Dumont I Got U"],
      "EDM":          ["Skrillex Bangarang", "Deadmau5 Ghosts n Stuff", "Porter Robinson Language", "Bassnectar Lights popular", "Excision popular"],
      "Lo-Fi":        ["lofi hip hop study beats popular", "Nujabes Feather", "J Dilla Donuts", "Tycho Awake", "Bonobo Kiara"],

      "K-Pop":        ["BTS Dynamite", "BLACKPINK How You Like That", "NewJeans Hype Boy", "aespa Savage", "IVE Love Dive", "TWICE Cheer Up", "EXO Call Me Baby", "Stray Kids Miroh"],
      "J-Pop":        ["Yoasobi Idol", "Official Hige Dandism Subtitle", "Ado Usseewa", "Fujii Kaze Shinunoga E-Wa", "King Gnu Hakujitsu", "Eve Heart wa Kaerarenai", "Kenshi Yonezu Lemon"],
      "J-Rock":       ["ONE OK ROCK Wherever You Are", "Radwimps Nandemonaiya", "My First Story popular", "SiM The Answer", "Maximum the Hormone popular"],
      "Anime":        ["LiSA Gurenge Demon Slayer", "Aimer Zankyou Reference Attack on Titan", "Asian Kung Fu Generation Rewrite", "Hiroyuki Sawano popular anime ost", "Yoko Kanno popular"],
      "City Pop":     ["Mariya Takeuchi Plastic Love", "Tatsuro Yamashita Ride on Time", "Anri I Can't Stop the Loneliness", "Miki Matsubara Stay With Me"],

      "Latin":        ["Bad Bunny Dakiti", "J Balvin Ginza", "Ozuna Taki Taki", "Rauw Alejandro Todo De Ti", "Daddy Yankee Gasolina", "Shakira Hips Don't Lie", "Maluma Hawai"],
      "Reggaeton":    ["Don Omar Danza Kuduro", "Nicky Jam El Perdon", "CNCO Reggaeton Lento", "Farruko Pepas"],
      "Classical":    ["Beethoven Symphony No 5 popular", "Mozart Eine Kleine Nachtmusik", "Chopin Nocturne Op 9", "Bach Air on the G String", "Debussy Clair de Lune"],
      "Jazz":         ["Miles Davis Kind of Blue", "John Coltrane A Love Supreme", "Dave Brubeck Take Five", "Thelonious Monk Round Midnight", "Norah Jones Come Away with Me"],
      "Country":      ["Morgan Wallen Whiskey Glasses", "Luke Combs Beautiful Crazy", "Zach Bryan American Heartbreak", "Chris Stapleton Tennessee Whiskey", "Blake Shelton God's Country"],
      "Reggae":       ["Bob Marley No Woman No Cry", "Sean Paul Temperature", "Damian Marley Road to Zion", "Protoje Who Knows"],
      "Blues":        ["B.B. King The Thrill Is Gone", "Eric Clapton Layla", "Stevie Ray Vaughan Pride and Joy", "Robert Johnson Cross Road Blues"],
    };

    let queries: string[] = [];

    if (lang) {
      const isKorean = /[\uAC00-\uD7A3]/.test(artist + currentSong.trackName);
      queries = isKorean ? GENRE_POPULAR["K-Pop"]! : GENRE_POPULAR["J-Pop"]!;
    } else {
      const genreLower = genre.toLowerCase();
      const matchedKey = Object.keys(GENRE_POPULAR).find(k =>
        genreLower.includes(k.toLowerCase()) || k.toLowerCase().includes(genreLower)
      );
      if (matchedKey) {
        queries = GENRE_POPULAR[matchedKey]!;
      } else if (genre) {
        queries = [`${genre} popular hits 2000s 2010s 2020s`, `best ${genre} songs popular`, `${artist} similar artists popular`];
      } else {
        queries = [`${artist} similar popular songs`, `popular music 2020s hits`];
      }
    }

    // Pick a random query from the pool
    const query = queries[Math.floor(Math.random() * queries.length)];
    if (!query) return;

    radioFetching.current = true;
    fetch(`/api/music/search?q=${encodeURIComponent(query)}&limit=30`)
      .then(r => r.json())
      .then(data => {
        if (!data.results?.length) return;
        const incoming: Track[] = data.results.map(apiToTrack);
        // Only add tracks that have artwork
        const withArt = incoming.filter((s: Track) => s.artworkUrl100 && s.artworkUrl100.length > 10);
        const existingIds = new Set(state.queue.map((s: Track) => s.id));
        const fresh = withArt.filter((s: Track) => !existingIds.has(s.id));
        if (fresh.length > 0) {
          const shuffled = [...fresh].sort(() => Math.random() - 0.5);
          shuffled.forEach((s: Track) => dispatch({ type: "ADD_TO_QUEUE", payload: s }));
        }
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
