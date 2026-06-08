export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

// Chart definitions — using iTunes RSS feeds which are always free + current
const CHARTS: Record<string, { name: string; description: string; itunesUrl: string }> = {
  "global-top-50":    { name: "Global Top 50",    description: "The most played songs worldwide right now",   itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/json" },
  "us-top-50":        { name: "USA Top 50",        description: "The most played songs in the United States", itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/json" },
  "hot-albums":       { name: "Hot Albums",        description: "The hottest albums right now",               itunesUrl: "https://itunes.apple.com/us/rss/topalbums/limit=50/json" },
  "new-music-friday": { name: "New Releases",      description: "The freshest new music this week",           itunesUrl: "https://itunes.apple.com/us/rss/recentreleases/limit=50/json" },
  "rap-caviar":       { name: "Hip-Hop",           description: "New Hip Hop & Rap",                         itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=18/json" },
  "rock-this":        { name: "Rock",              description: "Rock legends & epic songs",                  itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=21/json" },
  "pop-rising":       { name: "Pop",               description: "The biggest Pop songs",                      itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=14/json" },
  "electronic":       { name: "Electronic",        description: "Fresh electronic & dance music",             itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=7/json" },
  "rb-randb":         { name: "R&B / Soul",        description: "The best R&B right now",                    itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=15/json" },
  "k-pop":            { name: "K-Pop",             description: "The biggest K-Pop songs",                   itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=51/json" },
  "latin":            { name: "Latin",             description: "The hottest Latin tracks",                   itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=12/json" },
  "country":          { name: "Country",           description: "The biggest Country songs",                  itunesUrl: "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=6/json" },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chart = searchParams.get("chart") ?? "global-top-50";

  const chartInfo = CHARTS[chart];
  if (!chartInfo) return NextResponse.json({ error: "Unknown chart" }, { status: 400 });

  try {
    const res = await fetch(chartInfo.itunesUrl, {
      next: { revalidate: 3600 }, // cache 1 hour — charts update daily
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ name: chartInfo.name, description: chartInfo.description, tracks: [] });
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = data.feed?.entry ?? [];

    const tracks = entries.map(entry => {
      const id       = entry.id?.attributes?.["im:id"] ?? "";
      const name     = entry["im:name"]?.label ?? "";
      const artist   = entry["im:artist"]?.label ?? "";
      const album    = entry["im:collection"]?.["im:name"]?.label ?? "";
      const artwork  = entry["im:image"]?.[2]?.label ?? entry["im:image"]?.[0]?.label ?? "";
      const price    = entry["im:price"]?.attributes?.amount ?? "0";

      return {
        id:               `itunes-chart-${id}`,
        trackId:          parseInt(id) || 0,
        trackName:        name,
        artistName:       artist,
        artistId:         "",
        collectionName:   album,
        collectionId:     id,
        artworkUrl100:    artwork.replace("55x55bb", "300x300bb"),
        previewUrl:       null,
        trackTimeMillis:  0,
        primaryGenreName: entry.category?.attributes?.label ?? "",
        releaseDate:      entry["im:releaseDate"]?.label ?? "",
        trackNumber:      0,
        explicit:         false,
        source:           "itunes",
      };
    }).filter(t => t.trackName && t.artistName);

    return NextResponse.json({ name: chartInfo.name, description: chartInfo.description, tracks });
  } catch (e) {
    console.error("Charts fetch error:", e);
    return NextResponse.json({ name: chartInfo.name, description: chartInfo.description, tracks: [] }, { status: 500 });
  }
}
