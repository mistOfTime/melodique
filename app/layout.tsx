import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlayerProvider } from "@/lib/playerContext";
import { PlaylistProvider } from "@/lib/playlistContext";
import { AuthProvider } from "@/lib/authContext";
import AppShell from "@/components/AppShell";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://melodique-fuys.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "Melodique",
    template: "%s · Melodique",
  },
  description: "Stream any song instantly. Powered by Spotify, iTunes & YouTube with real-time synced lyrics.",
  keywords: ["music", "streaming", "lyrics", "spotify", "itunes", "melodique"],
  authors: [{ name: "Melodique" }],
  creator: "Melodique",

  /* ── Favicon + manifest ── */
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon",        type: "image/png",     sizes: "512x512" },
    ],
    shortcut: "/favicon.svg",
    apple:    "/icon",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable:        true,
    statusBarStyle: "black-translucent",
    title:          "Melodique",
  },

  /* ── OpenGraph ── */
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "Melodique",
    title: "Melodique — Stream any music",
    description: "Stream any song instantly. Powered by Spotify, iTunes & YouTube with real-time synced lyrics.",
    images: [
      {
        url: `${APP_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Melodique — Stream any music",
      },
    ],
  },

  /* ── Twitter / X card ── */
  twitter: {
    card: "summary_large_image",
    title: "Melodique — Stream any music",
    description: "Stream any song instantly. Powered by Spotify, iTunes & YouTube with real-time synced lyrics.",
    images: [`${APP_URL}/opengraph-image`],
  },

  metadataBase: new URL(APP_URL),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1ed760",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <PlayerProvider>
            <PlaylistProvider>
              <AppShell>{children}</AppShell>
            </PlaylistProvider>
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
