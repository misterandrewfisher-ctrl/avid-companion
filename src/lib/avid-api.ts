import { supabase } from "./auth";

const DEFAULT_API_BASE = "https://project--0b678040-0945-40d8-b885-963e81cc0a50.lovable.app";
const FALLBACK_API_BASES = [
  DEFAULT_API_BASE,
  "https://bloom-create-deploy.lovable.app",
  "https://project--0b678040-0945-40d8-b885-963e81cc0a50-dev.lovable.app",
] as const;

function cleanBase(value: string | undefined) {
  const next = (value || "").trim().replace(/\/$/, "");
  if (!next) return "";
  // Preview URLs are login-gated from desktop apps and fail CORS. Never use them.
  if (next.includes("id-preview--") || next.includes("lovableproject.com")) return "";
  return next;
}

const ENV_API = cleanBase(
  (import.meta.env.VITE_AVID_API_BASE as string | undefined) ||
    (import.meta.env.VITE_AVID_API_URL as string | undefined),
);
const API = ENV_API || DEFAULT_API_BASE;

function apiCandidates() {
  return Array.from(new Set([API, ...FALLBACK_API_BASES].filter(Boolean)));
}

export function getApiBase() {
  return API;
}

export function getApiCandidates() {
  return apiCandidates();
}

async function req<T>(path: string, init: RequestInit = {}, withAuth = false): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (withAuth) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) headers.Authorization = `Bearer ${session.access_token}`;
  }

  const errors: string[] = [];
  for (const base of apiCandidates()) {
    try {
      const r = await fetch(`${base}${path}`, { ...init, headers, cache: "no-store" });
      const text = await r.text();
      if (!r.ok) {
        errors.push(`${base}: ${r.status} ${text.slice(0, 240)}`);
        continue;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } catch (err) {
      errors.push(`${base}: ${formatNetworkError(err)}`);
    }
  }
  throw new Error(errors.join("\n"));
}

function formatNetworkError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
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
  const errors: string[] = [];
  for (const base of apiCandidates()) {
    try {
      const r = await fetch(`${base}/api/public/companion/device-code/exchange`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ device_code }),
        cache: "no-store",
      });
      const body = (await r.json().catch(() => ({}))) as DeviceCodeExchange;
      if (r.status === 202) return { status: "pending" };
      if (!r.ok) {
        errors.push(`${base}: ${body.error ?? `HTTP ${r.status}`}`);
        continue;
      }
      return body;
    } catch (err) {
      errors.push(`${base}: ${formatNetworkError(err)}`);
    }
  }
  throw new Error(errors.join("\n"));
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
