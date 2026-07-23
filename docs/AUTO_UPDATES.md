# Avid Companion — Auto-updates (v0.3)

The app now checks GitHub Releases for a new version:
- Once at startup
- Once again after sign-in
- A retry button appears if a check fails

Releases are downloaded and installed **only** if they're signed with
your Tauri updater key. Set that up once, then every `vX.Y.Z` git tag
becomes an auto-update for existing installs.

## One-time setup

### 1. Generate a signing keypair (on your machine)
```powershell
bunx @tauri-apps/cli signer generate -w %USERPROFILE%\.tauri\avid-companion.key
```
This prints two things:
- A **private key** (the `avid-companion.key` file) — keep secret.
- A **public key** (base64 string) — safe to commit.

### 2. Put the public key in `src-tauri/tauri.conf.json`
Replace `REPLACE_ME_WITH_TAURI_UPDATER_PUBKEY` under `plugins.updater.pubkey`
with the base64 string. Also replace `REPLACE_ME_OWNER` in the endpoint URL
with your GitHub username or org so it reads:

```
https://github.com/<you>/avid-companion/releases/latest/download/latest.json
```

Commit both changes.

### 3. Add two GitHub secrets
Repo → Settings → Secrets and variables → Actions → **New repository secret**:
- `TAURI_SIGNING_PRIVATE_KEY` — paste the **contents** of the `.key` file.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you typed when
  generating the key (leave blank if you skipped one, but still add the secret).

## Cutting a release

```bash
git tag v0.3.0
git push origin v0.3.0
```

The **Build Avid Companion (Windows)** workflow will:
1. Build the app.
2. Sign the update artifact with your private key.
3. Create a GitHub Release named `Avid Companion v0.3.0`.
4. Upload `latest.json`, the `.nsis.zip` update payload, and the installer.

Existing installs will see the update on the next startup (or the next
sign-in) and self-install without a reinstall.

## Troubleshooting

- **"Update check failed"** on a fresh install → confirm the `endpoints`
  URL is reachable in a browser and that `latest.json` exists in the
  latest release.
- **Signature verification error** → the `pubkey` in `tauri.conf.json`
  doesn't match the `TAURI_SIGNING_PRIVATE_KEY` used by the workflow.
  Regenerate the pair or replace whichever is out of date.
- **No update showing after a tag push** → check the Actions run.
  If it succeeded but no release appeared, verify the workflow has
  `contents: write` permission (it does in `.github/workflows/build.yml`).
