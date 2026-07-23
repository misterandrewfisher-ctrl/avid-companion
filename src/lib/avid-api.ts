import { supabase } from "./auth";

const DEFAULT_API_BASE = "https://project--0b678040-0945-40d8-b885-963e81cc0a50.lovable.app";
const API = (
  (import.meta.env.VITE_AVID_API_BASE as string | undefined) ||
  (import.meta.env.VITE_AVID_API_URL as string | undefined) ||
  DEFAULT_API_BASE
).replace(/\/$/, "");

export function getApiBase() {
  return API;
}

async function req<T>(path: string, init: RequestInit = {}, withAuth = false): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (withAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) headers.Authorization = `Bearer ${session.access_token}`;
  }
  const r = await fetch(`${API}${path}`, { ...init, headers });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ---- Device-code login ---------------------------------------------------

export interface DeviceCodeStart {
  device_code: string;
  user_code: string;
  verify_url: string;
  expires_in: number;
  interval: number;
}

export async function requestDeviceCode(): Promise<DeviceCodeStart> {
  return req<DeviceCodeStart>("/api/public/companion/device-code", { method: "POST" });
}

export interface DeviceCodeExchange {
  status?: "pending" | "approved";
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id: string; email: string };
  error?: string;
}

export async function exchangeDeviceCode(device_code: string): Promise<DeviceCodeExchange> {
  const r = await fetch(`${API}/api/public/companion/device-code/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code }),
  });
  const body = (await r.json().catch(() => ({}))) as DeviceCodeExchange;
  if (r.status === 202) return { status: "pending" };
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
}

// ---- Fleet + launch ------------------------------------------------------

export type FlightType = "revenue" | "ferry" | "mx";

export interface FleetAircraft {
  tail: string;
  type: string | null;
  family: string | null;
  airport: string | null;
  condition: number | null;
  in_flight: boolean;
  open_squawks: number;
  grounded: boolean;
  mx_check_flight: boolean;
  available_for: Record<FlightType, boolean>;
}

export async function getFleet(): Promise<FleetAircraft[]> {
  const res = await req<{ fleet: FleetAircraft[] }>("/api/companion/fleet", {}, true);
  return res.fleet ?? [];
}

export interface LaunchResult {
  launch_id: string;
  launched_at: string;
  tail: string;
  flight_type: FlightType;
  dispatch: {
    sit?: { kind?: string; airport?: string | null } | null;
    [k: string]: unknown;
  };
}

export async function launchFlight(tail: string, flight_type: FlightType): Promise<LaunchResult> {
  return req<LaunchResult>(
    "/api/companion/launch",
    { method: "POST", body: JSON.stringify({ tail, flight_type }) },
    true,
  );
}

// ---- Legacy dispatch (kept for X-Plane bridge flow) ----------------------

export interface DispatchPayload {
  tail: string;
  flight_id: string;
  route?: string;
  departure: string;
  destination: string;
  fuel_kg?: number;
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

export async function getMyDispatch(): Promise<DispatchPayload | null> {
  try {
    return await req<DispatchPayload>("/api/dispatch/mine", {}, true);
  } catch {
    return null;
  }
}

export async function signOffMxFlight(flightId: string) {
  return req(`/api/mx/flight/${flightId}/signoff`, { method: "POST" }, true);
}
