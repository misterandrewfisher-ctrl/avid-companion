import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getAuthConfigStatus,
  loadSession,
  setSessionFromTokens,
  signOut,
} from "./lib/auth";
import {
  exchangeDeviceCode,
  getFleet,
  launchFlight,
  requestDeviceCode,
  type DeviceCodeStart,
  type FleetAircraft,
  type FlightType,
} from "./lib/avid-api";

type BridgeState = { connected: boolean; xplane_running?: boolean };

export function App() {
  const [user, setUser] = useState<any>(null);
  const [xpRoot, setXpRoot] = useState<string | null>(null);
  const [bridge, setBridge] = useState<BridgeState>({ connected: false });
  const [status, setStatus] = useState("Initializing…");
  const [error, setError] = useState<string | null>(null);

  // Login (device code)
  const [pairing, setPairing] = useState<DeviceCodeStart | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);

  // Fleet + selection
  const [fleet, setFleet] = useState<FleetAircraft[]>([]);
  const [tail, setTail] = useState<string>("");
  const [flightType, setFlightType] = useState<FlightType>("revenue");
  const [launching, setLaunching] = useState(false);

  const loadFleet = useCallback(async () => {
    try {
      const f = await getFleet();
      setFleet(f);
      if (f.length && !tail) setTail(f[0].tail);
    } catch (err) {
      setError(`Fleet load failed: ${formatError(err)}`);
    }
  }, [tail]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void bootstrap().then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap() {
    try {
      const u = await loadSession();
      setUser(u);
      if (u) await loadFleet();
    } catch (err) {
      setError(`Sign-in session could not be loaded: ${formatError(err)}`);
    }

    try {
      setXpRoot(await invoke<string | null>("locate_xplane"));
    } catch (err) {
      setStatus(`Ready. X-Plane auto-detect failed: ${formatError(err)}`);
    }
    try {
      setBridge(await invoke<BridgeState>("bridge_status"));
    } catch {
      /* bridge optional */
    }

    let un1: (() => void) | undefined;
    let un2: (() => void) | undefined;
    try {
      un1 = await listen<boolean>("bridge:connected", (e) =>
        setBridge((c) => ({ ...c, connected: e.payload })),
      );
      un2 = await listen("bridge:message", (e) => console.log("[bridge]", e.payload));
    } catch {
      /* running outside Tauri */
    }
    setStatus((c) => (c.startsWith("Initializing") ? "Ready." : c));
    return () => {
      un1?.();
      un2?.();
    };
  }

  // ---- Device-code login ------------------------------------------------

  async function startPairing() {
    setError(null);
    setPairingBusy(true);
    try {
      const start = await requestDeviceCode();
      setPairing(start);
      void pollPairing(start);
    } catch (err) {
      setError(`Sign-in start failed: ${formatError(err)}`);
    } finally {
      setPairingBusy(false);
    }
  }

  async function pollPairing(start: DeviceCodeStart) {
    const deadline = Date.now() + start.expires_in * 1000;
    const intervalMs = Math.max(2, start.interval) * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await exchangeDeviceCode(start.device_code);
        if (res.status === "approved" && res.access_token && res.refresh_token) {
          const u = await setSessionFromTokens(res.access_token, res.refresh_token);
          setUser(u);
          setPairing(null);
          setStatus(`Signed in as ${u?.email ?? "pilot"}.`);
          await loadFleet();
          return;
        }
      } catch (err) {
        setError(`Sign-in error: ${formatError(err)}`);
        return;
      }
    }
    setPairing(null);
    setError("Sign-in code expired. Please try again.");
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setFleet([]);
    setTail("");
    setStatus("Signed out.");
  }

  // ---- Launch -----------------------------------------------------------

  async function handleLaunch() {
    if (!tail) return;
    setError(null);
    setLaunching(true);
    setStatus(`Requesting dispatch for ${tail}…`);
    try {
      const res = await launchFlight(tail, flightType);
      setStatus(`Dispatch OK · ${res.tail} · ${flightType}. Preparing X-Plane…`);
      // Best-effort X-Plane launch if we have a root + situation url on the sit
      const sitUrl =
        typeof res.dispatch?.sit === "object" && res.dispatch?.sit
          ? (res.dispatch.sit as Record<string, unknown>).url
          : undefined;
      if (xpRoot) {
        try {
          let sitPath: string | null = null;
          if (typeof sitUrl === "string") {
            sitPath = await invoke<string>("load_situation", { sitUrl, tail });
          }
          await invoke("launch_xplane", { xpRoot, sitPath });
          setStatus("X-Plane launching. Bridge will connect when the sim is up.");
        } catch (err) {
          setStatus(`Dispatched, but X-Plane launch failed: ${formatError(err)}`);
        }
      }
    } catch (err) {
      setError(`Launch failed: ${formatError(err)}`);
    } finally {
      setLaunching(false);
    }
  }

  // ---- Render -----------------------------------------------------------

  const cfg = getAuthConfigStatus();

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b0f14] text-[#e6edf3] p-8">
        <div className="mx-auto max-w-lg">
          <p className="text-xs uppercase tracking-[0.25em] text-white/60">Avid Companion</p>
          <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-white/70">
            Approve this app from your pilot account to link it.
          </p>

          {pairing ? (
            <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-white/70">Enter this code on the website:</p>
              <p className="mt-3 text-3xl font-mono tracking-[0.25em]">{pairing.user_code}</p>
              <p className="mt-3 break-all text-xs text-white/50">{pairing.verify_url}</p>
              <p className="mt-4 text-sm text-white/80">Waiting for approval…</p>
            </div>
          ) : (
            <button
              onClick={startPairing}
              disabled={pairingBusy}
              className="mt-6 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              {pairingBusy ? "Requesting…" : "Request sign-in code"}
            </button>
          )}

          {error && (
            <pre className="mt-6 whitespace-pre-wrap rounded-md border border-red-500/40 bg-red-950/20 p-4 text-xs text-red-100">
              {error}
            </pre>
          )}

          <p className="mt-8 text-[10px] text-white/40">
            {cfg.backendUrl} · key from {cfg.keySource}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] text-[#e6edf3] p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/60">Avid Companion</p>
            <h1 className="mt-1 text-2xl font-semibold">{user.email ?? "Pilot"}</h1>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5"
          >
            Sign out
          </button>
        </header>

        <section className="rounded-lg border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold text-white/80">1. Select aircraft</h2>
          <select
            value={tail}
            onChange={(e) => setTail(e.target.value)}
            className="mt-3 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm"
          >
            {fleet.length === 0 && <option value="">Loading fleet…</option>}
            {fleet.map((a) => {
              const ok = a.available_for[flightType];
              const suffix = a.in_flight
                ? " · IN FLIGHT"
                : a.grounded
                ? " · GROUNDED"
                : a.open_squawks
                ? ` · ${a.open_squawks} squawk${a.open_squawks > 1 ? "s" : ""}`
                : "";
              return (
                <option key={a.tail} value={a.tail} disabled={!ok}>
                  {a.tail} ({a.type ?? "?"}) — {a.airport ?? "?"}
                  {suffix}
                </option>
              );
            })}
          </select>

          <h2 className="mt-5 text-sm font-semibold text-white/80">2. Flight type</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["revenue", "Revenue"],
                ["ferry", "Ferry"],
                ["mx", "MX Check"],
              ] as Array<[FlightType, string]>
            ).map(([id, label]) => (
              <label
                key={id}
                className={
                  "cursor-pointer rounded-md border px-3 py-2 text-center text-sm " +
                  (flightType === id
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                    : "border-white/15 text-white/80 hover:bg-white/5")
                }
              >
                <input
                  type="radio"
                  name="flightType"
                  value={id}
                  checked={flightType === id}
                  onChange={() => setFlightType(id)}
                  className="hidden"
                />
                {label}
              </label>
            ))}
          </div>

          <button
            onClick={handleLaunch}
            disabled={!tail || launching}
            className="mt-6 w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
          >
            {launching ? "Launching…" : "Launch flight"}
          </button>
          <button
            onClick={loadFleet}
            className="mt-2 w-full rounded-md border border-white/15 px-4 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            Refresh fleet
          </button>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5 p-5 text-sm text-white/80">
          <div className="flex items-center justify-between">
            <span>X-Plane</span>
            <span className={xpRoot ? "text-emerald-300" : "text-white/50"}>
              {xpRoot ?? "not detected"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span>Bridge</span>
            <span className={bridge.connected ? "text-emerald-300" : "text-white/50"}>
              {bridge.connected ? "connected" : "waiting"}
            </span>
          </div>
        </section>

        <p className="text-xs text-white/60">{status}</p>
        {error && (
          <pre className="whitespace-pre-wrap rounded-md border border-red-500/40 bg-red-950/20 p-4 text-xs text-red-100">
            {error}
          </pre>
        )}
      </div>
    </div>
  );
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
