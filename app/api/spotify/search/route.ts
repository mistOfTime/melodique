import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q     = searchParams.get("q") || "";
  const limit = searchParams.get("limit") || "50";
  const type  = searchParams.get("type") || "track";

  if (!q) return NextResponse.json({ tracks: { items: [] } });

  const token = await getSpotifyToken();
  if (!token) return NextResponse.json({ error: "No Spotify token" }, { status: 500 });

  try {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}&market=US`;    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Spotify search error:", res.status, err);
      return NextResponse.json({ error: err }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
