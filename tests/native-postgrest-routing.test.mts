import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native admin data uses local PostgREST for full query compatibility", async () => {
  const source = await readFile(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8");
  assert.match(source, /PostgrestClient/);
  assert.match(source, /postgrestUrl/);
  assert.doesNotMatch(source, /createNativeDatabaseClient/);
});
