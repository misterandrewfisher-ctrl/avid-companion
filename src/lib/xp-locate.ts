// Locate the X-Plane 12 install and resolve the required ACF + preferred
// livery. Livery preference order:
//   1) A livery folder whose name contains the aircraft tail.
//   2) The explicit xplane_livery_folder from aircraft_meta.
//   3) Any livery under the ACF's liveries directory.
//   4) Default livery.

import { exists, readDir } from "@tauri-apps/plugin-fs";
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

function normalizeWinPath(path: string): string {
  return path.replace(/\//g, "\\").replace(/\\+/g, "\\");
}

function isAbsoluteWinPath(path: string): boolean {
  return /^[a-zA-Z]:\\/.test(normalizeWinPath(path)) || normalizeWinPath(path).startsWith("\\\\");
}

function joinWin(...parts: string[]): string {
  return normalizeWinPath(parts.filter(Boolean).join("\\"));
}

function dirnameWin(path: string): string {
  const normalized = normalizeWinPath(path);
  const idx = normalized.lastIndexOf("\\");
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

function basenameWin(path: string): string {
  const normalized = normalizeWinPath(path);
  const idx = normalized.lastIndexOf("\\");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export async function getXpRoot(): Promise<string | null> {
  const store = await Store.load("settings.json");
  const saved = (await store.get<string>(XP_ROOT_KEY)) ?? null;
  if (saved && (await exists(saved))) return saved;

  for (const candidate of CANDIDATES) {
    if (await exists(candidate)) {
      await store.set(XP_ROOT_KEY, candidate);
      await store.save();
      return candidate;
    }
  }

  return null;
}

export async function setXpRoot(path: string): Promise<void> {
  const store = await Store.load("settings.json");
  await store.set(XP_ROOT_KEY, normalizeWinPath(path));
  await store.save();
}

export async function resolveAcfAndLivery(
  xpRoot: string,
  acfPath: string,
  preferredLivery: string | null,
  tail: string,
): Promise<AcfResolution> {
  const acfAbs = isAbsoluteWinPath(acfPath) ? normalizeWinPath(acfPath) : joinWin(xpRoot, acfPath);

  if (!(await exists(acfAbs))) {
    throw new Error(
      `Aircraft file not found: ${acfAbs}\n\nInstall the required airframe or update the ACF path in Admin -> Fleet.`,
    );
  }

  const acfDir = dirnameWin(acfAbs);
  const liveriesDir = joinWin(acfDir, "liveries");

  if (!(await exists(liveriesDir))) {
    return { acf_absolute_path: acfAbs, livery_absolute_path: null, livery_source: "default" };
  }

  const entries = await readDir(liveriesDir);
  const dirs = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name);
  const tailLc = tail.toLowerCase();

  const tailMatch = dirs.find((dir) => dir.toLowerCase().includes(tailLc));
  if (tailMatch) {
    return {
      acf_absolute_path: acfAbs,
      livery_absolute_path: joinWin(liveriesDir, tailMatch),
      livery_source: "tail_match",
    };
  }

  if (preferredLivery) {
    const preferredName = basenameWin(preferredLivery);
    const preferredMatch = dirs.find((dir) => dir.toLowerCase() === preferredName.toLowerCase());
    if (preferredMatch) {
      return {
        acf_absolute_path: acfAbs,
        livery_absolute_path: joinWin(liveriesDir, preferredMatch),
        livery_source: "preferred",
      };
    }
  }

  if (dirs.length > 0) {
    return {
      acf_absolute_path: acfAbs,
      livery_absolute_path: joinWin(liveriesDir, dirs[0]),
      livery_source: "any",
    };
  }

  return { acf_absolute_path: acfAbs, livery_absolute_path: null, livery_source: "default" };
}
