import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadSession, signIn, signOut } from "./lib/auth";
import { getMyDispatch, type DispatchPayload } from "./lib/avid-api";
import { checkForUpdates, type UpdaterStatus } from "./lib/updater";

type BridgeState = { connected: boolean; xplane_running?: boolean };

export function App() {
  const [user, setUser] = useState<any>(null);
  const [xpRoot, setXpRoot] = useState<string | null>(null);
  const [bridge, setBridge] = useState<BridgeState>({ connected: false });
  const [dispatch, setDispatch] = useState<DispatchPayload | null>(null);
  const [status, setStatus] = useState("Initializing…");
  const [updater, setUpdater] = useState<UpdaterStatus>({ state: "idle" });

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void bootstrap().then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, []);

  async function bootstrap() {
    setUser(await loadSession());
    setXpRoot(await invoke<string | null>("locate_xplane"));
    setBridge(await invoke<BridgeState>("bridge_status"));
    const un1 = await listen<boolean>("bridge:connected", (e) =>
      setBridge((current) => ({ ...current, connected: e.payload })),
    );
    const un2 = await listen("bridge:message", (e) => console.log("[bridge]", e.payload));
    // Check for updates as soon as the app is up.
    void checkForUpdates(setUpdater);
    setStatus("Ready.");
    return () => {
      un1();
      un2();
    };
  }

  async function loginFlow() {
    const email = prompt("Avid email");
    const password = prompt("Password");
    if (!email || !password) return;
    const session = await signIn(email, password);
    setUser(session);
    // Re-check after sign-in so a pilot who left the app open picks up
    // releases without restarting.
    if (session) void checkForUpdates(setUpdater);
  }

  async function refreshDispatch() {
    setStatus("Fetching dispatch…");
    const d = await getMyDispatch();
    setDispatch(d);
    setStatus(
      d ? `Dispatch: ${d.tail} · ${d.departure} → ${d.destination}` : "No active dispatch.",
    );
  }

  async function flyIt() {
    if (!dispatch || !xpRoot) return;
    setStatus("Preparing situation…");
    const sit = dispatch.sit_url
      ? await invoke<string>("load_situation", { sitUrl: dispatch.sit_url, tail: dispatch.tail })
      : null;
    setStatus("Launching X-Plane 12…");
    await invoke("launch_xplane", { xpRoot, sitPath: sit });
    setStatus("X-Plane launching. Bridge will connect when the sim is up.");
  }

  async function installPlugin() {
    if (!xpRoot) return;
    await invoke("install_bridge_plugin", { xpRoot });
    setStatus("Bridge plugin installed. Restart X-Plane to activate.");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <UpdateBanner status={updater} onCheck={() => checkForUpdates(setUpdater, { force: true })} />
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Avid Companion</h1>
        <div className="text-sm opacity-70">
          {user ? user.email : <button className="underline" onClick={loginFlow}>Sign in</button>}
          {user && <button className="ml-3 underline" onClick={async () => { await signOut(); setUser(null); }}>Sign out</button>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <Card title="X-Plane 12">
          <p className="text-sm">{xpRoot ?? "Not found — set path in Settings."}</p>
          <button className="btn" onClick={installPlugin} disabled={!xpRoot}>Install bridge plugin</button>
        </Card>
        <Card title="Bridge">
          <p className="text-sm">
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${bridge.connected ? "bg-green-500" : "bg-red-500"}`} />
            {bridge.connected ? "Connected to XP12" : "Waiting for X-Plane"}
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium">Dispatch</h2>
          <button className="btn" onClick={refreshDispatch} disabled={!user}>Refresh</button>
        </div>
        {dispatch ? (
          <div className="rounded-lg bg-white/5 p-4 space-y-2">
            <div className="text-xl">{dispatch.tail} — {dispatch.departure} → {dispatch.destination}</div>
            <div className="text-sm opacity-80">Route: {dispatch.route ?? "TBD"} · Fuel: {dispatch.fuel_kg ?? "—"} kg</div>
            {dispatch.is_mx_flight && <div className="text-yellow-300">⚠ MX Test Flight</div>}
            {dispatch.wear.squawks.length > 0 && (
              <details><summary>{dispatch.wear.squawks.length} squawks</summary>
                <ul className="text-sm">{dispatch.wear.squawks.map((s, i) => <li key={i}>{s.system}: {s.note} ({s.severity})</li>)}</ul>
              </details>
            )}
            <button className="btn-primary" onClick={flyIt}>Load into X-Plane</button>
          </div>
        ) : <p className="text-sm opacity-60">No dispatch loaded.</p>}
      </section>

      <footer className="text-xs opacity-50">{status}</footer>

      <style>{`
        .btn { padding: 6px 12px; background: rgba(255,255,255,.08); border-radius: 6px; }
        .btn:hover { background: rgba(255,255,255,.14); }
        .btn:disabled { opacity: .4; }
        .btn-primary { padding: 8px 16px; background: #2563eb; border-radius: 6px; font-weight: 600; }
        .btn-primary:hover { background: #1d4ed8; }
      `}</style>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white/5 p-4 space-y-2">
      <div className="text-sm uppercase tracking-wider opacity-60">{title}</div>
      {children}
    </div>
  );
}

function UpdateBanner({
  status,
  onCheck,
}: {
  status: UpdaterStatus;
  onCheck: () => void;
}) {
  if (status.state === "idle" || status.state === "up-to-date") return null;

  const bg =
    status.state === "error"
      ? "bg-red-500/15 border-red-500/40 text-red-100"
      : "bg-sky-500/15 border-sky-500/40 text-sky-100";

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${bg} flex items-center justify-between gap-3`}>
      <div>
        {status.state === "checking" && "Checking for updates…"}
        {status.state === "available" && `Update v${status.version} available — downloading…`}
        {status.state === "downloading" && (
          <>Downloading v{status.version} — {Math.round(status.percent)}%</>
        )}
        {status.state === "installing" && `Installing v${status.version}. The app will restart…`}
        {status.state === "error" && `Update check failed: ${status.message}`}
      </div>
      {status.state === "error" && (
        <button className="underline" onClick={onCheck}>Retry</button>
      )}
    </div>
  );
}
