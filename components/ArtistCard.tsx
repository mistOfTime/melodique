"use client";

import { ItunesTrack, getArtwork } from "@/lib/itunes";
import { usePlayer } from "@/lib/playerContext";
import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface ArtistCardProps {
  artist: string;
  tracks: ItunesTrack[];
}

export default function ArtistCard({ artist, tracks }: ArtistCardProps) {
  const { playQueue } = usePlayer();
  const cover = tracks[0]?.artworkUrl100 ?? "";

  return (
    <div className="group flex flex-col items-center text-center w-36">
      <div className="relative w-32 h-32 rounded-full overflow-hidden mb-3 shadow-xl transition-transform duration-300 group-hover:scale-105">
        {cover && (
          <Image src={getArtwork(cover, 300)} alt={artist} width={128} height={128} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={() => playQueue(tracks, 0)}
            className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <Play size={16} fill="black" className="ml-0.5" />
          </button>
        </div>
      </div>
      <Link href={`/artist/${encodeURIComponent(artist)}`} className="text-sm font-semibold text-white hover:underline truncate w-full">
        {artist}
      </Link>
      <p className="text-xs text-white/40 mt-0.5">Artist</p>
    </div>
  );
}
