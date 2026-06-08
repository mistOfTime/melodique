"use client";

import { useEffect, useState, useCallback } from "react";
import { Track, apiToTrack } from "@/lib/track";
import SongRow from "@/components/SongRow";
import { usePlayer } from "@/lib/playerContext";
import { Radio, Play, Shuffle, Loader2 } from "lucide-react";

const MIXES = [
  "top hits 2025", "underground rap 2024", "indie alternative 2025",
  "rnb soul 2025", "electronic dance 2025", "latin pop 2025",
  "yung lean bladee drain gang", "rage phonk 2025", "drill trap 2025",
  "pop hits 2024 2025", "lo fi hip hop", "jazz soul",
];

export default function RadioPage() {
  const [tracks, setTracks]   = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [mixName, setMixName] = useState("");
  const { playQueue }         = usePlayer();

  const load = useCallback(async () => {
    setLoading(true);
    const q = MIXES[Math.floor(Math.random() * MIXES.length)];
    setMixName(q);
    const res  = await fetch(`/api/music/search?q=${encodeURIComponent(q)}&limit=50`);
    const data = await res.json();
    const shuffled = (data.results ?? []).map(apiToTrack).sort(() => Math.random() - 0.5);
    setTracks(shuffled);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-full bg-[#0a0a0f] px-4 sm:px-8 pt-6 sm:pt-8 pb-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Radio size={24} className="text-green-400" />
        <h1 className="font-bold text-2xl sm:text-3xl text-white">Radio</h1>
      </div>
      {mixName && <p className="text-white/40 text-sm mb-5 capitalize">{mixName}</p>}
      <div className="flex gap-3 mb-6">
        <button onClick={() => playQueue(tracks, 0)} disabled={!tracks.length}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500 text-black font-bold text-sm hover:scale-105 disabled:opacity-40">
          <Play size={14} fill="black" /> Play Radio
        </button>
        <button onClick={load}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white font-semibold text-sm hover:bg-white/20">
          <Shuffle size={14} /> New Mix
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/40"><Loader2 size={28} className="animate-spin" /></div>
      ) : (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] overflow-hidden">
          {tracks.map((t, i) => <SongRow key={`${t.id}-${i}`} song={t} index={i} queue={tracks} showAlbum />)}
        </div>
      )}
    </div>
  );
}
