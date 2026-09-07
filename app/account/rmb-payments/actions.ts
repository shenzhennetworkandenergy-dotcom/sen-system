"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRmbCustomerRequestOptions, type RmbRateOption } from "@/lib/rmb-payments/data";

const proofBucket = "rmb-payment-proofs";
const imageTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export type RmbCustomerRequestValues = {
  currency: string;
  amount: string;
  expectedRateId: string;
  payeeOrganization: string;
  payeeName: string;
  payeePhone: string;
  payeeAddress: string;
  payeeAccountDetails: string;
  chinaPaymentMethodId: string;
  chinaDestinationType: string;
  chinaBankName: string;
  chinaAccountName: string;
  chinaBankAccountNumber: string;
  chinaBankBranch: string;
  chinaBankCode: string;
  chinaWalletId: string;
  chinaCashRecipientName: string;
  chinaCashRecipientContact: string;
  chinaCashInstructionNote: string;
  customerPaymentMethodId: string;
  customerPaymentReference: string;
  customerPaymentNote: string;
  customerInstruction: string;
};

export type RmbCustomerRequestState = { error: string; values: RmbCustomerRequestValues; currentRate: RmbRateOption | null };

const text = (form: FormData, key: string, limit: number) => String(form.get(key) ?? "").trim().slice(0, limit);

function readValues(form: FormData): RmbCustomerRequestValues {
  return {
    currency: text(form, "currency", 5).toUpperCase(), amount: text(form, "amount", 40), expectedRateId: text(form, "expected_rate_id", 100),
    payeeOrganization: text(form, "payee_organization", 200), payeeName: text(form, "payee_name", 200), payeePhone: text(form, "payee_phone", 100), payeeAddress: text(form, "payee_address", 1000), payeeAccountDetails: text(form, "payee_account_details", 2000),
    chinaPaymentMethodId: text(form, "china_payment_method_id", 100), chinaDestinationType: text(form, "china_destination_type", 20), chinaBankName: text(form, "china_bank_name", 200), chinaAccountName: text(form, "china_account_name", 200), chinaBankAccountNumber: text(form, "china_account_number", 200), chinaBankBranch: text(form, "china_bank_branch", 200), chinaBankCode: text(form, "china_bank_code", 100), chinaWalletId: text(form, "china_wallet_id", 200), chinaCashRecipientName: text(form, "china_cash_recipient_name", 200), chinaCashRecipientContact: text(form, "china_cash_recipient_contact", 200), chinaCashInstructionNote: text(form, "china_cash_instruction_note", 1000),
    customerPaymentMethodId: text(form, "customer_payment_method_id", 100), customerPaymentReference: text(form, "customer_payment_reference", 200), customerPaymentNote: text(form, "customer_payment_note", 1000), customerInstruction: text(form, "customer_instruction", 2000),
  };
}

function imageFile(form: FormData, key: string) {
  const value = form.get(key);
  if (!(value instanceof File) || value.size === 0) return null;
  if (!imageTypes[value.type]) throw new Error("Use a JPG, PNG, WebP or GIF image.");
  if (value.size > 900_000) throw new Error("Image must be 900 KB or smaller.");
  return value;
}

async function upload(path: string, file: File) {
  const { error } = await createSupabaseAdminClient().storage.from(proofBucket).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
}

async function activeRate(currency: string) {
  const { data } = await createSupabaseAdminClient().from("rmb_rate_history").select("id,currency_code,rate_bdt,effective_at,is_active").eq("currency_code", currency).eq("is_active", true).maybeSingle();
  return (data ?? null) as RmbRateOption | null;
}

export async function createRmbCustomerRequestAction(_state: RmbCustomerRequestState, form: FormData): Promise<RmbCustomerRequestState> {
  const { profile } = await requireProfile(["customer"]);
  const values = readValues(form);
  let customerProofPath: string | null = null;
  let destinationQrPath: string | null = null;
  const jobId = randomUUID();
  try {
    if (!values.currency) throw new Error("Choose a currency.");
    if (!/^\d+(?:\.\d{1,4})?$/.test(values.amount) || Number(values.amount) <= 0) throw new Error("Foreign amount must be greater than zero.");
    if (!values.expectedRateId) throw new Error("Select the current rate and try again.");
    if (!values.payeeName) throw new Error("Payee name is required.");
    if (!values.payeeAccountDetails && !values.chinaBankAccountNumber && !values.chinaWalletId) throw new Error("Payment destination details are required.");

    const options = await getRmbCustomerRequestOptions();
    const chinaMethod = options.methods.find((method) => method.id === values.chinaPaymentMethodId && ["CHINA_PAYMENT", "BOTH"].includes(method.context));
    const customerMethod = options.methods.find((method) => method.id === values.customerPaymentMethodId && ["CUSTOMER_PAYMENT", "BOTH"].includes(method.context));
    if (values.chinaPaymentMethodId && !chinaMethod) throw new Error("Choose a valid China payment method.");
    if (values.customerPaymentMethodId && !customerMethod) throw new Error("Choose a valid Bangladesh payment method.");
    const customerProof = imageFile(form, "customer_payment_proof");
    const destinationQr = imageFile(form, "china_destination_qr");
    if (customerProof) { customerProofPath = `${jobId}/customer-payment/${profile.id}-${randomUUID()}.${imageTypes[customerProof.type]}`; await upload(customerProofPath, customerProof); }
    if (destinationQr) { destinationQrPath = `${jobId}/destination/${profile.id}-${randomUUID()}.${imageTypes[destinationQr.type]}`; await upload(destinationQrPath, destinationQr); }

    const payload = {
      foreign_currency: values.currency, foreign_amount: values.amount,
      payee_organization: values.payeeOrganization, payee_name: values.payeeName, payee_phone: values.payeePhone, payee_address: values.payeeAddress, payee_account_details: values.payeeAccountDetails,
      china_payment_method_id: values.chinaPaymentMethodId || null, china_payment_method_name: chinaMethod?.name || null, china_destination_type: values.chinaDestinationType || chinaMethod?.method_type || null,
      china_bank_name: values.chinaBankName, china_account_name: values.chinaAccountName, china_bank_account_number: values.chinaBankAccountNumber, china_bank_branch: values.chinaBankBranch, china_bank_code: values.chinaBankCode, china_wallet_id: values.chinaWalletId, china_destination_qr_path: destinationQrPath,
      china_cash_recipient_name: values.chinaCashRecipientName, china_cash_recipient_contact: values.chinaCashRecipientContact, china_cash_instruction_note: values.chinaCashInstructionNote,
      customer_payment_method_id: values.customerPaymentMethodId || null, customer_payment_reference: values.customerPaymentReference, customer_payment_note: values.customerPaymentNote, customer_payment_proof_path: customerProofPath, customer_instruction: values.customerInstruction,
    };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_rmb_customer_request", { requested_job_id: jobId, expected_rate_id: values.expectedRateId, requested_payload: payload });
    if (error || !data) throw new Error(error?.message || "Unable to create RMB request.");
    revalidatePath("/account/rmb-payments");
    redirect(`/account/rmb-payments/${data}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (customerProofPath) await createSupabaseAdminClient().storage.from(proofBucket).remove([customerProofPath]);
    if (destinationQrPath) await createSupabaseAdminClient().storage.from(proofBucket).remove([destinationQrPath]);
    const message = error instanceof Error ? error.message : "Unable to create RMB request.";
    const currentRate = message.includes("RATE_CHANGED") ? await activeRate(values.currency) : null;
    return { error: message.includes("RATE_CHANGED") ? "Rate has changed. Please review the updated rate and payable amount." : message, values, currentRate };
  }
}
