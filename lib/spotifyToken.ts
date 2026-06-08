// Shared Spotify token cache — used by all server-side API routes

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getSpotifyToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
    return null;
  }

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      // Use no-store only on server — Next.js 14 requires this pattern
      cache: "no-store",
      // next option overrides cache behaviour for static pages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (!res.ok) {
      const err = await res.text();
      console.error("Spotify token error:", res.status, err);
      return null;
    }

    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiry = now + (data.expires_in - 60) * 1000;
    return cachedToken;
  } catch (e) {
    console.error("Spotify token fetch failed:", e);
    return null;
  }
}
