import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Murshida receipt presentation defines the exact two-copy print contract", () => {
  const document = readFileSync("app/admin/murshida-manzil/_components/MurshidaReceiptCopy.tsx", "utf8");
  assert.match(document, /murshida-receipt--\$\{kind\}/);
  assert.match(document, /LANDLORD COPY|বাড়িওয়ালার/i);
  assert.match(document, /TENANT COPY|ভাড়াটিয়ার/i);
  assert.match(document, /PrintButton/);
  assert.equal(existsSync("app/admin/murshida-manzil/murshida.module.css"), true);
  const css = readFileSync("app/admin/murshida-manzil/murshida.module.css", "utf8");
  assert.match(css, /@page\s*\{[^}]*size:\s*11in\s+4\.5in/i);
  assert.match(css, /cutLine/);
  assert.match(css, /seal/);
});
