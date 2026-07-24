// Locate the X-Plane 12 install and resolve the required ACF + preferred
// livery. Livery preference order:
//   1) A livery folder whose name contains the aircraft tail (case-insensitive)
//      — this matches your convention of putting the tail in Avid livery names.
//   2) The explicit `xplane_livery_folder` from aircraft_meta, if it exists.
//   3) Any livery under the ACF's "liveries/" directory.
//   4) Default (blank) livery.

import { exists, readDir } from "@tauri-apps/plugin-fs";
import { join, dirname } from "@tauri-apps/api/path";
import { Store } from "@tauri-apps/plugin-store";

const XP_ROOT_KEY = "xplane_root";
const CANDIDATES = [
  "C:\\X-Plane 12",
  "D:\\X-Plane 12",
  "E:\\X-Plane 12",
  "C:\\Program Files\\X-Plane 12",
  "D:\\Program Files\\X-Plane 12",
];

export type AcfResolution = {
  acf_absolute_path: string;
  livery_absolute_path: string | null;
  livery_source: "tail_match" | "preferred" | "any" | "default";
};

export async function getXpRoot(): Promise<string | null> {
  const store = await Store.load("settings.json");
  const saved = (await store.get<string>(XP_ROOT_KEY)) ?? null;
  if (saved && (await exists(saved))) return saved;
  for (const c of CANDIDATES) {
    if (await exists(c)) {
      await store.set(XP_ROOT_KEY, c);
      await store.save();
      return c;
    }
  }
  return null;
}

export async function setXpRoot(path: string): Promise<void> {
  const store = await Store.load("settings.json");
  await store.set(XP_ROOT_KEY, path);
  await store.save();
}

export async function resolveAcfAndLivery(
  xpRoot: string,
  acfRelativePath: string,
  preferredLivery: string | null,
  tail: string,
): Promise<AcfResolution> {
  const acfAbs = await join(xpRoot, acfRelativePath.replace(/\//g, "\\"));
  if (!(await exists(acfAbs))) {
    throw new Error(
      `Aircraft file not found: ${acfAbs}\n\nInstall the required airframe or update the ACF path in Admin → Fleet.`,
    );
  }
  const acfDir = await dirname(acfAbs);
  const liveriesDir = await join(acfDir, "liveries");

  if (!(await exists(liveriesDir))) {
    return { acf_absolute_path: acfAbs, livery_absolute_path: null, livery_source: "default" };
  }

  const entries = await readDir(liveriesDir);
  const dirs = entries.filter((e) => e.isDirectory).map((e) => e.name);
  const tailLc = tail.toLowerCase();

  const tailMatch = dirs.find((d) => d.toLowerCase().includes(tailLc));
  if (tailMatch) {
    return {
      acf_absolute_path: acfAbs,
      livery_absolute_path: await join(liveriesDir, tailMatch),
      livery_source: "tail_match",
    };
  }
  if (preferredLivery && dirs.includes(preferredLivery)) {
    return {
      acf_absolute_path: acfAbs,
      livery_absolute_path: await join(liveriesDir, preferredLivery),
      livery_source: "preferred",
    };
  }
  if (dirs.length > 0) {
    return {
      acf_absolute_path: acfAbs,
      livery_absolute_path: await join(liveriesDir, dirs[0]),
      livery_source: "any",
    };
  }
  return { acf_absolute_path: acfAbs, livery_absolute_path: null, livery_source: "default" };
}
