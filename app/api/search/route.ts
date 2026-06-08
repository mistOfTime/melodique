import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const term = searchParams.get("term") || "";
  const limit = searchParams.get("limit") || "50";
  const entity = searchParams.get("entity") || "song";

  if (!term) return NextResponse.json({ resultCount: 0, results: [] });

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=${limit}&media=music`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ resultCount: 0, results: [] }, { status: 500 });
  }
}
