/**
 * Lyrics API — multi-source with aggressive fallback chain
 *
 * Sources (in priority order):
 *  1. lrclib.net   — 8M+ tracks, synced + plain, completely free
 *  2. lyrics.ovh   — large catalog, plain lyrics, no key needed
 *  3. textyl.co    — additional catalog, plain lyrics
 *
 * All sources are tried in parallel to minimise latency.
 * Synced lyrics are always preferred over plain.
 * Results are cached 24h so repeat plays are instant.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

const TO = 7000; // 7s per source

/* ── Helpers ────────────────────────────────────────────── */
function strip(s: string) {
  return s
    .replace(/\s*\(feat[^)]*\)/gi, "")
    .replace(/\s*\(ft\.[^)]*\)/gi, "")
    .replace(/\s*\(with[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*[-–]\s*(remix|edit|version|live|acoustic|remaster.*|official.*)/gi, "")
    .replace(/\s+/g, " ").trim();
}
const fa = (a: string) => a.split(/[,&]|feat\.|ft\./i)[0].replace(/\(.*?\)/g, "").trim();

/* ── lrclib ─────────────────────────────────────────────── */
async function lrclibDirect(artist: string, title: string) {
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
    const q = `track:${strip(title)} artist:${fa(artist)}`;
    const sr = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1&market=US`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } }
    );
    if (!sr.ok) return null;
    const sd = await sr.json();
    const isrc = sd.tracks?.items?.[0]?.external_ids?.isrc;
    if (!isrc) return null;
    const lr = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(isrc)}`,
      { signal: AbortSignal.timeout(TO) }
    );
    if (!lr.ok) return null;
    const list = await lr.json();
    if (!Array.isArray(list) || !list.length) return null;
    return list.find((x: { syncedLyrics?: string }) => x.syncedLyrics) ?? list[0];
  } catch { return null; }
}

/* ── Main ───────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = (searchParams.get("artist") ?? "").trim();
  const title  = (searchParams.get("title") ?? "").trim();
  if (!artist || !title) return NextResponse.json({ synced: null, plain: null });

  const ct = strip(title);
  const ca = fa(artist);

  // All fast sources in parallel — pick best result
  const [a, b, c, d, e, f, g, h] = await Promise.all([
    lrclibDirect(artist, title),           // exact original
    lrclibDirect(ca, ct),                  // cleaned
    lrclibDirect(ca, title),               // clean artist, original title
    lrclibSearch(`${ca} ${ct}`),           // search
    lrclibSearch(ct),                      // title-only search
    ovh(ca, ct),                           // lyrics.ovh cleaned
    ovh(ca, title),                        // lyrics.ovh original
    textyl(ca, ct),                        // textyl
  ]);

  // Pick best: prefer synced lrclib > plain lrclib > ovh > textyl
  const lrcHit = [a, b, c, d, e].find(x => x && (x.syncedLyrics || x.plainLyrics));
  if (lrcHit?.syncedLyrics) return ok(lrcHit.syncedLyrics, lrcHit.plainLyrics ?? null);
  if (lrcHit?.plainLyrics)  return ok(null, lrcHit.plainLyrics);
  if (f) return ok(null, f as string);
  if (g) return ok(null, g as string);
  if (h) return ok(null, h as string);

  // Slower fallback: Spotify ISRC → lrclib (most accurate for tricky tracks)
  const isrcHit = await spotifyToLrclib(artist, title);
  if (isrcHit?.syncedLyrics) return ok(isrcHit.syncedLyrics, isrcHit.plainLyrics ?? null);
  if (isrcHit?.plainLyrics)  return ok(null, isrcHit.plainLyrics);

  // Last try: first few words of title only
  if (ct.split(" ").length > 2) {
    const short = await lrclibSearch(ct.split(" ").slice(0, 3).join(" "));
    if (short?.syncedLyrics) return ok(short.syncedLyrics, short.plainLyrics ?? null);
    if (short?.plainLyrics)  return ok(null, short.plainLyrics);
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
