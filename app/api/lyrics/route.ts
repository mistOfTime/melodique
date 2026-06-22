export const dynamic = "force-dynamic";
/**
 * Lyrics API — multi-source with aggressive fallback chain
 *
 * Sources (in priority order):
 *  1. lrclib.net   — 8M+ tracks, synced + plain, completely free
 *  2. lyrics.ovh   — large catalog, plain lyrics, no key needed
 *  3. textyl.co    — additional catalog, plain lyrics
 *
 * Strategy:
 *  - Try many query variations in parallel (original, cleaned, first-artist-only, etc.)
 *  - Prefer synced lyrics over plain lyrics
 *  - Cache hits for 24h
 */

import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

const TO = 7000; // 7s per source

/* ── String helpers ─────────────────────────────────────── */

/** Remove feat/remix/version/etc. bracketed info */
function strip(s: string) {
  return s
    .replace(/\s*\(feat[^)]*\)/gi, "")
    .replace(/\s*\(ft\.[^)]*\)/gi, "")
    .replace(/\s*\(with[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*[-–]\s*(remix|edit|version|live|acoustic|remaster.*|official.*|radio edit.*|extended.*|deluxe.*)/gi, "")
    .replace(/\s+/g, " ").trim();
}

/** Take only the first credited artist */
const firstArtist = (a: string) =>
  a.split(/[,&]|feat\.|ft\./i)[0].replace(/\(.*?\)/g, "").trim();

/** Remove "the" prefix for search (The Beatles → Beatles) */
const dropThe = (s: string) => s.replace(/^the\s+/i, "").trim();

/** Build a deduplicated array of search strings to try */
function titleVariants(artist: string, title: string): Array<[string, string]> {
  const a1  = firstArtist(artist);
  const ct  = strip(title);
  const ca  = strip(a1);
  const noa = dropThe(ca);

  const pairs: Array<[string, string]> = [
    [artist, title],   // original exact
    [a1, title],       // first artist, original title
    [ca, ct],          // both cleaned
    [a1, ct],          // first artist, cleaned title
    [noa, ct],         // drop "the", cleaned title
    [ca, title],       // clean artist, original title
    [dropThe(strip(artist)), ct], // fully cleaned both
  ];

  // Deduplicate
  const seen = new Set<string>();
  return pairs.filter(([a, t]) => {
    const key = `${a.toLowerCase()}|${t.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ── Validate that a lyric result is likely correct ─────── */
function isLikelyCorrect(result: { artistName?: string; trackName?: string } | null, artist: string, title: string): boolean {
  if (!result) return false;
  // If the result has artist/title metadata, do a loose check
  const ra = (result.artistName ?? "").toLowerCase();
  const rt = (result.trackName ?? "").toLowerCase();
  const fa = firstArtist(artist).toLowerCase();
  const ct = strip(title).toLowerCase();
  if (ra && rt) {
    const artistMatch = ra.includes(fa) || fa.includes(ra) || ra.includes(dropThe(fa)) || dropThe(fa).includes(ra);
    const titleMatch  = rt.includes(ct) || ct.includes(rt) ||
                        rt.includes(ct.split(" ")[0]) || strip(rt).includes(strip(ct));
    return artistMatch || titleMatch;
  }
  return true; // No metadata to validate against — trust it
}

/* ── lrclib ─────────────────────────────────────────────── */
async function lrclibGet(artist: string, title: string) {
  try {
    const r = await fetch(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(TO), next: { revalidate: 86400 } }
    );
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
    // Prefer synced, then any
    return list.find((x: { syncedLyrics?: string }) => x.syncedLyrics) ?? list[0];
  } catch { return null; }
}

async function lrclibSearchWithArtistTitle(artist: string, title: string) {
  try {
    const r = await fetch(
      `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(TO), next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return null;
    return list.find((x: { syncedLyrics?: string }) => x.syncedLyrics) ?? list[0];
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
async function spotifyToLrclib(artist: string, title: string) {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;
    const q = `track:${strip(title)} artist:${firstArtist(artist)}`;
    const sr = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1&market=US`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } }
    );
    if (!sr.ok) return null;
    const sd = await sr.json();
    const track = sd.tracks?.items?.[0];
    const isrc  = track?.external_ids?.isrc;
    if (!isrc) return null;

    // Try ISRC search on lrclib
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

    // Also try with the Spotify-returned track name (more accurate than iTunes)
    if (track.name && track.artists?.[0]?.name) {
      return await lrclibSearchWithArtistTitle(track.artists[0].name, track.name);
    }
    return null;
  } catch { return null; }
}

/* ── Main ───────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = (searchParams.get("artist") ?? "").trim();
  const title  = (searchParams.get("title") ?? "").trim();
  if (!artist || !title) return NextResponse.json({ synced: null, plain: null });

  const variants = titleVariants(artist, title);
  const fa = firstArtist(artist);
  const ct = strip(title);

  // ── Round 1: all lrclib GET variants in parallel ──
  const lrcGetResults = await Promise.all(
    variants.map(([a, t]) => lrclibGet(a, t))
  );
  // Pick the best — prefer synced AND correctly matched
  const syncedGet = lrcGetResults.find(x => x?.syncedLyrics && isLikelyCorrect(x, artist, title))
                 ?? lrcGetResults.find(x => x?.syncedLyrics);
  const plainGet  = lrcGetResults.find(x => x?.plainLyrics && isLikelyCorrect(x, artist, title))
                 ?? lrcGetResults.find(x => x?.plainLyrics);

  if (syncedGet?.syncedLyrics) return ok(syncedGet.syncedLyrics, syncedGet.plainLyrics ?? null);

  // ── Round 2: lrclib structured search + plain fallbacks in parallel ──
  const [
    searchHit1, searchHit2, searchHit3, searchHit4,
    ovhHit1, ovhHit2,
    textylHit,
  ] = await Promise.all([
    lrclibSearchWithArtistTitle(fa, ct),
    lrclibSearchWithArtistTitle(fa, title),
    lrclibSearch(`${fa} ${ct}`),
    lrclibSearch(`${ct} ${fa}`),
    ovh(fa, ct),
    ovh(fa, title),
    textyl(fa, ct),
  ]);

  const searchResults = [searchHit1, searchHit2, searchHit3, searchHit4];
  const searchSynced = searchResults.find(x => x?.syncedLyrics && isLikelyCorrect(x, artist, title))
                    ?? searchResults.find(x => x?.syncedLyrics);
  const searchPlain  = searchResults.find(x => x?.plainLyrics && isLikelyCorrect(x, artist, title))
                    ?? searchResults.find(x => x?.plainLyrics);

  if (searchSynced?.syncedLyrics) return ok(searchSynced.syncedLyrics, searchSynced.plainLyrics ?? null);
  if (plainGet?.plainLyrics)  return ok(null, plainGet.plainLyrics);
  if (searchPlain?.plainLyrics)  return ok(null, searchPlain.plainLyrics);
  if (ovhHit1)  return ok(null, ovhHit1 as string);
  if (ovhHit2)  return ok(null, ovhHit2 as string);
  if (textylHit) return ok(null, textylHit as string);

  // ── Round 3: Spotify ISRC lookup (slower but most accurate) ──
  const isrcHit = await spotifyToLrclib(artist, title);
  if (isrcHit?.syncedLyrics) return ok(isrcHit.syncedLyrics, isrcHit.plainLyrics ?? null);
  if (isrcHit?.plainLyrics)  return ok(null, isrcHit.plainLyrics);

  // ── Round 4: short title search (last resort) ──
  const words = ct.split(" ");
  if (words.length > 2) {
    const short = words.slice(0, 3).join(" ");
    const [shortSearch, ovhShort] = await Promise.all([
      lrclibSearchWithArtistTitle(fa, short),
      ovh(fa, short),
    ]);
    if (shortSearch?.syncedLyrics) return ok(shortSearch.syncedLyrics, shortSearch.plainLyrics ?? null);
    if (shortSearch?.plainLyrics)  return ok(null, shortSearch.plainLyrics);
    if (ovhShort) return ok(null, ovhShort as string);
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
