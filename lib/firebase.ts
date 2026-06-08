import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

// Guard: don't initialize Firebase if env vars are missing
// This prevents build-time crashes on Vercel when env vars aren't set yet
if (!apiKey && typeof window !== "undefined") {
  console.warn("Firebase: NEXT_PUBLIC_FIREBASE_API_KEY is not set. Auth will not work.");
}

const firebaseConfig = {
  apiKey:            apiKey ?? "",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

// Only initialize if we have a real API key
const app = apiKey
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : (getApps().length ? getApp() : initializeApp({ ...firebaseConfig, apiKey: "placeholder" }));

export const auth = getAuth(app);
export default app;
