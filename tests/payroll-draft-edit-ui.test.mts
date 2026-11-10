import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const payrollPagePath = new URL("../app/admin/hr/payroll/page.tsx", import.meta.url);

test("draft payrolls expose a visible edit action that opens the existing editor", async () => {
  const source = await readFile(payrollPagePath, "utf8");

  assert.match(source, /row\.status === "draft"[\s\S]*?Edit payroll/);
  assert.match(source, /href=\{`\/admin\/hr\/payroll\?edit=\$\{row\.id\}#edit-payroll-\$\{row\.id\}`\}/);
  assert.match(source, /<details id=\{`edit-payroll-\$\{row\.id\}`\} open=\{params\.edit === row\.id\}/);
});
