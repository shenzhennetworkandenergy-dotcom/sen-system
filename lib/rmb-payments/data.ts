import "server-only";

import type { CustomerSearchOption } from "@/lib/customers/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const proofBucket = "rmb-payment-proofs";

export type RmbCurrencyOption = { code: string; name: string; symbol: string };
export const rmbPaymentMethodContexts = ["CUSTOMER_PAYMENT", "CHINA_PAYMENT", "BOTH"] as const;
export type RmbPaymentMethodContext = (typeof rmbPaymentMethodContexts)[number];
export const rmbPaymentMethodTypes = ["BANK", "WECHAT", "ALIPAY", "CASH", "OTHER"] as const;
export type RmbPaymentMethodType = (typeof rmbPaymentMethodTypes)[number];
export type RmbPaymentMethodOption = {
  id: string;
  name: string;
  context: RmbPaymentMethodContext;
  method_type: RmbPaymentMethodType;
};

export const rmbStatuses = [
  "AWAITING_CUSTOMER_PAYMENT",
  "CUSTOMER_PAID",
  "CHINA_PAYMENT_PENDING",
  "PAYEE_PAID",
  "COMPLETED",
  "CLOSED",
] as const;
export type RmbStatus = (typeof rmbStatuses)[number];
export const rmbStatusLabels: Record<RmbStatus, string> = {
  AWAITING_CUSTOMER_PAYMENT: "Awaiting Customer Payment",
  CUSTOMER_PAID: "Customer Paid",
  CHINA_PAYMENT_PENDING: "China Payment Pending",
  PAYEE_PAID: "Supplier / Payee Paid",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

export function nextRmbStatus(status: RmbStatus) {
  const index = rmbStatuses.indexOf(status);
  return index >= 0 && index < rmbStatuses.length - 1 ? rmbStatuses[index + 1] : null;
}

export type RmbPaymentJob = {
  id: string;
  job_reference: string;
  customer_id: string;
  foreign_currency: string;
  foreign_amount: number;
  agreed_bdt_rate: number;
  calculated_bdt_payable: number;
  customer_payment_date: string | null;
  customer_payment_method: string | null;
  customer_payment_method_id: string | null;
  customer_payment_reference: string | null;
  customer_payment_note: string | null;
  customer_payment_proof_path: string | null;
  payee_organization: string | null;
  payee_name: string | null;
  payee_address: string | null;
  payee_phone: string | null;
  payee_account_details: string | null;
  china_payment_date: string | null;
  china_payment_method: string | null;
  china_payment_method_id: string | null;
  china_payment_reference: string | null;
  china_payment_note: string | null;
  china_payment_proof_path: string | null;
  china_destination_type: RmbPaymentMethodType | null;
  china_bank_name: string | null;
  china_account_name: string | null;
  china_account_number: string | null;
  china_bank_branch: string | null;
  china_bank_code: string | null;
  china_wallet_id: string | null;
  china_destination_qr_path: string | null;
  china_cash_recipient_name: string | null;
  china_cash_recipient_contact: string | null;
  china_cash_instruction_note: string | null;
  customer_instruction: string | null;
  note: string | null;
  current_status: RmbStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

export type RmbPaymentListItem = RmbPaymentJob & { customer: CustomerSearchOption | null };
export type RmbPaymentEvent = {
  id: string;
  status: RmbStatus;
  event_at: string;
  note: string | null;
  actor_id: string;
  actor_name: string;
};

export type RmbRateOption = {
  id: string;
  currency_code: string;
  rate_bdt: number;
  effective_at: string;
  is_active: boolean;
};

export type RmbCustomerJobListItem = Pick<
  RmbPaymentJob,
  "id" | "job_reference" | "foreign_currency" | "foreign_amount" | "agreed_bdt_rate" | "calculated_bdt_payable" | "current_status" | "created_at" | "updated_at"
>;

export type RmbCustomerJobDetail = {
  job: RmbPaymentJob;
  events: Array<Pick<RmbPaymentEvent, "id" | "status" | "event_at">>;
  customerProofUrl: string | null;
  chinaProofUrl: string | null;
  destinationQrUrl: string | null;
};

export async function getRmbCustomerOptions(): Promise<CustomerSearchOption[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,email,phone,company_name")
    .eq("role", "customer")
    .eq("status", "active")
    .order("full_name")
    .limit(500);
  if (error) throw new Error("Unable to load customers.");
  return (data ?? []) as CustomerSearchOption[];
}

export async function getRmbSetupOptions() {
  const db = createSupabaseAdminClient();
  const [currencies, methods] = await Promise.all([
    db.from("rmb_currencies").select("code,name,symbol").eq("is_active", true).order("code"),
    db.from("rmb_payment_methods").select("id,name,context,method_type").eq("is_active", true).order("name"),
  ]);
  if (currencies.error || methods.error) throw new Error("Unable to load RMB setup options.");
  return {
    currencies: (currencies.data ?? []) as RmbCurrencyOption[],
    methods: (methods.data ?? []) as RmbPaymentMethodOption[],
  };
}

export async function getRmbActiveRates(): Promise<RmbRateOption[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("rmb_rate_history")
    .select("id,currency_code,rate_bdt,effective_at,is_active")
    .eq("is_active", true)
    .order("currency_code");
  if (error) throw new Error("Unable to load RMB active rates.");
  return (data ?? []) as RmbRateOption[];
}

export async function getRmbCustomerRequestOptions() {
  const db = createSupabaseAdminClient();
  const [{ data: currencies, error: currencyError }, { data: rates, error: rateError }, { data: methods, error: methodError }] = await Promise.all([
    db.from("rmb_currencies").select("code,name,symbol").eq("is_active", true).order("code"),
    db.from("rmb_rate_history").select("id,currency_code,rate_bdt,effective_at,is_active").eq("is_active", true).order("currency_code"),
    db.from("rmb_payment_methods").select("id,name,context,method_type").eq("is_active", true).order("name"),
  ]);
  if (currencyError || rateError || methodError) throw new Error("Unable to load RMB request options.");
  return {
    currencies: (currencies ?? []) as RmbCurrencyOption[],
    rates: (rates ?? []) as RmbRateOption[],
    methods: (methods ?? []) as RmbPaymentMethodOption[],
  };
}

export async function getRmbCustomerJobs(customerId: string): Promise<RmbCustomerJobListItem[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("rmb_payment_jobs")
    .select("id,job_reference,foreign_currency,foreign_amount,agreed_bdt_rate,calculated_bdt_payable,current_status,created_at,updated_at")
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to load your RMB requests.");
  return (data ?? []) as RmbCustomerJobListItem[];
}

async function customerSignedProof(path: string | null, allowed: boolean) {
  if (!path || !allowed) return null;
  const db = createSupabaseAdminClient();
  const { data, error } = await db.storage.from(proofBucket).createSignedUrl(path, 900);
  return error ? null : data.signedUrl;
}

export async function getRmbCustomerJob(jobId: string, customerId: string): Promise<RmbCustomerJobDetail | null> {
  const db = createSupabaseAdminClient();
  const { data: rawJob, error: jobError } = await db
    .from("rmb_payment_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (jobError) throw new Error("Unable to load your RMB request.");
  if (!rawJob) return null;
  const job = rawJob as RmbPaymentJob;
  const { data: rawEvents, error: eventError } = await db
    .from("rmb_payment_events")
    .select("id,status,event_at")
    .eq("job_id", job.id)
    .order("event_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (eventError) throw new Error("Unable to load your RMB request history.");
  const customerProofUrl = await customerSignedProof(job.customer_payment_proof_path, true);
  const chinaProofVisible = ["PAYEE_PAID", "COMPLETED", "CLOSED"].includes(job.current_status);
  const [chinaProofUrl, destinationQrUrl] = await Promise.all([
    customerSignedProof(job.china_payment_proof_path, chinaProofVisible),
    customerSignedProof(job.china_destination_qr_path, true),
  ]);
  return {
    job,
    events: (rawEvents ?? []) as Array<Pick<RmbPaymentEvent, "id" | "status" | "event_at">>,
    customerProofUrl,
    chinaProofUrl,
    destinationQrUrl,
  };
}

export async function getRmbCustomerProofPath(jobId: string, customerId: string, kind: "customer" | "china" | "destination") {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("rmb_payment_jobs").select("customer_payment_proof_path,china_payment_proof_path,china_destination_qr_path,current_status").eq("id", jobId).eq("customer_id", customerId).maybeSingle();
  if (error || !data) return null;
  if (kind === "china" && !["PAYEE_PAID", "COMPLETED", "CLOSED"].includes(data.current_status)) return null;
  return kind === "customer" ? data.customer_payment_proof_path : kind === "china" ? data.china_payment_proof_path : data.china_destination_qr_path;
}

export async function getRmbPaymentWorkspace(): Promise<RmbPaymentListItem[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("rmb_payment_jobs").select("*").order("updated_at", { ascending: false }).limit(250);
  if (error) throw new Error("Unable to load RMB payment jobs.");
  const jobs = (data ?? []) as RmbPaymentJob[];
  const customerIds = [...new Set(jobs.map((job) => job.customer_id))];
  const customers = customerIds.length
    ? await db.from("profiles").select("id,full_name,email,phone,company_name").in("id", customerIds)
    : { data: [], error: null };
  if (customers.error) throw new Error("Unable to load RMB payment customers.");
  const customerMap = new Map(((customers.data ?? []) as CustomerSearchOption[]).map((customer) => [customer.id, customer]));
  return jobs.map((job) => ({ ...job, customer: customerMap.get(job.customer_id) ?? null }));
}

async function signedProofUrl(path: string | null) {
  if (!path) return null;
  const db = createSupabaseAdminClient();
  const { data, error } = await db.storage.from("rmb-payment-proofs").createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

export async function getRmbPaymentJob(jobId: string) {
  const db = createSupabaseAdminClient();
  const { data: rawJob, error: jobError } = await db.from("rmb_payment_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobError) throw new Error("Unable to load RMB payment job.");
  if (!rawJob) return null;
  const job = rawJob as RmbPaymentJob;
  const [{ data: customer, error: customerError }, { data: rawEvents, error: eventError }, methods] = await Promise.all([
    db.from("profiles").select("id,full_name,email,phone,company_name").eq("id", job.customer_id).maybeSingle(),
    db.from("rmb_payment_events").select("id,status,event_at,note,actor_id").eq("job_id", job.id).order("event_at", { ascending: false }).order("created_at", { ascending: false }),
    db.from("rmb_payment_methods").select("id,name,context,method_type").eq("is_active", true).order("name"),
  ]);
  if (customerError || eventError || methods.error) throw new Error("Unable to load RMB payment details.");
  const events = (rawEvents ?? []) as Omit<RmbPaymentEvent, "actor_name">[];
  const actorIds = [...new Set(events.map((event) => event.actor_id))];
  const actors = actorIds.length ? await db.from("profiles").select("id,full_name,email").in("id", actorIds) : { data: [], error: null };
  if (actors.error) throw new Error("Unable to load RMB payment event actors.");
  const actorMap = new Map((actors.data ?? []).map((actor: { id: string; full_name: string | null; email: string }) => [actor.id, actor.full_name || actor.email]));
  const [customerProofUrl, chinaProofUrl, chinaDestinationQrUrl] = await Promise.all([
    signedProofUrl(job.customer_payment_proof_path),
    signedProofUrl(job.china_payment_proof_path),
    signedProofUrl(job.china_destination_qr_path),
  ]);
  return {
    job,
    customer: (customer as CustomerSearchOption | null) ?? null,
    methods: (methods.data ?? []) as RmbPaymentMethodOption[],
    customerProofUrl,
    chinaProofUrl,
    chinaDestinationQrUrl,
    events: events.map((event) => ({ ...event, actor_name: actorMap.get(event.actor_id) ?? "Admin" })),
  };
}
