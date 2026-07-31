import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL(
  "../components/inventory/RichTextEditor.tsx",
  import.meta.url,
);

test("renders separate accessible Visual and HTML source mode buttons", async () => {
  const source = await readFile(componentUrl, "utf8");

  assert.match(source, />\s*Visual\s*</);
  assert.match(source, />\s*HTML source\s*</);
  assert.match(source, /onClick=\{\(\)\s*=>\s*setMode\("visual"\)\}/);
  assert.match(source, /onClick=\{\(\)\s*=>\s*setMode\("html"\)\}/);
  assert.match(source, /aria-pressed=\{mode\s*===\s*"visual"\}/);
  assert.match(source, /aria-pressed=\{mode\s*===\s*"html"\}/);
  assert.doesNotMatch(
    source,
    /setMode\(mode==="visual"\?"html":"visual"\)/,
  );
});
