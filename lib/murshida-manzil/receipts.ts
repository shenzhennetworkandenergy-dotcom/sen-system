export type MurshidaRentTransactionSnapshot = {
  id: string;
  receiptNumber: string;
  rentReceiptNumber: string;
  tenantName: string;
  tenantPhone?: string | null;
  unitCodeSnapshot: string;
  unitDescriptionSnapshot?: string | null;
  rentMonth: number;
  rentYear: number;
  monthlyRent: number;
  actualMoneyReceived: number;
  advanceAdjusted: number;
  totalRentSettled: number;
  advanceBalanceBefore: number;
  advanceBalanceAfter: number;
  paymentDate: string;
  paymentMethod: string;
  notes: string | null;
};

export type MurshidaRentTransactionRow = {
  id: string;
  money_receipt_number: string;
  rent_receipt_number: string;
  tenant_name: string;
  tenant_phone?: string | null;
  unit_code_snapshot: string;
  unit_description_snapshot: string | null;
  rent_month: number;
  rent_year: number;
  monthly_rent: number | string;
  actual_money_received: number | string;
  advance_adjusted: number | string;
  total_rent_settled: number | string;
  advance_balance_before: number | string;
  advance_balance_after: number | string;
  payment_date: string;
  payment_method: string;
  notes: string | null;
};

export function mapRentTransactionRowToSnapshot(row: MurshidaRentTransactionRow): MurshidaRentTransactionSnapshot {
  return {
    id: row.id,
    receiptNumber: row.money_receipt_number,
    rentReceiptNumber: row.rent_receipt_number,
    tenantName: row.tenant_name,
    tenantPhone: row.tenant_phone ?? null,
    unitCodeSnapshot: row.unit_code_snapshot,
    unitDescriptionSnapshot: row.unit_description_snapshot,
    rentMonth: Number(row.rent_month),
    rentYear: Number(row.rent_year),
    monthlyRent: Number(row.monthly_rent),
    actualMoneyReceived: Number(row.actual_money_received),
    advanceAdjusted: Number(row.advance_adjusted),
    totalRentSettled: Number(row.total_rent_settled),
    advanceBalanceBefore: Number(row.advance_balance_before),
    advanceBalanceAfter: Number(row.advance_balance_after),
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    notes: row.notes,
  };
}

const identity = { headingEnglish: "MURSHIDA MANZIL", headingBangla: "মুর্শিদা মঞ্জিল" } as const;

export function buildMoneyReceiptData(transaction: MurshidaRentTransactionSnapshot) {
  return {
    ...identity,
    receiptNumber: transaction.receiptNumber,
    date: transaction.paymentDate,
    tenantName: transaction.tenantName,
    ...(transaction.tenantPhone ? { tenantPhone: transaction.tenantPhone } : {}),
    unitSnapshot: [transaction.unitCodeSnapshot, transaction.unitDescriptionSnapshot].filter(Boolean).join(" · "),
    rentMonth: transaction.rentMonth,
    rentYear: transaction.rentYear,
    amountReceived: transaction.actualMoneyReceived,
    paymentMethod: transaction.paymentMethod,
    notes: transaction.notes,
  };
}

export function buildRentReceiptData(transaction: MurshidaRentTransactionSnapshot) {
  return {
    ...identity,
    receiptNumber: transaction.rentReceiptNumber,
    date: transaction.paymentDate,
    tenantName: transaction.tenantName,
    ...(transaction.tenantPhone ? { tenantPhone: transaction.tenantPhone } : {}),
    unitSnapshot: [transaction.unitCodeSnapshot, transaction.unitDescriptionSnapshot].filter(Boolean).join(" · "),
    rentMonth: transaction.rentMonth,
    rentYear: transaction.rentYear,
    monthlyRent: transaction.monthlyRent,
    actualMoneyReceived: transaction.actualMoneyReceived,
    advanceAdjusted: transaction.advanceAdjusted,
    totalRentSettled: transaction.totalRentSettled,
    advanceBalanceBefore: transaction.advanceBalanceBefore,
    advanceBalanceAfter: transaction.advanceBalanceAfter,
    paymentMethod: transaction.paymentMethod,
  };
}

export type MurshidaAdvanceTransactionSnapshot = {
  id: string;
  receiptNumber?: string | null;
  tenantName: string;
  tenantPhone?: string | null;
  unitCodeSnapshot: string;
  unitDescriptionSnapshot?: string | null;
  amount: number;
  defaultMonthlyAdjustment?: number;
  paymentDate: string;
};

export function buildAdvanceMoneyReceiptData(transaction: MurshidaAdvanceTransactionSnapshot) {
  return {
    ...identity,
    title: "ADVANCE MONEY RECEIPT",
    receiptNumber: transaction.receiptNumber || transaction.id,
    date: transaction.paymentDate,
    tenantName: transaction.tenantName,
    ...(transaction.tenantPhone ? { tenantPhone: transaction.tenantPhone } : {}),
    unitSnapshot: [transaction.unitCodeSnapshot, transaction.unitDescriptionSnapshot].filter(Boolean).join(" · "),
    amount: transaction.amount,
    defaultMonthlyAdjustment: transaction.defaultMonthlyAdjustment ?? 0,
  };
}
