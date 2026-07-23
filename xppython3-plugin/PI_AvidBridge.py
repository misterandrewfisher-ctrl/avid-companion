"""
PI_AvidBridge.py — X-Plane 12 side of the Avid Companion bridge.

Runs inside XPPython3 (https://xppython3.readthedocs.io).
Opens a WebSocket server on 127.0.0.1:49152 that the Tauri app connects to.

Responsibilities:
  1. Publish telemetry (~4 Hz) via WS.
  2. Report engine start/stop and landing events.
  3. Accept `failure` messages and write to appropriate failure datarefs
     (generic X-Plane, FlightFactor 757/767, dash8-400 — the dataref map is
     driven by the Avid backend so this file stays airframe-agnostic).
  4. Accept `wear_load` messages so the app can pre-populate wear state
     (hot brakes, degraded battery, low oil, etc.) at spawn.
"""

import asyncio
import json
import threading
import time
from typing import Any, Dict, Optional

try:
    from XPPython3 import xp
except ImportError:  # keeps IDE happy outside XP
    xp = None  # type: ignore

# WS dep ships with XPPython3 (Python 3.11+ has no built-in — we bundle websockets)
import websockets  # noqa: E402


WS_HOST = "127.0.0.1"
WS_PORT = 49152
TELEMETRY_HZ = 4


class DatarefMap:
    """
    Generic + airframe-specific dataref maps.
    The Avid backend serves richer per-airframe maps; this is the safe default.
    """
    GENERIC = {
        "lat":            "sim/flightmodel/position/latitude",
        "lon":            "sim/flightmodel/position/longitude",
        "alt_ft":         "sim/flightmodel/misc/h_ind",
        "gs_kts":         "sim/flightmodel/position/groundspeed",
        "vs_fpm":         "sim/flightmodel/position/vh_ind_fpm",
        "g_load":         "sim/flightmodel/forces/g_nrml",
        "on_ground":      "sim/flightmodel/failures/onground_any",
        "n1_1":           "sim/flightmodel/engine/ENGN_N1_[0]",
        "eng_running_1":  "sim/flightmodel2/engines/engine_is_burning_fuel",
        "oil_press_1":    "sim/flightmodel/engine/ENGN_oil_press_psi",
        "brake_temp_l":   "sim/flightmodel/parts/tire_temp_pilot",
        "battery_v":      "sim/cockpit2/electrical/battery_voltage_actual_volts",
    }

    # Failure injection datarefs — writing 6 = inop, 0 = ok on generic XP
    FAILURES = {
        "engine_1_fire":  "sim/operation/failures/rel_engfir0",
        "engine_1_flame": "sim/operation/failures/rel_engfla0",
        "tire_burst_nose":"sim/operation/failures/rel_tire0",
        "hyd_pump_1":     "sim/operation/failures/rel_hydpmp1",
        "battery_dead":   "sim/operation/failures/rel_batter1",
        "generator_1":    "sim/operation/failures/rel_genera1",
    }


class Bridge:
    def __init__(self):
        self.dref_cache: Dict[str, Any] = {}
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.clients: set = set()
        self.thread: Optional[threading.Thread] = None
        self.stop_flag = False

    def _read(self, dref_path: str) -> float:
        if xp is None:
            return 0.0
        ref = self.dref_cache.get(dref_path)
        if ref is None:
            ref = xp.findDataRef(dref_path)
            self.dref_cache[dref_path] = ref
        if not ref:
            return 0.0
        return float(xp.getDataf(ref))

    def _write(self, dref_path: str, value: float) -> None:
        if xp is None:
            return
        ref = self.dref_cache.get(dref_path)
        if ref is None:
            ref = xp.findDataRef(dref_path)
            self.dref_cache[dref_path] = ref
        if ref:
            xp.setDataf(ref, float(value))

    def _sample_telemetry(self) -> Dict[str, Any]:
        m = DatarefMap.GENERIC
        return {
            "type": "telemetry",
            "lat": self._read(m["lat"]),
            "lon": self._read(m["lon"]),
            "alt_ft": self._read(m["alt_ft"]),
            "gs_kts": self._read(m["gs_kts"]) * 1.94384,
            "on_ground": bool(self._read(m["on_ground"]) > 0.5),
            "phase": self._infer_phase(),
        }

    def _infer_phase(self) -> str:
        m = DatarefMap.GENERIC
        gs = self._read(m["gs_kts"]) * 1.94384
        alt = self._read(m["alt_ft"])
        on_ground = self._read(m["on_ground"]) > 0.5
        if on_ground and gs < 1: return "parked"
        if on_ground and gs < 40: return "taxi"
        if on_ground: return "roll"
        if alt < 10000: return "climb_descent"
        return "cruise"

    async def _handler(self, ws):
        self.clients.add(ws)
        try:
            await ws.send(json.dumps({
                "type": "hello",
                "aircraft": "unknown",
                "xp_version": "12",
            }))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                await self._handle_message(msg)
        finally:
            self.clients.discard(ws)

    async def _handle_message(self, msg: Dict[str, Any]) -> None:
        kind = msg.get("type")
        if kind == "failure":
            # {"type":"failure","dref":"sim/operation/failures/rel_engfir0","value":6}
            self._write(msg["dref"], msg.get("value", 6))
        elif kind == "wear_load":
            # {"type":"wear_load","tire_wear_pct":80,"oil_qty_pct":60,...}
            # Airframe-specific — map values to airframe datarefs. Stub for now.
            pass

    async def _telemetry_loop(self):
        interval = 1.0 / TELEMETRY_HZ
        while not self.stop_flag:
            if self.clients:
                sample = self._sample_telemetry()
                payload = json.dumps(sample)
                for c in list(self.clients):
                    try:
                        await c.send(payload)
                    except Exception:
                        self.clients.discard(c)
            await asyncio.sleep(interval)

    def start(self):
        def run():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
            server = websockets.serve(self._handler, WS_HOST, WS_PORT)
            self.loop.run_until_complete(server)
            self.loop.create_task(self._telemetry_loop())
            self.loop.run_forever()
        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_flag = True
        if self.loop:
            self.loop.call_soon_threadsafe(self.loop.stop)


class PythonInterface:
    def XPluginStart(self):
        self.bridge = Bridge()
        self.bridge.start()
        return "AvidBridge", "com.avidair.bridge", "Avid Companion telemetry bridge"

    def XPluginStop(self):
        self.bridge.stop()

    def XPluginEnable(self):
        return 1

    def XPluginDisable(self):
        pass

    def XPluginReceiveMessage(self, inFrom, inMsg, inParam):
        pass
