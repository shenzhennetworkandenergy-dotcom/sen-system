import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const baseCommit = "54d4ac6de3a628ad2c5071e6478ab133d223a8d4";
const exactAllowedPaths = new Set([
  "docs/superpowers/plans/2026-09-29-production-snapshot-crm-overlay.md",
  "docs/superpowers/specs/2026-09-29-production-snapshot-crm-overlay-design.md",
  "docs/CRM_FOLLOWUPS.md",
  "supabase/migrations/202609290002_crm_followups_phase1_phase2.sql",
  "supabase/migrations/202609290003_crm_whatsapp_private_storage.sql",
]);
const allowedPrefixes = ["app/admin/crm/", "components/crm/", "lib/crm/", "tests/crm-"];

function gitLines(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

function changedPaths() {
  return [...new Set([
    ...gitLines(["diff", "--name-only", `${baseCommit}...HEAD`]),
    ...gitLines(["diff", "--name-only", "--cached"]),
    ...gitLines(["diff", "--name-only"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ])].sort();
}

test("changed paths stay inside the CRM production allowlist", () => {
  const paths = changedPaths();
  const rejected = paths.filter((file) =>
    !exactAllowedPaths.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)),
  );
  assert.deepEqual(rejected, [], `Non-CRM paths are forbidden:\n${rejected.join("\n")}`);

  const sensitive = paths.filter((file) =>
    /(^|\/)(\.env($|\.)|\.offline-test\/|\.local-sen-data\/|supabase\/\.temp\/)/i.test(file)
    || /(^|\/)(customers?|conversations?)[^/]*\.csv$/i.test(file),
  );
  assert.deepEqual(sensitive, [], `Sensitive or customer-data files are forbidden:\n${sensitive.join("\n")}`);
});
