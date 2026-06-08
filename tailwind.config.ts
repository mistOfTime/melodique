import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "375px",
      },
      colors: {
        "ink": "#0a0a0f",
        "ink-1": "#111118",
        "ink-2": "#1a1a24",
        "ink-3": "#242430",
        "mist": "#e8e4f0",
        "mist-2": "#b8b2c8",
        "mist-3": "#6b6480",
        "violet": "#8b5cf6",
        "violet-light": "#a78bfa",
        "rose": "#f43f5e",
        "amber": "#f59e0b",
        "emerald": "#10b981",
      },
      fontFamily: {
        "display": ["Georgia", "serif"],
        "sans": ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      animation: {
        "spin-slow": "spin 8s linear infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.4s ease-out",
        "bars": "bars 1.2s ease-in-out infinite",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        bars: {
          "0%, 100%": { transform: "scaleY(0.4)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
