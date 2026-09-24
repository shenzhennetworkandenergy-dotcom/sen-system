import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const expensePage = readFileSync("app/admin/murshida-manzil/[id]/expense-voucher/page.tsx", "utf8");
const ownerPage = readFileSync("app/admin/murshida-manzil/reports/owner-rent-account/page.tsx", "utf8");

test("expense voucher uses the isolated blue Murshida print presentation", () => {
  assert.match(expensePage, /print-documents\.module\.css/);
  assert.match(expensePage, /murshida-seal\.png/);
  assert.match(expensePage, /murshida-architecture\.png/);
  assert.match(expensePage, /খরচের ভাউচার/);
  assert.match(expensePage, /Voucher Number/);
  assert.match(expensePage, /expense\.amount/);
  assert.match(expensePage, /Prepared By/);
  assert.match(expensePage, /Approved By/);
  assert.match(expensePage, /Receiver/);
});

test("owner rent account keeps its controls and data while using formal print styling", () => {
  assert.match(ownerPage, /print-documents\.module\.css/);
  assert.match(ownerPage, /murshida-seal\.png/);
  assert.match(ownerPage, /murshida-architecture\.png/);
  assert.match(ownerPage, /মালিক ভাড়া হিসাব বিবরণী/);
  for (const control of ["owner", "year", "from", "to"]) assert.match(ownerPage, new RegExp(`name="${control}"`));
  assert.match(ownerPage, /\?owner=\$\{selectedOwner\.id\}&beginning=1/);
  assert.match(ownerPage, /transaction\.eligibleRentIncome/);
  assert.match(ownerPage, /transaction\.ownerPercentage/);
  assert.match(ownerPage, /transaction\.ownerShare/);
  assert.match(ownerPage, /selectedData\.selectedPeriodTotal/);
  assert.match(ownerPage, /allData\.fromBeginningTotal/);
});

test("formal document CSS is isolated and uses full-page print rather than receipt dimensions", () => {
  const path = "app/admin/murshida-manzil/print-documents.module.css";
  assert.equal(existsSync(path), true);
  const css = readFileSync(path, "utf8");
  assert.match(css, /@page\s*\{[^}]*size:\s*A4\s+landscape/i);
  assert.doesNotMatch(css, /11in\s+4\.5in/i);
  assert.match(css, /print-color-adjust:\s*exact/i);
  assert.match(css, /break-inside:\s*avoid/i);
});

test("native print keeps the letterhead and footer in normal document flow", () => {
  const css = readFileSync("app/admin/murshida-manzil/print-documents.module.css", "utf8");
  const printBlock = css.match(/@media print\s*\{([\s\S]*)\}\s*$/)?.[1] ?? "";
  assert.doesNotMatch(printBlock, /header:not\(\.letterhead\).*display:\s*none/i);
  assert.match(printBlock, /\.document\s*\{[\s\S]*overflow:\s*visible/i);
  assert.match(printBlock, /\.document\s*\{[\s\S]*min-height:\s*0/i);
  assert.match(printBlock, /\.footer\s*\{[\s\S]*position:\s*static/i);
  assert.doesNotMatch(printBlock, /\.letterhead[^}]*display:\s*none/i);
  assert.match(printBlock, /\.letterhead\s*\{[\s\S]*min-height:\s*90px/i);
  assert.match(printBlock, /\.content\s*\{[\s\S]*padding:\s*8px\s+14px\s+5px/i);
  assert.doesNotMatch(printBlock, /\.grandTotal[^}]*break-inside:\s*avoid/i);
  assert.doesNotMatch(printBlock, /\.signatures[^}]*break-inside:\s*avoid/i);
});
