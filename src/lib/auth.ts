/**
 * Avid Companion — device-code / PKCE auth against Lovable Cloud (Supabase).
 *
 * We use Supabase's `signInWithPassword` for MVP simplicity. Post-MVP we
 * migrate to Device Authorization Grant: the app displays a code, the pilot
 * confirms in their browser on the Avid site, and the app polls token exchange.
 */
import { createClient } from "@supabase/supabase-js";
import { Store } from "@tauri-apps/plugin-store";

const DEFAULT_SUPABASE_URL = "https://burcdoowolryklggsgkj.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wunQ43nqsnYde5DGvPrUcQ_pt5UbBkZ";

const SUPABASE_URL = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL
).trim();
const SUPABASE_PUBLISHABLE_KEY = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY
).trim();

export function getAuthConfigStatus() {
  return {
    backendUrl: SUPABASE_URL,
    hasPublishableKey: Boolean(SUPABASE_PUBLISHABLE_KEY),
    urlSource: import.meta.env.VITE_SUPABASE_URL ? "build env" : "built-in publishable default",
    keySource:
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
        ? "build env"
        : "built-in publishable default",
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});

// When Supabase auto-refreshes the access token, persist the new pair back to
// the Tauri store so the next app launch has valid credentials. Without this,
// the stored refresh_token eventually becomes invalid and every authed request
// returns 401.
supabase.auth.onAuthStateChange(async (event, session) => {
  if (!session) return;
  if (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN") return;
  try {
    const st = await s();
    await st.set("session", session);
    await st.save();
  } catch (err) {
    console.warn("[auth] failed to persist refreshed session", err);
  }
});


let store: Store | null = null;
async function s() {
  if (!store) store = await Store.load("avid-auth.json");
  return store;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const st = await s();
  await st.set("session", data.session);
  await st.save();
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
  const st = await s();
  await (st as any).delete("session");
  await st.save();
}

export async function loadSession() {
  const st = await s();
  const saved = await st.get<any>("session");
  if (saved?.access_token) {
    await supabase.auth.setSession({
      access_token: saved.access_token,
      refresh_token: saved.refresh_token,
    });
  }
  return (await supabase.auth.getUser()).data.user;
}

export async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function setSessionFromTokens(access_token: string, refresh_token: string) {
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  const st = await s();
  await st.set("session", data.session);
  await st.save();
  return data.user;
}
