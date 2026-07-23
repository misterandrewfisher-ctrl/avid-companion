# Avid Companion — v8 Patch (drop-in)

## What's in this zip

- `src-tauri/icons/*` — new icons rendered from the AVID website logo
- `.github/workflows/build.yml` — replaces the old workflow. Adds a **Run workflow** button and builds on every push to `main`. No more `git tag` needed.

## How to install

1. In your `avid-companion` GitHub repo (web UI), open each file in this zip and **replace the corresponding file** (or upload via GitHub Desktop). Overwrite everything under `src-tauri/icons/` and replace `.github/workflows/build.yml` in full.
2. Add these three repo secrets (Settings → Secrets and variables → Actions):

   | Name | Value |
   |---|---|
   | `VITE_AVID_API_BASE` | `https://id-preview--0b678040-0945-40d8-b885-963e81cc0a50.lovable.app` |
   | `VITE_COMPANION_SECRET` | The AVID companion secret (see the paste box I'll open in chat) |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password from when you generated the key. If you pressed Enter for none, add the secret with an empty value **or skip it entirely** — the workflow tolerates missing. |

3. Trigger a build **without any terminal**:
   - Go to **Actions** → "Build Avid Companion" → **Run workflow** → type `0.2.1` → Run.
   - Or just commit anything to `main`; it auto-builds using the version in `src-tauri/tauri.conf.json`.

4. When the run finishes, check **Releases** — you'll see `v0.2.1` with the `.exe`, `.sig`, and `latest.json`. Install that `.exe` once; future versions auto-update.

## Notes

- The workflow now syncs `package.json`, `tauri.conf.json`, and `Cargo.toml` to the version you pick, so you never have to bump three files by hand.
- If a build fails, click the failing step in Actions and paste the last ~30 lines here.
