"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Player from "@/components/Player";
import NowPlayingPanel from "@/components/NowPlayingPanel";
import YouTubePlayer from "@/components/YouTubePlayer";
import MobileNav from "@/components/MobileNav";
import { usePlayer } from "@/lib/playerContext";
import { useAuth } from "@/lib/authContext";
import { User } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import { MelodiqueIcon } from "@/components/MelodiqueLogo";
import Image from "next/image";
import Link from "next/link";

const AUTH_PATHS = ["/login", "/signup"];
const PAGES_WITH_OWN_HEADER = ["/library", "/profile"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p));
  const { currentSong } = usePlayer();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user && !isAuthPage) {
      router.replace("/login");
    }
  }, [user, loading, isAuthPage, router]);

  if (isAuthPage) return <>{children}</>;

  // Loading spinner
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <path d="M22 4v14.5a4 4 0 1 1-2-3.465V8.82L12 10.91V22.5a4 4 0 1 1-2-3.465V9L22 6V4z" fill="#1ed760"/>
          </svg>
          <div className="w-5 h-5 border-2 border-white/20 border-t-green-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const showOwnHeader = PAGES_WITH_OWN_HEADER.some(p => pathname.startsWith(p));

  return (
    <ToastProvider>
    <div className="flex flex-col h-[100dvh] w-screen bg-[#0a0a0f] overflow-hidden">

      {/* ── Desktop ───────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0 gap-2 p-2">
        <Sidebar />
        <div className="flex-1 min-w-0 rounded-lg bg-[#121212] overflow-hidden flex flex-col">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        {!!currentSong && (
          <div className="w-[340px] flex-shrink-0 rounded-lg bg-[#121212] overflow-hidden flex flex-col">
            <NowPlayingPanel />
          </div>
        )}
      </div>
      <div className="hidden md:block flex-shrink-0">
        <Player />
      </div>

      {/* ── Mobile layout ──────────────────────────────────── */}
      {/* Use flex-col with fixed heights for each zone */}
      <div className="flex md:hidden flex-col w-full" style={{ height: "100dvh" }}>

        {/* Top bar */}
        {!showOwnHeader && (
          <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0 bg-[#121212]">
            <Link href="/" className="flex items-center gap-1.5">
              <MelodiqueIcon size={26} />
            </Link>
            <div className="flex items-center gap-2">
              {user ? (
                <Link href="/profile">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow">
                    {user.avatar
                      ? <Image src={user.avatar} alt={user.displayName} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                      : <span className="text-xs font-bold text-white leading-none">{user.displayName.charAt(0).toUpperCase()}</span>}
                  </div>
                </Link>
              ) : (
                <Link href="/login"
                  className="flex items-center gap-1.5 text-xs text-white/50 bg-white/[0.08] px-3 py-1.5 rounded-full">
                  <User size={13} /> Log in
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Main scrollable content — flex-1 takes remaining space */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-[#121212]">
          {children}
        </main>

        {/* Player — fixed height */}
        <div className="flex-shrink-0 bg-[#181818]">
          <Player />
        </div>

        {/* Bottom nav — always visible */}
        <div className="flex-shrink-0">
          <MobileNav />
        </div>
      </div>

      <YouTubePlayer />
    </div>
    </ToastProvider>
  );
}
