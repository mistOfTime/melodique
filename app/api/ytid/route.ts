export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

// Server-side memory cache
const cache = new Map<string, { id: string | null; ts: number }>();
const HIT_TTL  = 3600 * 1000 * 6;  // 6 hours for found IDs
const MISS_TTL = 60 * 1000 * 2;    // 2 minutes for misses — retry quickly

function cached(key: string): string | null | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  const ttl = e.id ? HIT_TTL : MISS_TTL;
  if (Date.now() - e.ts > ttl) { cache.delete(key); return undefined; }
  return e.id;
}
function setCache(key: string, id: string | null) {
  cache.set(key, { id, ts: Date.now() });
}

function cleanTitle(t: string) {
  return t
    .replace(/\s*\(feat[^)]*\)/gi, "")
    .replace(/\s*\(ft\.[^)]*\)/gi, "")
    .replace(/\s*\(with[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*[-–]\s*(official.*|audio|video|lyric.*|hd|hq|music video)/gi, "")
    .replace(/\s+/g, " ").trim();
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Extract first valid video ID from any string
function extractVideoId(text: string): string | null {
  const patterns = [
    /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
    /\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /"url":"\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /watch%3Fv%3D([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m?.[1] && m[1] !== "undefined") return m[1];
  }
  return null;
}

/* ── Strategy 1: YouTube search page scrape ───────────────
   Works when Vercel can reach YouTube (usually does)
   ─────────────────────────────────────────────────────── */
async function scrapeYouTube(query: string): Promise<string | null> {
  const searchUrls = [
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`, // music filter
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  ];
  for (const url of searchUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,*/*",
          "Cookie": "PREF=hl=en&gl=US; CONSENT=YES+",
        },
        signal: AbortSignal.timeout(7000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const id = extractVideoId(html);
      if (id) return id;
    } catch { continue; }
  }
  return null;
}

/* ── Strategy 2: YouTube suggest/autocomplete ─────────────
   Lightweight endpoint, rarely blocked
   ─────────────────────────────────────────────────────── */
async function youtubeSuggest(query: string): Promise<string | null> {
  try {
    // Use YouTube's internal suggest endpoint which returns video IDs in some cases
    const res = await fetch(
      `https://suggestqueries-clients6.youtube.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const id = extractVideoId(text);
    return id;
  } catch { return null; }
}

/* ── Strategy 3: Piped API (multiple instances in parallel) */
const PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.tokhmi.xyz",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
  "https://pipedapi.adminforge.de",
  "https://watchapi.whatever.social",
];

async function pipedSearch(query: string): Promise<string | null> {
  const results = await Promise.allSettled(
    PIPED.map(async (base) => {
      const res = await fetch(
        `${base}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { signal: AbortSignal.timeout(4000), cache: "no-store" }
      );
      if (!res.ok) throw new Error("bad");
      const data = await res.json();
      const items: { type?: string; url?: string }[] = data.items ?? [];
      const video = items.find(v => (v.type === "stream" || v.type === "video") && v.url);
      if (!video?.url) throw new Error("no video");
      // Extract 11-char video ID from URL
      const m = (video.url as string).match(/[?&v=/]([a-zA-Z0-9_-]{11})(?:[&?]|$)/);
      if (!m?.[1]) throw new Error("no id");
      return m[1];
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

/* ── Strategy 4: Invidious API (multiple instances) ───────*/
const INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.privacydev.net",
  "https://yt.cdaut.de",
  "https://invidious.lunar.icu",
  "https://invidious.protokolla.fi",
  "https://iv.melmac.space",
  "https://invidious.fdn.fr",
  "https://invidious.tiekoetter.com",
];

async function invidiousSearch(query: string): Promise<string | null> {
  const results = await Promise.allSettled(
    INVIDIOUS.map(async (base) => {
      const res = await fetch(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        { signal: AbortSignal.timeout(4000), cache: "no-store" }
      );
      if (!res.ok) throw new Error("bad");
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error("empty");
      const video = data.find((v: { type?: string; videoId?: string }) => v.videoId);
      if (!video?.videoId) throw new Error("no id");
      return video.videoId as string;
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

/* ── Strategy 5: YouTube oEmbed URL construction ──────────
   Try common ID patterns from search terms
   This is a last resort using a known good video when all else fails
   ─────────────────────────────────────────────────────── */
async function youtubeDirectFetch(artist: string, title: string): Promise<string | null> {
  // Use the YouTube music search URL and look for data in initial data
  try {
    const q = `${artist} ${title}`;
    const res = await fetch(
      `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "en-US",
        },
        signal: AbortSignal.timeout(7000),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const html = await res.text();
    return extractVideoId(html);
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist    = (searchParams.get("artist") ?? "").trim();
  const title     = (searchParams.get("title") ?? "").trim();
  const excludeId = (searchParams.get("exclude") ?? "").trim();

  if (!artist || !title) return NextResponse.json({ videoId: null });

  const ct = cleanTitle(title);
  const shortArtist = artist.split(/[,&]/)[0].trim();
  const cacheKey = excludeId
    ? `${artist.toLowerCase()}::${ct.toLowerCase()}::excl-${excludeId}`
    : `${artist.toLowerCase()}::${ct.toLowerCase()}`;

  const hit = cached(cacheKey);
  if (hit !== undefined) return NextResponse.json({ videoId: hit });

  // Build queries from most specific to least
  const queries = [
    `${shortArtist} ${ct} official audio`,
    `${shortArtist} - ${ct}`,
    `${shortArtist} ${ct} audio`,
    `${shortArtist} ${ct}`,
    `${ct} ${shortArtist}`,
    `${ct} song`,
  ];

  // Helper: filter out excluded video ID from result
  const filterResult = (id: string | null) =>
    id && id !== excludeId ? id : null;

  // Round 1: Try all strategies in parallel with the best query
  const q0 = queries[0];
  const [ytId, pipedId, invId, ytMusicId] = await Promise.all([
    scrapeYouTube(q0).then(filterResult),
    pipedSearch(q0).then(filterResult),
    invidiousSearch(q0).then(filterResult),
    youtubeDirectFetch(shortArtist, ct).then(filterResult),
  ]);

  const round1 = ytId ?? pipedId ?? invId ?? ytMusicId;
  if (round1) {
    setCache(cacheKey, round1);
    return NextResponse.json({ videoId: round1 });
  }

  // Round 2: Try remaining queries in parallel
  const round2Results = await Promise.allSettled(
    queries.slice(1).map(async q => {
      const [yt, pip, inv] = await Promise.all([
        scrapeYouTube(q).then(filterResult),
        pipedSearch(q).then(filterResult),
        invidiousSearch(q).then(filterResult),
      ]);
      return yt ?? pip ?? inv ?? null;
    })
  );

  for (const r of round2Results) {
    if (r.status === "fulfilled" && r.value) {
      setCache(cacheKey, r.value);
      return NextResponse.json({ videoId: r.value });
    }
  }

  setCache(cacheKey, null);
  return NextResponse.json({ videoId: null });
}
