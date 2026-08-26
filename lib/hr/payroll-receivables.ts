import { createHash } from "node:crypto";

export type PayrollLoanCategory = "employee_loan" | "salary_advance" | string;
export type PayrollLoanStatus = "active" | "fully_repaid" | "cancelled" | "rejected" | "requested" | "under_review" | "approved" | string;
export type PayrollRepaymentMethod = "salary_deduction" | "cash" | "bank" | "mfs" | "other" | string;

export type PayrollLoanInstallment = {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  remainingAmount: number;
};

export type PayrollLoanAccount = {
  id: string;
  employeeRecordId: string | null;
  category: PayrollLoanCategory;
  status: PayrollLoanStatus;
  currency: string;
  outstandingAmount: number;
  repaymentMethod: PayrollRepaymentMethod;
  installment: PayrollLoanInstallment | null;
};

export type PayrollLoanPlanInput = {
  employeeRecordId: string;
  periodEnd: string;
  currency: string;
  currentGrossPay: number;
  existingDeductions: number;
  accounts: PayrollLoanAccount[];
};

export type PayrollDeductionPlan = {
  receivableAccountId: string;
  amount: number;
  installmentNumber: number;
  dueDate: string;
  currency: string;
};

export type PayrollLoanPlan = {
  deductions: PayrollDeductionPlan[];
  totalDeduction: number;
  netPayable: number;
};

const eligibleCategories = new Set(["employee_loan", "salary_advance"]);

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

const compareUuid = (left: string, right: string) => left.localeCompare(right);

export function planPayrollLoanDeductions(input: PayrollLoanPlanInput): PayrollLoanPlan {
  if (!Number.isFinite(input.currentGrossPay) || input.currentGrossPay < 0) {
    throw new Error("Gross pay must be zero or greater.");
  }
  if (!Number.isFinite(input.existingDeductions) || input.existingDeductions < 0) {
    throw new Error("Existing deductions must be zero or greater.");
  }

  const deductions = input.accounts
    .filter((account) => account.employeeRecordId === input.employeeRecordId)
    .filter((account) => eligibleCategories.has(account.category))
    .filter((account) => account.status === "active")
    .filter((account) => account.currency === input.currency)
    .filter((account) => account.repaymentMethod === "salary_deduction")
    .filter((account) => account.outstandingAmount > 0)
    .filter((account) => account.installment !== null)
    .filter((account) => account.installment!.dueDate <= input.periodEnd)
    .sort((left, right) => compareUuid(left.id, right.id))
    .map((account) => {
      const installment = account.installment!;
      const amount = roundMoney(Math.min(account.outstandingAmount, installment.remainingAmount, installment.amountDue));
      return {
        receivableAccountId: account.id,
        amount,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate,
        currency: account.currency,
      } satisfies PayrollDeductionPlan;
    })
    .filter((deduction) => deduction.amount > 0);

  const totalDeduction = roundMoney(input.existingDeductions + deductions.reduce((sum, row) => sum + row.amount, 0));
  const netPayable = roundMoney(input.currentGrossPay - totalDeduction);
  if (netPayable < 0) {
    throw new Error("Loan deductions cannot make net payable negative.");
  }
  return { deductions, totalDeduction, netPayable };
}

export function derivePayrollOperationId(payrollRecordId: string, receivableAccountId: string): string {
  const digest = createHash("sha256")
    .update(`payroll-receivable:${payrollRecordId}:${receivableAccountId}`)
    .digest("hex");
  // UUID-shaped deterministic value compatible with uuid columns.
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${(parseInt(digest.slice(16, 18), 16) & 0x3f | 0x80).toString(16).padStart(2, "0")}${digest.slice(18, 20)}-${digest.slice(20, 32)}`;
}

export function buildPayrollPlanHash(payrollRecordId: string, deductions: Array<Pick<PayrollDeductionPlan, "receivableAccountId" | "amount">>): string {
  const canonical = deductions
    .map((row) => `${row.receivableAccountId}:${roundMoney(row.amount).toFixed(4)}`)
    .sort()
    .join("|");
  return createHash("sha256").update(`${payrollRecordId}|${canonical}`).digest("hex");
}

export type PayrollStatus = "draft" | "approved" | "paid" | "cancelled";

export function assertPayrollStatusTransition(current: PayrollStatus, requested: PayrollStatus): void {
  if (current === "paid") {
    throw new Error("Paid payroll is final and cannot be edited, cancelled, or moved backward.");
  }
  const allowed: Record<PayrollStatus, PayrollStatus[]> = {
    draft: ["approved", "cancelled"],
    approved: ["paid", "cancelled"],
    paid: [],
    cancelled: [],
  };
  if (!allowed[current].includes(requested)) {
    throw new Error(`Payroll cannot move from ${current} to ${requested}; Approved → Paid is required for final payment.`);
  }
}
