export type SmartPaddyRuntimeConfig = {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_DATABASE_URL?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_MARKET_API_URL?: string;
  VITE_USE_MOCK_MARKET?: string;
};

declare global {
  interface Window {
    __SMARTPADDY_CONFIG__?: SmartPaddyRuntimeConfig;
  }
}

export const runtimeConfig: SmartPaddyRuntimeConfig = window.__SMARTPADDY_CONFIG__ ?? {};
