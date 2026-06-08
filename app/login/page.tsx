"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { Music2, Eye, EyeOff, Loader2 } from "lucide-react";
import { MelodiqueIcon } from "@/components/MelodiqueLogo";
import Link from "next/link";

/* Spotify-style input class */
const INPUT =
  "w-full bg-white border border-[#878787] rounded px-3 py-3.5 text-sm text-black placeholder-[#6a6a6a] outline-none focus:border-[#1ed760] focus:border-2 transition-all [&::-ms-reveal]:hidden";
const LABEL = "block text-xs font-bold text-white mb-1.5 tracking-wide";

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [googleLoad, setGoogleLoad] = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.push("/");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/user-not-found" || code === "auth/invalid-credential")
        setError("Incorrect email or password.");
      else if (code === "auth/wrong-password")
        setError("Incorrect password. Please try again.");
      else if (code === "auth/invalid-email")
        setError("Please enter a valid email address.");
      else if (code === "auth/too-many-requests")
        setError("Too many attempts. Please wait a moment and try again.");
      else
        setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoad(true);
    try {
      await signInWithGoogle();
      router.push("/");
    } finally {
      setGoogleLoad(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <MelodiqueIcon size={36} />
            <span className="text-white font-black text-2xl tracking-tight">Melodique</span>
          </div>
        </div>

        <h1 className="text-3xl font-black text-white text-center mb-8 leading-tight">
          Log in to<br />Melodique
        </h1>

        {/* Google button */}
        <button onClick={handleGoogle} disabled={googleLoad}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-full border border-[#878787] bg-transparent text-white font-bold text-sm hover:border-white hover:scale-[1.02] transition-all mb-3 disabled:opacity-50">
          {googleLoad ? <Loader2 size={18} className="animate-spin" /> : (
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
          )}
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[#292929]" />
          <span className="text-[#a7a7a7] text-xs font-medium">or</span>
          <div className="flex-1 h-px bg-[#292929]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={LABEL}>Email address or username</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email address or username" required className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password" required
                className={INPUT + " pr-12"}
              />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6a6a6a] hover:text-black transition-colors">
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-[#e91429]/10 border border-[#e91429]/30 rounded px-3 py-2.5">
              <span className="text-[#e91429] text-sm">{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-full bg-[#1ed760] text-black font-bold text-sm hover:bg-[#3be477] hover:scale-[1.02] active:scale-[0.99] transition-all disabled:opacity-50 disabled:scale-100 mt-2">
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Log In"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center border-t border-[#292929] pt-6">
          <p className="text-[#a7a7a7] text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-white underline underline-offset-2 hover:text-[#1ed760] transition-colors font-semibold">
              Sign up for Melodique
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
