"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "./firebase";

// ── Public user shape ─────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  provider: "email" | "google";
  createdAt: number;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signUp:           (email: string, password: string, displayName: string) => Promise<void>;
  signIn:           (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut:          () => Promise<void>;
  updateProfile:    (data: Partial<Pick<User, "displayName" | "avatar">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function fbUserToUser(fb: FirebaseUser): User {
  const provider = fb.providerData?.[0]?.providerId === "google.com" ? "google" : "email";
  return {
    id:          fb.uid,
    email:       fb.email ?? "",
    displayName: fb.displayName ?? fb.email?.split("@")[0] ?? "User",
    avatar:      fb.photoURL ?? undefined,
    provider,
    createdAt:   fb.metadata.creationTime
      ? new Date(fb.metadata.creationTime).getTime()
      : Date.now(),
  };
}

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state — persists across refreshes automatically
  useEffect(() => {
    // Don't try to listen if Firebase isn't properly configured
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (fb) => {
      if (fb) {
        const u = fbUserToUser(fb);
        // Restore locally saved avatar (base64) if present
        try {
          const localAvatar = localStorage.getItem("melodique_avatar");
          if (localAvatar) u.avatar = localAvatar;
        } catch { /* ignore */ }
        setUser(u);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Set the display name right away
    await firebaseUpdateProfile(cred.user, { displayName });
    setUser(fbUserToUser({ ...cred.user, displayName }));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will update user automatically
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
    // onAuthStateChanged handles the rest
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const updateProfile = useCallback(async (data: Partial<Pick<User, "displayName" | "avatar">>) => {
    if (!auth.currentUser) return;

    // Firebase photoURL only accepts real http/https URLs — not base64 data URLs.
    // If the avatar is a base64 string, we store it locally only and skip Firebase.
    const isBase64 = (s?: string) => !!s && s.startsWith("data:");

    const firebaseUpdate: { displayName?: string; photoURL?: string } = {};
    if (data.displayName) firebaseUpdate.displayName = data.displayName;
    if (data.avatar && !isBase64(data.avatar)) firebaseUpdate.photoURL = data.avatar;

    if (Object.keys(firebaseUpdate).length > 0) {
      await firebaseUpdateProfile(auth.currentUser, firebaseUpdate);
    }

    // Always update local state (including base64 avatars)
    setUser(u => u ? { ...u, ...data } : null);

    // Persist avatar locally so it survives page refreshes
    if (data.avatar) {
      try { localStorage.setItem("melodique_avatar", data.avatar); } catch { /* ignore */ }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
