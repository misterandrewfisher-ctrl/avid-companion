// Patch the bundled XP 12.4.3 cold-and-dark reference .sit with a resolved
// parking stand's lat/lon/heading. The reference is captured from XP 12.4.3
// so it validates on load (our old hand-written stub was rejected).
//
// XP .sit files are line-based key/value records. We only rewrite the small
// set of fields that control position and startup state; everything else
// (systems, battery off, parking brake, chocks, engines off) is inherited
// from the reference verbatim.

import { readFile as readBinaryFile, writeFile as writeBinaryFile } from "@tauri-apps/plugin-fs";
import { resolveResource } from "@tauri-apps/api/path";

export type ParkingStand = {
  id: string;
  icao: string;
  stand_code: string;
  stand_type: "gate" | "remote" | "hangar";
  lat: number | null;
  lon: number | null;
  heading_true?: number | null;
};

export type SitDescriptor = {
  mode: "overnight" | "turnaround";
  icao: string | null;
  cold_and_dark: boolean;
};

// Rewrite one "key value" line if key matches (whitespace-tolerant).
function setField(lines: string[], key: string, value: string): void {
  const re = new RegExp(`^(\\s*${key}\\s+).*$`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      lines[i] = lines[i].replace(re, `$1${value}`);
      return;
    }
  }
  // If the key isn't present in the reference we skip silently — XP
  // handles absent optional fields.
}

export async function composeSit(
  stand: ParkingStand | null,
  descriptor: SitDescriptor,
  airportLatLon: { lat: number; lon: number } | null,
): Promise<Uint8Array> {
  const refPath = await resolveResource("resources/xp12_cold_dark.sit");
  const bytes = await readBinaryFile(refPath);
  const text = new TextDecoder("utf-8").decode(bytes);
  const lines = text.split(/\r?\n/);

  const lat = stand?.lat ?? airportLatLon?.lat ?? 0;
  const lon = stand?.lon ?? airportLatLon?.lon ?? 0;
  const hdg = stand?.heading_true ?? 0;

  // These are the fields XP 12 .sit uses for start position / attitude.
  setField(lines, "p_lat_lon_ele/0", lat.toFixed(9));
  setField(lines, "p_lat_lon_ele/1", lon.toFixed(9));
  setField(lines, "p_psi_the_phi/0", hdg.toFixed(4));
  setField(lines, "p_psi_the_phi/1", "0.0000");
  setField(lines, "p_psi_the_phi/2", "0.0000");
  setField(lines, "start_type", "5"); // 5 = ramp start / cold & dark

  return new TextEncoder().encode(lines.join("\n"));
}

export async function writeSitToTemp(bytes: Uint8Array, filename = "avid_launch.sit"): Promise<string> {
  await writeBinaryFile(filename, bytes, { baseDir: BaseDirectory.Temp });
  const { tempDir, join } = await import("@tauri-apps/api/path");
  return await join(await tempDir(), filename);
}
