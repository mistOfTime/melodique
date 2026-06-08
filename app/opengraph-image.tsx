import { ImageResponse } from "next/og";

export const runtime     = "edge";
export const alt         = "Melodique — Stream any music";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Green gradient glow top-left */}
        <div style={{
          position: "absolute", top: -200, left: -200,
          width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(29,215,84,0.25) 0%, transparent 70%)",
          display: "flex",
        }} />

        {/* Subtle glow bottom-right */}
        <div style={{
          position: "absolute", bottom: -150, right: -150,
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(29,215,84,0.12) 0%, transparent 70%)",
          display: "flex",
        }} />

        {/* Main content */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          zIndex: 10,
        }}>
          {/* Logo row — circle + wordmark */}
          <div style={{
            display: "flex", alignItems: "center", gap: 20,
          }}>
            {/* Green circle icon */}
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              background: "#1ed760",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {/* Simple music note using text */}
              <span style={{ fontSize: 44, color: "#000", fontWeight: 900, lineHeight: 1 }}>♪</span>
            </div>
            <span style={{
              fontSize: 80, fontWeight: 900, color: "#ffffff", letterSpacing: -2,
            }}>
              Melodique
            </span>
          </div>

          {/* Tagline */}
          <span style={{
            fontSize: 34, color: "rgba(255,255,255,0.65)", fontWeight: 400, textAlign: "center",
            maxWidth: 800,
          }}>
            Stream any song. Instantly. Free.
          </span>

          {/* Feature pills */}
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
            {["Spotify", "Free", "Unlimited Skips", "Songs"].map((label) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 100,
                padding: "10px 24px",
                fontSize: 22,
                color: "rgba(255,255,255,0.8)",
                fontWeight: 600,
                display: "flex",
              }}>
                {label}
              </div>
            ))}
          </div>

          {/* URL */}
          <span style={{
            fontSize: 22, color: "#1ed760", marginTop: 8, fontWeight: 500,
          }}>
            melodique-fuys.vercel.app
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
