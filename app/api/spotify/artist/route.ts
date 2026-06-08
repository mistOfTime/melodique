export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotifyToken";

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

async function fetchAllPages(url: string, token: string, max = 500) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = [];
  let next: string | null = url;
  let page = 0;
  while (next && items.length < max && page < 20) {
    page++;
    const res: Response = await fetch(next, {
      headers: headers(token),
      // Short cache for discography so new releases appear quickly
      next: { revalidate: 900 },
    });
    if (!res.ok) break;
    const data = await res.json();
    items = [...items, ...(data.items ?? [])];
    next = data.next ?? null;
  }
  return items;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artistId = searchParams.get("id") ?? "";
  const action   = searchParams.get("action") ?? "albums";

  if (!artistId) return NextResponse.json({ error: "No id" }, { status: 400 });

  const token = await getSpotifyToken();
  if (!token) return NextResponse.json({ error: "No token" }, { status: 500 });

  // ── Top tracks ──────────────────────────────────────
  if (action === "toptracks") {
    const res = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
      { headers: headers(token), next: { revalidate: 3600 } }
    );
    if (!res.ok) return NextResponse.json({ tracks: [] });
    return NextResponse.json(await res.json());
  }

  // ── Related artists ─────────────────────────────────
  if (action === "related") {
    const res = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/related-artists`,
      { headers: headers(token), next: { revalidate: 86400 } }
    );
    if (!res.ok) return NextResponse.json({ artists: [] });
    return NextResponse.json(await res.json());
  }

  // ── Appears on ──────────────────────────────────────
  if (action === "appears_on") {
    const items = await fetchAllPages(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=appears_on&market=US&limit=50`,
      token, 100
    );
    return NextResponse.json({ items: dedupeAlbums(items) });
  }

  // ── Compilations ────────────────────────────────────
  if (action === "compilations") {
    const items = await fetchAllPages(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=compilation&market=US&limit=50`,
      token, 100
    );
    return NextResponse.json({ items: dedupeAlbums(items) });
  }

  // ── Albums only ─────────────────────────────────────
  if (action === "albums_only") {
    const items = await fetchAllPages(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&market=US&limit=50`,
      token, 200
    );
    return NextResponse.json({ items: dedupeAlbums(items) });
  }

  // ── Singles only ────────────────────────────────────
  if (action === "singles") {
    const items = await fetchAllPages(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=single&market=US&limit=50`,
      token, 200
    );
    return NextResponse.json({ items: dedupeAlbums(items) });
  }

  // ── Default: all (album + single) ───────────────────
  const items = await fetchAllPages(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&market=US&limit=50`,
    token, 300
  );
  return NextResponse.json({ items: dedupeAlbums(items) });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupeAlbums(items: any[]) {
  const seen = new Set<string>();
  return items
    .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""))
    .filter(a => {
      // Only dedupe truly identical names — don't strip parentheticals
      const key = (a.name ?? "").toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
