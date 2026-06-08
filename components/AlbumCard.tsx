"use client";

import { Track, getArtwork } from "@/lib/track";
import { usePlayer } from "@/lib/playerContext";
import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface AlbumCardProps {
  collectionId: string;
  title: string;
  artist: string;
  cover: string;
  year: string;
  tracks: Track[];
  source?: "spotify" | "itunes";
}

export default function AlbumCard({ collectionId, title, artist, cover, year, tracks, source = "itunes" }: AlbumCardProps) {
  const { playQueue } = usePlayer();
  const href = source === "spotify" ? `/album/${collectionId}?source=spotify` : `/album/${collectionId}`;

  return (
    <div className="group w-36 sm:w-44 flex-shrink-0">
      <Link href={href} className="block">
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-xl overflow-hidden mb-2 shadow-xl transition-transform duration-300 group-hover:scale-[1.03]">
          {cover ? (
            <Image src={getArtwork(cover, 300)} alt={title} width={176} height={176} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white/10" />
          )}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 sm:p-3">
            <button
              onClick={e => { e.preventDefault(); if (tracks.length) playQueue(tracks, 0); }}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-green-500 flex items-center justify-center shadow-xl hover:scale-110 transition-transform"
            >
              <Play size={16} fill="black" className="ml-0.5" />
            </button>
          </div>
        </div>
        <p className="text-xs sm:text-sm font-semibold text-white truncate hover:underline">{title}</p>
        <p className="text-xs text-white/40 mt-0.5 truncate">{year} · {artist}</p>
      </Link>
    </div>
  );
}
