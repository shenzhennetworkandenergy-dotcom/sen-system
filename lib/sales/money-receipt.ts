type MoneyReceiptPayment = {
  id: string;
  amount: number | string;
  status: string;
  created_at: string;
};

export type MoneyReceiptHistory = {
  previouslyPaid: number;
  thisPayment: number;
  totalPaid: number;
  remaining: number;
  status: "PARTIAL PAYMENT" | "FULL PAYMENT";
};

export type MoneyReceiptSnapshot = Readonly<{
  receipt_number: string;
  receipt_date: string;
  generated_at: string;
  sale: Readonly<Record<string, unknown>>;
  customer: Readonly<Record<string, unknown>>;
  address: Readonly<Record<string, unknown>>;
  payment: Readonly<Record<string, unknown>>;
  summary: Readonly<Record<string, unknown>>;
  amount_in_words: string;
}>;

function toCents(value: number | string) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw new Error("Money value must be a valid number.");
  }
  return Math.round((parsed + Number.EPSILON) * 100);
}

function fromCents(value: number) {
  return Math.round(value) / 100;
}

function sortReceivedPayments(payments: MoneyReceiptPayment[]) {
  return [...payments]
    .filter((payment) => String(payment.status).trim().toLowerCase() === "received")
    .sort((left, right) => {
      const createdAt = String(left.created_at).localeCompare(String(right.created_at));
      if (createdAt !== 0) return createdAt;
      return String(left.id).localeCompare(String(right.id));
    });
}

export function calculateMoneyReceiptHistory(input: {
  saleTotal: number | string;
  paymentId: string;
  payments: MoneyReceiptPayment[];
}): MoneyReceiptHistory {
  const saleTotal = toCents(input.saleTotal);
  const sorted = sortReceivedPayments(input.payments);
  const paymentIndex = sorted.findIndex((payment) => payment.id === input.paymentId);
  if (paymentIndex === -1) {
    const requested = input.payments.find((payment) => payment.id === input.paymentId);
    if (!requested) {
      throw new Error("Requested payment was not found.");
    }
    throw new Error("Requested payment must have status received.");
  }

  let previouslyPaid = 0;
  for (let index = 0; index < paymentIndex; index += 1) {
    previouslyPaid += toCents(sorted[index].amount);
  }

  const thisPayment = toCents(sorted[paymentIndex].amount);
  const totalPaid = previouslyPaid + thisPayment;
  return {
    previouslyPaid: fromCents(previouslyPaid),
    thisPayment: fromCents(thisPayment),
    totalPaid: fromCents(totalPaid),
    remaining: fromCents(Math.max(saleTotal - totalPaid, 0)),
    status: totalPaid >= saleTotal ? "FULL PAYMENT" : "PARTIAL PAYMENT",
  };
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertReceiptSnapshotShape(value: unknown): asserts value is MoneyReceiptSnapshot {
  if (!isNonNullObject(value)) {
    throw new TypeError("Receipt snapshot must be an object.");
  }

  const requiredTextFields = ["receipt_number", "receipt_date", "generated_at", "amount_in_words"] as const;
  for (const key of requiredTextFields) {
    if (typeof value[key] !== "string" || !String(value[key]).trim()) {
      throw new TypeError(`Receipt snapshot is missing ${key}.`);
    }
  }

  const requiredObjectFields = ["sale", "customer", "address", "payment", "summary"] as const;
  for (const key of requiredObjectFields) {
    if (!isNonNullObject(value[key])) {
      throw new TypeError(`Receipt snapshot is missing ${key}.`);
    }
  }
}
