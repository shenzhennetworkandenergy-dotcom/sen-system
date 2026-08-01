export type CashbookTransactionType = "income" | "expense";
export type CashbookPaymentMethod = "cash" | "bank" | "mfs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function normalizeCashbookDescriptionInput(input: { name: unknown; transactionType: unknown }) {
  const name = String(input.name ?? "").trim();
  const transactionType = String(input.transactionType ?? "").trim().toLowerCase();

  if (name.length < 2) throw new Error("খাত/বিবরণ must be at least 2 characters.");
  if (name.length > 160) throw new Error("খাত/বিবরণ cannot exceed 160 characters.");
  if (transactionType !== "income" && transactionType !== "expense") {
    throw new Error("Transaction type must be income or expense.");
  }

  return { name, transactionType: transactionType as CashbookTransactionType };
}

export function normalizeCashbookEntryInput(input: {
  descriptionId: unknown;
  remark?: unknown;
  amount: unknown;
  paymentMethod: unknown;
  occurredAt: unknown;
}) {
  const descriptionId = String(input.descriptionId ?? "").trim();
  const remark = String(input.remark ?? "").trim();
  const amount = Number(input.amount);
  const paymentMethod = String(input.paymentMethod ?? "").trim().toLowerCase();
  const occurredAt = String(input.occurredAt ?? "").trim();

  if (!UUID_PATTERN.test(descriptionId)) throw new Error("Select a valid description (খাত/বিবরণ).");
  if (remark.length > 240) throw new Error("Short remark cannot exceed 240 characters.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  if (!["cash", "bank", "mfs"].includes(paymentMethod)) {
    throw new Error("Payment method must be Cash, Bank, or MFS.");
  }
  if (occurredAt && !LOCAL_DATE_TIME_PATTERN.test(occurredAt)) {
    throw new Error("Enter a valid transaction date and time.");
  }

  return {
    descriptionId,
    remark,
    amount: roundMoney(amount),
    paymentMethod: paymentMethod as CashbookPaymentMethod,
    occurredAt: occurredAt || null,
  };
}

export function normalizeOpeningBalance(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Opening cash must be zero or greater.");
  return roundMoney(amount);
}

export function toCashbookTimestamp(occurredAt: string, businessDate: string) {
  if (!LOCAL_DATE_TIME_PATTERN.test(occurredAt) || !occurredAt.startsWith(`${businessDate}T`)) {
    throw new Error("Transaction date and time must match the selected cashbook date.");
  }
  return `${occurredAt}:00+06:00`;
}

export function getBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getBusinessDateTimeLocal(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function normalizeCashbookDate(value: unknown, fallback = getBusinessDate()) {
  const candidate = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate);
  if (!match) return fallback;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === candidate ? candidate : fallback;
}

export function summarizeCashbookEntries(
  entries: ReadonlyArray<{ transactionType: CashbookTransactionType; amount: number }>,
  openingBalance = 0,
) {
  const summary = entries.reduce(
    (totals, entry) => {
      totals[entry.transactionType] += Number(entry.amount) || 0;
      return totals;
    },
    { income: 0, expense: 0 },
  );

  const income = roundMoney(summary.income);
  const expense = roundMoney(summary.expense);
  const opening = roundMoney(openingBalance);
  const net = roundMoney(income - expense);
  return { opening, income, expense, net, closing: roundMoney(opening + net) };
}
