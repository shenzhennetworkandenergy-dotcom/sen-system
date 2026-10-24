// Serializable DTOs only. The database is authoritative for dates and money.
export type PayrollAutofill = {
  employee_id: string;
  base_salary: number | null;
  currency: string;
  period_start?: string;
  period_end?: string;
  review_reason: string | null;
  salary_review: string | null;
};
export type PayrollInstallment = {
  account_id: string;
  reference: string;
  category: string;
  installment_id: string;
  installment_number: number;
  due_date: string;
  original_amount: number;
  amount: number;
  outstanding: number;
  effective_date: string;
};
export type PayrollQuote = {
  installments: PayrollInstallment[];
  automatic: number;
  manual: number;
  deductions: number;
  gross: number;
  net: number;
  effective_date: string;
};
export type PayrollDraftValues = {
  id: string;
  employeeId: string;
  start: string;
  end: string;
  effective: string;
  base: string;
  allowance: string;
  bonus: string;
  manual: string;
  currency: string;
  notes: string;
  updatedAt: string;
};
