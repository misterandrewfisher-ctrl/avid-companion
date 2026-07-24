# v15 TS hotfix

Two things: (1) overwrite `src/vite-env.d.ts`, (2) run the patch script below
from the companion repo root to rewrite the three broken imports.

## Patch script

Save as `apply-v15-fix.mjs` in the repo root and run `node apply-v15-fix.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";

const edits = [
  {
    file: "src/lib/sit-compose.ts",
    from: /import\s*\{\s*readBinaryFile\s*,\s*writeBinaryFile\s*\}\s*from\s*"@tauri-apps\/plugin-fs";?/,
    to: 'import { readFile as readBinaryFile, writeFile as writeBinaryFile } from "@tauri-apps/plugin-fs";',
  },
  {
    file: "src/lib/sit-source.ts",
    from: /import\s*\{\s*writeBinaryFile\s*\}\s*from\s*"@tauri-apps\/plugin-fs";?/,
    to: 'import { writeFile as writeBinaryFile } from "@tauri-apps/plugin-fs";',
  },
];

for (const { file, from, to } of edits) {
  const src = readFileSync(file, "utf8");
  if (!from.test(src)) { console.warn("skip (pattern not found):", file); continue; }
  writeFileSync(file, src.replace(from, to));
  console.log("patched", file);
}
console.log("done — plugin-http imports resolve via the ambient stub in src/vite-env.d.ts");
```

## Also install the plugins (if not already present)

```
npm i @tauri-apps/plugin-fs @tauri-apps/plugin-http
```
