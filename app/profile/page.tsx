"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { usePlaylists } from "@/lib/playlistContext";
import { usePlayer } from "@/lib/playerContext";
import { getTopArtists } from "@/lib/playerContext";
import { useRouter } from "next/navigation";
import {
  User, LogOut, Edit3, Check, X,
  Heart, ListMusic, Camera, UserMinus, Play, TrendingUp,
} from "lucide-react";
import SongRow from "@/components/SongRow";
import { PlaylistCoverGrid } from "@/components/PlaylistCoverGrid";
import Image from "next/image";
import Link from "next/link";

export default function ProfilePage() {
  const { user, signOut, updateProfile } = useAuth();
  const { state: plState, unfollowArtist } = usePlaylists();
  const { playQueue } = usePlayer();
  const router = useRouter();

  const [editing, setEditing]     = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    if (nameInput.trim()) updateProfile({ displayName: nameInput.trim() });
    setEditing(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateProfile({ avatar: reader.result as string });
    reader.readAsDataURL(file);
  };

  if (!user) {
    return (
      <div className="min-h-full bg-[#121212] flex flex-col items-center justify-center py-24 text-white/30">
        <User size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-semibold text-white mb-2">Not logged in</p>
        <p className="text-sm mb-6">Sign in to see your profile</p>
        <Link href="/login" className="px-6 py-2.5 rounded-full bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-all">
          Log In
        </Link>
      </div>
    );
  }

  const likedCount    = plState.likedTracks.length;
  const playlistCount = plState.playlists.filter(p => p.id !== "liked").length;
  const followingCount = plState.followedArtists?.length ?? 0;
  const recentLiked   = plState.likedTracks.slice(-6).reverse();
  const followedArtists = plState.followedArtists ?? [];

  // Top artists from listening history — computed client-side
  const [topArtists, setTopArtists] = useState<{ name: string; id: string; image: string; playCount: number }[]>([]);
  useEffect(() => {
    setTopArtists(getTopArtists(8));
  }, []);

  return (
    <div className="min-h-full bg-[#121212] pb-12 animate-fade-in">

      {/* ── Hero banner ──────────────────────────────────── */}
      <div className="relative h-48 sm:h-64 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900/60 to-[#121212]" />
        {/* Blurred avatar as background */}
        {user.avatar && (
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: `url(${user.avatar})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px)" }} />
        )}
      </div>

      {/* ── Avatar + name ────────────────────────────────── */}
      <div className="px-4 sm:px-8 -mt-16 flex items-end gap-4 mb-5">
        {/* Avatar — click to change */}
        <div className="relative flex-shrink-0 group cursor-pointer" onClick={() => fileRef.current?.click()}>
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center shadow-2xl ring-4 ring-[#121212]">
            {user.avatar
              ? <Image src={user.avatar} alt={user.displayName} width={144} height={144} className="w-full h-full object-cover" unoptimized />
              : <span className="text-5xl font-black text-white select-none">{user.displayName.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
            <Camera size={20} className="text-white" />
            <span className="text-[10px] text-white font-medium">Change photo</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        <div className="flex-1 min-w-0 pb-2">
          <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">Profile</p>
          {editing ? (
            <div className="flex items-center gap-2 mb-1">
              <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                className="bg-white/[0.1] border border-white/20 rounded-lg px-3 py-1.5 text-2xl font-black text-white outline-none focus:border-green-500/60 min-w-0 flex-1" />
              <button onClick={handleSave} className="p-2 text-green-400 hover:text-green-300"><Check size={18} /></button>
              <button onClick={() => setEditing(false)} className="p-2 text-white/40 hover:text-white"><X size={18} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl sm:text-5xl font-black text-white truncate leading-none">{user.displayName}</h1>
              <button onClick={() => { setNameInput(user.displayName); setEditing(true); }}
                className="p-1.5 text-white/30 hover:text-white transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                <Edit3 size={16} />
              </button>
            </div>
          )}
          {/* Stats row */}
          <div className="flex items-center gap-3 flex-wrap mt-1">
            {playlistCount > 0 && <span className="text-sm text-white/60">{playlistCount} <span className="font-semibold text-white">Playlists</span></span>}
            {followingCount > 0 && <span className="text-sm text-white/60">{followingCount} <span className="font-semibold text-white">Following</span></span>}
            {likedCount > 0 && <span className="text-sm text-white/60">{likedCount} <span className="font-semibold text-white">Liked songs</span></span>}
          </div>
        </div>
      </div>

      {/* ── Action row ───────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 sm:px-8 mb-8">
        {likedCount > 0 && (
          <button onClick={() => playQueue(plState.likedTracks, 0)}
            className="w-14 h-14 rounded-full bg-green-500 text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl">
            <Play size={22} fill="currentColor" />
          </button>
        )}
        <button onClick={() => { signOut().then(() => router.push("/login")); }}
          className="flex items-center gap-2 px-5 py-2 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 text-sm font-semibold transition-all">
          <LogOut size={15} /> Sign out
        </button>
        <button onClick={() => router.push("/edit-profile")}
          className="flex items-center gap-2 px-5 py-2 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 text-sm font-semibold transition-all">
          <Edit3 size={15} /> Edit profile
        </button>
      </div>

      <div className="px-4 sm:px-8 space-y-10">

        {/* ── Top Artists This Month ───────────────────────── */}
        {topArtists.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp size={20} className="text-green-400" />
              <h2 className="font-bold text-2xl text-white">Top Artists This Month</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {topArtists.map((artist, rank) => (
                <Link key={artist.id} href={`/artist/${encodeURIComponent(artist.name)}`}
                  className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/[0.06] transition-colors">
                  <div className="relative w-full aspect-square rounded-full overflow-hidden bg-white/10">
                    {artist.image
                      ? <Image src={artist.image} alt={artist.name} fill className="object-cover group-hover:scale-105 transition-transform" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/20">{artist.name[0]}</div>}
                    {/* Rank badge */}
                    <div className="absolute top-0 left-0 w-6 h-6 rounded-full bg-[#121212] flex items-center justify-center m-1">
                      <span className="text-[10px] font-black text-white/60">#{rank + 1}</span>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white text-center truncate w-full">{artist.name}</p>
                  <p className="text-xs text-white/40">{artist.playCount} play{artist.playCount !== 1 ? "s" : ""}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Following artists ────────────────────────────── */}
        {followedArtists.length > 0 && (
          <section>
            <h2 className="font-bold text-2xl text-white mb-5">Following</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {followedArtists.map(artist => (
                <div key={artist.id} className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/[0.06] transition-colors">
                  <Link href={`/artist/${encodeURIComponent(artist.name)}`} className="w-full flex flex-col items-center gap-2">
                    <div className="w-full aspect-square rounded-full overflow-hidden bg-white/10">
                      {artist.image
                        ? <Image src={artist.image} alt={artist.name} width={120} height={120} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        : <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/20">{artist.name[0]}</div>}
                    </div>
                    <p className="text-sm font-semibold text-white text-center truncate w-full">{artist.name}</p>
                    <p className="text-xs text-white/40">Artist</p>
                  </Link>
                  {/* Unfollow button */}
                  <button
                    onClick={() => unfollowArtist(artist.id)}
                    className="mt-1 flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/20 text-xs text-white/50 hover:text-red-400 hover:border-red-400/40 transition-all font-medium opacity-0 group-hover:opacity-100"
                    title="Unfollow">
                    <UserMinus size={12} /> Unfollow
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent liked ─────────────────────────────────── */}
        {recentLiked.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-2xl text-white">Recently Liked</h2>
              <Link href="/liked" className="text-sm text-white/40 hover:text-white transition-colors">See all</Link>
            </div>
            <div className="rounded-xl overflow-hidden">
              {recentLiked.map((t, i) => (
                <SongRow key={t.id} song={t} index={i} queue={recentLiked} showArtwork />
              ))}
            </div>
          </section>
        )}

        {/* ── Playlists ────────────────────────────────────── */}
        {playlistCount > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-2xl text-white">Playlists</h2>
              <Link href="/library" className="text-sm text-white/40 hover:text-white transition-colors">See all</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {plState.playlists.filter(p => p.id !== "liked").map(pl => (
                <Link key={pl.id} href={`/playlist/${pl.id}`}
                  className="group flex flex-col gap-2">
                  <div className="aspect-square rounded-lg overflow-hidden bg-white/[0.06]">
                    <PlaylistCoverGrid playlist={pl} size={200} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate group-hover:underline">{pl.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">Playlist · {pl.tracks.length} songs</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Liked Songs shortcut ─────────────────────────── */}
        {likedCount > 0 && (
          <section>
            <Link href="/liked"
              className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors group">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-600 to-blue-400 flex items-center justify-center flex-shrink-0 shadow">
                <Heart size={28} className="text-white" fill="white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-lg">Liked Songs</p>
                <p className="text-sm text-white/40">{likedCount} song{likedCount !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={e => { e.preventDefault(); playQueue(plState.likedTracks, 0); }}
                className="w-12 h-12 rounded-full bg-green-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-105 transition-all shadow-lg">
                <Play size={16} fill="currentColor" />
              </button>
            </Link>
          </section>
        )}

        {/* ── Member info ──────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 text-white/25 text-xs">
            <span className={`px-2 py-1 rounded-full ${user.provider === "google" ? "bg-blue-500/15 text-blue-400" : "bg-green-500/10 text-green-400"}`}>
              {user.provider === "google" ? "Google Account" : "Melodique Account"}
            </span>
            <span>{user.email}</span>
            <span>·</span>
            <span>Member since {new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          </div>
        </section>

      </div>
    </div>
  );
}
