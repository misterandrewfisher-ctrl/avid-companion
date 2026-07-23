// Optional auto-updater. Uses dynamic imports so the app still builds
// even when the Tauri updater/process plugins aren't installed yet.
export async function checkForUpdates() {
  try {
    const updater = await import(
      /* @vite-ignore */ "@tauri-apps/plugin-updater"
    ).catch(() => null as any);
    const proc = await import(
      /* @vite-ignore */ "@tauri-apps/plugin-process"
    ).catch(() => null as any);
    if (!updater?.check) return;
    const update = await updater.check();
    if (update) {
      console.log(`Update available: ${update.version}`);
      await update.downloadAndInstall();
      if (proc?.relaunch) await proc.relaunch();
    }
  } catch (e) {
    console.error("Update check failed", e);
  }
}
