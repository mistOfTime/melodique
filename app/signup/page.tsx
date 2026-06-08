"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { Music2, Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { MelodiqueIcon } from "@/components/MelodiqueLogo";
import Link from "next/link";

const INPUT =
  "w-full bg-white border border-[#878787] rounded px-3 py-3.5 text-sm text-black placeholder-[#6a6a6a] outline-none focus:border-[#1ed760] focus:border-2 transition-all [&::-ms-reveal]:hidden";
const LABEL = "block text-xs font-bold text-white mb-1.5 tracking-wide";

function PasswordRule({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-[#1ed760]" : "text-[#a7a7a7]"}`}>
      {met ? <Check size={11} /> : <X size={11} />}
      {text}
    </div>
  );
}

export default function SignupPage() {
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [email, setEmail]             = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [googleLoad, setGoogleLoad]   = useState(false);
  const [error, setError]             = useState("");

  const rules = {
    length: password.length >= 8,
    upper:  /[A-Z]/.test(password),
    number: /\d/.test(password),
    match:  password === confirm && confirm.length > 0,
  };
  const allRulesMet = Object.values(rules).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!allRulesMet) { setError("Please meet all password requirements."); return; }
    setLoading(true);
    try {
      await signUp(email.trim(), password, displayName.trim() || email.split("@")[0]);
      router.push("/");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/email-already-in-use")
        setError("An account with this email already exists. Try logging in.");
      else if (code === "auth/invalid-email")
        setError("Please enter a valid email address.");
      else if (code === "auth/weak-password")
        setError("Password is too weak. Please choose a stronger one.");
      else
        setError(err instanceof Error ? err.message : "Sign up failed.");
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
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2">
            <MelodiqueIcon size={36} />
            <span className="text-white font-black text-2xl tracking-tight">Melodique</span>
          </div>
        </div>

        <h1 className="text-3xl font-black text-white text-center mb-7 leading-tight">
          Sign up free
        </h1>

        {/* Google */}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={LABEL}>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com" required className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>
              Display name <span className="font-normal text-[#a7a7a7]">(optional)</span>
            </label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="What should we call you?" className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password" required
                className={INPUT + " pr-12"} />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6a6a6a] hover:text-black transition-colors">
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {password && (
              <div className="mt-2.5 space-y-1 px-0.5">
                <PasswordRule met={rules.length} text="At least 8 characters" />
                <PasswordRule met={rules.upper}  text="1 uppercase letter" />
                <PasswordRule met={rules.number} text="1 number" />
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Confirm password</label>
            <div className="relative">
              <input type={showConfirm ? "text" : "password"} value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm your password" required
                className={`${INPUT} pr-12 ${confirm && !rules.match ? "border-[#e91429] focus:border-[#e91429]" : ""}`} />
              <button type="button" onClick={() => setShowConfirm(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6a6a6a] hover:text-black transition-colors">
                {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {confirm && !rules.match && (
              <p className="text-[#e91429] text-xs mt-1">Passwords don&apos;t match</p>
            )}
          </div>

          {error && (
            <div className="bg-[#e91429]/10 border border-[#e91429]/30 rounded px-3 py-2.5">
              <span className="text-[#e91429] text-sm">{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-full bg-[#1ed760] text-black font-bold text-sm hover:bg-[#3be477] hover:scale-[1.02] active:scale-[0.99] transition-all disabled:opacity-50 disabled:scale-100 mt-2">
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Create Account"}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-[#292929] pt-6">
          <p className="text-[#a7a7a7] text-sm">
            Already have an account?{" "}
            <Link href="/login" className="text-white underline underline-offset-2 hover:text-[#1ed760] transition-colors font-semibold">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
