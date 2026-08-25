import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Draft quotation database verifier refuses non-local database hosts before connecting", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-draft-quotation-editing-database.mjs", "--self-test"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /local-host guard self-test passed/i);
});
