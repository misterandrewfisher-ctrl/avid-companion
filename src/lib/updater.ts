// Auto-update integration for Tauri v2.
// Uses dynamic imports so the app still builds even if the updater plugins
// aren't installed yet (they are optional at dev time).

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date" }
  | { state: "available"; version: string }
  | { state: "downloading"; downloaded: number; total: number | null }
  | { state: "installing" }
  | { state: "error"; message: string };

export type UpdateListener = (status: UpdateStatus) => void;

export async function checkForUpdates(listener: UpdateListener = () => {}): Promise<void> {
  try {
    listener({ state: "checking" });
    const updaterMod: any = await import(/* @vite-ignore */ "@tauri-apps/plugin-updater").catch(
      () => null,
    );
    const processMod: any = await import(/* @vite-ignore */ "@tauri-apps/plugin-process").catch(
      () => null,
    );
    if (!updaterMod?.check) {
      listener({ state: "up-to-date" });
      return;
    }

    const update = await updaterMod.check();
    if (!update) {
      listener({ state: "up-to-date" });
      return;
    }

    listener({ state: "available", version: update.version ?? "unknown" });

    let downloaded = 0;
    let total: number | null = null;

    await update.downloadAndInstall((event: any) => {
      switch (event?.event) {
        case "Started":
          total = event.data?.contentLength ?? null;
          downloaded = 0;
          listener({ state: "downloading", downloaded, total });
          break;
        case "Progress":
          downloaded += event.data?.chunkLength ?? 0;
          listener({ state: "downloading", downloaded, total });
          break;
        case "Finished":
          listener({ state: "installing" });
          break;
      }
    });

    if (processMod?.relaunch) {
      await processMod.relaunch();
    }
  } catch (error) {
    listener({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
