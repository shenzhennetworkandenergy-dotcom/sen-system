import assert from "node:assert/strict";
import test from "node:test";

import {
  applyReviewedBusinessCard,
  type CustomerFormValues,
} from "../lib/customer-ocr/apply.ts";
import type { ReviewedBusinessCard } from "../lib/customer-ocr/types.ts";
import {
  initialOcrAssistantState,
  ocrAssistantReducer,
} from "../lib/customer-ocr/workflow.ts";
import {
  createInitialCustomerFormState,
  customerFormReducer,
} from "../lib/customers/form-state.ts";
import { customerCreationDecision } from "../lib/customers/duplicate-decision.ts";
import type { DuplicateCandidate } from "../lib/customer-ocr/types.ts";

const candidate = (
  reasons: DuplicateCandidate["reasons"],
): DuplicateCandidate => ({
  customer: {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Amina Rahman",
    company_name: "Tex Rise Engineering",
    email: "amina@example.com",
    phone: "+8801711000001",
  },
  reasons,
  blocksCreation: reasons.includes("email"),
});

test("customer creation continues when no existing customer matches", () => {
  assert.deepEqual(customerCreationDecision([], false), {
    allowCreation: true,
    requiresOverride: false,
    message: "",
  });
});

test("an exact email duplicate blocks customer creation", () => {
  assert.deepEqual(customerCreationDecision([candidate(["email"])], true), {
    allowCreation: false,
    requiresOverride: false,
    message:
      "A customer with this email already exists. Use the existing customer.",
  });
});

test("phone or company duplicates require an explicit create-new override", () => {
  const duplicates = [candidate(["phone", "company"])];

  assert.deepEqual(customerCreationDecision(duplicates, false), {
    allowCreation: false,
    requiresOverride: true,
    message: "Possible existing customer found.",
  });
  assert.deepEqual(customerCreationDecision(duplicates, true), {
    allowCreation: true,
    requiresOverride: false,
    message: "",
  });
});

const field = (
  value: string,
  confidence: number | null = value ? 90 : null,
): ReviewedBusinessCard["companyName"] => ({
  value,
  confidence,
  status: value ? "ok" : "low",
  sourceText: value,
});

const reviewedCard = (): ReviewedBusinessCard => ({
  companyName: field("Shenzhen Example Technology Co."),
  contactName: field("Li Wei"),
  designation: field("Sales Manager"),
  mobileNumber: field("+86 138 0000 0000"),
  alternatePhone: field("+86 755 8888 0000"),
  emailAddress: field("li.wei@example.cn"),
  website: field("www.example.cn"),
  fullAddress: field("Nanshan Science Park, Shenzhen, China"),
  city: field("Shenzhen"),
  country: field("China"),
});

const emptyCustomerForm = (): CustomerFormValues => ({
  fullName: "",
  companyName: "",
  email: "",
  phone: "",
  alternatePhone: "",
  addressLine1: "",
  city: "",
  country: "Bangladesh",
  countryCode: "BD",
});

test("reviewed OCR maps only fields supported by the customer form", () => {
  const result = applyReviewedBusinessCard(emptyCustomerForm(), reviewedCard(), {
    overwriteConflicts: true,
  });

  assert.deepEqual(result.values, {
    fullName: "Li Wei",
    companyName: "Shenzhen Example Technology Co.",
    email: "li.wei@example.cn",
    phone: "+86 138 0000 0000",
    alternatePhone: "+86 755 8888 0000",
    addressLine1: "Nanshan Science Park, Shenzhen, China",
    city: "Shenzhen",
    country: "China",
    countryCode: "CN",
  });
  assert.equal("designation" in result.values, false);
  assert.equal("website" in result.values, false);
  assert.deepEqual(result.conflicts, []);
});

test("OCR apply reports conflicts before replacing manual customer values", () => {
  const current = { ...emptyCustomerForm(), fullName: "Manual Name" };
  const first = applyReviewedBusinessCard(current, reviewedCard());

  assert.equal(first.values.fullName, "Manual Name");
  assert.deepEqual(first.conflicts, [
    { field: "fullName", currentValue: "Manual Name", proposedValue: "Li Wei" },
    { field: "country", currentValue: "Bangladesh", proposedValue: "China" },
    { field: "countryCode", currentValue: "BD", proposedValue: "CN" },
  ]);

  const confirmed = applyReviewedBusinessCard(current, reviewedCard(), {
    overwriteConflicts: true,
  });
  assert.equal(confirmed.values.fullName, "Li Wei");
  assert.equal(confirmed.values.countryCode, "CN");
});

test("OCR workflow cannot skip image processing and mandatory review", () => {
  const selected = ocrAssistantReducer(initialOcrAssistantState, {
    type: "image-selected",
    fileName: "card.png",
  });
  assert.equal(selected.phase, "image");

  const processing = ocrAssistantReducer(selected, { type: "ocr-started" });
  assert.equal(processing.phase, "processing");

  const review = ocrAssistantReducer(processing, {
    type: "ocr-succeeded",
    reviewed: reviewedCard(),
  });
  assert.equal(review.phase, "review");
  assert.equal(review.reviewed?.contactName.value, "Li Wei");

  const corrected = ocrAssistantReducer(review, {
    type: "field-edited",
    field: "contactName",
    value: "Li Wei (corrected)",
  });
  assert.equal(corrected.reviewed?.contactName.value, "Li Wei (corrected)");
  assert.equal(corrected.phase, "review");
});

test("manual Add Customer remains complete when OCR is never used", () => {
  let state = createInitialCustomerFormState();
  const entries: Array<[keyof CustomerFormValues, string]> = [
    ["fullName", "Manual Customer"],
    ["companyName", "Manual Company"],
    ["email", "manual@example.com"],
    ["phone", "+8801700000000"],
    ["addressLine1", "Manual address"],
  ];
  for (const [fieldName, value] of entries) {
    state = customerFormReducer(state, {
      type: "field-changed",
      field: fieldName,
      value,
    });
  }

  assert.equal(state.values.fullName, "Manual Customer");
  assert.equal(state.values.email, "manual@example.com");
  assert.deepEqual(state.duplicates, []);
  assert.equal(state.duplicateOverride, false);
});

test("customer form permits override only for nonblocking duplicate warnings", () => {
  const warningState = customerFormReducer(createInitialCustomerFormState(), {
    type: "duplicates-found",
    duplicates: [candidate(["phone", "company"])],
  });
  assert.equal(
    customerFormReducer(warningState, {
      type: "duplicate-override-changed",
      value: true,
    }).duplicateOverride,
    true,
  );

  const blockedState = customerFormReducer(createInitialCustomerFormState(), {
    type: "duplicates-found",
    duplicates: [candidate(["email"])],
  });
  assert.equal(
    customerFormReducer(blockedState, {
      type: "duplicate-override-changed",
      value: true,
    }).duplicateOverride,
    false,
  );
});

test("successful customer save resets the shared authoritative form", () => {
  const edited = customerFormReducer(createInitialCustomerFormState(), {
    type: "field-changed",
    field: "fullName",
    value: "Temporary Name",
  });
  const reset = customerFormReducer(edited, { type: "customer-saved" });

  assert.equal(reset.values.fullName, "");
  assert.equal(reset.values.country, "Bangladesh");
  assert.equal(reset.values.countryCode, "BD");
  assert.deepEqual(reset.duplicates, []);
});
