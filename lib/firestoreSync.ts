"use client";

/**
 * Firestore sync for playlists, liked tracks, followed artists, saved albums.
 * All user data is stored at: users/{uid}/library
 * This syncs across all devices in real-time.
 */

import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";import { db } from "./firebase";

const SYNC_DEBOUNCE = 1500; // ms — wait before writing to avoid hammering Firestore

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLibraryFromFirestore(uid: string): Promise<any | null> {
  if (!uid || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return null;
  try {
    const ref  = doc(db, "users", uid, "data", "library");
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
    return null;
  } catch (e) {
    console.warn("Firestore load failed:", e);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveLibraryToFirestore(uid: string, data: any): Promise<void> {
  if (!uid || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
  try {
    const ref = doc(db, "users", uid, "data", "library");
    await setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.warn("Firestore save failed:", e);
  }
}

// Real-time listener — calls cb whenever another device updates the library
export function subscribeLibrary(
  uid: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (data: any) => void
): () => void {
  if (!uid || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return () => {};
  try {
    const ref = doc(db, "users", uid, "data", "library");
    return onSnapshot(ref, snap => {
      if (snap.exists()) cb(snap.data());
    });
  } catch { return () => {}; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveProfileToFirestore(uid: string, data: any): Promise<void> {
  if (!uid || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
  try {
    const ref = doc(db, "users", uid, "data", "profile");
    await setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.warn("Firestore profile save failed:", e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadProfileFromFirestore(uid: string): Promise<any | null> {
  if (!uid || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return null;
  try {
    const ref  = doc(db, "users", uid, "data", "profile");
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// Real-time profile listener — updates across devices instantly
export function subscribeProfile(
  uid: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (data: any) => void
): () => void {
  if (!uid || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return () => {};
  try {
    const ref = doc(db, "users", uid, "data", "profile");
    return onSnapshot(ref, snap => {
      if (snap.exists()) cb(snap.data());
    });
  } catch { return () => {}; }
}
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debouncedSave(uid: string, data: any) {
  if (timers[uid]) clearTimeout(timers[uid]);
  timers[uid] = setTimeout(() => saveLibraryToFirestore(uid, data), SYNC_DEBOUNCE);
}
