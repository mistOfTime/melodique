"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Track, apiToTrack, getArtwork } from "@/lib/track";
import SongRow from "@/components/SongRow";
import { Search, Loader2, X, Music2, Clock, PlusCircle } from "lucide-react";
import { usePlayer } from "@/lib/playerContext";
import { usePlaylists } from "@/lib/playlistContext";
import { getRecentSongs } from "@/lib/playerContext";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SEARCH_HISTORY_KEY = "melodique_search_history";
const MAX_HISTORY = 10;

function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveToHistory(term: string) {
  try {
    const h = getHistory().filter(t => t.toLowerCase() !== term.toLowerCase());
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify([term, ...h].slice(0, MAX_HISTORY)));
  } catch { /* ignore */ }
}
function removeFromHistory(term: string) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(getHistory().filter(t => t !== term)));
  } catch { /* ignore */ }
}

const GENRES: { label: string; color: string; query: string }[] = [
  { label: "Pop",        color: "#e13300", query: "pop new 2025" },
  { label: "Hip-Hop",    color: "#8d67ab", query: "hip hop rap 2025" },
  { label: "R&B",        color: "#1e3264", query: "rnb soul 2025" },
  { label: "Rock",       color: "#477d95", query: "rock 2025" },
  { label: "Electronic", color: "#e8115b", query: "electronic dance 2025" },
  { label: "Latin",      color: "#503750", query: "latin reggaeton 2025" },
  { label: "K-Pop",      color: "#148a08", query: "kpop 2025" },
  { label: "Indie",      color: "#e91429", query: "indie alternative 2025" },
  { label: "Drill",      color: "#0d73ec", query: "drill 2025" },
  { label: "Metal",      color: "#ba5d07", query: "metal heavy 2025" },
  { label: "Lo-Fi",      color: "#555566", query: "lofi chill beats" },
  { label: "Jazz",       color: "#af2896", query: "jazz new" },
  { label: "Afrobeats",  color: "#1db954", query: "afrobeats 2025" },
  { label: "Country",    color: "#c84b31", query: "country 2025" },
  { label: "Classical",  color: "#4a4a6a", query: "classical orchestra" },
  { label: "Reggae",     color: "#2d6a4f", query: "reggae dancehall" },
];

interface SuggestItem {
  type: "query" | "track" | "artist";
  label: string;
  sublabel?: string;
  image?: string;
  track?: Track;
  artistName?: string;
}

function getUniqueAlbums(tracks: Track[]) {
  const seen = new Map<string, Track>();
  for (const t of tracks) {
    const key = `${t.collectionName.toLowerCase().trim()}::${t.artistName.toLowerCase().trim()}`;
    if (!seen.has(key)) seen.set(key, t);
  }
  return Array.from(seen.values());
}
function getUniqueArtists(tracks: Track[]) {
  const seen = new Map<string, Track>();
  for (const t of tracks) {
    if (!seen.has(t.artistName.toLowerCase().trim())) seen.set(t.artistName.toLowerCase().trim(), t);
  }
  return Array.from(seen.values()).slice(0, 6);
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      <span className="text-white/50">{text.slice(0, idx)}</span>
      <span className="text-white font-bold">{text.slice(idx, idx + query.length)}</span>
      <span className="text-white/80">{text.slice(idx + query.length)}</span>
    </span>
  );
}

export default function SearchPage() {
  const [query, setQuery]             = useState("");
  const [tracks, setTracks]           = useState<Track[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [searched, setSearched]       = useState(false);
  const [showDrop, setShowDrop]       = useState(false);
  const [history, setHistory]         = useState<string[]>([]);
  const [recentSongs, setRecentSongs] = useState<Track[]>([]);
  const [genreData, setGenreData]     = useState<Map<string, Track>>(new Map());
  const [activeIdx, setActiveIdx]     = useState(-1);

  const { playQueue } = usePlayer();
  const { toggleLiked, isLiked, followArtist, isFollowing } = usePlaylists();
  const router        = useRouter();
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const dropRef       = useRef<HTMLDivElement>(null);
  const suggestAbort  = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(getHistory());
    setRecentSongs(getRecentSongs(12));
  }, []);

  // Genre cover art preload — load all genres in parallel with Spotify-quality results
  useEffect(() => {
    if (genreData.size > 0) return;
    Promise.all(GENRES.map(g =>
      fetch(`/api/music/search?q=${encodeURIComponent(g.query)}&limit=3`)
        .then(r => r.json())
        .then(d => {
          // Pick the result with the best artwork (non-empty)
          const results = (d.results ?? []).map(apiToTrack) as Track[];
          const withArt = results.find(t => t.artworkUrl100 && t.artworkUrl100.length > 10);
          return { label: g.label, track: withArt ?? null };
        })
        .catch(() => ({ label: g.label, track: null }))
    )).then(results => {
      const m = new Map<string, Track>();
      results.forEach(({ label, track }) => { if (track) m.set(label, track); });
      setGenreData(m);
    });
  }, [genreData.size]);

  // Close dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Autocomplete suggestions (fast, debounced)
  const fetchSuggestions = useCallback(async (term: string) => {
    if (!term.trim()) { setSuggestions([]); return; }
    if (suggestAbort.current) suggestAbort.current.abort();
    suggestAbort.current = new AbortController();
    try {
      const res  = await fetch(`/api/music/search?q=${encodeURIComponent(term)}&limit=10`, { signal: suggestAbort.current.signal });
      const data = await res.json();
      const results = (data.results ?? []).map(apiToTrack) as Track[];
      const items: SuggestItem[] = [];

      // Query suggestions from history prefix matches
      const hist = getHistory().filter(h => h.toLowerCase().startsWith(term.toLowerCase())).slice(0, 3);
      hist.forEach(h => items.push({ type: "query", label: h }));

      // Unique artists first (up to 2)
      const artists = getUniqueArtists(results).slice(0, 2);
      artists.forEach(t => items.push({
        type: "artist", label: t.artistName, sublabel: "Artist",
        image: t.artworkUrl100, artistName: t.artistName, track: t,
      }));

      // Top tracks (up to 4)
      results.slice(0, 4).forEach(t => items.push({
        type: "track", label: t.trackName, sublabel: `Song · ${t.artistName}`,
        image: t.artworkUrl100, track: t,
      }));

      setSuggestions(items.slice(0, 8));
    } catch { /* aborted or error */ }
  }, []);

  // Full search
  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) { setTracks([]); setSearched(false); return; }
    setLoading(true); setSearched(true); setShowDrop(false);
    try {
      const res  = await fetch(`/api/music/search?q=${encodeURIComponent(term)}&limit=100`);
      const data = await res.json();
      const results = (data.results ?? []).map(apiToTrack) as Track[];
      setTracks(results);
      if (results.length > 0) { saveToHistory(term); setHistory(getHistory()); }
    } finally { setLoading(false); }
  }, []);

  const handleChange = (v: string) => {
    setQuery(v); setActiveIdx(-1);
    if (!v.trim()) { setSuggestions([]); setShowDrop(false); return; }
    setShowDrop(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 180);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") {
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        const s = suggestions[activeIdx];
        if (s.type === "artist") router.push(`/artist/${encodeURIComponent(s.label)}`);
        else if (s.type === "track" && s.track) { playQueue([s.track], 0); setShowDrop(false); }
        else { setQuery(s.label); doSearch(s.label); }
      } else {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSearch(query);
      }
    }
    else if (e.key === "Escape") { setShowDrop(false); setQuery(""); }
  };

  const handleSuggestionClick = (s: SuggestItem) => {
    if (s.type === "artist") { router.push(`/artist/${encodeURIComponent(s.label)}`); }
    else if (s.type === "track" && s.track) { playQueue([s.track], 0); setShowDrop(false); }
    else { setQuery(s.label); doSearch(s.label); }
  };

  const albums  = getUniqueAlbums(tracks);
  const artists = getUniqueArtists(tracks);

  return (
    <div className="min-h-full bg-[#121212] px-4 sm:px-6 pt-6 pb-6 animate-fade-in">
      <h1 className="font-bold text-2xl text-white mb-4">Search</h1>

      {/* ── Search bar + dropdown ────────────────────────── */}
      <div className="relative max-w-2xl mb-5 z-50">
        {/* Input */}
        <div className={`flex items-center gap-3 bg-[#2a2a2a] border ${showDrop && query ? "border-white rounded-t-2xl rounded-b-none" : "border-white/20 rounded-2xl"} px-4 py-2.5 transition-all`}>
          <Search size={18} className="text-white/60 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (query) setShowDrop(true); }}
            placeholder="What do you want to listen to?"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/35"
          />
          {query && (
            <button onClick={() => { setQuery(""); setTracks([]); setSearched(false); setSuggestions([]); setShowDrop(false); inputRef.current?.focus(); }}
              className="text-white/50 hover:text-white flex-shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDrop && query && suggestions.length > 0 && (
          <div ref={dropRef}
            className="absolute left-0 right-0 top-full bg-[#2a2a2a] border border-white/20 border-t-0 rounded-b-2xl overflow-hidden shadow-2xl z-50">
            {/* Navigate hint */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="flex items-center gap-1 bg-white/10 px-1.5 py-0.5 rounded text-[10px]">↑↓</span>
                Navigate
              </div>
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">Enter</span>
                Search
              </div>
            </div>

            {suggestions.map((s, i) => (
              <div key={`${s.type}-${s.label}-${i}`}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${activeIdx === i ? "bg-white/10" : "hover:bg-white/[0.06]"}`}
                onClick={() => handleSuggestionClick(s)}>

                {/* Icon / image */}
                {s.type === "query" ? (
                  <Search size={16} className="text-white/40 flex-shrink-0" />
                ) : s.image ? (
                  <div className={`w-10 h-10 flex-shrink-0 overflow-hidden bg-white/10 ${s.type === "artist" ? "rounded-full" : "rounded-md"}`}>
                    <Image src={getArtwork(s.image, 80)} alt={s.label} width={40} height={40} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className={`w-10 h-10 flex-shrink-0 bg-white/10 flex items-center justify-center ${s.type === "artist" ? "rounded-full" : "rounded-md"}`}>
                    <Music2 size={14} className="text-white/30" />
                  </div>
                )}

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    <HighlightMatch text={s.label} query={query} />
                  </p>
                  {s.sublabel && <p className="text-xs text-white/40 truncate">{s.sublabel}</p>}
                </div>

                {/* Action button */}
                {s.type === "track" && s.track && (
                  <button onClick={e => { e.stopPropagation(); toggleLiked(s.track!); }}
                    className="p-1.5 text-white/30 hover:text-white transition-colors flex-shrink-0">
                    <PlusCircle size={18} strokeWidth={1.5} />
                  </button>
                )}
                {s.type === "artist" && s.artistName && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (!isFollowing(s.artistName!)) {
                        followArtist({ id: s.artistName!, name: s.artistName!, image: s.image ?? "", followers: 0 });
                      }
                    }}
                    className={`text-xs px-3 py-1 rounded-full border font-semibold transition-all flex-shrink-0 ${
                      isFollowing(s.artistName!)
                        ? "border-white/30 text-white/50 cursor-default"
                        : "border-white/40 text-white hover:border-white"
                    }`}>
                    {isFollowing(s.artistName!) ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent searches ─────────────────────────────── */}
      {!query && history.length > 0 && (
        <div className="mb-6 max-w-2xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-white">Recent searches</h2>
            <button onClick={() => { localStorage.removeItem(SEARCH_HISTORY_KEY); setHistory([]); }}
              className="text-xs text-white/40 hover:text-white transition-colors">Clear all</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map(term => (
              <div key={term}
                className="flex items-center gap-2 bg-white/[0.08] hover:bg-white/[0.12] rounded-full px-3 py-1.5 cursor-pointer transition-colors group"
                onClick={() => { setQuery(term); doSearch(term); }}>
                <Clock size={13} className="text-white/40 flex-shrink-0" />
                <span className="text-sm text-white">{term}</span>
                <button onClick={e => { e.stopPropagation(); removeFromHistory(term); setHistory(getHistory()); }}
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-all">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recently played songs ────────────────────────── */}
      {!query && recentSongs.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-white">Recently played</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {recentSongs.map(t => (
              <div key={t.id}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 cursor-pointer group w-20"
                onClick={() => { playQueue([t], 0); }}>
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 flex-shrink-0 group-hover:scale-105 transition-transform">
                  {t.artworkUrl100
                    ? <Image src={getArtwork(t.artworkUrl100, 100)} alt={t.trackName} width={64} height={64} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music2 size={18} className="text-white/20" /></div>}
                </div>
                <p className="text-[10px] text-white/70 truncate w-full text-center">{t.trackName}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Browse genres ────────────────────────────────── */}
      {!query && (
        <div>
          <h2 className="font-bold text-base text-white mb-4">Browse all</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {GENRES.map(genre => {
              const coverTrack = genreData.get(genre.label);
              return (
                <button key={genre.label}
                  onClick={() => { setQuery(genre.label); doSearch(genre.query); }}
                  className="h-[76px] rounded-xl text-left font-bold text-white text-sm px-4 hover:scale-[1.02] transition-transform shadow-md overflow-hidden relative"
                  style={{ background: genre.color }}>
                  <span className="relative z-10">{genre.label}</span>
                  {coverTrack?.artworkUrl100 && (
                    <div className="absolute -bottom-2 -right-2 w-14 h-14 rotate-[25deg] rounded-lg overflow-hidden shadow-xl opacity-70">
                      <Image src={getArtwork(coverTrack.artworkUrl100, 120)} alt={genre.label} width={56} height={56} className="w-full h-full object-cover" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-white/40">
          <Loader2 size={28} className="animate-spin" />
        </div>
      )}

      {/* ── Results ─────────────────────────────────────── */}
      {!loading && searched && (
        <div className="space-y-8">
          {tracks.length === 0 ? (
            <div className="text-center py-20 text-white/40">
              <Search size={40} className="mx-auto mb-3 opacity-20" />
              <p>No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs mt-2 text-white/25">Try a different spelling or artist name</p>
            </div>
          ) : (
            <>
              {/* Top result */}
              <section>
                <h2 className="font-bold text-lg text-white mb-3">Top result</h2>
                <div className="bg-white/[0.05] hover:bg-white/[0.08] rounded-xl p-5 cursor-pointer transition-colors w-full sm:w-64 group relative"
                  onClick={() => playQueue(tracks, 0)}>
                  {tracks[0].artworkUrl100
                    ? <Image src={getArtwork(tracks[0].artworkUrl100, 200)} alt={tracks[0].trackName} width={80} height={80} className="rounded-lg mb-4 shadow-lg object-cover" />
                    : <div className="w-20 h-20 rounded-lg bg-white/10 mb-4 flex items-center justify-center"><Music2 size={24} className="text-white/20" /></div>}
                  <p className="font-bold text-white text-lg truncate">{tracks[0].trackName}</p>
                  <p className="text-sm text-white/50 truncate mt-1">{tracks[0].artistName}</p>
                  <div className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-green-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-105 shadow-xl">
                    <svg viewBox="0 0 16 16" width={16} fill="currentColor"><path d="M3 2.69a1 1 0 0 1 1.47-.88l10.67 5.31a1 1 0 0 1 0 1.76L4.47 14.19A1 1 0 0 1 3 13.31V2.69z"/></svg>
                  </div>
                </div>
              </section>

              {/* Artists */}
              {artists.length > 1 && (
                <section>
                  <h2 className="font-bold text-lg text-white mb-4">Artists</h2>
                  <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
                    {artists.map(t => (
                      <Link key={t.artistName} href={`/artist/${encodeURIComponent(t.artistName)}`}
                        className="flex flex-col items-center gap-2 flex-shrink-0 w-28 group">
                        <div className="w-24 h-24 rounded-full overflow-hidden bg-white/10">
                          {t.artworkUrl100
                            ? <Image src={getArtwork(t.artworkUrl100, 200)} alt={t.artistName} width={96} height={96} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            : <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white/30">{t.artistName[0]}</div>}
                        </div>
                        <p className="text-xs font-semibold text-white text-center truncate w-full">{t.artistName}</p>
                        <p className="text-xs text-white/40">Artist</p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Albums */}
              {albums.length > 0 && (
                <section>
                  <h2 className="font-bold text-lg text-white mb-4">Albums</h2>
                  <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
                    {albums.slice(0, 12).map(t => (
                      <Link key={`${t.collectionId}-${t.artistName}`} href={`/album/${t.collectionId}`}
                        className="flex-shrink-0 w-36 group">
                        <div className="w-36 h-36 rounded-xl overflow-hidden mb-2 bg-white/10 group-hover:scale-[1.03] transition-transform">
                          {t.artworkUrl100
                            ? <Image src={getArtwork(t.artworkUrl100, 300)} alt={t.collectionName} width={144} height={144} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Music2 size={28} className="text-white/20" /></div>}
                        </div>
                        <p className="text-xs font-semibold text-white truncate">{t.collectionName}</p>
                        <p className="text-xs text-white/40 mt-0.5 truncate">{t.releaseDate?.slice(0,4)} · {t.artistName}</p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Songs */}
              <section>
                <h2 className="font-bold text-lg text-white mb-3">Songs ({tracks.length})</h2>
                <div className="rounded-xl overflow-hidden">
                  {tracks.map((t, i) => (
                    <SongRow key={t.id} song={t} index={i} queue={tracks} showAlbum showArtwork />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
