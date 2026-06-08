export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

// Server-side memory cache
const cache = new Map<string, { id: string | null; ts: number }>();
const CACHE_TTL = 3600 * 1000; // 1 hour

function cached(key: string): string | null | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return undefined; }
  return e.id;
}
function setCache(key: string, id: string | null) {
  cache.set(key, { id, ts: Date.now() });
}

function cleanTitle(t: string) {
  return t
    .replace(/\s*\(feat[^)]*\)/gi, "")
    .replace(/\s*\(ft\.[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*-\s*(official.*|audio|video|lyric.*|hd|hq)/gi, "")
    .replace(/\s+/g, " ").trim();
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ── Strategy 1: YouTube HTML scrape ─────────────────────
   Most reliable when it works — scrapes the YouTube search
   results page directly, no API key needed.
   ─────────────────────────────────────────────────────── */
async function scrapeYouTube(query: string): Promise<string | null> {
  const urls = [
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`,
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 3600 },
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Multiple patterns for videoId extraction
      const patterns = [
        /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
        /\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /"url"\s*:\s*"\/watch\?v=([a-zA-Z0-9_-]{11})/,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m?.[1]) return m[1];
      }
    } catch { continue; }
  }
  return null;
}

/* ── Strategy 2: Invidious API ───────────────────────────
   Open-source YouTube frontend with JSON API.
   Multiple instances for redundancy.
   ─────────────────────────────────────────────────────── */
const INVIDIOUS = [
  "https://invidious.nerdvpn.de",
  "https://invidious.privacydev.net",
  "https://inv.nadeko.net",
  "https://invidious.perennialte.ch",
  "https://yt.cdaut.de",
  "https://invidious.lunar.icu",
  "https://vid.puffyan.us",
  "https://invidious.io",
];

async function invidiousSearch(query: string): Promise<string | null> {
  // Try instances in parallel, take first success
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
    if (r.status === "fulfilled") return r.value;
  }
  return null;
}

/* ── Strategy 3: Piped API ───────────────────────────────
   Alternative YouTube frontend with JSON search API.
   ─────────────────────────────────────────────────────── */
const PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.tokhmi.xyz",
  "https://piped-api.garudalinux.org",
];

async function pipedSearch(query: string): Promise<string | null> {
  for (const base of PIPED) {
    try {
      const res = await fetch(
        `${base}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const items = data.items ?? [];
      const video = items.find((v: { type?: string; url?: string }) => v.type === "stream" && v.url);
      if (video?.url) {
        const m = video.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (m?.[1]) return m[1];
        // /watch/VIDEO_ID format
        const m2 = video.url.match(/\/watch\/([a-zA-Z0-9_-]{11})/);
        if (m2?.[1]) return m2[1];
      }
    } catch { continue; }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = (searchParams.get("artist") ?? "").trim();
  const title  = (searchParams.get("title") ?? "").trim();

  if (!artist || !title) return NextResponse.json({ videoId: null });

  const ct = cleanTitle(title);
  const cacheKey = `${artist.toLowerCase()}::${ct.toLowerCase()}`;

  // Return cached result
  const hit = cached(cacheKey);
  if (hit !== undefined) return NextResponse.json({ videoId: hit });

  // Build search queries (most specific → least specific)
  const queries = [
    `${artist} ${ct} official audio`,
    `${artist} ${ct} audio`,
    `${artist} ${ct}`,
    `${ct} ${artist}`,
  ];

  // Strategy 1: YouTube scrape + Invidious in parallel for each query
  for (const q of queries) {
    const [ytResult, invResult] = await Promise.allSettled([
      scrapeYouTube(q),
      invidiousSearch(q),
    ]);

    const id = (ytResult.status === "fulfilled" && ytResult.value) ||
               (invResult.status === "fulfilled" && invResult.value) || null;

    if (id) {
      setCache(cacheKey, id);
      return NextResponse.json({ videoId: id });
    }
  }

  // Strategy 2: Piped as additional fallback
  for (const q of queries.slice(0, 2)) {
    const id = await pipedSearch(q);
    if (id) {
      setCache(cacheKey, id);
      return NextResponse.json({ videoId: id });
    }
  }

  setCache(cacheKey, null);
  return NextResponse.json({ videoId: null });
}
