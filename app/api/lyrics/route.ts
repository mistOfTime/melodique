export const dynamic = "force-dynamic";
/**
 * Lyrics API — universal multi-source with 5-round fallback chain
 *
 * Sources:
 *  1. lrclib.net     — 8M+ tracks, synced + plain, all languages
 *  2. lyrics.ovh     — large catalog, plain, no key
 *  3. textyl.co      — additional catalog, plain
 *  4. Spotify ISRC   — most accurate title match → lrclib
 *  5. NetEase/163    — strong Japanese/Korean/Chinese coverage (proxy)
 *
 * Strategy:
 *  - Try all title/artist variants in parallel
 *  - Prefer synced lyrics over plain
 *  - Duration-based validation for accurate matching
 *  - Cache 24h for hits, 30min for misses
 */

import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

const TO = 7000;

/* ── String helpers ─────────────────────────────────────── */
function strip(s: string) {
  return s
    .replace(/\s*\(feat[^)]*\)/gi, "")
    .replace(/\s*\(ft\.[^)]*\)/gi, "")
    .replace(/\s*\(with[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*[-–]\s*(remix|edit|version|live|acoustic|remaster.*|official.*|radio edit.*|extended.*|deluxe.*)/gi, "")
    .replace(/\s+/g, " ").trim();
}

const firstArtist = (a: string) =>
  a.split(/[,&]|feat\.|ft\./i)[0].replace(/\(.*?\)/g, "").trim();

const dropThe = (s: string) => s.replace(/^the\s+/i, "").trim();

function titleVariants(artist: string, title: string): Array<[string, string]> {
  const a1  = firstArtist(artist);
  const ct  = strip(title);
  const ca  = strip(a1);
  const noa = dropThe(ca);

  const pairs: Array<[string, string]> = [
    [artist, title],
    [a1, title],
    [ca, ct],
    [a1, ct],
    [noa, ct],
    [ca, title],
    [dropThe(strip(artist)), ct],
  ];

  const seen = new Set<string>();
  return pairs.filter(([a, t]) => {
    const key = `${a.toLowerCase()}|${t.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ── Duration-based validation ─────────────────────────── */
function durationMatch(
  resultDuration: number | undefined,
  expectedMs: number | undefined,
  toleranceMs = 5000
): boolean {
  if (!resultDuration || !expectedMs || expectedMs === 0) return true;
  const resultMs = resultDuration * 1000;
  return Math.abs(resultMs - expectedMs) <= toleranceMs;
}

/* ── Result scoring ─────────────────────────────────────── */
function scoreResult(
  result: { artistName?: string; trackName?: string; duration?: number } | null,
  artist: string,
  title: string,
  durationMs?: number
): number {
  if (!result) return 0;
  let score = 1;
  const ra = (result.artistName ?? "").toLowerCase();
  const rt = (result.trackName ?? "").toLowerCase();
  const fa = firstArtist(artist).toLowerCase();
  const ct = strip(title).toLowerCase();

  if (ra && ra.includes(fa)) score += 3;
  if (ra && fa.includes(ra)) score += 2;
  if (rt && (rt.includes(ct) || ct.includes(rt))) score += 3;
  if (rt && strip(rt) === ct) score += 5;
  if (durationMatch(result.duration, durationMs)) score += 2;
  return score;
}

/* ── lrclib ─────────────────────────────────────────────── */
async function lrclibGet(artist: string, title: string, durationMs?: number) {
  try {
    let url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    if (durationMs) url += `&duration=${Math.round(durationMs / 1000)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(TO), next: { revalidate: 86400 } });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.syncedLyrics || d.plainLyrics) ? d : null;
  } catch { return null; }
}

async function lrclibSearch(q: string) {
  try {
    const r = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(TO), next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return null;
    return list.find((x: { syncedLyrics?: string }) => x.syncedLyrics) ?? list[0];
  } catch { return null; }
}

async function lrclibSearchWithArtistTitle(artist: string, title: string, durationMs?: number) {
  try {
    let url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    if (durationMs) url += `&duration=${Math.round(durationMs / 1000)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(TO), next: { revalidate: 86400 } });
    if (!r.ok) return null;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return null;
    // Score all results and pick the best
    const scored = list
      .map((x: { artistName?: string; trackName?: string; duration?: number; syncedLyrics?: string; plainLyrics?: string }) => ({
        item: x,
        score: scoreResult(x, artist, title, durationMs) + (x.syncedLyrics ? 10 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.item ?? null;
  } catch { return null; }
}

/* ── lyrics.ovh ─────────────────────────────────────────── */
async function ovh(artist: string, title: string) {
  try {
    const r = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(TO), next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.lyrics?.trim() || null;
  } catch { return null; }
}

/* ── textyl.co ──────────────────────────────────────────── */
async function textyl(artist: string, title: string) {
  try {
    const r = await fetch(
      `https://api.textyl.co/api/lyrics?q=${encodeURIComponent(`${artist} ${title}`)}`,
      { signal: AbortSignal.timeout(TO), next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) return null;
    return d.map((l: { lyrics?: string } | string) =>
      typeof l === "string" ? l : (l.lyrics ?? "")
    ).filter(Boolean).join("\n") || null;
  } catch { return null; }
}

/* ── Spotify ISRC → lrclib ──────────────────────────────── */
async function spotifyToLrclib(artist: string, title: string, durationMs?: number) {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;
    const q = `track:${strip(title)} artist:${firstArtist(artist)}`;
    const sr = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=3&market=US`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } }
    );
    if (!sr.ok) return null;
    const sd = await sr.json();
    const items = sd.tracks?.items ?? [];

    // Pick the best match by duration
    let track = items[0];
    if (durationMs && items.length > 1) {
      track = items.reduce((best: { duration_ms?: number }, t: { duration_ms?: number }) =>
        Math.abs((t.duration_ms ?? 0) - durationMs) < Math.abs((best.duration_ms ?? 0) - durationMs) ? t : best
      );
    }
    if (!track) return null;

    const isrc = track.external_ids?.isrc;

    // Try ISRC → lrclib
    if (isrc) {
      const lr = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(isrc)}`,
        { signal: AbortSignal.timeout(TO) }
      );
      if (lr.ok) {
        const list = await lr.json();
        if (Array.isArray(list) && list.length) {
          return list.find((x: { syncedLyrics?: string }) => x.syncedLyrics) ?? list[0];
        }
      }
    }

    // Try Spotify track name + artist (more accurate than iTunes title)
    if (track.name && track.artists?.[0]?.name) {
      return await lrclibSearchWithArtistTitle(track.artists[0].name, track.name, track.duration_ms);
    }
    return null;
  } catch { return null; }
}

/* ── NetEase Music (strong CJK + international coverage) ── */
async function neteaseLyrics(artist: string, title: string): Promise<string | null> {
  try {
    // Search NetEase via a public API proxy
    const searchRes = await fetch(
      `https://music.xianqiao.wang/neteasecloudmusicapi/search?keywords=${encodeURIComponent(`${artist} ${title}`)}&type=1&limit=3`,
      { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const songs = searchData.result?.songs ?? [];
    if (!songs.length) return null;

    const song = songs[0];
    const lyricRes = await fetch(
      `https://music.xianqiao.wang/neteasecloudmusicapi/lyric?id=${song.id}`,
      { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } }
    );
    if (!lyricRes.ok) return null;
    const lyricData = await lyricRes.json();
    const lrc = lyricData.lrc?.lyric ?? lyricData.tlyric?.lyric ?? null;
    if (!lrc || lrc.includes("纯音乐")) return null; // skip "instrumental" marker
    return lrc;
  } catch { return null; }
}

/* ── Main ───────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist    = (searchParams.get("artist") ?? "").trim();
  const title     = (searchParams.get("title") ?? "").trim();
  const durationMs = searchParams.get("duration") ? parseInt(searchParams.get("duration")!) : undefined;

  if (!artist || !title) return NextResponse.json({ synced: null, plain: null });

  const variants = titleVariants(artist, title);
  const fa  = firstArtist(artist);
  const ct  = strip(title);
  const isCJK = /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3\u0E00-\u0E7F\uA000-\uA48F]/.test(artist + title);

  // ── Round 1: lrclib GET with all variants + duration matching ──
  const lrcGetResults = await Promise.all(
    variants.map(([a, t]) => lrclibGet(a, t, durationMs))
  );
  const scored1 = lrcGetResults
    .filter(Boolean)
    .map(x => ({ x, s: scoreResult(x, artist, title, durationMs) + (x?.syncedLyrics ? 10 : 0) }))
    .sort((a, b) => b.s - a.s);

  const syncedGet = scored1.find(r => r.x?.syncedLyrics)?.x;
  const plainGet  = scored1.find(r => r.x?.plainLyrics)?.x;

  if (syncedGet?.syncedLyrics) return ok(syncedGet.syncedLyrics, syncedGet.plainLyrics ?? null);

  // ── Round 2: lrclib structured search + plain sources in parallel ──
  const [
    searchHit1, searchHit2, searchHit3, searchHit4,
    ovhHit1, ovhHit2, textylHit,
    // CJK: also try NetEase immediately in parallel
    neteaseHit,
  ] = await Promise.all([
    lrclibSearchWithArtistTitle(fa, ct, durationMs),
    lrclibSearchWithArtistTitle(fa, title, durationMs),
    lrclibSearch(`${fa} ${ct}`),
    lrclibSearch(`${ct} ${fa}`),
    ovh(fa, ct),
    ovh(fa, title),
    textyl(fa, ct),
    isCJK ? neteaseLyrics(fa, ct) : Promise.resolve(null),
  ]);

  const searchResults = [searchHit1, searchHit2, searchHit3, searchHit4].filter(Boolean);
  const scoredSearch = searchResults
    .map(x => ({ x, s: scoreResult(x, artist, title, durationMs) + (x?.syncedLyrics ? 10 : 0) }))
    .sort((a, b) => b.s - a.s);

  const searchSynced = scoredSearch.find(r => r.x?.syncedLyrics)?.x;
  const searchPlain  = scoredSearch.find(r => r.x?.plainLyrics)?.x;

  if (searchSynced?.syncedLyrics) return ok(searchSynced.syncedLyrics, searchSynced.plainLyrics ?? null);
  if (plainGet?.plainLyrics)     return ok(null, plainGet.plainLyrics);
  if (searchPlain?.plainLyrics)  return ok(null, searchPlain.plainLyrics);
  if (neteaseHit)                return ok(neteaseHit.startsWith("[") ? neteaseHit : null, neteaseHit.startsWith("[") ? null : neteaseHit);
  if (ovhHit1)   return ok(null, ovhHit1 as string);
  if (ovhHit2)   return ok(null, ovhHit2 as string);
  if (textylHit) return ok(null, textylHit as string);

  // ── Round 3: Spotify ISRC → lrclib (accurate cross-language matching) ──
  const isrcHit = await spotifyToLrclib(artist, title, durationMs);
  if (isrcHit?.syncedLyrics) return ok(isrcHit.syncedLyrics, isrcHit.plainLyrics ?? null);
  if (isrcHit?.plainLyrics)  return ok(null, isrcHit.plainLyrics);

  // ── Round 4: Short title fallback ──
  const words = ct.split(" ").filter(w => w.length > 1);
  if (words.length > 2) {
    const short = words.slice(0, 3).join(" ");
    const [shortSearch, ovhShort] = await Promise.all([
      lrclibSearchWithArtistTitle(fa, short, durationMs),
      ovh(fa, short),
    ]);
    if (shortSearch?.syncedLyrics) return ok(shortSearch.syncedLyrics, shortSearch.plainLyrics ?? null);
    if (shortSearch?.plainLyrics)  return ok(null, shortSearch.plainLyrics);
    if (ovhShort) return ok(null, ovhShort as string);
  }

  // ── Round 5: CJK — try Romanized/translated title via lrclib search ──
  if (isCJK) {
    const cjkSearch = await lrclibSearch(`${fa}`);
    if (cjkSearch?.syncedLyrics) return ok(cjkSearch.syncedLyrics, cjkSearch.plainLyrics ?? null);
    if (cjkSearch?.plainLyrics)  return ok(null, cjkSearch.plainLyrics);
  }

  return NextResponse.json(
    { synced: null, plain: null },
    { headers: { "Cache-Control": "public, s-maxage=1800" } }
  );
}

function ok(synced: string | null, plain: string | null) {
  return NextResponse.json(
    { synced, plain },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
