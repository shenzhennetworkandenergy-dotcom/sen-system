import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const DONATION_BUCKET = "donation-expense-proofs";
export const BENEFICIARY_TYPES = ["INDIVIDUAL", "FAMILY", "INSTITUTION", "MADRASA_MOSQUE", "OTHER"] as const;
export const RELATIONSHIP_GROUPS = [
  "Immediate Family", "Relative", "Friend", "Neighbor", "Known Person", "Referred Person",
  "Unknown / External", "Religious Institution", "Charity Organization", "Other",
] as const;
export const DONATION_STATUSES = ["DRAFT", "COMPLETED", "CLOSED"] as const;

export type DonationOption = { id: string; name: string };
export type DonationBeneficiary = {
  id: string; beneficiary_reference: string; beneficiary_type: string; name: string; phone: string | null;
  alternate_phone: string | null; address: string | null; city_district: string | null; country: string | null;
  whatsapp: string | null; notes: string | null; relationship_group: string | null;
  relationship_type_id: string | null; relationship_note: string | null; referred_by_name: string | null;
  referred_by_phone: string | null; referred_by_note: string | null; monthly_support_enabled: boolean;
  default_monthly_amount: number | null; reminder_day_of_month: number | null; support_start_date: string | null;
  support_end_date: string | null; default_purpose: string | null; default_category_id: string | null;
  default_payment_method_id: string | null; is_active: boolean; created_at: string; updated_at: string;
  relationship_type?: DonationOption | null; default_category?: DonationOption | null;
  default_payment_method?: DonationOption | null;
};
export type DonationExpense = {
  id: string; expense_reference: string; beneficiary_id: string; category_id: string; amount: number;
  donation_date: string; payment_method_id: string; payment_reference: string | null; purpose: string;
  note: string | null; proof_path: string | null; proof_file_name: string | null; proof_mime_type: string | null;
  monthly_support_id: string | null; status: string; completed_at: string | null; closed_at: string | null;
  created_at: string; updated_at: string; beneficiary?: DonationBeneficiary; category?: DonationOption;
  payment_method?: DonationOption;
};
export type MonthlySupportReminder = {
  id: string; beneficiary_id: string; support_month: string; reminder_day_of_month: number; amount: number;
  category_id: string | null; payment_method_id: string | null; purpose: string | null; status: string;
  expense_id: string | null; beneficiary?: DonationBeneficiary; category?: DonationOption | null;
  payment_method?: DonationOption | null;
};

function assertNoError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function getDonationOptions() {
  const db = createSupabaseAdminClient();
  const [relationships, categories, methods, beneficiaries] = await Promise.all([
    db.from("donation_relationship_types").select("id,name").eq("is_active", true).order("name"),
    db.from("donation_expense_categories").select("id,name").eq("is_active", true).order("name"),
    db.from("donation_payment_methods").select("id,name").eq("is_active", true).order("name"),
    db.from("donation_beneficiaries").select("*").eq("is_active", true).order("name"),
  ]);
  assertNoError(relationships.error, "Unable to load relationship types");
  assertNoError(categories.error, "Unable to load donation categories");
  assertNoError(methods.error, "Unable to load payment methods");
  assertNoError(beneficiaries.error, "Unable to load beneficiaries");
  return {
    relationshipTypes: (relationships.data ?? []) as DonationOption[],
    categories: (categories.data ?? []) as DonationOption[],
    paymentMethods: (methods.data ?? []) as DonationOption[],
    beneficiaries: (beneficiaries.data ?? []) as DonationBeneficiary[],
  };
}

export async function ensureCurrentDonationReminders() {
  const db = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await db.rpc("ensure_donation_monthly_support_reminders", { requested_date: today });
  assertNoError(error, "Unable to prepare monthly support reminders");
}

export async function getDonationDashboard(search?: string) {
  await ensureCurrentDonationReminders();
  const db = createSupabaseAdminClient();
  const today = new Date();
  const month = `${today.toISOString().slice(0, 7)}-01`;
  const [options, expensesResult, remindersResult] = await Promise.all([
    getDonationOptions(),
    db.from("donation_expenses")
      .select("*, beneficiary:donation_beneficiaries(*), category:donation_expense_categories(id,name), payment_method:donation_payment_methods(id,name)")
      .order("donation_date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    db.from("donation_monthly_support")
      .select("*, beneficiary:donation_beneficiaries(*), category:donation_expense_categories(id,name), payment_method:donation_payment_methods(id,name)")
      .eq("support_month", month).eq("status", "PENDING").lte("reminder_day_of_month", today.getUTCDate())
      .order("reminder_day_of_month"),
  ]);
  assertNoError(expensesResult.error, "Unable to load donation expenses");
  assertNoError(remindersResult.error, "Unable to load monthly support reminders");
  const term = (search ?? "").trim().toLowerCase();
  const matchedBeneficiaries = term
    ? options.beneficiaries.filter((item) => [item.name, item.beneficiary_reference, item.phone ?? ""]
      .some((value) => value.toLowerCase().includes(term)))
    : [];
  return {
    ...options,
    expenses: (expensesResult.data ?? []) as unknown as DonationExpense[],
    reminders: (remindersResult.data ?? []) as unknown as MonthlySupportReminder[],
    matchedBeneficiaries,
  };
}

export async function getDonationBeneficiaries(search?: string) {
  const db = createSupabaseAdminClient();
  let query = db.from("donation_beneficiaries")
    .select("*, relationship_type:donation_relationship_types(id,name)")
    .order("name");
  const term = (search ?? "").trim().replace(/[,%()]/g, " ");
  if (term) query = query.or(`name.ilike.%${term}%,beneficiary_reference.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await query;
  assertNoError(error, "Unable to load beneficiaries");
  return (data ?? []) as unknown as DonationBeneficiary[];
}

export type TrendPeriod = "3m" | "12m" | "1y" | "3y" | "custom";
function startForPeriod(period: TrendPeriod, from?: string) {
  if (period === "custom" && from) return new Date(`${from}T00:00:00Z`);
  const months = period === "3m" ? 2 : period === "3y" ? 35 : 11;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
}

export async function getDonationBeneficiaryDetail(id: string, period: TrendPeriod = "12m", from?: string, to?: string) {
  const db = createSupabaseAdminClient();
  const [beneficiaryResult, expensesResult] = await Promise.all([
    db.from("donation_beneficiaries")
      .select("*, relationship_type:donation_relationship_types(id,name), default_category:donation_expense_categories(id,name), default_payment_method:donation_payment_methods(id,name)")
      .eq("id", id).maybeSingle(),
    db.from("donation_expenses")
      .select("*, category:donation_expense_categories(id,name), payment_method:donation_payment_methods(id,name)")
      .eq("beneficiary_id", id).order("donation_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  assertNoError(beneficiaryResult.error, "Unable to load beneficiary");
  assertNoError(expensesResult.error, "Unable to load beneficiary payments");
  if (!beneficiaryResult.data) return null;
  const expenses = (expensesResult.data ?? []) as unknown as DonationExpense[];
  const completed = expenses.filter((item) => item.status === "COMPLETED" || item.status === "CLOSED");
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const last12 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const totalSince = (date: Date) => completed.filter((item) => new Date(`${item.donation_date}T00:00:00Z`) >= date)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const chartStart = startForPeriod(period, from);
  const chartEnd = period === "custom" && to ? new Date(`${to}T23:59:59Z`) : now;
  const chartRows = completed.filter((item) => {
    const value = new Date(`${item.donation_date}T00:00:00Z`);
    return value >= chartStart && value <= chartEnd;
  });
  const monthly = new Map<string, number>();
  for (const row of chartRows) {
    const key = row.donation_date.slice(0, 7);
    monthly.set(key, (monthly.get(key) ?? 0) + Number(row.amount));
  }
  return {
    beneficiary: beneficiaryResult.data as unknown as DonationBeneficiary,
    expenses,
    summary: {
      thisMonth: totalSince(monthStart), thisYear: totalSince(yearStart), last12Months: totalSince(last12),
      lifetime: completed.reduce((sum, item) => sum + Number(item.amount), 0), paymentCount: completed.length,
      lastPaymentDate: completed[0]?.donation_date ?? null,
    },
    trend: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount })),
  };
}

export async function getDonationExpenseDetail(id: string) {
  const db = createSupabaseAdminClient();
  const [expenseResult, eventsResult] = await Promise.all([
    db.from("donation_expenses")
      .select("*, beneficiary:donation_beneficiaries(*, relationship_type:donation_relationship_types(id,name)), category:donation_expense_categories(id,name), payment_method:donation_payment_methods(id,name)")
      .eq("id", id).maybeSingle(),
    db.from("donation_expense_events").select("*").eq("expense_id", id)
      .order("event_at", { ascending: false }).order("id", { ascending: false }),
  ]);
  assertNoError(expenseResult.error, "Unable to load donation expense");
  assertNoError(eventsResult.error, "Unable to load donation history");
  if (!expenseResult.data) return null;
  const expense = expenseResult.data as unknown as DonationExpense;
  let proofUrl: string | null = null;
  if (expense.proof_path) {
    const { data, error } = await db.storage.from(DONATION_BUCKET).createSignedUrl(expense.proof_path, 900);
    assertNoError(error, "Unable to open donation proof");
    proofUrl = data.signedUrl;
  }
  return { expense, events: (eventsResult.data ?? []) as { id:string; status:string; event_at:string; note:string|null }[], proofUrl };
}
