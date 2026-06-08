"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect } from "react";
import { Track } from "./track";

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  cover?: string;
}

export interface FollowedArtist {
  id: string;          // Spotify artist ID or artist name slug
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
  | { type: "HYDRATE"; payload: PlaylistState };

const DEFAULT_STATE: PlaylistState = {
  playlists: [
    { id: "liked", name: "Liked Songs", tracks: [], createdAt: Date.now(), cover: "" },
  ],
  likedTracks: [],
  followedArtists: [],
  savedAlbums: [],
};

const STORAGE_KEY = "melodique_playlists_v2";

function loadFromStorage(): PlaylistState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as PlaylistState;
    // Ensure the "liked" playlist always exists
    if (!parsed.playlists.find(p => p.id === "liked")) {
      parsed.playlists.unshift({ id: "liked", name: "Liked Songs", tracks: parsed.likedTracks ?? [], createdAt: Date.now(), cover: "" });
    }
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state: PlaylistState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full or unavailable */ }
}

function reducer(state: PlaylistState, action: Action): PlaylistState {
  switch (action.type) {
    case "HYDRATE": return { ...DEFAULT_STATE, ...action.payload };
    case "CREATE_PLAYLIST": {
      const newPl: Playlist = {
        id: `pl-${Date.now()}`,
        name: action.payload.name,
        tracks: [],
        createdAt: Date.now(),
      };
      return { ...state, playlists: [...state.playlists, newPl] };
    }
    case "DELETE_PLAYLIST":
      return { ...state, playlists: state.playlists.filter(p => p.id !== action.payload) };
    case "RENAME_PLAYLIST":
      return {
        ...state,
        playlists: state.playlists.map(p =>
          p.id === action.payload.id ? { ...p, name: action.payload.name } : p
        ),
      };
    case "ADD_TO_PLAYLIST":
      return {
        ...state,
        playlists: state.playlists.map(p => {
          if (p.id !== action.payload.playlistId) return p;
          if (p.tracks.some(t => t.id === action.payload.track.id)) return p;
          return { ...p, tracks: [...p.tracks, action.payload.track], cover: p.cover || action.payload.track.artworkUrl100 };
        }),
      };
    case "REMOVE_FROM_PLAYLIST":
      return {
        ...state,
        playlists: state.playlists.map(p =>
          p.id === action.payload.playlistId
            ? { ...p, tracks: p.tracks.filter(t => t.id !== action.payload.trackId) }
            : p
        ),
      };
    case "UPDATE_COVER":
      return {
        ...state,
        playlists: state.playlists.map(p =>
          p.id === action.payload.playlistId ? { ...p, cover: action.payload.cover } : p
        ),
      };
    case "TOGGLE_LIKED": {
      const exists = state.likedTracks.some(t => t.id === action.payload.id);
      return {
        ...state,
        likedTracks: exists
          ? state.likedTracks.filter(t => t.id !== action.payload.id)
          : [...state.likedTracks, action.payload],
        playlists: state.playlists.map(p => {
          if (p.id !== "liked") return p;
          if (exists) return { ...p, tracks: p.tracks.filter(t => t.id !== action.payload.id) };
          return { ...p, tracks: [...p.tracks, action.payload], cover: p.cover || action.payload.artworkUrl100 };
        }),
      };
    }
    case "FOLLOW_ARTIST": {
      const alreadyFollowing = state.followedArtists.some(a => a.id === action.payload.id);
      if (alreadyFollowing) return state;
      return { ...state, followedArtists: [action.payload, ...state.followedArtists] };
    }
    case "UNFOLLOW_ARTIST":
      return { ...state, followedArtists: state.followedArtists.filter(a => a.id !== action.payload) };
    case "SAVE_ALBUM": {
      const alreadySaved = state.savedAlbums.some(a => a.id === action.payload.id);
      if (alreadySaved) return state;
      return { ...state, savedAlbums: [action.payload, ...state.savedAlbums] };
    }
    case "UNSAVE_ALBUM":
      return { ...state, savedAlbums: state.savedAlbums.filter(a => a.id !== action.payload) };
    default: return state;
  }
}

interface PlaylistContextValue {
  state: PlaylistState;
  createPlaylist: (name: string) => void;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  updatePlaylistCover: (playlistId: string, cover: string) => void;
  toggleLiked: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  followArtist: (artist: FollowedArtist) => void;
  unfollowArtist: (id: string) => void;
  isFollowing: (id: string) => boolean;
  saveAlbum: (album: { id: string; name: string; artist: string; cover: string; year: string }) => void;
  unsaveAlbum: (id: string) => void;
  isAlbumSaved: (id: string) => boolean;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadFromStorage();
    dispatch({ type: "HYDRATE", payload: saved });
  }, []);

  // Persist every state change
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const createPlaylist     = useCallback((name: string) => dispatch({ type: "CREATE_PLAYLIST", payload: { name } }), []);
  const deletePlaylist     = useCallback((id: string) => dispatch({ type: "DELETE_PLAYLIST", payload: id }), []);
  const renamePlaylist     = useCallback((id: string, name: string) => dispatch({ type: "RENAME_PLAYLIST", payload: { id, name } }), []);
  const addToPlaylist      = useCallback((playlistId: string, track: Track) => dispatch({ type: "ADD_TO_PLAYLIST", payload: { playlistId, track } }), []);
  const removeFromPlaylist = useCallback((playlistId: string, trackId: string) => dispatch({ type: "REMOVE_FROM_PLAYLIST", payload: { playlistId, trackId } }), []);
  const updatePlaylistCover = useCallback((playlistId: string, cover: string) => dispatch({ type: "UPDATE_COVER", payload: { playlistId, cover } }), []);
  const toggleLiked        = useCallback((track: Track) => dispatch({ type: "TOGGLE_LIKED", payload: track }), []);
  const isLiked            = useCallback((trackId: string) => state.likedTracks.some(t => t.id === trackId), [state.likedTracks]);
  const followArtist       = useCallback((artist: FollowedArtist) => dispatch({ type: "FOLLOW_ARTIST", payload: artist }), []);
  const unfollowArtist     = useCallback((id: string) => dispatch({ type: "UNFOLLOW_ARTIST", payload: id }), []);
  const isFollowing        = useCallback((id: string) => state.followedArtists.some(a => a.id === id), [state.followedArtists]);
  const saveAlbum          = useCallback((album: { id: string; name: string; artist: string; cover: string; year: string }) => dispatch({ type: "SAVE_ALBUM", payload: album }), []);
  const unsaveAlbum        = useCallback((id: string) => dispatch({ type: "UNSAVE_ALBUM", payload: id }), []);
  const isAlbumSaved       = useCallback((id: string) => state.savedAlbums.some(a => a.id === id), [state.savedAlbums]);

  return (
    <PlaylistContext.Provider value={{
      state, createPlaylist, deletePlaylist, renamePlaylist, addToPlaylist, removeFromPlaylist,
      updatePlaylistCover, toggleLiked, isLiked,
      followArtist, unfollowArtist, isFollowing,
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
