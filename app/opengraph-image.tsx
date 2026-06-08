import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Melodique — Stream any music";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a2a1a 50%, #0d0d14 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Glow orb */}
        <div style={{
          position: "absolute", width: 600, height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(29,215,84,0.15) 0%, transparent 70%)",
          top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
          <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
            <path d="M22 4v14.5a4 4 0 1 1-2-3.465V8.82L12 10.91V22.5a4 4 0 1 1-2-3.465V9L22 6V4z" fill="#1ed760"/>
          </svg>
          <span style={{ fontSize: 72, fontWeight: 900, color: "#fff", letterSpacing: -2 }}>
            Melodique
          </span>
        </div>

        {/* Tagline */}
        <p style={{ fontSize: 32, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 400 }}>
          Stream any song. Instantly.
        </p>

        {/* Pills */}
        <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
          {["iTunes", "Spotify", "YouTube", "Lyrics"].map(s => (
            <div key={s} style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 100, padding: "10px 24px",
              fontSize: 22, color: "rgba(255,255,255,0.7)", fontWeight: 600,
            }}>{s}</div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
