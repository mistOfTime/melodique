"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Loader2 } from "lucide-react";
import Image from "next/image";

export default function EditProfilePage() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();

  const [name, setName]           = useState(user?.displayName ?? "");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState(user?.avatar ?? "");
  // Track whether the user actually changed the avatar
  const [avatarChanged, setAvatarChanged] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreviewAvatar(result);
      setAvatarChanged(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return; // don't save empty name

    setSaving(true);
    try {
      const updates: { displayName?: string; avatar?: string } = {};

      // Only update name if it changed
      if (trimmedName !== user?.displayName) {
        updates.displayName = trimmedName;
      }

      // Only update avatar if user actually picked a new one
      if (avatarChanged && previewAvatar) {
        updates.avatar = previewAvatar;
      }

      // Always call updateProfile to ensure state is fresh
      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
      }

      setSaved(true);
      setTimeout(() => router.push("/profile"), 800);
    } catch (err) {
      console.error("Save profile error:", err);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const displayChar = (name || user.displayName || "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-full bg-[#121212] animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-white/[0.06]">
        <button onClick={() => router.back()}
          className="p-2 text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/[0.06]">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg text-white flex-1">Edit Profile</h1>
        <button onClick={handleSave} disabled={saving || saved || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-all disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" />
           : saved  ? <Check size={14} />
           : null}
          {saved ? "Saved!" : saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="px-4 sm:px-8 pt-8 space-y-8">

        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center shadow-2xl ring-4 ring-[#121212]">
              {previewAvatar
                ? <Image src={previewAvatar} alt={name || "Avatar"} width={112} height={112}
                    className="w-full h-full object-cover" unoptimized />
                : <span className="text-4xl font-black text-white select-none">{displayChar}</span>}
            </div>
            {/* Camera overlay */}
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
              <Camera size={22} className="text-white" />
              <span className="text-[10px] text-white font-medium">Change</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <p className="text-xs text-white/40">Tap photo to change</p>
        </div>

        {/* Display name */}
        <div>
          <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
            Display name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your display name"
            maxLength={50}
            className="w-full bg-white/[0.07] border border-white/[0.12] rounded-lg px-4 py-3 text-white text-base outline-none focus:border-green-500/60 transition-all placeholder-white/25"
          />
          {!name.trim() && (
            <p className="text-red-400 text-xs mt-1.5 px-1">Display name can&apos;t be empty</p>
          )}
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Email</label>
          <p className="text-white/40 text-sm">{user.email}</p>
        </div>

        {/* Account type */}
        <div>
          <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Account type</label>
          <span className={`text-xs px-3 py-1.5 rounded-full ${
            user.provider === "google" ? "bg-blue-500/15 text-blue-400" : "bg-green-500/10 text-green-400"
          }`}>
            {user.provider === "google" ? "Google Account" : "Melodique Account"}
          </span>
        </div>
      </div>
    </div>
  );
}
