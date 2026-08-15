# Avid Companion — hosted inside the website project

This folder is the source of the **Avid Companion desktop app** (Tauri + React +
Python bridge). It lives inside the main `bloom-create-deploy` Lovable project
so that Lovable can read and edit it in the same chat that owns the website
and Supabase backend.

## What is / isn't built here

- Lovable / Vite build in this project builds **only** the website
  (`/src`, `/vite.config.ts`, `/tsconfig.json`).
- This `/companion` folder is **source only**. The Windows `.exe` is produced
  by the GitHub Actions workflow in `.github/workflows/build.yml` inside this
  folder — that workflow needs to be moved to the repo root (`/.github/workflows/`)
  and updated to `working-directory: companion` when we wire the pipeline.

## Layout

- `src/` — React UI (aircraft picker, preflight panel, launch button)
- `src-tauri/` — Rust Tauri shell + commands
- `plugin/` and `xppython3-plugin/` — the `PI_AvidBridge.py` X-Plane plugin
- `docs/`, `README*.md` — historical notes from v8 → v15

## API contract

The companion talks to the website through these endpoints (already live):

- `POST /api/public/companion/device-code` — start login
- `POST /api/public/companion/device-code.exchange` — poll for approval
- `GET  /api/companion/fleet` — aircraft dropdown
- `GET  /api/companion/preflight` — green-light checks
- `POST /api/companion/launch` — dispatch pack + `.sit` descriptor
- `POST /api/public/sit/upload` — persist post-flight `.sit`

Auth uses a Supabase bearer token from the device-code flow.
