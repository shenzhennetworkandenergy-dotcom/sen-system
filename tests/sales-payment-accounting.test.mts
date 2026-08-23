import assert from "node:assert/strict";
import test from "node:test";

import * as paymentAccounting from "../lib/sales/payment-accounting.ts";

const { normalizeSalePaymentReceipt } = paymentAccounting;

test("maps a received cash payment to the Cash ledger channel", () => {
  assert.deepEqual(normalizeSalePaymentReceipt("cash", null), {
    method: "cash",
    receiptChannel: "cash",
  });
});

test("maps unambiguous received methods to their real ledger channels", () => {
  assert.deepEqual(normalizeSalePaymentReceipt("cash_on_delivery", null), {
    method: "cash_on_delivery",
    receiptChannel: "cash",
  });
  assert.deepEqual(normalizeSalePaymentReceipt("mobile_banking", null), {
    method: "mobile_banking",
    receiptChannel: "mfs",
  });
  assert.deepEqual(normalizeSalePaymentReceipt("bank_transfer", null), {
    method: "bank_transfer",
    receiptChannel: "bank",
  });
  assert.deepEqual(normalizeSalePaymentReceipt("cheque", null), {
    method: "cheque",
    receiptChannel: "bank",
  });
  assert.deepEqual(normalizeSalePaymentReceipt("card", null), {
    method: "card",
    receiptChannel: "bank",
  });
});

test("rejects Credit Sale because it is not received money", () => {
  assert.throws(
    () => normalizeSalePaymentReceipt("credit_sale", null),
    /Credit Sale is not a received payment/i,
  );
});

test("requires the actual receiving channel for Advance Payment and Other", () => {
  assert.deepEqual(normalizeSalePaymentReceipt("advance_payment", "cash"), {
    method: "advance_payment",
    receiptChannel: "cash",
  });
  assert.deepEqual(normalizeSalePaymentReceipt("other", "mfs"), {
    method: "other",
    receiptChannel: "mfs",
  });
  assert.throws(
    () => normalizeSalePaymentReceipt("advance_payment", null),
    /select the actual Cash, Bank, or MFS receiving channel/i,
  );
  assert.throws(
    () => normalizeSalePaymentReceipt("other", "unclassified"),
    /select the actual Cash, Bank, or MFS receiving channel/i,
  );
});

test("identifies only ambiguous received methods as requiring an explicit channel", () => {
  const requiresExplicitReceiptChannel = (
    paymentAccounting as unknown as {
      requiresExplicitReceiptChannel?: (method: unknown) => boolean;
    }
  ).requiresExplicitReceiptChannel;

  assert.equal(typeof requiresExplicitReceiptChannel, "function");
  assert.equal(requiresExplicitReceiptChannel?.("advance_payment"), true);
  assert.equal(requiresExplicitReceiptChannel?.("other"), true);
  assert.equal(requiresExplicitReceiptChannel?.("bank_transfer"), false);
  assert.equal(requiresExplicitReceiptChannel?.("credit_sale"), false);
});

test("builds the atomic record_sale_payment RPC payload with operation and channel", () => {
  const buildSalePaymentRpcArguments = (
    paymentAccounting as unknown as {
      buildSalePaymentRpcArguments?: (input: Record<string, unknown>) => Record<string, unknown>;
    }
  ).buildSalePaymentRpcArguments;

  assert.equal(typeof buildSalePaymentRpcArguments, "function");
  assert.deepEqual(buildSalePaymentRpcArguments?.({
    actorProfileId: "10000000-0000-4000-8000-000000000001",
    saleId: "20000000-0000-4000-8000-000000000002",
    amount: 20000,
    paymentDate: "2026-08-23",
    method: "bank_transfer",
    receiptChannel: null,
    reference: "RAL BRAC",
    note: "Partial payment",
    operationId: "30000000-0000-4000-8000-000000000003",
  }), {
    actor_profile_id: "10000000-0000-4000-8000-000000000001",
    requested_order_id: "20000000-0000-4000-8000-000000000002",
    requested_amount: 20000,
    requested_date: "2026-08-23",
    requested_method: "bank_transfer",
    requested_reference: "RAL BRAC",
    requested_note: "Partial payment",
    requested_operation_id: "30000000-0000-4000-8000-000000000003",
    requested_receipt_channel: "bank",
  });
});

test("normalizes the linked Cash Book and journal identity for Sales history", () => {
  const normalizeSalePaymentAccountingLink = (
    paymentAccounting as unknown as {
      normalizeSalePaymentAccountingLink?: (input: unknown) => unknown;
    }
  ).normalizeSalePaymentAccountingLink;

  assert.equal(typeof normalizeSalePaymentAccountingLink, "function");
  assert.deepEqual(normalizeSalePaymentAccountingLink?.({
    id: "40000000-0000-4000-8000-000000000004",
    journal_entry_id: "50000000-0000-4000-8000-000000000005",
    journal_entries: [{ entry_number: "JE-2026-000123" }],
  }), {
    cashbookEntryId: "40000000-0000-4000-8000-000000000004",
    journalEntryId: "50000000-0000-4000-8000-000000000005",
    journalEntryNumber: "JE-2026-000123",
  });
  assert.equal(normalizeSalePaymentAccountingLink?.(null), null);
});

test("formats the exact Sales method separately from its ledger channel", () => {
  const formatReceiptMethodForAccounting = (
    paymentAccounting as unknown as {
      formatReceiptMethodForAccounting?: (exactMethod: unknown, channel: unknown) => string;
    }
  ).formatReceiptMethodForAccounting;

  assert.equal(typeof formatReceiptMethodForAccounting, "function");
  assert.equal(formatReceiptMethodForAccounting?.("bank_transfer", "bank"), "Bank Transfer (Bank)");
  assert.equal(formatReceiptMethodForAccounting?.("mobile_banking", "mfs"), "Mobile Banking (MFS)");
  assert.equal(formatReceiptMethodForAccounting?.(null, "cash"), "Cash");
});
