"use client";

import { useEffect, useState, createContext, useContext, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, X, Heart, ListPlus } from "lucide-react";

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "info" | "error";
  icon?: "heart" | "playlist" | "check";
}

interface ToastContextValue {
  show: (message: string, opts?: { type?: ToastItem["type"]; icon?: ToastItem["icon"]; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
    if (timers.current[id]) clearTimeout(timers.current[id]);
  }, []);

  const show = useCallback((message: string, opts?: { type?: ToastItem["type"]; icon?: ToastItem["icon"]; duration?: number }) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(t => [...t.slice(-3), { id, message, type: opts?.type ?? "success", icon: opts?.icon }]);
    timers.current[id] = setTimeout(() => dismiss(id), opts?.duration ?? 2500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex flex-col items-center gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id}
              className="flex items-center gap-3 px-4 py-3 rounded-full shadow-2xl pointer-events-auto cursor-pointer animate-fade-in"
              style={{ background: "rgba(30,30,40,0.97)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}
              onClick={() => dismiss(t.id)}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                t.type === "error" ? "bg-red-500/20" : "bg-green-500/20"
              }`}>
                {t.icon === "heart"    ? <Heart size={13} className="text-green-400" fill="currentColor" />
                : t.icon === "playlist" ? <ListPlus size={13} className="text-green-400" />
                : <Check size={13} className="text-green-400" />}
              </div>
              <span className="text-sm font-medium text-white whitespace-nowrap">{t.message}</span>
              <button className="text-white/30 hover:text-white transition-colors ml-1">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
