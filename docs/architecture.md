# Avid Companion — Architecture

```
┌────────────────────────────────────────┐
│  Avid Website (Lovable Cloud)          │
│  - dispatch payload   /api/dispatch    │
│  - .sit upload        /api/public/sit  │
│  - flight events      /api/public/onair│
│  - wear ledger        supabase RLS     │
└─────────────▲──────────────────▲───────┘
              │HTTPS             │HTTPS
┌─────────────┴──────────────────┴───────┐
│  Avid Companion (Tauri, Windows)        │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ React UI     │  │ Rust core     │    │
│  │ - login      │  │ - xp locate   │    │
│  │ - dispatch   │  │ - launch XP   │    │
│  │ - fly button │  │ - sit up/down │    │
│  └───────┬──────┘  │ - WS bridge   │    │
│          │         └──────┬────────┘    │
└──────────┼────────────────┼─────────────┘
           │ WebSocket ws://127.0.0.1:49152
┌──────────┴────────────────┴─────────────┐
│  XPPython3 plugin (PI_AvidBridge.py)    │
│  runs inside X-Plane 12                 │
│  - reads/writes datarefs                │
│  - injects failures                     │
│  - streams telemetry @ 4Hz              │
└─────────────────────────────────────────┘
```

## Auth

Phase 1: `signInWithPassword` with the pilot's Avid credentials, session
persisted via `tauri-plugin-store` and secured with OS keyring.

Phase 2: OAuth Device Authorization Grant. The app displays a short code, the
pilot opens `avidcargo.com/link` in their browser and confirms. Companion polls
`/oauth/token` until the token is issued. Better UX + no password handling.

## Dataref maps

Airframe-specific dataref maps live in the Avid backend (`aircraft_meta.dref_map`
JSONB column). The companion fetches the map on dispatch load and hands it to
the XPPython3 plugin over WS. This keeps the plugin airframe-agnostic — new
airframes can be added by editing a JSON in the admin panel, no plugin update.

### Confirmed native for FF757/767, Dash8-400
Both use standard `sim/flightmodel/*` datarefs for position, groundspeed, and
attitude. Failure injection uses `sim/operation/failures/rel_*`.

## Wear → failure roll

On dispatch load the app pushes a `wear_load` message. The plugin:
1. Sets initial wear datarefs (oil qty, tire pressure, brake temp, battery V).
2. Registers a failure roll callback every 60s. Probability = f(condition_pct).
3. On roll fire, writes a failure dref and emits a `failure` event back.

## .sit file lifecycle

- **On dispatch**: download from Supabase Storage → `%TEMP%/avid-companion/<tail>.sit` → passed to X-Plane as launch arg.
- **On flight end**: scan `<XP>/Output/situations/` for newest `.sit` → upload to `/api/public/sit/upload` → backend stores keyed by (tail, flight_id).
- **AI-generated** (from AI Pilot continuity): server synthesizes a `.sit` descriptor from the last known position/attitude. No file exists client-side.

## Test-flight sign-off

Dispatch payload includes `is_mx_flight: true` when the previous work order had
severe items. The **Sign Off** button unlocks only after the plugin reports
`phase: parked && engines_off` on landing at destination.
