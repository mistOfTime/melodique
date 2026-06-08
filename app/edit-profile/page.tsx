"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Loader2 } from "lucide-react";
import Image from "next/image";

export default function EditProfilePage() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();

  const [name, setName]       = useState(user?.displayName ?? "");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewAvatar, setPreviewAvatar] = useState(user?.avatar ?? "");

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreviewAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        displayName: name.trim() || user?.displayName,
        avatar:      previewAvatar !== user?.avatar ? previewAvatar : undefined,
      });
      setSaved(true);
      setTimeout(() => router.push("/profile"), 800);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-full bg-[#121212] animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-white/[0.06]">
        <button onClick={() => router.back()}
          className="p-2 text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/[0.06]">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg text-white flex-1">Edit Profile</h1>
        <button onClick={handleSave} disabled={saving || saved}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-all disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {saved ? "Saved!" : saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="px-4 sm:px-8 pt-8 space-y-8">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center shadow-2xl ring-4 ring-[#121212]">
              {previewAvatar
                ? <Image src={previewAvatar} alt={name} width={112} height={112} className="w-full h-full object-cover" unoptimized />
                : <span className="text-4xl font-black text-white">{name.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
              <Camera size={22} className="text-white" />
              <span className="text-[10px] text-white font-medium">Change</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <p className="text-xs text-white/40">Tap to change profile photo</p>
        </div>

        {/* Display name */}
        <div>
          <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Display name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your display name"
            className="w-full bg-white/[0.07] border border-white/[0.12] rounded-lg px-4 py-3 text-white text-base outline-none focus:border-green-500/60 transition-all"
          />
        </div>

        {/* Account info (read-only) */}
        <div>
          <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Email</label>
          <p className="text-white/40 text-sm px-1">{user.email}</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Account type</label>
          <span className={`text-xs px-3 py-1.5 rounded-full ${user.provider === "google" ? "bg-blue-500/15 text-blue-400" : "bg-green-500/10 text-green-400"}`}>
            {user.provider === "google" ? "Google Account" : "Melodique Account"}
          </span>
        </div>
      </div>
    </div>
  );
}
