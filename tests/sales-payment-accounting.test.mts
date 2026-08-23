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
