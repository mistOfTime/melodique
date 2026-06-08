"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import { Track } from "./track";
import { loadLibraryFromFirestore, saveLibraryToFirestore, debouncedSave, subscribeLibrary } from "./firestoreSync";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  cover?: string;
}

export interface FollowedArtist {
  id: string;
  name: string;
  image: string;
  followers?: number;
}

interface PlaylistState {
  playlists: Playlist[];
  likedTracks: Track[];
  followedArtists: FollowedArtist[];
  savedAlbums: { id: string; name: string; artist: string; cover: string; year: string }[];
}

type Action =
  | { type: "CREATE_PLAYLIST"; payload: { name: string } }
  | { type: "DELETE_PLAYLIST"; payload: string }
  | { type: "RENAME_PLAYLIST"; payload: { id: string; name: string } }
  | { type: "ADD_TO_PLAYLIST"; payload: { playlistId: string; track: Track } }
  | { type: "REMOVE_FROM_PLAYLIST"; payload: { playlistId: string; trackId: string } }
  | { type: "UPDATE_COVER"; payload: { playlistId: string; cover: string } }
  | { type: "TOGGLE_LIKED"; payload: Track }
  | { type: "FOLLOW_ARTIST"; payload: FollowedArtist }
  | { type: "UNFOLLOW_ARTIST"; payload: string }
  | { type: "SAVE_ALBUM"; payload: { id: string; name: string; artist: string; cover: string; year: string } }
  | { type: "UNSAVE_ALBUM"; payload: string }
  | { type: "HYDRATE"; payload: Partial<PlaylistState> };

const DEFAULT_STATE: PlaylistState = {
  playlists:       [{ id: "liked", name: "Liked Songs", tracks: [], createdAt: Date.now(), cover: "" }],
  likedTracks:     [],
  followedArtists: [],
  savedAlbums:     [],
};

const STORAGE_KEY = "melodique_playlists_v2";

function localLoad(): PlaylistState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const p = JSON.parse(raw) as PlaylistState;
    if (!p.playlists?.find(x => x.id === "liked")) {
      p.playlists = [{ id: "liked", name: "Liked Songs", tracks: p.likedTracks ?? [], createdAt: Date.now(), cover: "" }, ...(p.playlists ?? [])];
    }
    return { ...DEFAULT_STATE, ...p };
  } catch { return DEFAULT_STATE; }
}

function localSave(s: PlaylistState) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function mergeState(base: PlaylistState, remote: Partial<PlaylistState>): PlaylistState {
  return {
    playlists:       remote.playlists       ?? base.playlists,
    likedTracks:     remote.likedTracks     ?? base.likedTracks,
    followedArtists: remote.followedArtists ?? base.followedArtists,
    savedAlbums:     remote.savedAlbums     ?? base.savedAlbums,
  };
}

// Merge two arrays, deduplicating by a key field
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeArrays<T extends Record<string, any>>(a: T[] = [], b: T[] = [], key: string): T[] {
  const map = new Map<string, T>();
  // b (local) first, then a (remote) — remote wins on conflict
  [...b, ...a].forEach(item => {
    const k = item[key];
    if (k !== undefined && k !== null) map.set(String(k), item);
  });
  return Array.from(map.values());
}

// Merge playlists — merge track lists within each playlist too
function mergePlaylists(remote: Playlist[] = [], local: Playlist[] = []): Playlist[] {
  const map = new Map<string, Playlist>();
  // Start with local
  local.forEach(p => map.set(p.id, p));
  // Overlay remote — merge tracks within each playlist
  remote.forEach(rp => {
    const lp = map.get(rp.id);
    if (lp) {
      // Merge tracks from both
      const trackMap = new Map<string, Track>();
      [...lp.tracks, ...rp.tracks].forEach(t => { if (!trackMap.has(t.id)) trackMap.set(t.id, t); });
      map.set(rp.id, {
        ...rp,
        tracks: Array.from(trackMap.values()),
        cover:  rp.cover || lp.cover,
      });
    } else {
      map.set(rp.id, rp);
    }
  });
  // Sort: liked first, then by createdAt
  return Array.from(map.values()).sort((a, b) => {
    if (a.id === "liked") return -1;
    if (b.id === "liked") return 1;
    return a.createdAt - b.createdAt;
  });
}

function reducer(state: PlaylistState, action: Action): PlaylistState {
  switch (action.type) {
    case "HYDRATE":
      return mergeState(state, {
        ...action.payload,
        // Always clear liked playlist cover so mosaic renders correctly
        playlists: action.payload.playlists?.map((p: Playlist) =>
          p.id === "liked" ? { ...p, cover: "" } : p
        ),
      });

    case "CREATE_PLAYLIST":
      return { ...state, playlists: [...state.playlists, {
        id: `pl-${Date.now()}`, name: action.payload.name, tracks: [], createdAt: Date.now(),
      }]};

    case "DELETE_PLAYLIST":
      return { ...state, playlists: state.playlists.filter(p => p.id !== action.payload) };

    case "RENAME_PLAYLIST":
      return { ...state, playlists: state.playlists.map(p =>
        p.id === action.payload.id ? { ...p, name: action.payload.name } : p
      )};

    case "ADD_TO_PLAYLIST":
      return { ...state, playlists: state.playlists.map(p => {
        if (p.id !== action.payload.playlistId) return p;
        if (p.tracks.some(t => t.id === action.payload.track.id)) return p;
        return { ...p, tracks: [...p.tracks, action.payload.track], cover: p.cover || action.payload.track.artworkUrl100 };
      })};

    case "REMOVE_FROM_PLAYLIST":
      return { ...state, playlists: state.playlists.map(p =>
        p.id === action.payload.playlistId
          ? { ...p, tracks: p.tracks.filter(t => t.id !== action.payload.trackId) }
          : p
      )};

    case "UPDATE_COVER":
      return { ...state, playlists: state.playlists.map(p =>
        p.id === action.payload.playlistId ? { ...p, cover: action.payload.cover } : p
      )};

    case "TOGGLE_LIKED": {
      const exists = state.likedTracks.some(t => t.id === action.payload.id);
      const newLiked = exists
        ? state.likedTracks.filter(t => t.id !== action.payload.id)
        : [...state.likedTracks, action.payload];
      return {
        ...state,
        likedTracks: newLiked,
        playlists: state.playlists.map(p => {
          if (p.id !== "liked") return p;
          // Always keep cover empty — PlaylistCoverGrid renders 4-tile mosaic automatically
          if (exists) return { ...p, tracks: p.tracks.filter(t => t.id !== action.payload.id), cover: "" };
          return { ...p, tracks: [...p.tracks, action.payload], cover: "" };
        }),
      };
    }

    case "FOLLOW_ARTIST":
      if (state.followedArtists.some(a => a.id === action.payload.id)) return state;
      return { ...state, followedArtists: [action.payload, ...state.followedArtists] };

    case "UNFOLLOW_ARTIST":
      return { ...state, followedArtists: state.followedArtists.filter(a => a.id !== action.payload) };

    case "SAVE_ALBUM":
      if (state.savedAlbums.some(a => a.id === action.payload.id)) return state;
      return { ...state, savedAlbums: [action.payload, ...state.savedAlbums] };

    case "UNSAVE_ALBUM":
      return { ...state, savedAlbums: state.savedAlbums.filter(a => a.id !== action.payload) };

    default: return state;
  }
}

interface PlaylistContextValue {
  state: PlaylistState;
  createPlaylist:      (name: string) => void;
  deletePlaylist:      (id: string) => void;
  renamePlaylist:      (id: string, name: string) => void;
  addToPlaylist:       (playlistId: string, track: Track) => void;
  removeFromPlaylist:  (playlistId: string, trackId: string) => void;
  updatePlaylistCover: (playlistId: string, cover: string) => void;
  toggleLiked:         (track: Track) => void;
  isLiked:             (trackId: string, trackName?: string, artistName?: string) => boolean;
  followArtist:        (artist: FollowedArtist) => void;
  unfollowArtist:      (id: string) => void;
  isFollowing:         (id: string) => boolean;
  saveAlbum:           (album: { id: string; name: string; artist: string; cover: string; year: string }) => void;
  unsaveAlbum:         (id: string) => void;
  isAlbumSaved:        (id: string) => boolean;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const uidRef          = useRef<string | null>(null);
  const hydrated        = useRef(false);
  const unsubFirestore  = useRef<(() => void) | null>(null);

  // 1. Hydrate from localStorage on mount
  useEffect(() => {
    const local = localLoad();
    dispatch({ type: "HYDRATE", payload: local });
  }, []);

  // 2. When user signs in — load from Firestore and subscribe to real-time updates
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
    const unsub = onAuthStateChanged(auth, async (fb) => {
      // Clean up previous subscription
      if (unsubFirestore.current) { unsubFirestore.current(); unsubFirestore.current = null; }

      if (fb) {
        uidRef.current = fb.uid;
        // Load from Firestore first
        const remote = await loadLibraryFromFirestore(fb.uid);
        const local  = localLoad();

        if (remote) {
          // Firestore exists — merge: combine data from both sources
          const merged: PlaylistState = {
            playlists:       mergePlaylists(remote.playlists,       local.playlists),
            likedTracks:     mergeArrays(remote.likedTracks,     local.likedTracks,     "id"),
            followedArtists: mergeArrays(remote.followedArtists, local.followedArtists, "id"),
            savedAlbums:     mergeArrays(remote.savedAlbums,     local.savedAlbums,     "id"),
          };
          dispatch({ type: "HYDRATE", payload: merged });
          // Upload the merged result back to Firestore so both are in sync
          await saveLibraryToFirestore(fb.uid, merged);
        } else {
          // No Firestore data yet — upload local data to Firestore
          dispatch({ type: "HYDRATE", payload: local });
          if (local.likedTracks.length > 0 || local.playlists.length > 1) {
            await saveLibraryToFirestore(fb.uid, local);
          }
        }
        hydrated.current = true;
        // Subscribe to real-time changes from other devices
        unsubFirestore.current = subscribeLibrary(fb.uid, (data) => {
          dispatch({ type: "HYDRATE", payload: data });
        });
      } else {
        uidRef.current   = null;
        hydrated.current = false;
      }
    });
    return () => { unsub(); if (unsubFirestore.current) unsubFirestore.current(); };
  }, []);

  // 3. Save to localStorage + Firestore on every change
  useEffect(() => {
    localSave(state);
    if (uidRef.current && hydrated.current) {
      debouncedSave(uidRef.current, {
        playlists:       state.playlists,
        likedTracks:     state.likedTracks,
        followedArtists: state.followedArtists,
        savedAlbums:     state.savedAlbums,
      });
    }
  }, [state]);

  const createPlaylist     = useCallback((name: string) => dispatch({ type: "CREATE_PLAYLIST", payload: { name } }), []);
  const deletePlaylist     = useCallback((id: string) => dispatch({ type: "DELETE_PLAYLIST", payload: id }), []);
  const renamePlaylist     = useCallback((id: string, name: string) => dispatch({ type: "RENAME_PLAYLIST", payload: { id, name } }), []);
  const addToPlaylist      = useCallback((playlistId: string, track: Track) => dispatch({ type: "ADD_TO_PLAYLIST", payload: { playlistId, track } }), []);
  const removeFromPlaylist = useCallback((playlistId: string, trackId: string) => dispatch({ type: "REMOVE_FROM_PLAYLIST", payload: { playlistId, trackId } }), []);
  const updatePlaylistCover = useCallback((playlistId: string, cover: string) => dispatch({ type: "UPDATE_COVER", payload: { playlistId, cover } }), []);
  const toggleLiked        = useCallback((track: Track) => dispatch({ type: "TOGGLE_LIKED", payload: track }), []);

  const isLiked = useCallback((trackId: string, trackName?: string, artistName?: string) => {
    if (state.likedTracks.some(t => t.id === trackId)) return true;
    if (trackName && artistName) {
      const n = trackName.toLowerCase().trim();
      const a = artistName.toLowerCase().trim();
      return state.likedTracks.some(t =>
        t.trackName.toLowerCase().trim() === n && t.artistName.toLowerCase().trim() === a
      );
    }
    return false;
  }, [state.likedTracks]);

  const followArtist   = useCallback((artist: FollowedArtist) => dispatch({ type: "FOLLOW_ARTIST", payload: artist }), []);
  const unfollowArtist = useCallback((id: string) => dispatch({ type: "UNFOLLOW_ARTIST", payload: id }), []);
  const isFollowing    = useCallback((id: string) => state.followedArtists.some(a => a.id === id), [state.followedArtists]);
  const saveAlbum      = useCallback((album: { id: string; name: string; artist: string; cover: string; year: string }) => dispatch({ type: "SAVE_ALBUM", payload: album }), []);
  const unsaveAlbum    = useCallback((id: string) => dispatch({ type: "UNSAVE_ALBUM", payload: id }), []);
  const isAlbumSaved   = useCallback((id: string) => state.savedAlbums.some(a => a.id === id), [state.savedAlbums]);

  return (
    <PlaylistContext.Provider value={{
      state, createPlaylist, deletePlaylist, renamePlaylist, addToPlaylist, removeFromPlaylist,
      updatePlaylistCover, toggleLiked, isLiked, followArtist, unfollowArtist, isFollowing,
      saveAlbum, unsaveAlbum, isAlbumSaved,
    }}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylists() {
  const ctx = useContext(PlaylistContext);
  if (!ctx) throw new Error("usePlaylists must be used within PlaylistProvider");
  return ctx;
}
