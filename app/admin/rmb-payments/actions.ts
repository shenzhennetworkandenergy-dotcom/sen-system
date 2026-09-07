"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { normalizeBasicCustomerInput } from "@/lib/customers/basic";
import { createBasicCustomerRecord, type CreatedBasicCustomer } from "@/lib/customers/create-basic";
import {
  rmbPaymentMethodContexts,
  rmbPaymentMethodTypes,
  type RmbCurrencyOption,
  type RmbPaymentMethodContext,
  type RmbPaymentMethodOption,
  type RmbPaymentMethodType,
  type RmbStatus,
} from "@/lib/rmb-payments/data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const proofBucket = "rmb-payment-proofs";
const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type RmbPaymentFormValues = {
  customer_id: string;
  customer_query: string;
  foreign_currency: string;
  foreign_amount: string;
  agreed_bdt_rate: string;
  customer_payment_date: string;
  customer_payment_method_id: string;
  customer_payment_reference: string;
  customer_payment_note: string;
  payee_organization: string;
  payee_name: string;
  payee_address: string;
  payee_phone: string;
  payee_account_details: string;
  china_payment_method_id: string;
  china_destination_type: RmbPaymentMethodType | "";
  china_bank_name: string;
  china_account_name: string;
  china_account_number: string;
  china_bank_branch: string;
  china_bank_code: string;
  china_wallet_id: string;
  china_cash_recipient_name: string;
  china_cash_recipient_contact: string;
  china_cash_instruction_note: string;
  note: string;
};

export type RmbPaymentFormState = { error: string; values: RmbPaymentFormValues };
export type RmbCustomerActionState = {
  status: "idle" | "success" | "error";
  message: string;
  customer: CreatedBasicCustomer | null;
};
export type RmbCurrencyActionState = {
  status: "idle" | "success" | "error";
  message: string;
  currency: RmbCurrencyOption | null;
};
export type RmbMethodActionState = {
  status: "idle" | "success" | "error";
  message: string;
  method: RmbPaymentMethodOption | null;
};

function text(form: FormData, key: string, limit: number) {
  return String(form.get(key) ?? "").trim().slice(0, limit);
}

function optionalDate(value: string, label: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function positiveDecimal(value: string, label: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the request.";
}

function readValues(form: FormData): RmbPaymentFormValues {
  const destinationType = text(form, "china_destination_type", 20);
  return {
    customer_id: text(form, "customer_id", 100),
    customer_query: text(form, "customer_query", 320),
    foreign_currency: text(form, "foreign_currency", 5).toUpperCase(),
    foreign_amount: text(form, "foreign_amount", 40),
    agreed_bdt_rate: text(form, "agreed_bdt_rate", 40),
    customer_payment_date: text(form, "customer_payment_date", 10),
    customer_payment_method_id: text(form, "customer_payment_method_id", 100),
    customer_payment_reference: text(form, "customer_payment_reference", 200),
    customer_payment_note: text(form, "customer_payment_note", 1000),
    payee_organization: text(form, "payee_organization", 200),
    payee_name: text(form, "payee_name", 200),
    payee_address: text(form, "payee_address", 1000),
    payee_phone: text(form, "payee_phone", 100),
    payee_account_details: text(form, "payee_account_details", 2000),
    china_payment_method_id: text(form, "china_payment_method_id", 100),
    china_destination_type: rmbPaymentMethodTypes.includes(destinationType as RmbPaymentMethodType)
      ? (destinationType as RmbPaymentMethodType)
      : "",
    china_bank_name: text(form, "china_bank_name", 200),
    china_account_name: text(form, "china_account_name", 200),
    china_account_number: text(form, "china_account_number", 200),
    china_bank_branch: text(form, "china_bank_branch", 200),
    china_bank_code: text(form, "china_bank_code", 100),
    china_wallet_id: text(form, "china_wallet_id", 200),
    china_cash_recipient_name: text(form, "china_cash_recipient_name", 200),
    china_cash_recipient_contact: text(form, "china_cash_recipient_contact", 200),
    china_cash_instruction_note: text(form, "china_cash_instruction_note", 1000),
    note: text(form, "note", 2000),
  };
}

function imageFile(form: FormData, key: string, required: boolean) {
  const value = form.get(key);
  if (!(value instanceof File) || value.size === 0) {
    if (required) throw new Error("Payment evidence image is required.");
    return null;
  }
  if (!imageTypes[value.type]) throw new Error("Use a JPG, PNG, WebP or GIF image.");
  if (value.size > 900_000) throw new Error("Image must be 900 KB or smaller.");
  return value;
}

async function uploadImage(path: string, file: File) {
  const db = createSupabaseAdminClient();
  const { error } = await db.storage.from(proofBucket).upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

export async function createRmbCustomerAction(_state: RmbCustomerActionState, form: FormData): Promise<RmbCustomerActionState> {
  await requireProfile(["admin"]);
  try {
    const customer = await createBasicCustomerRecord(normalizeBasicCustomerInput({
      fullName: form.get("full_name"),
      companyName: form.get("company_name"),
      email: form.get("email"),
      phone: form.get("phone"),
      addressLine1: form.get("address_line_1"),
    }));
    return { status: "success", message: "Customer added.", customer };
  } catch (error) {
    return { status: "error", message: message(error), customer: null };
  }
}

export async function createRmbCurrencyAction(_state: RmbCurrencyActionState, form: FormData): Promise<RmbCurrencyActionState> {
  const { profile } = await requireProfile(["admin"]);
  try {
    const code = text(form, "code", 5).toUpperCase();
    const name = text(form, "name", 100);
    const symbol = text(form, "symbol", 12);
    if (!/^[A-Z]{3,5}$/.test(code)) throw new Error("Currency code must be 3–5 letters.");
    if (!name || !symbol) throw new Error("Currency name and symbol are required.");
    const currency = { code, name, symbol };
    const { error } = await createSupabaseAdminClient().from("rmb_currencies").insert({ ...currency, created_by: profile.id });
    if (error) throw new Error(error.message);
    return { status: "success", message: "Currency added.", currency };
  } catch (error) {
    return { status: "error", message: message(error), currency: null };
  }
}

export async function createRmbPaymentMethodAction(_state: RmbMethodActionState, form: FormData): Promise<RmbMethodActionState> {
  const { profile } = await requireProfile(["admin"]);
  try {
    const name = text(form, "name", 100);
    const context = text(form, "context", 30) as RmbPaymentMethodContext;
    const methodType = text(form, "method_type", 20) as RmbPaymentMethodType;
    if (!name) throw new Error("Method name is required.");
    if (!rmbPaymentMethodContexts.includes(context)) throw new Error("Choose a valid payment context.");
    if (!rmbPaymentMethodTypes.includes(methodType)) throw new Error("Choose a valid method type.");
    const { data, error } = await createSupabaseAdminClient()
      .from("rmb_payment_methods")
      .insert({ name, context, method_type: methodType, created_by: profile.id })
      .select("id,name,context,method_type")
      .single();
    if (error) throw new Error(error.message);
    return { status: "success", message: "Payment method added.", method: data as RmbPaymentMethodOption };
  } catch (error) {
    return { status: "error", message: message(error), method: null };
  }
}

export async function createRmbPaymentAction(_state: RmbPaymentFormState, form: FormData): Promise<RmbPaymentFormState> {
  const { profile } = await requireProfile(["admin"]);
  const values = readValues(form);
  const jobId = randomUUID();
  let qrPath: string | null = null;
  try {
    if (!values.customer_id) throw new Error("Choose a customer.");
    if (!values.foreign_currency) throw new Error("Choose a currency.");
    const foreignAmount = positiveDecimal(values.foreign_amount, "Foreign amount");
    const agreedRate = positiveDecimal(values.agreed_bdt_rate, "Agreed BDT rate");
    if (!values.china_payment_method_id || !values.china_destination_type) throw new Error("Choose a China payment method.");
    const needsQr = values.china_destination_type === "WECHAT" || values.china_destination_type === "ALIPAY";
    const qrFile = imageFile(form, "china_destination_qr", needsQr);
    if (qrFile) {
      qrPath = `${jobId}/destination/qr-${randomUUID()}.${imageTypes[qrFile.type]}`;
      await uploadImage(qrPath, qrFile);
    }
    const db = createSupabaseAdminClient();
    const { data, error } = await db.rpc("create_rmb_payment_job_v2", {
      actor_profile_id: profile.id,
      requested_job_id: jobId,
      requested_customer_id: values.customer_id,
      requested_foreign_currency: values.foreign_currency,
      requested_foreign_amount: foreignAmount,
      requested_agreed_bdt_rate: agreedRate,
      requested_customer_payment_date: optionalDate(values.customer_payment_date, "Customer payment date"),
      requested_customer_payment_method_id: values.customer_payment_method_id || null,
      requested_customer_payment_reference: values.customer_payment_reference || null,
      requested_customer_payment_note: values.customer_payment_note || null,
      requested_payee_organization: values.payee_organization || null,
      requested_payee_name: values.payee_name || null,
      requested_payee_address: values.payee_address || null,
      requested_payee_phone: values.payee_phone || null,
      requested_payee_account_details: values.payee_account_details || null,
      requested_china_payment_method_id: values.china_payment_method_id,
      requested_china_destination_type: values.china_destination_type,
      requested_china_bank_name: values.china_bank_name || null,
      requested_china_account_name: values.china_account_name || null,
      requested_china_account_number: values.china_account_number || null,
      requested_china_bank_branch: values.china_bank_branch || null,
      requested_china_bank_code: values.china_bank_code || null,
      requested_china_wallet_id: values.china_wallet_id || null,
      requested_china_destination_qr_path: qrPath,
      requested_china_cash_recipient_name: values.china_cash_recipient_name || null,
      requested_china_cash_recipient_contact: values.china_cash_recipient_contact || null,
      requested_china_cash_instruction_note: values.china_cash_instruction_note || null,
      requested_note: values.note || null,
    });
    if (error || !data) throw new Error(error?.message || "Unable to create RMB payment job.");
    revalidatePath("/admin/rmb-payments");
    redirect(`/admin/rmb-payments/${data}?success=${encodeURIComponent("RMB payment job created.")}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (qrPath) await createSupabaseAdminClient().storage.from(proofBucket).remove([qrPath]);
    return { error: message(error), values };
  }
}

export async function saveCustomerPaymentProofAction(jobId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  let proofPath: string | null = null;
  try {
    const file = imageFile(form, "payment_evidence", true)!;
    proofPath = `${jobId}/customer-payment/proof-${randomUUID()}.${imageTypes[file.type]}`;
    await uploadImage(proofPath, file);
    const methodId = text(form, "customer_payment_method_id", 100) || null;
    let methodName: string | null = null;
    const db = createSupabaseAdminClient();
    if (methodId) {
      const { data } = await db.from("rmb_payment_methods").select("name,context").eq("id", methodId).eq("is_active", true).maybeSingle();
      if (!data || !["CUSTOMER_PAYMENT", "BOTH"].includes(data.context)) throw new Error("Choose a valid Bangladesh payment method.");
      methodName = data.name;
    }
    const { error } = await db.from("rmb_payment_jobs").update({
      customer_payment_proof_path: proofPath,
      customer_payment_method_id: methodId,
      customer_payment_method: methodName,
      customer_payment_date: optionalDate(text(form, "customer_payment_date", 10), "Customer payment date"),
      customer_payment_reference: text(form, "customer_payment_reference", 200) || null,
      customer_payment_note: text(form, "customer_payment_note", 1000) || null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (error) throw new Error(error.message);
  } catch (error) {
    if (proofPath) await createSupabaseAdminClient().storage.from(proofBucket).remove([proofPath]);
    redirect(`/admin/rmb-payments/${jobId}?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(`/admin/rmb-payments/${jobId}`);
  redirect(`/admin/rmb-payments/${jobId}?success=${encodeURIComponent("Customer payment evidence saved.")}`);
}

export async function saveChinaPaymentExecutionAction(jobId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  let proofPath: string | null = null;
  try {
    const date = optionalDate(text(form, "china_payment_date", 10), "China payment date");
    const reference = text(form, "china_payment_reference", 200);
    if (!date || !reference) throw new Error("China payment date and reference are required.");
    const file = imageFile(form, "payment_evidence", true)!;
    proofPath = `${jobId}/china-payment/proof-${randomUUID()}.${imageTypes[file.type]}`;
    await uploadImage(proofPath, file);
    const db = createSupabaseAdminClient();
    const { data: job } = await db.from("rmb_payment_jobs").select("current_status").eq("id", jobId).maybeSingle();
    if (!job || job.current_status !== "CHINA_PAYMENT_PENDING") throw new Error("China payment execution is available only when payment is pending.");
    const { error } = await db.from("rmb_payment_jobs").update({
      china_payment_date: date,
      china_payment_reference: reference,
      china_payment_note: text(form, "china_payment_note", 1000) || null,
      china_payment_proof_path: proofPath,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (error) throw new Error(error.message);
  } catch (error) {
    if (proofPath) await createSupabaseAdminClient().storage.from(proofBucket).remove([proofPath]);
    redirect(`/admin/rmb-payments/${jobId}?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(`/admin/rmb-payments/${jobId}`);
  redirect(`/admin/rmb-payments/${jobId}?success=${encodeURIComponent("China payment execution saved.")}`);
}

export async function advanceRmbPaymentAction(jobId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const requestedStatus = text(form, "status", 50) as RmbStatus;
  const eventNote = text(form, "event_note", 1000);
  const { error } = await createSupabaseAdminClient().rpc("advance_rmb_payment_job", {
    actor_profile_id: profile.id,
    requested_job_id: jobId,
    requested_status: requestedStatus,
    requested_note: eventNote || null,
  });
  if (error) redirect(`/admin/rmb-payments/${jobId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/rmb-payments");
  revalidatePath(`/admin/rmb-payments/${jobId}`);
  redirect(`/admin/rmb-payments/${jobId}?success=${encodeURIComponent("RMB payment status updated.")}`);
}

export async function setRmbActiveRateAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const currency = text(form, "currency_code", 5).toUpperCase();
  const rate = text(form, "rate_bdt", 40);
  try {
    if (!currency || !/^\d+(?:\.\d{1,6})?$/.test(rate) || Number(rate) <= 0) {
      throw new Error("Choose a currency and enter a positive rate (up to 6 decimals).");
    }
    const { error } = await createSupabaseAdminClient().rpc("set_rmb_active_rate", {
      actor_profile_id: profile.id,
      requested_currency_code: currency,
      requested_rate: rate,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/admin/rmb-payments");
    redirect(`/admin/rmb-payments?success=${encodeURIComponent("Active RMB rate saved.")}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/admin/rmb-payments?error=${encodeURIComponent(message(error))}`);
  }
}
