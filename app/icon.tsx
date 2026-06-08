import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size    = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{
        width: 512, height: 512,
        background: "#000",
        borderRadius: 115,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {/* Music note path rendered as SVG */}
        <svg width="320" height="320" viewBox="0 0 32 32" fill="none">
          <path
            d="M22 4v14.5a4 4 0 1 1-2-3.465V8.82L12 10.91V22.5a4 4 0 1 1-2-3.465V9L22 6V4z"
            fill="#1ed760"
          />
        </svg>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
