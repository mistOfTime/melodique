import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const albumId = searchParams.get("id") || "";

  if (!albumId) return NextResponse.json({ error: "No id" }, { status: 400 });

  const token = await getSpotifyToken();
  if (!token) return NextResponse.json({ error: "No token" }, { status: 500 });

  const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}?market=US`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await res.json());
}
