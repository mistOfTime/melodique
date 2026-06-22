export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

// Server-side memory cache
const cache = new Map<string, { id: string | null; ts: number }>();
const HIT_TTL  = 3600 * 1000 * 6;  // 6 hours for successful lookups
const MISS_TTL = 60 * 1000 * 5;    // 5 minutes for failed lookups (retry sooner)

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

// Extract all videoIds from a string (picks the most-repeated one as most likely correct)
function extractBestVideoId(html: string): string | null {
  const patterns = [
    /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g,
    /\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    /"url":"\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/g,
  ];
  const freq = new Map<string, number>();
  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(html)) !== null) {
      const id = m[1];
      // Filter out obviously wrong IDs (ads, related thumbnails etc.)
      if (id && id !== "undefined" && id.length === 11) {
        freq.set(id, (freq.get(id) ?? 0) + 1);
      }
    }
  }
  if (!freq.size) return null;
  // Return most frequent ID
  let bestId = "";
  let bestCount = 0;
  freq.forEach((count, id) => { if (count > bestCount) { bestCount = count; bestId = id; } });
  return bestId || null;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* ── Strategy 1: YouTube search scrape ─────────────────── */
async function scrapeYouTube(query: string): Promise<string | null> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Cookie": "PREF=hl=en&gl=US",
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractBestVideoId(html);
  } catch { return null; }
}

/* ── Strategy 2: Invidious API (many instances) ─────────── */
const INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.privacydev.net",
  "https://invidious.perennialte.ch",
  "https://yt.cdaut.de",
  "https://invidious.lunar.icu",
  "https://invidious.protokolla.fi",
  "https://iv.melmac.space",
  "https://invidious.fdn.fr",
  "https://invidious.tiekoetter.com",
  "https://invidious.io",
];

async function invidiousSearch(query: string): Promise<string | null> {
  const results = await Promise.allSettled(
    INVIDIOUS.map(async (base) => {
      const res = await fetch(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`,
        { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } }
      );
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error("empty");
      const video = data.find((v: { type?: string; videoId?: string }) => v.type === "video" && v.videoId);
      if (!video?.videoId) throw new Error("no video");
      return video.videoId as string;
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

/* ── Strategy 3: Piped API ───────────────────────────────── */
const PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.tokhmi.xyz",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
  "https://pipedapi.adminforge.de",
];

async function pipedSearch(query: string): Promise<string | null> {
  const results = await Promise.allSettled(
    PIPED.map(async (base) => {
      const res = await fetch(
        `${base}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } }
      );
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      const items = data.items ?? [];
      const video = items.find((v: { type?: string; url?: string }) => v.type === "stream" && v.url);
      if (!video?.url) throw new Error("no video");
      const m = video.url.match(/[?&v=\/watch\/]([a-zA-Z0-9_-]{11})/);
      if (!m?.[1]) throw new Error("no id");
      return m[1];
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

/* ── Strategy 4: YouTube oEmbed (just validates an ID exists) */
async function youtubeOembed(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(3000) }
    );
    return res.ok;
  } catch { return false; }
}

/* ── Build query variants ────────────────────────────────── */
function buildQueries(artist: string, title: string): string[] {
  const ct = cleanTitle(title);
  // Remove common prefixes that confuse search
  const shortArtist = artist.split(/[,&]/)[0].trim();

  const queries: string[] = [
    `${shortArtist} - ${ct} (Official Audio)`,
    `${shortArtist} ${ct} official audio`,
    `${shortArtist} ${ct} audio`,
    `${shortArtist} ${ct}`,
    `${ct} ${shortArtist}`,
    `${ct} official audio`,
  ];

  // Deduplicate
  const seen = new Set<string>();
  const unique: string[] = [];
  queries.forEach(q => { if (!seen.has(q)) { seen.add(q); unique.push(q); } });
  return unique;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = (searchParams.get("artist") ?? "").trim();
  const title  = (searchParams.get("title") ?? "").trim();

  if (!artist || !title) return NextResponse.json({ videoId: null });

  const ct = cleanTitle(title);
  const cacheKey = `${artist.toLowerCase()}::${ct.toLowerCase()}`;

  const hit = cached(cacheKey);
  if (hit !== undefined) return NextResponse.json({ videoId: hit });

  const queries = buildQueries(artist, title);

  // Run all strategies in parallel for the first (best) query
  const [ytId, invId, pipedId] = await Promise.all([
    scrapeYouTube(queries[0]),
    invidiousSearch(queries[0]),
    pipedSearch(queries[0]),
  ]);

  const id = ytId ?? invId ?? pipedId;
  if (id) {
    setCache(cacheKey, id);
    return NextResponse.json({ videoId: id });
  }

  // Try remaining queries sequentially (don't blast all at once)
  for (const q of queries.slice(1)) {
    const [ytR, invR, pipedR] = await Promise.all([
      scrapeYouTube(q),
      invidiousSearch(q),
      pipedSearch(q),
    ]);
    const found = ytR ?? invR ?? pipedR;
    if (found) {
      setCache(cacheKey, found);
      return NextResponse.json({ videoId: found });
    }
  }

  setCache(cacheKey, null);
  return NextResponse.json({ videoId: null });
}
