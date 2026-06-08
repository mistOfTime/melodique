"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Search, Heart, Plus, ListMusic,
  User, LogOut, Camera, Pencil, Check, X, Play,
} from "lucide-react";
import { MelodiqueLogo } from "@/components/MelodiqueLogo";
import { usePlaylists } from "@/lib/playlistContext";
import { usePlayer } from "@/lib/playerContext";
import { useAuth } from "@/lib/authContext";
import Image from "next/image";
import { PlaylistCoverGrid } from "@/app/page";
import { useState, useRef } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { state, createPlaylist, deletePlaylist, renamePlaylist, updatePlaylistCover } = usePlaylists();
  const { playQueue } = usePlayer();
  const { user, signOut } = useAuth();

  const [creating, setCreating]         = useState(false);
  const [newName, setNewName]           = useState("");
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverTargetId = useRef<string | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createPlaylist(name);
    setNewName("");
    setCreating(false);
  };

  const handleRename = (id: string) => {
    if (editName.trim()) renamePlaylist(id, editName.trim());
    setEditingId(null);
  };

  const openCoverPicker = (playlistId: string) => {
    coverTargetId.current = playlistId;
    coverInputRef.current?.click();
  };

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !coverTargetId.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      updatePlaylistCover(coverTargetId.current!, reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col bg-[#121212] overflow-hidden">
      {/* ── Logo + nav ─────────────────────────────────── */}
      <div className="px-4 pt-5 pb-2 flex-shrink-0 space-y-1">
        {/* Logo */}
        <div className="flex items-center gap-2 px-2 mb-3">
          <MelodiqueLogo iconSize={24} textSize="text-base" />
        </div>

        {[
          { href: "/",       icon: Home,   label: "Home" },
          { href: "/search", icon: Search, label: "Search" },
        ].map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-4 px-3 py-2.5 rounded-md text-sm font-semibold transition-all ${
              pathname === href ? "text-white" : "text-white/60 hover:text-white"
            }`}>
            <Icon size={20} strokeWidth={pathname === href ? 2.5 : 1.8} />
            {label}
          </Link>
        ))}
      </div>

      {/* ── Your Library ───────────────────────────────── */}
      <div className="mx-2 rounded-lg bg-[#1a1a1a] flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Library header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <Link href="/library" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors font-semibold text-sm">
            <ListMusic size={18} />
            Your Library
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCreating(c => !c)}
              className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
              title="Create playlist"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 px-3 pb-2 flex-shrink-0 overflow-x-auto hide-scrollbar">
          <button className="text-xs bg-white/10 text-white px-3 py-1 rounded-full font-medium flex-shrink-0 hover:bg-white/20 transition-colors">
            Playlists
          </button>
          <Link href="/liked"
            className={`text-xs px-3 py-1 rounded-full font-medium flex-shrink-0 transition-colors ${
              pathname === "/liked" ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
            }`}>
            Liked
          </Link>
        </div>

        {/* Create input */}
        {creating && (
          <div className="px-3 pb-2 flex gap-1.5 flex-shrink-0">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder="Playlist name…"
              className="flex-1 bg-white/[0.08] border border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-green-500/50"
            />
            <button onClick={handleCreate} disabled={!newName.trim()}
              className="px-2 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold disabled:opacity-40 hover:bg-green-400 transition-colors">
              <Check size={12} />
            </button>
            <button onClick={() => setCreating(false)} className="px-1 text-white/40 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Hidden file input for cover upload */}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverFile}
        />

        {/* Playlists list */}
        <div className="flex-1 overflow-y-auto pb-2 px-1 min-h-0">
          {/* Liked Songs — always first */}
          <div
            className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${
              pathname === "/liked" ? "bg-white/10" : "hover:bg-white/[0.06]"
            }`}
            onClick={() => router.push("/liked")}
          >
            <div className="w-10 h-10 rounded-md flex-shrink-0 bg-gradient-to-br from-purple-500 to-blue-400 flex items-center justify-center shadow-sm">
              <Heart size={14} className="text-white" fill="white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">Liked Songs</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                Playlist · {state.likedTracks.length} songs
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); playQueue(state.likedTracks, 0); }}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full bg-green-500 text-black flex items-center justify-center hover:scale-105 transition-all flex-shrink-0"
            >
              <Play size={11} fill="currentColor" />
            </button>
          </div>

          {/* User playlists */}
          {state.playlists.filter(p => p.id !== "liked").map(pl => (
            <div key={pl.id}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                pathname === `/playlist/${pl.id}` ? "bg-white/10" : "hover:bg-white/[0.06]"
              }`}
              onClick={() => {
                if (editingId === pl.id) return;
                router.push(`/playlist/${pl.id}`);
              }}
            >
              {/* Cover — click to upload */}
              <div
                className="relative w-10 h-10 rounded-md flex-shrink-0 overflow-hidden bg-white/10 flex items-center justify-center group/cover"
                onClick={e => { e.stopPropagation(); openCoverPicker(pl.id); }}
                title="Change cover"
              >
                <PlaylistCoverGrid playlist={pl} size={40} />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity rounded-md">
                  <Camera size={12} className="text-white" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                {editingId === pl.id ? (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRename(pl.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 bg-white/[0.1] border border-white/20 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-green-500/60 min-w-0"
                    />
                    <button onClick={() => handleRename(pl.id)} className="text-green-400 hover:text-green-300 flex-shrink-0"><Check size={12} /></button>
                    <button onClick={() => setEditingId(null)} className="text-white/40 hover:text-white flex-shrink-0"><X size={12} /></button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-white truncate">{pl.name}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">Playlist · {pl.tracks.length} songs</p>
                  </>
                )}
              </div>

              {/* Actions on hover */}
              {editingId !== pl.id && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditName(pl.name); setEditingId(pl.id); }}
                    className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white transition-colors rounded"
                    title="Rename"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => deletePlaylist(pl.id)}
                    className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-red-400 transition-colors rounded"
                    title="Delete"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Saved albums */}
          {state.savedAlbums?.map(album => (
            <div key={album.id}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                pathname === `/album/${album.id}` ? "bg-white/10" : "hover:bg-white/[0.06]"
              }`}
              onClick={() => router.push(`/album/${album.id}`)}>
              <div className="w-10 h-10 rounded-md flex-shrink-0 overflow-hidden bg-white/10">
                {album.cover
                  ? <Image src={album.cover} alt={album.name} width={40} height={40} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><ListMusic size={12} className="text-white/20" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{album.name}</p>
                <p className="text-[11px] text-white/40 mt-0.5">Album · {album.artist}</p>
              </div>
            </div>
          ))}

          {/* Followed artists */}
          {state.followedArtists?.map(artist => (
            <div key={artist.id}
              className="group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all hover:bg-white/[0.06]"
              onClick={() => router.push(`/artist/${encodeURIComponent(artist.name)}`)}>
              <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-white/10">
                {artist.image
                  ? <Image src={artist.image} alt={artist.name} width={40} height={40} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/30">{artist.name[0]}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{artist.name}</p>
                <p className="text-[11px] text-white/40 mt-0.5">Artist</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── User profile at bottom ─────────────────── */}
        <div className="border-t border-white/[0.06] px-3 py-3 flex-shrink-0">
          {user ? (
            <div className="flex items-center gap-2.5">
              <Link href="/profile" className="flex items-center gap-2.5 flex-1 min-w-0 group">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                  {user.avatar
                    ? <Image src={user.avatar} alt={user.displayName} width={32} height={32}
                        className="w-full h-full object-cover" unoptimized />
                    : <span className="text-xs font-bold text-white leading-none">
                        {user.displayName.charAt(0).toUpperCase()}
                      </span>}
                </div>
                <span className="text-sm font-semibold text-white truncate group-hover:text-green-400 transition-colors">
                  {user.displayName}
                </span>
              </Link>
              <button
                onClick={() => { signOut().then(() => router.push("/login")); }}
                className="p-1.5 text-white/25 hover:text-red-400 transition-colors flex-shrink-0 rounded-md hover:bg-white/[0.05]"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link href="/login"
              className="flex items-center gap-2.5 text-white/40 hover:text-white transition-colors">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <User size={14} />
              </div>
              <span className="text-sm font-medium">Log in</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
