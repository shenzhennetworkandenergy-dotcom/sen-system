import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../lib/auth/local-credentials.ts";

test("local passwords use salted adaptive hashes", async () => {
  const first = await hashPassword("Correct horse battery staple 2026!");
  const second = await hashPassword("Correct horse battery staple 2026!");
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("Correct horse battery staple 2026!", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("local password verification rejects malformed hashes safely", async () => {
  assert.equal(await verifyPassword("anything", "not-a-password-hash"), false);
  await assert.rejects(() => hashPassword("short"), /12 characters/i);
});

test("session tokens store only deterministic SHA-256 hashes", () => {
  const token = createSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
  assert.notEqual(hashSessionToken(token), token);
});
