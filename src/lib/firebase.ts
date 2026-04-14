import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Firebase is used only for live sensor readings from Realtime Database.
// RAG documents and source files are stored in Supabase.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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
export const rtdb = getDatabase(app);
