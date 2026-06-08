import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type  = searchParams.get("type") || "new-releases";
  const limit = searchParams.get("limit") || "20";

  const token = await getSpotifyToken();
  if (!token) return NextResponse.json({ error: "No token" }, { status: 500 });

  const headers = { Authorization: `Bearer ${token}` };

  try {
    if (type === "new-releases") {
      const res = await fetch(
        `https://api.spotify.com/v1/browse/new-releases?limit=${limit}&country=US`,
        { headers, next: { revalidate: 3600 } }
      );
      if (!res.ok) return NextResponse.json({ albums: { items: [] } });
      return NextResponse.json(await res.json());
    }

    if (type === "featured") {
      const res = await fetch(
        `https://api.spotify.com/v1/browse/featured-playlists?limit=${limit}&country=US`,
        { headers, next: { revalidate: 3600 } }
      );
      if (!res.ok) return NextResponse.json({ playlists: { items: [] } });
      return NextResponse.json(await res.json());
    }

    if (type === "categories") {
      const res = await fetch(
        `https://api.spotify.com/v1/browse/categories?limit=${limit}&country=US`,
        { headers, next: { revalidate: 86400 } }
      );
      if (!res.ok) return NextResponse.json({ categories: { items: [] } });
      return NextResponse.json(await res.json());
    }

    if (type === "category-playlists") {
      const category = searchParams.get("category") || "toplists";
      const res = await fetch(
        `https://api.spotify.com/v1/browse/categories/${category}/playlists?limit=${limit}&country=US`,
        { headers, next: { revalidate: 3600 } }
      );
      if (!res.ok) return NextResponse.json({ playlists: { items: [] } });
      return NextResponse.json(await res.json());
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
