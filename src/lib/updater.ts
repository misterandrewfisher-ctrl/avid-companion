import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "none" }
  | { type: "available"; version: string }
  | { type: "downloading"; version: string }
  | { type: "installing"; version: string }
  | { type: "relaunching"; version: string }
  | { type: "error"; message: string };

export type UpdateListener = (status: UpdateStatus) => void;

const noop: UpdateListener = () => {};

export async function checkForUpdates(onStatus: UpdateListener = noop) {
  onStatus({ type: "checking" });
  try {
    const update = await check();
    if (!update) {
      onStatus({ type: "none" });
      return;
    }

    onStatus({ type: "available", version: update.version });
    onStatus({ type: "downloading", version: update.version });
    await update.downloadAndInstall((event) => {
      if ((event as { event: string }).event === "Finished") {
        onStatus({ type: "installing", version: update.version });
      }
    });

    onStatus({ type: "relaunching", version: update.version });
    await relaunch();

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onStatus({ type: "error", message });
  }
}
