/**
 * Avid Companion — device-code / PKCE auth against Lovable Cloud (Supabase).
 *
 * We use Supabase's `signInWithPassword` for MVP simplicity. Post-MVP we
 * migrate to Device Authorization Grant: the app displays a code, the pilot
 * confirms in their browser on the Avid site, and the app polls token exchange.
 */
import { createClient } from "@supabase/supabase-js";
import { Store } from "@tauri-apps/plugin-store";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
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
  await st.delete("session");
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
