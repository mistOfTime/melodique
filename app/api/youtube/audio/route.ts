export const dynamic = "force-dynamic";
/**
 * YouTube audio URL extractor
 * Uses yt-dlp compatible sources to get a direct audio stream URL
 * so we can play it in a native <audio> element for background playback.
 */
import { NextRequest, NextResponse } from "next/server";

const cache = new Map<string, { url: string; ts: number }>();
const CACHE_TTL = 1800 * 1000; // 30 min (stream URLs expire)

function getCached(videoId: string): string | null {
  const e = cache.get(videoId);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(videoId); return null; }
  return e.url;
}

// Piped instances — return direct audio stream URLs
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.tokhmi.xyz",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.adminforge.de",
];

async function getPipedAudio(videoId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      // audioStreams sorted by quality — pick the best mp4a or opus
      const streams: { url: string; mimeType: string; bitrate?: number }[] =
        data.audioStreams ?? [];
      // Prefer m4a/mp4a for widest browser support, then opus, then any
      const m4a = streams.find(s => s.mimeType?.includes("mp4a") || s.mimeType?.includes("m4a"));
      const opus = streams.find(s => s.mimeType?.includes("opus") || s.mimeType?.includes("webm"));
      const chosen = m4a ?? opus ?? streams[0];
      if (chosen?.url) return chosen.url;
    } catch { continue; }
  }
  return null;
}

// Invidious instances — also provide audio streams
const INVIDIOUS_INSTANCES = [
  "https://invidious.nerdvpn.de",
  "https://invidious.privacydev.net",
  "https://inv.nadeko.net",
  "https://yt.cdaut.de",
];

async function getInvidiousAudio(videoId: string): Promise<string | null> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const formats: { type: string; url: string; bitrate?: number }[] =
        data.adaptiveFormats ?? [];
      const audio = formats
        .filter(f => f.type?.includes("audio"))
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const m4a = audio.find(f => f.type?.includes("mp4a") || f.type?.includes("m4a"));
      const chosen = m4a ?? audio[0];
      if (chosen?.url) return chosen.url;
    } catch { continue; }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const videoId = new URL(req.url).searchParams.get("v")?.trim();
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ url: null }, { status: 400 });
  }

  const cached = getCached(videoId);
  if (cached) return NextResponse.json({ url: cached });

  // Try Piped and Invidious in parallel
  const [pipedUrl, invUrl] = await Promise.allSettled([
    getPipedAudio(videoId),
    getInvidiousAudio(videoId),
  ]);

  const url =
    (pipedUrl.status === "fulfilled" && pipedUrl.value) ||
    (invUrl.status === "fulfilled" && invUrl.value) ||
    null;

  if (url) {
    cache.set(videoId, { url, ts: Date.now() });
    return NextResponse.json({ url });
  }

  return NextResponse.json({ url: null });
}
