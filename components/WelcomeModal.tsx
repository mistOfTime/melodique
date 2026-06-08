"use client";

import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";

const SEEN_KEY = "melodique_welcome_seen_v1";

const FEATURES = [
  {
    title: "Music keeps playing with screen off",
    desc: "Lock your screen and music continues. Control playback from your lock screen or notification bar.",
  },
  {
    title: "Unlimited skips, no ads",
    desc: "Skip as many songs as you want, anytime. No interruptions, completely free.",
  },
  {
    title: "Install as an app",
    desc: "On Android: open Chrome, tap the menu and select \"Add to Home Screen\". On iPhone: tap Share in Safari, then \"Add to Home Screen\". Works like a real app.",
  },
  {
    title: "Sync across all your devices",
    desc: "Your liked songs, playlists, and followed artists sync automatically between mobile and desktop.",
  },
];

export default function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
        style={{
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">
              Welcome to Melodique
            </h2>
            <p className="text-sm text-white/50 mt-1">
              A few things you should know
            </p>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06] flex-shrink-0 ml-3 mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feature list */}
        <div className="px-6 pb-2 space-y-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex items-start gap-3.5">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check size={11} className="text-green-400" strokeWidth={3} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-snug">{f.title}</p>
                <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pt-4 pb-6">
          <button
            onClick={dismiss}
            className="w-full py-3 rounded-full bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            Got it, let me listen
          </button>
        </div>
      </div>
    </div>
  );
}
