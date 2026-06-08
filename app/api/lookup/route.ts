export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id     = searchParams.get("id") || "";
  const entity = searchParams.get("entity") || "song";
  const limit  = searchParams.get("limit") || "200";

  if (!id) return NextResponse.json({ resultCount: 0, results: [] });

  try {
    const url = `https://itunes.apple.com/lookup?id=${id}&entity=${entity}&limit=${limit}`;
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ resultCount: 0, results: [] }, { status: 500 });
  }
}
