import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Draft quotation database verifier refuses remote routing and self-tests two-session cleanup", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-draft-quotation-editing-database.mjs", "--self-test"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /local-host guard self-test passed/i);
  assert.match(result.stdout, /libpq-routing sanitization self-test passed/i);
  assert.match(result.stdout, /disposable identity self-test passed/i);
  assert.match(result.stdout, /two-session lock self-test passed/i);
});
