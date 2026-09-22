import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login registration logout and session resolution support native mode", async () => {
  const files = await Promise.all([
    "app/login/actions.ts",
    "app/register/actions.ts",
    "app/logout/route.ts",
    "lib/auth/session.ts",
  ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  assert.match(files[0], /authenticateLocal/);
  assert.match(files[0], /createLocalSession/);
  assert.match(files[1], /registerLocalCustomer/);
  assert.match(files[2], /revokeLocalSession/);
  assert.match(files[3], /getLocalSession/);
});
