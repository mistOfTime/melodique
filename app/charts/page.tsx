"use client";

import { useEffect, useState } from "react";
import { Track } from "@/lib/track";
import SongRow from "@/components/SongRow";
import { usePlayer } from "@/lib/playerContext";
import { TrendingUp, Loader2, Play, Shuffle } from "lucide-react";
import Image from "next/image";

const CHARTS = [
  { key: "global-top-50",    label: "Top Songs" },
  { key: "us-top-50",        label: "USA Top 50" },
  { key: "hot-albums",       label: "Hot Albums" },
  { key: "new-music-friday", label: "New Releases" },
  { key: "rap-caviar",       label: "Hip-Hop" },
  { key: "rock-this",        label: "Rock" },
  { key: "pop-rising",       label: "Pop" },
  { key: "electronic",       label: "Electronic" },
  { key: "rb-randb",         label: "R&B" },
  { key: "k-pop",            label: "K-Pop" },
  { key: "latin",            label: "Latin" },
  { key: "country",          label: "Country" },
];

export default function ChartsPage() {
  const [active, setActive]           = useState(0);
  const [tracks, setTracks]           = useState<Track[]>([]);
  const [chartName, setChartName]     = useState("");
  const [chartDesc, setChartDesc]     = useState("");
  const [loading, setLoading]         = useState(false);
  const { playQueue } = usePlayer();

  useEffect(() => {
    setLoading(true);
    setTracks([]);
    fetch(`/api/spotify/charts?chart=${CHARTS[active].key}&limit=50`)
      .then(r => r.json())
      .then(async d => {
        const rawTracks: Track[] = d.tracks ?? [];
        setChartName(d.name ?? CHARTS[active].label);
        setChartDesc(d.description ?? "");

        // Enrich tracks — look up full track data via iTunes to get previewUrl + proper IDs
        // Do this in background without blocking display
        setTracks(rawTracks);

        // Background enrich: fetch playable versions for first 20
        if (rawTracks.length > 0) {
          const enriched = await Promise.all(
            rawTracks.slice(0, 20).map(async t => {
              try {
                const res = await fetch(`/api/lookup?id=${t.trackId}&entity=song`);
                const data = await res.json();
                const song = data.results?.find((r: { wrapperType: string }) => r.wrapperType === "track");
                if (song) {
                  return {
                    ...t,
                    id:           `itunes-${song.trackId}`,
                    trackId:      song.trackId,
                    previewUrl:   song.previewUrl ?? null,
                    artworkUrl100: song.artworkUrl100 ?? t.artworkUrl100,
                  } as Track;
                }
              } catch { /* ignore */ }
              return t;
            })
          );
          setTracks(prev => [...enriched, ...prev.slice(20)]);
        }
      })
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [active]);

  const coverTrack = tracks.find(t => t.artworkUrl100);

  return (
    <div className="min-h-full bg-[#121212] animate-fade-in pb-8">

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Background */}
        {coverTrack && (
          <>
            <div className="absolute inset-0 opacity-30"
              style={{ backgroundImage: `url(${coverTrack.artworkUrl100})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px) saturate(1.5)" }} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-[#121212]" />
          </>
        )}
        {!coverTrack && <div className="absolute inset-0 bg-gradient-to-b from-green-900/40 to-[#121212]" />}

        <div className="relative z-10 px-4 sm:px-8 pt-8 pb-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-green-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-green-400">Charts</p>
          </div>
          <h1 className="font-black text-3xl sm:text-5xl text-white mb-2 leading-none">{chartName || CHARTS[active].label}</h1>
          {chartDesc && <p className="text-sm text-white/50 mb-4 max-w-md">{chartDesc}</p>}

          {/* Grid of top 4 covers */}
          {tracks.length > 0 && (
            <div className="flex gap-2 mb-5">
              {tracks.slice(0, 4).filter(t => t.artworkUrl100).map((t, i) => (
                <div key={t.id} className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                  <Image src={t.artworkUrl100} alt={t.trackName} width={48} height={48} className="w-full h-full object-cover" />
                </div>
              ))}
              {tracks.length > 4 && <span className="text-xs text-white/40 self-end pb-1">+{tracks.length - 4} more</span>}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => playQueue(tracks, 0)} disabled={!tracks.length || loading}
              className="w-14 h-14 rounded-full bg-green-500 text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl disabled:opacity-40">
              <Play size={22} fill="currentColor" />
            </button>
            <button onClick={() => playQueue([...tracks].sort(() => Math.random() - 0.5), 0)} disabled={!tracks.length || loading}
              className="p-2 text-white/50 hover:text-white transition-colors disabled:opacity-40">
              <Shuffle size={22} />
            </button>
            <p className="text-xs text-white/30">{tracks.length > 0 ? `${tracks.length} songs · Updated today` : ""}</p>
          </div>
        </div>
      </div>

      {/* ── Chart tabs ───────────────────────────────────── */}
      <div className="px-4 sm:px-8 mb-5">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {CHARTS.map((c, i) => (
            <button key={c.key} onClick={() => setActive(i)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold flex-shrink-0 transition-all ${
                active === i ? "bg-white text-black" : "bg-white/[0.08] text-white/60 hover:bg-white/[0.14] hover:text-white"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Track list ───────────────────────────────────── */}
      <div className="px-4 sm:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/40">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <TrendingUp size={40} className="mx-auto mb-3 opacity-20" />
            <p>No chart data available</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden">
            {tracks.map((t, i) => (
              <SongRow key={t.id} song={t} index={i} queue={tracks} showArtwork showAlbum />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
