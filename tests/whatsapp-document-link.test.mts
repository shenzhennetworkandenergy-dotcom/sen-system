import assert from "node:assert/strict";
import test from "node:test";
import { createWhatsappDocumentToken, readDocumentReference, verifyWhatsappDocumentToken } from "../lib/whatsapp/document-link.ts";

test("a document token authorizes one type, document and customer until it expires", () => {
  const now = Date.UTC(2026, 10, 26);
  const secret = "local-test-secret";
  const document = { kind: "quotation" as const, id: "be4e39ec-f733-4e74-9f16-a07bb6350240" };
  const customerId = "2d49cabb-da7a-46de-8ce8-052262c5bcdf";
  const token = createWhatsappDocumentToken(document, customerId, secret, now);
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  assert.deepEqual(verifyWhatsappDocumentToken(token, secret, expiresAt - 1), {
    ...document, customerId, expiresAt: expiresAt / 1000,
  });
  assert.equal(verifyWhatsappDocumentToken(token, secret, expiresAt), null);
  assert.equal(verifyWhatsappDocumentToken(token, "another-secret", now), null);
  const [, signature] = token.split(".");
  const tampered = Buffer.from(JSON.stringify({ ...document, kind: "invoice", customerId, expiresAt: expiresAt / 1000 })).toString("base64url");
  assert.equal(verifyWhatsappDocumentToken(tampered + "." + signature, secret, now), null);
  assert.equal(readDocumentReference({ kind: "invoice", id: "../../other" }), null);
});
