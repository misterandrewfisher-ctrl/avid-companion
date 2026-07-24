AVID Companion v15 hotfix v2

This is a plain drop-in package. No script needed.

1. Unzip this over the root of the companion app repo.
2. Let Windows overwrite the existing files.
3. Commit and rerun the GitHub workflow.

This fixes the Tauri v2 build errors by removing:
- BaseDirectory
- tempDir
- dirname
- writeFile/readFile third-argument calls

It also accepts either an absolute ACF path like:
D:\X-Plane 12\Aircraft\Boeing757-Full\757-RF_xp12.acf
or a path relative to the X-Plane root.
