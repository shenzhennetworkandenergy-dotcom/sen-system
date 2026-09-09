import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EMPLOYEE_LOAN_FINAL_CONSENT_ITEMS,
  EMPLOYEE_LOAN_TERM_ITEMS,
  employeeLoanStageLabel,
  hasCompleteLoanConsent,
  normalizeApprovedEmployeeLoanTerms,
  normalizeEmployeeLoanApplication,
  normalizeLoanConsent,
  validatePrivateLoanDocument,
} from "../lib/receivables/employee-loans.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("employee loan consent requires every acknowledgement", () => {
  assert.throws(() => normalizeLoanConsent({ guidance: true }), /required acknowledgement/i);
  const accepted = Object.fromEntries([...EMPLOYEE_LOAN_TERM_ITEMS, ...EMPLOYEE_LOAN_FINAL_CONSENT_ITEMS].map((key) => [key, true]));
  const consent = normalizeLoanConsent(accepted);
  assert.equal(EMPLOYEE_LOAN_TERM_ITEMS.length, 14);
  assert.ok(consent.items.includes("term_14"));
  assert.ok(consent.items.includes("final_witness"));
  assert.equal(hasCompleteLoanConsent({ consent_version: consent.version, consent_items: consent.items }), true);
  assert.equal(hasCompleteLoanConsent({ consent_version: "employee-loan-terms-bn-v2", consent_items: consent.items }), false);
  assert.equal(hasCompleteLoanConsent({ consent_version: consent.version, consent_items: consent.items.filter((item) => item !== "final_witness") }), false);
});

test("employee application and Admin terms validate independently", () => {
  const request = normalizeEmployeeLoanApplication({
    requestedAmount: "120000", purpose: "", repaymentMonths: "0", repaymentDays: "10",
    installmentFrequency: "weekly", proposedInstallment: "10000", preferredStartDate: "2026-10-01",
    detailedExplanation: "Detailed and accurate explanation.", employeeNote: "Please review.",
    witnesses: [1, 2, 3].map((number) => ({ name: `Witness ${number}`, address: `Address ${number}`, phone: `0170000000${number}` })),
  });
  assert.equal(request.requestedAmount, 120000);
  assert.equal(request.purpose, null);
  assert.equal(request.repaymentMonths, 0);
  assert.equal(request.repaymentDays, 10);
  assert.equal(request.installmentFrequency, "weekly");
  assert.equal(request.witnesses.length, 3);
  assert.throws(() => normalizeEmployeeLoanApplication({ ...request, requestedAmount: "0" }), /whole number/i);
  assert.throws(() => normalizeEmployeeLoanApplication({ ...request, requestedAmount: "5000.50" }), /digits only/i);
  assert.throws(() => normalizeEmployeeLoanApplication({ ...request, repaymentDays: "0" }), /cannot both be zero/i);
  assert.throws(() => normalizeEmployeeLoanApplication({ ...request, installmentFrequency: "annual" }), /frequency is invalid/i);
  assert.throws(() => normalizeEmployeeLoanApplication({ ...request, proposedInstallment: "5e3" }), /digits only/i);

  const approved = normalizeApprovedEmployeeLoanTerms({
    approvedAmount: "100000", approvedPeriod: "10 months", approvedInstallments: "10",
    approvedMonthlyInstallment: "10000", repaymentStartDate: "2026-11-01", purpose: "Approved purpose",
    specialTerms: "Subject to the signed agreement.", adminNote: "Identity verified.",
    agreementDate: "2026-09-08", agreementReference: "SEN-ELA-2026-000123",
  });
  assert.equal(approved.approvedAmount, 100000);
  assert.equal(approved.approvedInstallments, 10);
});

test("private document validation accepts only bounded PDF or image evidence", () => {
  assert.equal(validatePrivateLoanDocument({ name: "signed.pdf", type: "application/pdf", size: 1024 }).extension, "pdf");
  assert.throws(() => validatePrivateLoanDocument({ name: "payload.html", type: "text/html", size: 50 }), /PDF, JPEG, or PNG/i);
  assert.throws(() => validatePrivateLoanDocument({ name: "large.pdf", type: "application/pdf", size: 11 * 1024 * 1024 }), /10 MB/i);
});

test("employee stages are derived without replacing canonical Receivables statuses", () => {
  assert.equal(employeeLoanStageLabel({ accountStatus: "requested", workflowStage: "submitted" }), "Submitted");
  assert.equal(employeeLoanStageLabel({ accountStatus: "approved", workflowStage: "agreement_sent" }), "Agreement Sent");
  assert.equal(employeeLoanStageLabel({ accountStatus: "active", workflowStage: "disbursed" }), "Approved / Disbursed");
  assert.equal(employeeLoanStageLabel({ accountStatus: "rejected", workflowStage: "submitted" }), "Rejected");
});

test("employee actions bind ownership from the authenticated employee record", async () => {
  const actions = await read("app/employee/loans/actions.ts");
  assert.match(actions, /requireEmployeeHrRecord\(\)/);
  assert.doesNotMatch(actions, /form\.get\(["']employee_id["']\)/);
  assert.match(actions, /employeeId = context\.employee\?\.id/);
  assert.match(actions, /create_employee_loan_application/);
});

test("employee pages and document routes enforce own-account access", async () => {
  const data = await read("lib/receivables/employee-loans-data.ts");
  const employeeDetail = await read("app/employee/loans/[id]/page.tsx");
  const adminPanel = await read("components/receivables/EmployeeLoanAdminPanel.tsx");
  const employeeDocument = await read("app/employee/loans/[id]/documents/[documentId]/route.ts");
  const adminDocument = await read("app/admin/receivables/loans/[id]/documents/[documentId]/route.ts");
  assert.match(data, /\.eq\("employee_record_id", context\.employee\.id\)/);
  assert.match(data, /transaction_type", "disbursement"/);
  assert.match(employeeDetail, /Disbursement Details/);
  assert.match(employeeDetail, /View \/ Download Payment Proof/);
  assert.match(adminPanel, /Disbursement \/ Payment Proof/);
  assert.match(adminPanel, /View \/ Download Payment Proof/);
  assert.match(employeeDocument, /getEmployeeLoanApplication/);
  assert.match(employeeDocument, /createSignedUrl/);
  assert.match(employeeDocument, /Cache-Control[\s\S]*private, no-store/);
  assert.match(adminDocument, /requireAllPermissions/);
  assert.match(adminDocument, /createSignedUrl/);
});

test("migration keeps applications non-financial and gates activation on signed agreement", async () => {
  const migration = await read("supabase/migrations/202609100002_employee_loan_application_agreement.sql");
  assert.match(migration, /create table if not exists public\.receivable_employee_loan_consents/i);
  assert.match(migration, /create table if not exists public\.receivable_employee_loan_details/i);
  assert.match(migration, /create table if not exists public\.receivable_loan_documents/i);
  assert.match(migration, /create_employee_loan_application/i);
  assert.match(migration, /protect_employee_loan_activation/i);
  assert.match(migration, /Signed agreement is required before loan activation/i);
  assert.match(migration, /requested_days integer/);
  assert.match(migration, /installment_frequency text/);
  assert.match(migration, /requested_witnesses jsonb/);
  assert.match(migration, /requested_installment_frequency not in \('monthly','weekly','daily'\)/);
  assert.doesNotMatch(migration, /insert into public\.(journal|cashbook|hr_payroll)/i);
});

test("agreement is Admin-authored, explicitly sent, printable, and uses approved religious text", async () => {
  const agreement = await read("components/receivables/EmployeeLoanAgreement.tsx");
  const printButton = await read("components/receivables/LoanPrintButton.tsx");
  const adminActions = await read("app/admin/receivables/employee-loan-actions.ts");
  assert.match(agreement, /approvedAmount/);
  assert.match(printButton, /window\.print/);
  assert.match(agreement, /সূরা আল-বাকারাহ, ২:২৮২/);
  assert.match(agreement, /সহিহ আল-বুখারি, ২৩৮৭/);
  assert.match(adminActions, /send_employee_loan_agreement/);
  assert.match(adminActions, /final_approve_employee_loan/);
});

test("agreement uses consistent A4 safe areas with approved terms and dynamic witness signatures", async () => {
  const agreement = await read("components/receivables/EmployeeLoanAgreement.tsx");
  assert.equal(agreement.match(/<article className="loan-agreement-page/g)?.length, 4);
  assert.match(agreement, /padding: 16mm 16mm 34mm/);
  assert.match(agreement, /overflow-wrap: anywhere/);
  assert.doesNotMatch(agreement, /overflow: hidden/);
  assert.match(agreement, /page-break-before: always/);
  assert.match(agreement, /page-one/);
  assert.match(agreement, /page-two/);
  assert.match(agreement, /page-three/);
  assert.match(agreement, /page-four/);
  assert.match(agreement, /ঋণের পরিমাণ ও অনুমোদন:/);
  assert.match(agreement, /ঋণ পরিশোধের নিয়ম:/);
  assert.match(agreement, /কিস্তি বা পরিশোধের শর্ত পরিবর্তন:/);
  assert.match(agreement, /অগ্রিম ঋণ পরিশোধ:/);
  assert.match(agreement, /চাকরি সমাপ্তি বা পদত্যাগের ক্ষেত্রে:/);
  assert.doesNotMatch(agreement, /Special Conditions|বিশেষ শর্ত/);
  assert.doesNotMatch(agreement, /এই চুক্তিপত্র নিজে কোনো Accounting বা Cash Book posting নির্দেশ করে না/);
  assert.match(agreement, /witnesses\.map/);
  assert.match(agreement, /witness-signature-card/);
  assert.match(agreement, /selected_sen_representative_name_snapshot/);
  assert.match(agreement, /employee-loan-agreement-a4\.png/);
  assert.match(agreement, /সূরা আল-বাকারাহ, ২:২৮২/);
  assert.match(agreement, /সহিহ আল-বুখারি, ২৩৮৭/);
});
