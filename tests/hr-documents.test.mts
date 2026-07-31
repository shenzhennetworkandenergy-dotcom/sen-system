import assert from "node:assert/strict";
import test from "node:test";

import {
  safeEmployeeDocumentName,
  validateEmployeeDocuments,
} from "../lib/hr/documents.ts";
import { actionOutcomeUrl } from "../lib/actions/outcome.ts";

test("employee documents accept multiple matching image and PDF files", () => {
  const files = validateEmployeeDocuments([
    { name: "passport.pdf", type: "application/pdf", size: 100 },
    { name: "photo.JPG", type: "image/jpeg", size: 100 },
  ]);
  assert.equal(files.length, 2);
});

test("document MIME and extension must agree", () => {
  assert.throws(
    () => validateEmployeeDocuments([{ name: "unsafe.pdf", type: "image/png", size: 100 }]),
    /matching PDF/,
  );
});

test("document names and action outcomes are safe", () => {
  assert.equal(safeEmployeeDocumentName("../../My passport (new).pdf"), "..-..-My-passport-new-.pdf");
  assert.equal(
    actionOutcomeUrl("/admin/hr/employees/1", { kind: "success", message: "Employee saved." }),
    "/admin/hr/employees/1?success=Employee%20saved.",
  );
});
