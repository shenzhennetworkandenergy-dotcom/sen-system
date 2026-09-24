import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalObjectToken, localObjectPath, putLocalObject, readLocalObject, verifyLocalObjectToken } from "../lib/storage/local.ts";

test("local storage rejects traversal and unsafe bucket names", () => {
  assert.throws(() => localObjectPath("D:\\SEN Data", "../private", "file.pdf"), /bucket/i);
  assert.throws(() => localObjectPath("D:\\SEN Data", "hr-documents", "../../secret"), /path/i);
  assert.throws(() => localObjectPath("D:\\SEN Data", "hr-documents", "C:\\Windows\\file"), /path/i);
});

test("local object tokens bind bucket path operation and expiry", () => {
  const secret = "s".repeat(48);
  const expires = Math.floor(Date.now() / 1000) + 60;
  const token = createLocalObjectToken("hr-documents", "employee/file.pdf", "read", expires, secret);
  assert.equal(verifyLocalObjectToken("hr-documents", "employee/file.pdf", "read", expires, token, secret), true);
  assert.equal(verifyLocalObjectToken("hr-documents", "employee/other.pdf", "read", expires, token, secret), false);
  assert.equal(verifyLocalObjectToken("hr-documents", "employee/file.pdf", "write", expires, token, secret), false);
  assert.equal(verifyLocalObjectToken("hr-documents", "employee/file.pdf", "read", 1, token, secret), false);
});

test("local storage writes and reads objects atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "sen-storage-"));
  try {
    const saved = await putLocalObject(root, "product-media", "products/one/image.png", Buffer.from("image"), { upsert: false });
    assert.equal(saved.size, 5);
    assert.equal((await readLocalObject(root, "product-media", "products/one/image.png")).toString(), "image");
    assert.equal((await readFile(saved.absolutePath)).toString(), "image");
    await assert.rejects(() => putLocalObject(root, "product-media", "products/one/image.png", Buffer.from("other"), { upsert: false }), /exists/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
