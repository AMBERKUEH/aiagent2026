import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { runtimeConfig } from "@/lib/runtimeConfig";

// Firebase is used only for live sensor readings from Realtime Database.
// RAG documents and source files are stored in Supabase.
const firebaseConfig = {
  apiKey: runtimeConfig.VITE_FIREBASE_API_KEY,
  projectId: runtimeConfig.VITE_FIREBASE_PROJECT_ID,
  databaseURL: runtimeConfig.VITE_FIREBASE_DATABASE_URL,
  authDomain: runtimeConfig.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: runtimeConfig.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: runtimeConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: runtimeConfig.VITE_FIREBASE_APP_ID,
};

const requiredKeys = [
  "apiKey",
  "projectId",
  "databaseURL",
  "authDomain",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key]);

if (missingKeys.length > 0) {
  throw new Error(
    `Missing Firebase sensor env vars: ${missingKeys.join(", ")}. Check VITE_FIREBASE_* values in .env and restart Vite.`
  );
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
