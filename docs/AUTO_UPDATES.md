# Avid Companion — Auto-updates

The companion app now checks GitHub Releases for a new version on every startup. Updates are downloaded and installed silently, then the app relaunches itself.

## One-time setup (already done in code)

- ✅ The Tauri updater plugin is installed in `companion/src-tauri/Cargo.toml`.
- ✅ The plugin is registered in Rust (`main.rs`).
- ✅ `tauri.conf.json` has the updater enabled with the public key already set.
- ✅ `useUpdater()` runs an update check on startup and shows status in the UI.
- ✅ The GitHub Actions workflow is configured to sign the update payload and upload the `.nsis.zip`, `.nsis.zip.sig`, and `latest.json` files to the release.
- ✅ The signing private key and password are stored in Lovable Cloud secrets.

## What you still need to do

### 1. Tell the app where your GitHub releases live

In `companion/src-tauri/tauri.conf.json`, replace the placeholder endpoint:

```json
"endpoints": [
  "https://github.com/REPLACE_ME_OWNER/REPLACE_ME_REPO/releases/latest/download/latest.json"
]
```

with your actual GitHub org/user and repo name, e.g.:

```json
"endpoints": [
  "https://github.com/avidair/avid-companion/releases/latest/download/latest.json"
]
```

### 2. Copy the signing secrets from Lovable to GitHub Actions

The Tauri updater needs two GitHub Actions secrets so the build server can sign the update package:

1. Open your project in Lovable and go to **Settings → Secrets** (or wherever your stored secrets are shown).
2. Copy these two values:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. In your GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret** and paste both values with the exact same names.

> ⚠️ The private key and password must match the public key in `tauri.conf.json`. If you regenerate a new keypair later, you must replace the public key in the config too.

### 3. Make sure the GitHub workflow is in your repo

The workflow file is already at `.github/workflows/companion-build.yml`. When you push the `companion` folder to GitHub, ensure this file is in the root of the GitHub repo (not inside the `companion` subfolder). It already triggers on `companion-v*` tags.

## Cutting a release

1. Bump the version in all three files so the new build reports the new version:
   - `companion/src-tauri/tauri.conf.json`
   - `companion/src-tauri/Cargo.toml`
   - `companion/package.json`
2. Create and push the tag:

```bash
git tag companion-v0.3.2
git push origin companion-v0.3.2
```

The **Build Avid Companion (Windows)** workflow will:

1. Build the app.
2. Sign the update payload with the private key.
3. Create a GitHub Release named `companion-v0.3.2`.
4. Upload the `.msi`, `.exe`, `.nsis.zip`, `.nsis.zip.sig`, and `latest.json` files.

Existing installs will detect the update on the next startup and install it automatically.

## Troubleshooting

- **"Update check failed"** on a fresh install → confirm the `endpoints` URL is reachable in a browser and that `latest.json` exists in the latest release.
- **Signature verification error** → the `pubkey` in `tauri.conf.json` doesn't match the `TAURI_SIGNING_PRIVATE_KEY` used by the workflow. If you regenerate the keypair, replace both the public key and the GitHub secret.
- **No update showing after a tag push** → check the Actions run. If it succeeded but no release appeared, verify the workflow has `contents: write` permission.
- **Updates fail on install** → ensure the Windows Defender / SmartScreen is not blocking the unsigned installer. A code-signing certificate (optional) reduces these warnings, but Tauri signature verification is the minimum requirement.
