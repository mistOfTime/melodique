import { NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

export async function GET() {
  const token = await getSpotifyToken();
  if (!token) return NextResponse.json({ error: "Failed to get token" }, { status: 500 });
  return NextResponse.json({ token });
}
