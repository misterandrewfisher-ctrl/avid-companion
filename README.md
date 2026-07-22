# Avid Companion

Desktop companion app for **Avid Air Cargo Virtual**. Bridges the Avid website, OnAir, SayIntentions, SimBrief, and X-Plane 12 into one launcher.

## Downloading the .exe

Every push to `main` builds Windows installers via GitHub Actions.

1. Push this repo to GitHub.
2. Open the **Actions** tab → **Build Avid Companion (Windows)** → latest run.
3. Scroll to **Artifacts** → download **avid-companion-windows**.
4. Inside you'll find:
   - `Avid Companion_0.1.0_x64_en-US.msi`
   - `Avid Companion_0.1.0_x64-setup.exe`

Either installer works. First launch triggers Windows SmartScreen (unsigned build) — click **More info → Run anyway**.

## Publishing this repo to GitHub

```bash
cd avid-companion
git init
git add .
git commit -m "Initial commit"
gh repo create avid-companion --public --source=. --remote=origin --push
```

The build workflow runs automatically on the first push.

## What it does

1. **Auth** — pilot signs in with their Avid account (email/password).
2. **Dispatch** — fetches the pilot's assigned aircraft, active flight, and dispatch payload (route, fuel, SELCAL, Mode-S, maintenance squawks) from `/api/dispatch/mine`.
3. **Situation Load** — downloads the aircraft's most recent `.sit` file, hands it to X-Plane 12 at launch.
4. **XP12 Bridge** — bundled XPPython3 plugin streams telemetry to the app over `ws://127.0.0.1:49152` and accepts failure injection.
5. **Flight Loop** — telemetry during flight; on shutdown, snapshots the current `.sit` and uploads it to `/api/public/sit/upload`.
6. **Test Flights** — MX test flights show a **Sign off** button that posts to `/api/mx/flight/:id/signoff`.

## Local development

Prerequisites: Rust (stable), Bun, Node 20+, and on Windows the MSVC build tools.

```bash
bun install
cp .env.example .env
bun tauri dev
```

## Local Windows build

```bash
bun tauri build
```

Installers land in `src-tauri/target/release/bundle/`.

## Repo layout

```
avid-companion/
├── src/                       React UI
├── src-tauri/                 Rust shell + Tauri config
│   ├── src/                   Tauri commands
│   ├── icons/                 Windows/macOS/Linux icons
│   └── capabilities/          Tauri v2 permission grants
├── xppython3-plugin/          XP12 plugin (Python)
│   └── PI_AvidBridge.py
└── .github/workflows/         CI (Windows build)
```

## Testing the round-trip

1. Install the `.exe` on your Windows box.
2. Sign in with your Avid credentials.
3. Point the app at your X-Plane 12 folder (auto-detected on most installs).
4. Click **Install bridge plugin** — restart XP12 once.
5. Lease a 757 / 767 in OnAir; the app will pick it up on **Refresh**.
6. Click **Load into X-Plane** — the `.sit` downloads and XP12 launches.
