"use client";

import Image from "next/image";
import { getArtwork } from "@/lib/track";

interface Props {
  playlist: { tracks: { artworkUrl100: string }[]; cover?: string };
  size?: number;
}

export function PlaylistCoverGrid({ playlist, size = 56 }: Props) {
  if (playlist.cover) {
    return (
      <Image src={playlist.cover} alt="" width={size} height={size}
        className="w-full h-full object-cover" unoptimized />
    );
  }

  const covers = Array.from(
    new Map(playlist.tracks.map(t => [t.artworkUrl100, t])).values()
  ).filter(t => t.artworkUrl100).slice(0, 4).map(t => getArtwork(t.artworkUrl100, 100));

  if (covers.length === 0) return (
    <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
      <svg width={Math.floor(size * 0.4)} height={Math.floor(size * 0.4)} viewBox="0 0 32 32" fill="none">
        <path d="M22 4v14.5a4 4 0 1 1-2-3.465V8.82L12 10.91V22.5a4 4 0 1 1-2-3.465V9L22 6V4z" fill="rgba(255,255,255,0.3)"/>
      </svg>
    </div>
  );
  if (covers.length < 4) {
    return <Image src={covers[0]} alt="" width={size} height={size} className="w-full h-full object-cover" />;
  }

  const half = size / 2;
  return (
    <div className="grid grid-cols-2 w-full h-full" style={{ width: size, height: size }}>
      {covers.map((src, i) => (
        <div key={i} style={{ width: half, height: half }} className="overflow-hidden">
          <Image src={src} alt="" width={half} height={half} className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
}
