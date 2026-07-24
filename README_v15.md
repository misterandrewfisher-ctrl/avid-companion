# Avid Companion v15 — drop-in bundle

Persistence-first .sit loader, ACF resolver with tail-based livery match,
and bridge status/diagnostics.

## Files to add / replace in the companion repo

- `src/lib/sit-compose.ts` — new
- `src/lib/sit-source.ts` — new
- `src/lib/xp-locate.ts` — new
- `src/lib/bridge-status.ts` — new
- `src/components/BridgeStatus.tsx` — new
- `src-tauri/resources/xp12_cold_dark.sit` — new (bundled reference, 4.8 MB)
- `PI_AvidBridge.py` → ship inside `src-tauri/resources/PI_AvidBridge.py`
  and offer to copy it into `<X-Plane 12>/Resources/plugins/PythonPlugins/`
  from the app on first run.

## `src-tauri/tauri.conf.json`

Under `bundle`, add both files to `resources`:

```json
"resources": [
  "resources/xp12_cold_dark.sit",
  "resources/PI_AvidBridge.py"
]
```

## Rust deps (already OK if you have http+fs+store)

```
tauri-plugin-http = "2"
tauri-plugin-fs = "2"
tauri-plugin-store = "2"
```

JS deps:

```
bun add @tauri-apps/plugin-http @tauri-apps/plugin-fs @tauri-apps/plugin-store
```

## Wiring the launch flow (App.tsx)

After the user hits **Launch**, the backend now returns
`dispatch.sit_source` and `dispatch.aircraft`:

```ts
import { resolveSitFile } from "./lib/sit-source";
import { getXpRoot, resolveAcfAndLivery } from "./lib/xp-locate";
import { BridgeStatus } from "./components/BridgeStatus";

async function launch(dispatch) {
  const xp = await getXpRoot();
  if (!xp) throw new Error("X-Plane 12 install not found. Set path in Settings.");

  const acfRel = dispatch.aircraft.xplane_acf_path;
  if (!acfRel) {
    throw new Error(
      `No ACF path configured for ${dispatch.tail}. ` +
      `Set it in Admin → Fleet → SimBrief tab.`
    );
  }

  const resolved = await resolveAcfAndLivery(
    xp,
    acfRel,
    dispatch.aircraft.xplane_livery_folder,
    dispatch.tail,
  );

  const sitPath = await resolveSitFile(dispatch.sit_source);

  // Hand paths to your existing XP launcher (command-line args / IPC).
  await startXPlane({
    acf: resolved.acf_absolute_path,
    livery: resolved.livery_absolute_path,
    sit: sitPath,
  });
}
```

Add `<BridgeStatus />` to the header of the main window.

## Livery naming convention

Livery folders whose name contains the tail (case-insensitive) win over
`xplane_livery_folder`. Naming an Avid livery like
`AVID_N5940F_freighter` under
`Aircraft/Boeing757-Full/liveries/` will auto-select it for N5940F.

## Backend already shipped

- `aircraft_meta.xplane_acf_path` / `xplane_livery_folder` fields (admin UI).
- `N5940F` seeded to `Aircraft/Boeing757-Full/757-RF_xp12.acf`.
- `/api/companion/launch` returns `dispatch.sit_source` (persisted signed URL
  or synthesized `{ stand, descriptor }`) and `dispatch.aircraft`.
