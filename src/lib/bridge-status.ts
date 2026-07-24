// Poll the AvidBridge XPPython3 plugin over 127.0.0.1:<port>.
// Emits: not_detected | handshaking | connected + last heartbeat timestamp.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export const BRIDGE_PORT = 47821;
export const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}/ping`;

export type BridgeState =
  | { kind: "not_detected" }
  | { kind: "handshaking"; since: number }
  | { kind: "connected"; last_heartbeat: number };

export async function pingBridge(timeoutMs = 800): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await tauriFetch(BRIDGE_URL, { method: "GET", signal: ctl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function watchBridge(onChange: (s: BridgeState) => void): () => void {
  let state: BridgeState = { kind: "not_detected" };
  let firstSeen = Date.now();
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const ok = await pingBridge();
    if (ok) {
      state = { kind: "connected", last_heartbeat: Date.now() };
    } else if (state.kind === "connected") {
      state = { kind: "handshaking", since: Date.now() };
    } else if (state.kind === "not_detected") {
      state = { kind: "handshaking", since: firstSeen };
    }
    onChange(state);
    setTimeout(tick, 2000);
  };
  tick();
  return () => {
    stopped = true;
  };
}
