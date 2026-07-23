// Auto-update helper for the Avid Companion desktop app.
// Called on startup and after sign-in. Checks the endpoint configured in
// tauri.conf.json (GitHub Releases latest.json), downloads + installs
// signed updates, and relaunches the app.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date" }
  | { state: "available"; version: string; notes?: string | null }
  | { state: "downloading"; percent: number; version: string }
  | { state: "installing"; version: string }
  | { state: "error"; message: string };

export type UpdaterListener = (status: UpdaterStatus) => void;

// De-duplicate concurrent checks (startup + post-login can race).
let inflight: Promise<void> | null = null;
let lastCheckAt = 0;
const CHECK_COOLDOWN_MS = 60_000;

/**
 * Check for a new release. If found, download + install and relaunch.
 * The dialog is disabled in tauri.conf.json — the UI is driven by the
 * `onStatus` callback so we can render a non-blocking banner.
 */
export async function checkForUpdates(
  onStatus: UpdaterListener = () => {},
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastCheckAt < CHECK_COOLDOWN_MS) return;

  inflight = (async () => {
    lastCheckAt = Date.now();
    onStatus({ state: "checking" });
    let update: Update | null = null;
    try {
      update = await check();
    } catch (err) {
      onStatus({ state: "error", message: readable(err) });
      return;
    }
    if (!update) {
      onStatus({ state: "up-to-date" });
      return;
    }

    onStatus({
      state: "available",
      version: update.version,
      notes: update.body ?? null,
    });

    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            downloaded = 0;
            onStatus({
              state: "downloading",
              percent: 0,
              version: update!.version,
            });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            onStatus({
              state: "downloading",
              percent: total > 0 ? Math.min(100, (downloaded / total) * 100) : 0,
              version: update!.version,
            });
            break;
          case "Finished":
            onStatus({ state: "installing", version: update!.version });
            break;
        }
      });
    } catch (err) {
      onStatus({ state: "error", message: readable(err) });
      return;
    }

    // Give the UI a beat to render "installing…" before the app restarts.
    await new Promise((r) => setTimeout(r, 400));
    await relaunch();
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

function readable(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}
