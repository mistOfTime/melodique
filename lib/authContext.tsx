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
import { saveProfileToFirestore, loadProfileFromFirestore } from "./firestoreSync";

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
    const unsub = onAuthStateChanged(auth, async (fb) => {
      if (fb) {
        const u = fbUserToUser(fb);
        // Restore locally saved avatar (base64) if present
        try {
          const localAvatar = localStorage.getItem("melodique_avatar");
          if (localAvatar) u.avatar = localAvatar;
        } catch { /* ignore */ }
        // Load profile overrides from Firestore (display name + avatar from other devices)
        try {
          const profile = await loadProfileFromFirestore(fb.uid);
          if (profile?.displayName) u.displayName = profile.displayName;
          if (profile?.avatar) {
            u.avatar = profile.avatar;
            try { localStorage.setItem("melodique_avatar", profile.avatar); } catch { /* ignore */ }
          }
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

    const isBase64 = (s?: string) => !!s && s.startsWith("data:");

    const firebaseUpdate: { displayName?: string; photoURL?: string } = {};
    if (data.displayName && data.displayName.trim()) {
      firebaseUpdate.displayName = data.displayName.trim();
    }
    if (data.avatar && !isBase64(data.avatar)) {
      firebaseUpdate.photoURL = data.avatar;
    }

    if (Object.keys(firebaseUpdate).length > 0) {
      await firebaseUpdateProfile(auth.currentUser, firebaseUpdate);
    }

    // Update local state
    setUser(u => {
      if (!u) return null;
      return {
        ...u,
        displayName: data.displayName?.trim() || u.displayName,
        avatar:      data.avatar || u.avatar,
      };
    });

    // Persist avatar locally
    if (data.avatar) {
      try { localStorage.setItem("melodique_avatar", data.avatar); } catch { /* ignore */ }
    }

    // Sync to Firestore so profile appears on all devices
    if (auth.currentUser) {
      const profileData: Record<string, string> = {};
      if (data.displayName?.trim()) profileData.displayName = data.displayName.trim();
      if (data.avatar) profileData.avatar = data.avatar;
      if (Object.keys(profileData).length > 0) {
        saveProfileToFirestore(auth.currentUser.uid, profileData).catch(() => {});
      }
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
