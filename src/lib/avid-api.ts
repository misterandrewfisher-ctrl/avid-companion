import { supabase } from "./auth";

const DEFAULT_API_BASE = "https://id-preview--0b678040-0945-40d8-b885-963e81cc0a50.lovable.app";
const API = (
  (import.meta.env.VITE_AVID_API_BASE as string | undefined) ||
  (import.meta.env.VITE_AVID_API_URL as string | undefined) ||
  DEFAULT_API_BASE
).replace(/\/$/, "");

export function getApiBase() {
  return API;
}

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export interface DispatchPayload {
  tail: string;
  flight_id: string;
  route?: string;
  departure: string;
  destination: string;
  fuel_kg?: number;
  selcal?: string;
  mode_s?: string;
  simbrief_ofp_url?: string;
  sit_url?: string;
  is_mx_flight: boolean;
  wear: {
    tire_wear_pct: number;
    oil_qty_pct: number;
    brake_wear_pct: number;
    battery_health_pct: number;
    squawks: Array<{ system: string; note: string; severity: string }>;
  };
}

interface DispatchApiResponse {
  active?: {
    tail?: string | null;
    flight_id?: string | null;
    departure?: string | null;
    destination?: string | null;
    route?: string | null;
    fuel_kg?: number | null;
  } | null;
  dispatch?: {
    tail?: string | null;
    state?: { latest_sit_url?: string | null } | null;
    squawks?: Array<{ severity?: string | null; title?: string | null; description?: string | null }>;
    mx?: {
      tire_wear_pct?: number;
      oil_qty_pct?: number;
      brake_wear_pct?: number;
      battery_health_pct?: number;
    };
  } | null;
}

function normalizeDispatch(payload: DispatchApiResponse): DispatchPayload | null {
  if (!payload.active || !payload.dispatch?.tail) return null;
  return {
    tail: payload.dispatch.tail,
    flight_id: payload.active.flight_id ?? "unknown",
    departure: payload.active.departure ?? "TBD",
    destination: payload.active.destination ?? "TBD",
    route: payload.active.route ?? undefined,
    fuel_kg: payload.active.fuel_kg ?? undefined,
    sit_url: payload.dispatch.state?.latest_sit_url ?? undefined,
    is_mx_flight: false,
    wear: {
      tire_wear_pct: payload.dispatch.mx?.tire_wear_pct ?? 0,
      oil_qty_pct: payload.dispatch.mx?.oil_qty_pct ?? 100,
      brake_wear_pct: payload.dispatch.mx?.brake_wear_pct ?? 0,
      battery_health_pct: payload.dispatch.mx?.battery_health_pct ?? 100,
      squawks: (payload.dispatch.squawks ?? []).map((s) => ({
        system: s.title ?? "Maintenance",
        note: s.description ?? s.title ?? "Reported issue",
        severity: s.severity ?? "info",
      })),
    },
  };
}

export async function getMyDispatch(): Promise<DispatchPayload | null> {
  return authed<DispatchApiResponse>("/api/dispatch/mine").then(normalizeDispatch).catch(() => null);
}

export async function signOffMxFlight(flightId: string) {
  return authed(`/api/mx/flight/${flightId}/signoff`, { method: "POST" });
}
