import { useEffect, useState } from "react";
import { watchBridge, type BridgeState } from "../lib/bridge-status";

export function BridgeStatus() {
  const [state, setState] = useState<BridgeState>({ kind: "not_detected" });

  useEffect(() => watchBridge(setState), []);

  const label =
    state.kind === "connected"
      ? "Bridge: Connected"
      : state.kind === "handshaking"
      ? "Bridge: Handshaking…"
      : "Bridge: Not detected";
  const color =
    state.kind === "connected"
      ? "#22c55e"
      : state.kind === "handshaking"
      ? "#eab308"
      : "#ef4444";

  return (
    <div
      title={
        state.kind === "connected"
          ? `Last heartbeat: ${new Date(state.last_heartbeat).toLocaleTimeString()}`
          : "AvidBridge plugin not responding on 127.0.0.1:47821"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      {label}
    </div>
  );
}
