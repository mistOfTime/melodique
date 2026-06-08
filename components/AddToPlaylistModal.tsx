"use client";

import { useState } from "react";
import { usePlaylists } from "@/lib/playlistContext";
import { Track, getArtwork } from "@/lib/track";
import { X, Plus, Check, Music2 } from "lucide-react";
import Image from "next/image";

interface Props {
  track: Track;
  onClose: () => void;
}

export default function AddToPlaylistModal({ track, onClose }: Props) {
  const { state, addToPlaylist, createPlaylist } = usePlaylists();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const handleAdd = (playlistId: string) => {
    addToPlaylist(playlistId, track);
    setAdded(prev => new Set(prev).add(playlistId));
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createPlaylist(name);
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: "rgba(28,28,38,0.97)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {track.artworkUrl100 ? (
              <Image src={getArtwork(track.artworkUrl100, 48)} alt={track.trackName} width={40} height={40} className="rounded-lg flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center"><Music2 size={16} className="text-white/30" /></div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{track.trackName}</p>
              <p className="text-xs text-white/50 truncate">{track.artistName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 flex-shrink-0"><X size={18} /></button>
        </div>

        {/* Create playlist */}
        <div className="px-5 py-3 border-b border-white/[0.06]">
          {creating ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                placeholder="Playlist name…"
                className="flex-1 bg-white/[0.08] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-green-500/50"
              />
              <button onClick={handleCreate} disabled={!newName.trim()}
                className="px-3 py-2 rounded-lg bg-green-500 text-black text-sm font-bold disabled:opacity-40 hover:bg-green-400 transition-colors">
                Create
              </button>
              <button onClick={() => setCreating(false)} className="px-2 py-2 text-white/40 hover:text-white"><X size={16} /></button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-2 text-sm text-green-400 hover:text-green-300 font-medium transition-colors w-full py-1">
              <Plus size={16} /> New playlist
            </button>
          )}
        </div>

        {/* Playlist list */}
        <div className="max-h-64 overflow-y-auto py-2">
          {state.playlists.length === 0 ? (
            <p className="text-center text-white/30 text-sm py-6">No playlists yet</p>
          ) : (
            state.playlists.map(pl => {
              const isAdded = added.has(pl.id) || pl.tracks.some(t => t.id === track.id);
              return (
                <button key={pl.id} onClick={() => !isAdded && handleAdd(pl.id)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.05] transition-colors text-left ${isAdded ? "opacity-60 cursor-default" : ""}`}>
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                    {pl.cover
                      ? <Image src={getArtwork(pl.cover, 40)} alt={pl.name} width={36} height={36} className="w-full h-full object-cover" />
                      : <Music2 size={14} className="text-white/20 m-auto mt-2.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{pl.name}</p>
                    <p className="text-xs text-white/40">{pl.tracks.length} songs</p>
                  </div>
                  {isAdded && <Check size={16} className="text-green-400 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
