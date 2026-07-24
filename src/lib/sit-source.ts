// Resolve the .sit file to hand to X-Plane, following the persistence-first
// ladder returned by /api/companion/launch:
//   1) sit_source.kind === "persisted" → download signed URL as-is.
//   2) sit_source.kind === "synthesized" → compose from bundled reference.

import { writeFile as writeBinaryFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { composeSit, writeSitToTemp, type ParkingStand, type SitDescriptor } from "./sit-compose";

export type SitSource =
  | {
      kind: "persisted";
      signed_url: string;
      expires_at: string;
      uploaded_at: string | null;
      flight_id: string | null;
      path: string;
    }
  | {
      kind: "synthesized";
      descriptor: SitDescriptor;
      stand: ParkingStand | null;
      airport: string | null;
      reason: "no_persisted_sit" | "no_stand_match";
    };

export async function resolveSitFile(source: SitSource): Promise<string> {
  if (source.kind === "persisted") {
    const res = await tauriFetch(source.signed_url, { method: "GET" });
    if (!res.ok) throw new Error(`Failed to download persisted .sit (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const filename = "avid_persisted.sit";
    await writeBinaryFile(filename, bytes, { baseDir: BaseDirectory.Temp });
    return await join(await tempDir(), filename);
  }
  const bytes = await composeSit(source.stand, source.descriptor, null);
  return await writeSitToTemp(bytes, "avid_launch.sit");
}
