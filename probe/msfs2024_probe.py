"""
MSFS 2024 capability probe — READ-MOSTLY, run on the sim PC.

Purpose: turn the two undocumented parts of the 2024 SDK into facts we can store
per aircraft title, so the airframe engine knows what it is allowed to do:

  1. Enumerate every InputEvent the loaded aircraft publishes (name, type, hash).
     This is pure reading. It decides the capability tier:
       native  -> a usable switch set was enumerated (full capture + replay)
       core    -> nothing useful published (core SimVars only)
  2. Probe the FailureAction `System` / `Behavior` enum values, which the SDK
     docs list as "Enum" without publishing the values. We call
     SimConnect_ExecuteAction("FailureAction", ...) with HealthPercent = 100
     (i.e. healthy — a no-op) for each candidate name and record whether the sim
     accepted it or raised ACTION_NOT_FOUND / NOT_AN_ACTION /
     INCORRECT_ACTION_PARAMS.

Nothing here breaks an aircraft: the failure probe only ever asks for 100%
health. Run it with the aircraft loaded and sitting on the ramp.

Output: a JSON capability report on stdout and in --out, which the companion
uploads as the tail's capability document. The engine trusts that document, not
the table in src/lib/airframe/msfs2024.ts.

Usage (Windows, MSFS 2024 running):
    python msfs2024_probe.py --out capability.json
    python msfs2024_probe.py --out capability.json --no-failure-probe
"""

from __future__ import annotations

import argparse
import ctypes as C
import json
import os
import sys
import time
from ctypes import wintypes

# ---------------------------------------------------------------- SimConnect FFI

# Candidate FailureAction `System` enum names. The SDK page is WIP and does not
# publish these, so the list is deliberately broad — the sim tells us which are
# real. Add to it freely; a wrong guess costs one exception line in the report.
CANDIDATE_FAILURE_SYSTEMS = [
    "Engine", "Battery", "Generator", "Alternator", "Starter",
    "FuelPump", "FuelSystem", "OilSystem",
    "Brake", "Tire", "Gear", "Hydraulic",
    "Pitot", "Static", "VacuumSystem",
    "Airspeed", "Altimeter", "Attitude", "Compass", "Turn", "VerticalSpeed",
    "AntiIce", "Deice", "Pressurization", "Bleed", "APU",
    "Electrical", "Avionics", "Radio", "Transponder", "Autopilot",
    "FlightControls", "Flaps", "Trim",
]

CANDIDATE_BEHAVIORS = ["Health", "Instant", "Progressive", "Degraded", "Fail", "Repair"]

LOCAL_USER_GUID = "{8B7615FA-BBBF-4baa-B959-5EF4F59BB575}"

SIMCONNECT_RECV_ID_EXCEPTION = 1
SIMCONNECT_RECV_ID_OPEN = 2
SIMCONNECT_RECV_ID_QUIT = 3
SIMCONNECT_RECV_ID_ENUMERATE_INPUT_EVENTS = 41  # verify against the shipped header

INPUT_EVENT_TYPES = {0: "NONE", 1: "DOUBLE", 2: "STRING"}


class SIMCONNECT_RECV(C.Structure):
    _fields_ = [("dwSize", wintypes.DWORD), ("dwVersion", wintypes.DWORD), ("dwID", wintypes.DWORD)]


class SIMCONNECT_RECV_EXCEPTION(C.Structure):
    _fields_ = SIMCONNECT_RECV._fields_ + [
        ("dwException", wintypes.DWORD),
        ("dwSendID", wintypes.DWORD),
        ("dwIndex", wintypes.DWORD),
    ]


class SIMCONNECT_RECV_LIST_TEMPLATE(C.Structure):
    _fields_ = SIMCONNECT_RECV._fields_ + [
        ("dwRequestID", wintypes.DWORD),
        ("dwArraySize", wintypes.DWORD),
        ("dwEntryNumber", wintypes.DWORD),
        ("dwOutOf", wintypes.DWORD),
    ]


class SIMCONNECT_INPUT_EVENT_DESCRIPTOR(C.Structure):
    """Name[64] + 64-bit hash + type. If the shipped header disagrees, this is
    the one struct to correct — the report records the raw sizes so a mismatch is
    obvious (garbled names, absurd hashes)."""

    _pack_ = 1
    _fields_ = [
        ("Name", C.c_char * 64),
        ("Hash", C.c_ulonglong),
        ("eType", C.c_int),
    ]


class FailureParams(C.Structure):
    """FailureAction parameter block: System, SystemIndex, Behavior,
    HealthPercent, TargetPlayer. Strings are passed inline, null-terminated, and
    the whole block must be byte-packed (the SDK example uses #pragma pack(1))."""

    _pack_ = 1


def _find_simconnect_dll() -> str:
    candidates = [
        os.environ.get("SIMCONNECT_DLL", ""),
        r"C:\MSFS 2024 SDK\SimConnect SDK\lib\SimConnect.dll",
        r"C:\MSFS SDK\SimConnect SDK\lib\SimConnect.dll",
        os.path.join(os.path.dirname(__file__), "SimConnect.dll"),
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    raise FileNotFoundError(
        "SimConnect.dll not found. Install the MSFS 2024 SDK or set SIMCONNECT_DLL "
        "to the full path of SimConnect.dll."
    )


class SimConnect:
    def __init__(self, name: str = "AvidAirProbe") -> None:
        self.dll = C.WinDLL(_find_simconnect_dll())
        self.handle = wintypes.HANDLE()
        hr = self.dll.SimConnect_Open(
            C.byref(self.handle), name.encode(), None, 0, None, 0
        )
        if hr != 0:
            raise RuntimeError(f"SimConnect_Open failed (0x{hr & 0xFFFFFFFF:08X}). Is MSFS running?")

    def close(self) -> None:
        if self.handle:
            self.dll.SimConnect_Close(self.handle)
            self.handle = wintypes.HANDLE()

    def enumerate_input_events(self, request_id: int = 1) -> int:
        return self.dll.SimConnect_EnumerateInputEvents(self.handle, request_id)

    def execute_action(self, action_id: str, payload: bytes, request_id: int = 2) -> int:
        buf = C.create_string_buffer(payload, len(payload))
        return self.dll.SimConnect_ExecuteAction(
            self.handle, request_id, action_id.encode(), len(payload), buf
        )

    def pump(self, seconds: float = 1.0):
        """Yield (recv_id, raw_bytes) for everything the sim sends us."""
        deadline = time.time() + seconds
        ppData = C.c_void_p()
        cbData = wintypes.DWORD()
        while time.time() < deadline:
            hr = self.dll.SimConnect_GetNextDispatch(self.handle, C.byref(ppData), C.byref(cbData))
            if hr != 0 or not ppData.value:
                time.sleep(0.01)
                continue
            head = C.cast(ppData, C.POINTER(SIMCONNECT_RECV)).contents
            raw = C.string_at(ppData, cbData.value)
            yield head.dwID, raw


# ------------------------------------------------------------------ probe steps


def probe_input_events(sc: SimConnect, seconds: float = 6.0) -> dict:
    """Read-only: enumerate the aircraft's InputEvents."""
    events: list[dict] = []
    exceptions: list[dict] = []
    pages = 0

    sc.enumerate_input_events()
    for recv_id, raw in sc.pump(seconds):
        if recv_id == SIMCONNECT_RECV_ID_EXCEPTION:
            exc = SIMCONNECT_RECV_EXCEPTION.from_buffer_copy(raw)
            exceptions.append({"exception": exc.dwException, "index": exc.dwIndex})
        elif recv_id == SIMCONNECT_RECV_ID_ENUMERATE_INPUT_EVENTS:
            head = SIMCONNECT_RECV_LIST_TEMPLATE.from_buffer_copy(
                raw[: C.sizeof(SIMCONNECT_RECV_LIST_TEMPLATE)]
            )
            pages += 1
            offset = C.sizeof(SIMCONNECT_RECV_LIST_TEMPLATE)
            stride = C.sizeof(SIMCONNECT_INPUT_EVENT_DESCRIPTOR)
            for i in range(head.dwArraySize):
                chunk = raw[offset + i * stride : offset + (i + 1) * stride]
                if len(chunk) < stride:
                    break
                d = SIMCONNECT_INPUT_EVENT_DESCRIPTOR.from_buffer_copy(chunk)
                events.append(
                    {
                        "name": d.Name.decode(errors="replace").strip("\x00"),
                        "hash": d.Hash,
                        "type": INPUT_EVENT_TYPES.get(d.eType, str(d.eType)),
                    }
                )
            if head.dwEntryNumber + head.dwArraySize >= head.dwOutOf:
                break

    return {"count": len(events), "pages": pages, "events": events, "exceptions": exceptions}


def pack_failure(system: str, behavior: str, index: int = 1, health: float = 100.0) -> bytes:
    parts = bytearray()
    parts += system.encode() + b"\x00"
    parts += bytes(C.c_long(index))
    parts += behavior.encode() + b"\x00"
    parts += bytes(C.c_float(health))
    parts += LOCAL_USER_GUID.encode() + b"\x00"
    return bytes(parts)


def probe_failure_systems(sc: SimConnect, behavior: str) -> dict:
    """Ask for 100% health on each candidate system — a no-op the sim either
    accepts (the enum value is real) or rejects with an exception."""
    accepted: list[str] = []
    rejected: list[dict] = []

    for system in CANDIDATE_FAILURE_SYSTEMS:
        hr = sc.execute_action("FailureAction", pack_failure(system, behavior))
        errs = []
        for recv_id, raw in sc.pump(0.35):
            if recv_id == SIMCONNECT_RECV_ID_EXCEPTION:
                exc = SIMCONNECT_RECV_EXCEPTION.from_buffer_copy(raw)
                errs.append({"exception": exc.dwException, "index": exc.dwIndex})
        if hr == 0 and not errs:
            accepted.append(system)
        else:
            rejected.append({"system": system, "hr": hr, "exceptions": errs})

    return {"behavior": behavior, "accepted": accepted, "rejected": rejected}


def capability_tier(input_events: dict) -> str:
    if input_events["count"] >= 20:
        return "native"
    if input_events["count"] > 0:
        return "native"
    return "core"


def main() -> int:
    ap = argparse.ArgumentParser(description="MSFS 2024 capability probe")
    ap.add_argument("--out", default="capability.json")
    ap.add_argument("--tail", default=None, help="Avid tail this report belongs to")
    ap.add_argument("--title", default=None, help="Aircraft title as loaded in the sim")
    ap.add_argument("--vendor", action="store_true", help="Mark as vendor-managed (PMDG/Fenix): no writes ever")
    ap.add_argument("--no-failure-probe", action="store_true")
    ap.add_argument("--seconds", type=float, default=6.0)
    args = ap.parse_args()

    sc = SimConnect()
    try:
        ie = probe_input_events(sc, args.seconds)
        failures = None
        if not args.no_failure_probe:
            failures = [probe_failure_systems(sc, b) for b in CANDIDATE_BEHAVIORS[:2]]
        report = {
            "schema": "avid.msfs2024.capability/1",
            "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "tail": args.tail,
            "aircraft_title": args.title,
            "capability_tier": "vendor" if args.vendor else capability_tier(ie),
            "input_events": ie,
            "failure_action": failures,
            "struct_sizes": {
                "input_event_descriptor": C.sizeof(SIMCONNECT_INPUT_EVENT_DESCRIPTOR),
                "list_template": C.sizeof(SIMCONNECT_RECV_LIST_TEMPLATE),
            },
        }
    finally:
        sc.close()

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps({k: v for k, v in report.items() if k != "input_events"}, indent=2))
    print(f"\n{ie['count']} input events enumerated -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
