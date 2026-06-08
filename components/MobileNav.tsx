"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, Heart, User } from "lucide-react";
import { usePlaylists } from "@/lib/playlistContext";

const tabs = [
  { href: "/",        icon: Home,    label: "Home" },
  { href: "/search",  icon: Search,  label: "Search" },
  { href: "/liked",   icon: Heart,   label: "Liked" },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/profile", icon: User,    label: "Profile" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { state } = usePlaylists();
  const likedCount = state.likedTracks.length;

  return (
    <nav className="flex-shrink-0 bg-[#181818] border-t border-white/[0.07] flex items-center justify-around px-1 py-1.5">
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        const isLiked = href === "/liked";
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[52px] relative ${
              active ? "text-white" : "text-white/35 hover:text-white/70"
            }`}
          >
            <div className="relative">
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8}
                className={active ? "text-white" : ""} />
              {/* Badge for liked count */}
              {isLiked && likedCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-green-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {likedCount > 99 ? "99+" : likedCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium ${active ? "text-white" : "text-white/35"}`}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
