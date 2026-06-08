"use client";

import { useState, useRef, useMemo } from "react";
import { usePlaylists } from "@/lib/playlistContext";
import { usePlayer } from "@/lib/playerContext";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { PlaylistCoverGrid } from "@/app/page";
import {
  Heart, Play, Plus, Check, X, Search,
  Music2, User, LogOut, Camera, ListFilter,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type FilterTab = "all" | "playlists" | "albums" | "artists";
type SortMode  = "recents" | "name" | "creator";

export default function LibraryPage() {
  const { state, createPlaylist, updatePlaylistCover } = usePlaylists();
  const { playQueue } = usePlayer();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [filter, setFilter]   = useState<FilterTab>("all");
  const [sort, setSort]       = useState<SortMode>("recents");
  const [query, setQuery]     = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverTargetId = useRef<string | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createPlaylist(name);
    setNewName("");
    setCreating(false);
  };

  const openCoverPicker = (id: string) => {
    coverTargetId.current = id;
    coverInputRef.current?.click();
  };

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !coverTargetId.current) return;
    const reader = new FileReader();
    reader.onload = () => updatePlaylistCover(coverTargetId.current!, reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Build unified items list
  const allItems = useMemo(() => {
    type Item =
      | { kind: "liked" }
      | { kind: "playlist"; id: string; name: string; trackCount: number; cover?: string; tracks: typeof state.playlists[0]["tracks"] }
      | { kind: "album"; id: string; name: string; artist: string; cover: string; year: string }
      | { kind: "artist"; id: string; name: string; image: string };

    const items: Item[] = [];

    if (filter === "all" || filter === "playlists") {
      items.push({ kind: "liked" });
      state.playlists.filter(p => p.id !== "liked").forEach(pl =>
        items.push({ kind: "playlist", id: pl.id, name: pl.name, trackCount: pl.tracks.length, cover: pl.cover, tracks: pl.tracks })
      );
    }
    if (filter === "all" || filter === "albums") {
      state.savedAlbums.forEach(a =>
        items.push({ kind: "album", id: a.id, name: a.name, artist: a.artist, cover: a.cover, year: a.year })
      );
    }
    if (filter === "all" || filter === "artists") {
      state.followedArtists.forEach(a =>
        items.push({ kind: "artist", id: a.id, name: a.name, image: a.image })
      );
    }

    // Filter by search
    const q = query.toLowerCase();
    const filtered = q
      ? items.filter(item => {
          if (item.kind === "liked") return "liked songs".includes(q);
          if (item.kind === "playlist") return item.name.toLowerCase().includes(q);
          if (item.kind === "album")   return item.name.toLowerCase().includes(q) || item.artist.toLowerCase().includes(q);
          if (item.kind === "artist")  return item.name.toLowerCase().includes(q);
          return true;
        })
      : items;

    return filtered;
  }, [state, filter, query]);

  const FILTERS: { key: FilterTab; label: string }[] = [
    { key: "playlists", label: "Playlists" },
    { key: "albums",    label: "Albums" },
    { key: "artists",   label: "Artists" },
  ];

  return (
    <div className="min-h-full bg-[#121212] flex flex-col animate-fade-in">

      {/* ── Top bar ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
            <Music2 size={16} className="text-white/70" />
          </div>
          <span className="font-bold text-white text-base">Your Library</span>
        </div>
        <div className="flex items-center gap-2">
          {/* + Create */}
          <button
            onClick={() => setCreating(c => !c)}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
            title="Create playlist"
          >
            <Plus size={20} />
          </button>
          {/* Profile / logout */}
          {user ? (
            <>
              <Link href="/profile">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow">
                  {user.avatar
                    ? <Image src={user.avatar} alt={user.displayName} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                    : <span className="text-xs font-bold text-white">{user.displayName.charAt(0).toUpperCase()}</span>}
                </div>
              </Link>
              <button onClick={() => signOut().then(() => router.push("/login"))}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-red-400 transition-colors">
                <LogOut size={15} />
              </button>
            </>
          ) : (
            <Link href="/login" className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white bg-white/[0.07] px-3 py-1.5 rounded-full transition-colors">
              <User size={13} /> Log in
            </Link>
          )}
        </div>
      </div>

      {/* ── Create input ──────────────────────────────── */}
      {creating && (
        <div className="px-4 pb-2 flex gap-2">
          <input
            autoFocus value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Playlist name…"
            className="flex-1 bg-white/[0.08] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-green-500/50"
          />
          <button onClick={handleCreate} disabled={!newName.trim()}
            className="px-3 py-2 rounded-lg bg-green-500 text-black text-sm font-bold disabled:opacity-40 hover:bg-green-400 flex items-center gap-1">
            <Check size={13} /> Create
          </button>
          <button onClick={() => setCreating(false)} className="px-2 text-white/40 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Filter tabs ───────────────────────────────── */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto hide-scrollbar flex-shrink-0">
        {FILTERS.map(f => (
          <button key={f.key}
            onClick={() => setFilter(prev => prev === f.key ? "all" : f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold flex-shrink-0 transition-all ${
              filter === f.key ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Search + sort bar ─────────────────────────── */}
      <div className="flex items-center justify-between px-4 pb-2 gap-3 flex-shrink-0">
        <button className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors">
          <Search size={18} />
        </button>
        <div className="flex-1 relative">
          {query !== "" && (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search in Your Library"
              className="w-full bg-white/[0.08] rounded-md px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none"
            />
          )}
        </div>
        <button
          onClick={() => setQuery(q => q === "" ? " " : "")}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${query ? "text-white" : "text-white/40 hover:text-white"}`}>
          {sort === "recents" ? "Recents" : sort === "name" ? "Name" : "Creator"}
          <ListFilter size={14} />
        </button>
      </div>

      {/* ── Items list ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/25">
            <Music2 size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-semibold mb-1">Nothing here yet</p>
            <p className="text-xs text-center px-6">
              {filter === "artists" ? "Follow artists to see them here" :
               filter === "albums"  ? "Save albums to see them here" :
                                      "Create playlists to see them here"}
            </p>
          </div>
        ) : allItems.map((item, i) => {
          if (item.kind === "liked") return (
            <div key="liked"
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors group"
              onClick={() => router.push("/liked")}>
              <div className="w-12 h-12 rounded-md flex-shrink-0 bg-gradient-to-br from-purple-600 to-blue-400 flex items-center justify-center shadow">
                <Heart size={18} className="text-white" fill="white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Liked Songs</p>
                <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1">
                  <span className="text-green-400">♦</span> Playlist · {state.likedTracks.length} songs
                </p>
              </div>
              <button onClick={e => { e.stopPropagation(); if (state.likedTracks.length) playQueue(state.likedTracks, 0); }}
                className="w-9 h-9 rounded-full bg-green-500 text-black opacity-0 group-hover:opacity-100 flex items-center justify-center hover:scale-105 transition-all">
                <Play size={12} fill="currentColor" />
              </button>
            </div>
          );

          if (item.kind === "playlist") return (
            <div key={item.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors group"
              onClick={() => router.push(`/playlist/${item.id}`)}>
              <div className="relative w-12 h-12 rounded-md flex-shrink-0 overflow-hidden bg-white/10"
                onClick={e => { e.stopPropagation(); openCoverPicker(item.id); }}>
                <PlaylistCoverGrid playlist={item} size={48} />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-md">
                  <Camera size={12} className="text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                <p className="text-xs text-white/40 mt-0.5">Playlist · {item.trackCount} songs</p>
              </div>
              {item.tracks.length > 0 && (
                <button onClick={e => { e.stopPropagation(); playQueue(item.tracks, 0); }}
                  className="w-9 h-9 rounded-full bg-green-500 text-black opacity-0 group-hover:opacity-100 flex items-center justify-center hover:scale-105 transition-all">
                  <Play size={12} fill="currentColor" />
                </button>
              )}
            </div>
          );

          if (item.kind === "album") return (
            <div key={item.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors group"
              onClick={() => router.push(`/album/${item.id}`)}>
              <div className="w-12 h-12 rounded-md flex-shrink-0 overflow-hidden bg-white/10">
                {item.cover
                  ? <Image src={item.cover} alt={item.name} width={48} height={48} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music2 size={16} className="text-white/20" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                <p className="text-xs text-white/40 mt-0.5">Album · {item.artist}</p>
              </div>
            </div>
          );

          if (item.kind === "artist") return (
            <Link key={item.id} href={`/artist/${encodeURIComponent(item.name)}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors">
              <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden bg-white/10">
                {item.image
                  ? <Image src={item.image} alt={item.name} width={48} height={48} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white/30">{item.name[0]}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                <p className="text-xs text-white/40 mt-0.5">Artist</p>
              </div>
            </Link>
          );

          return null;
        })}
      </div>

      {/* Hidden file input */}
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />
    </div>
  );
}
