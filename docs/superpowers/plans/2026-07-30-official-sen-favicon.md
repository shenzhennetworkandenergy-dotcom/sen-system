# Official SEN Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every generic favicon reference with optimized icons derived directly from SEN's official logo.

**Architecture:** A small verification script will inspect the generated icon pixels and public metadata endpoints. Sharp will resize the existing official square PNG without modifying its artwork. Next.js file metadata, root metadata, and the web app manifest will consistently reference those derived assets.

**Tech Stack:** Next.js 16 metadata APIs, Node.js, Sharp, PNG and ICO assets.

## Global Constraints

- Preserve `public/brand/sen-official-logo.png` unchanged.
- Preserve the official logo artwork, colors, wording, and proportions.
- Use a white background for cross-browser legibility.
- Do not change visible header, footer, or page content.

---

### Task 1: Official favicon assets and metadata

**Files:**
- Create: `scripts/verify-favicon.mjs`
- Create: `app/icon.png`
- Create: `app/apple-icon.png`
- Modify: `app/favicon.ico`
- Delete: `app/icon.svg`
- Delete: `app/apple-icon.svg`
- Modify: `app/layout.tsx`
- Modify: `app/manifest.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `public/brand/sen-official-logo.png` as the only artwork source.
- Produces: `/icon.png`, `/apple-icon.png`, and `/favicon.ico` as official-logo-derived icons; `npm run test:favicon` verifies the result.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-favicon.mjs` to:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";

const source = sharp("public/brand/sen-official-logo.png");
const sourceHash = await source
  .clone()
  .resize(64, 64, { fit: "contain", background: "#ffffff" })
  .png()
  .toBuffer();

for (const [path, size] of [["app/icon.png", 64], ["app/apple-icon.png", 180]]) {
  assert.ok(fs.existsSync(path), `${path} is missing`);
  const metadata = await sharp(path).metadata();
  assert.equal(metadata.width, size);
  assert.equal(metadata.height, size);
}

const iconHash = await sharp("app/icon.png").png().toBuffer();
assert.deepEqual(iconHash, sourceHash, "app/icon.png is not derived from the official SEN logo");
assert.ok(fs.existsSync("app/favicon.ico"), "app/favicon.ico is missing");
```

Also fetch `/manifest.webmanifest` and `/` from the running application and assert that both advertise `/icon.png`, `/apple-icon.png`, and `/favicon.ico` without advertising the generic SVG icons.

- [ ] **Step 2: Run the check and verify RED**

Run: `node scripts/verify-favicon.mjs`

Expected: FAIL because `app/icon.png` and `app/apple-icon.png` do not exist and the metadata still advertises generic SVG icons.

- [ ] **Step 3: Generate minimal official-logo-derived assets**

Use Sharp to resize `public/brand/sen-official-logo.png` with `fit: "contain"` and `background: "#ffffff"` into:

```text
app/icon.png       64x64 PNG
app/apple-icon.png 180x180 PNG
```

Create a multi-size `app/favicon.ico` containing 16x16, 32x32, and 48x48 renderings from the same source. Remove the two generic SVG files.

- [ ] **Step 4: Point metadata and manifest to the official assets**

Update `app/layout.tsx`:

```ts
icons: {
  icon: [
    { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
    { url: "/icon.png", sizes: "64x64", type: "image/png" },
  ],
  shortcut: "/favicon.ico",
  apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
},
```

Update `app/manifest.ts`:

```ts
icons: [
  { src: "/icon.png", sizes: "64x64", type: "image/png" },
  { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
],
```

Add `"test:favicon": "node scripts/verify-favicon.mjs"` to `package.json`.

- [ ] **Step 5: Run favicon verification and verify GREEN**

Run: `npm run test:favicon`

Expected: PASS with all assets square, official-logo-derived, and advertised by the application.

- [ ] **Step 6: Run project verification**

Run:

```text
npm run lint
npm run build
```

Expected: both commands exit successfully without new warnings.

- [ ] **Step 7: Verify in the browser**

Open the local website with a cache-busting query, inspect the document favicon links, and confirm the tab displays the official SEN logo. Reload bypassing browser cache if the old favicon persists.
