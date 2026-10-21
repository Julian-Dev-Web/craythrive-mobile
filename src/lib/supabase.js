// src/lib/supabase.js

import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";
import { validatePublicSupabaseConfig } from './clientConfig';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

validatePublicSupabaseConfig(supabaseUrl, supabaseAnonKey);

const memoryStorage = (() => {
  let store = {};

  return {
    getItem: async (key) => store[key] ?? null,
    setItem: async (key, value) => {
      store[key] = value;
    },
    removeItem: async (key) => {
      delete store[key];
    },
  };
})();

const webStorage =
  typeof window !== "undefined" && window.localStorage
    ? {
        getItem: async (key) => window.localStorage.getItem(key),
        setItem: async (key, value) => window.localStorage.setItem(key, value),
        removeItem: async (key) => window.localStorage.removeItem(key),
      }
    : memoryStorage;

const storage = Platform.OS === "web" ? webStorage : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    ...(Platform.OS !== "web" ? { lock: processLock } : {}),

    // Important for password reset link on web
    detectSessionInUrl: Platform.OS === "web",
  },
});

// The process can be suspended in the background. Resume refresh when the app
// becomes active; stopping this timer does not remove the saved login.
if (Platform.OS !== "web") {
  let disposed = false;
  let initialized = false;
  const updateRefresh = (state) => {
    if (disposed || !initialized) return;
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  const subscription = AppState.addEventListener("change", updateRefresh);
  // Auth initialization starts its own native ticker. Apply AppState afterwards
  // so a background launch cannot accidentally restart background refreshing.
  supabase.auth.initialize().then(() => {
    if (disposed) {
      supabase.auth.stopAutoRefresh();
      return;
    }
    initialized = true;
    updateRefresh(AppState.currentState);
  }).catch(() => {
    // Session restoration reports storage/initialization failures in the UI.
  });
  if (module.hot) module.hot.dispose(() => {
    disposed = true;
    subscription.remove();
    supabase.auth.stopAutoRefresh();
  });
}
