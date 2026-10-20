"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { changedCustomerAddressFields, changedCustomerFields, customerAddressEditFields, customerEditFields, normalizeCustomerEdit, rejectUnexpectedCustomerFields } from "@/lib/customers/edit";
import { addressFromForm, uuid } from "@/lib/orders/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const editPath = (customerId: string) => `/admin/users/${customerId}/edit`;
const failure = (customerId: string, message: string) => `${editPath(customerId)}?error=${encodeURIComponent(message)}`;

export async function saveCustomerProfileAction(customerId: string, form: FormData) {
  await requireProfile(["admin"]);
  const id = uuid(customerId, "Customer");
  const db = createSupabaseAdminClient();
  const { data: customer, error: lookupError } = await db.from("profiles").select("id,role,full_name,company_name,customer_type,phone,alternate_phone,country,country_name,country_code,address_line,city,region,postal_code").eq("id", id).maybeSingle();
  if (lookupError || !customer || customer.role !== "customer") redirect(failure(id, "This customer account could not be verified."));
  let patch: Record<string, string | null>;
  try {
    rejectUnexpectedCustomerFields(form.keys(), customerEditFields);
    const input = Object.fromEntries(customerEditFields.map((field) => [field, form.get(field) ?? customer[field] ?? ""]));
    const next = normalizeCustomerEdit(input, { allowEmptyPhone: !customer.phone });
    patch = changedCustomerFields(customer, next);
    if (patch.phone) {
      const auth = await db.auth.admin.getUserById(id);
      if (auth.error || !auth.data.user || auth.data.user.phone) throw new Error("Phone is an authentication identifier for this account and cannot be edited here.");
    }
  } catch (error) {
    redirect(failure(id, error instanceof Error ? error.message : "Invalid customer information."));
  }
  if (Object.keys(patch).length) {
    const { data, error } = await db.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("role", "customer").select("id").maybeSingle();
    if (error || !data) {
      console.error("Admin customer profile update failed", { code: error?.code, message: error?.message });
      redirect(failure(id, "Unable to save customer changes."));
    }
  }
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?success=${encodeURIComponent("Customer information updated.")}`);
}

export async function saveCustomerAddressAction(customerId: string, addressId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const id = uuid(customerId, "Customer");
  const address = uuid(addressId, "Address");
  const db = createSupabaseAdminClient();
  const [{ data: customer, error: customerError }, { data: existing, error: addressError }] = await Promise.all([
    db.from("profiles").select("id,role").eq("id", id).maybeSingle(),
    db.from("customer_addresses").select("*").eq("id", address).eq("profile_id", id).maybeSingle(),
  ]);
  if (customerError || !customer || customer.role !== "customer" || addressError || !existing) redirect(failure(id, "This customer address could not be verified."));
  let patch: Record<string, string | null> = {};
  try {
    rejectUnexpectedCustomerFields(form.keys(), customerAddressEditFields);
    const normalized = addressFromForm(form);
    if (!/^[A-Z]{2}$/.test(normalized.country_code)) throw new Error("Country code must contain two letters.");
    patch = changedCustomerAddressFields(existing, normalized);
  } catch (error) {
    redirect(failure(id, error instanceof Error ? error.message : "Invalid address information."));
  }
  if (Object.keys(patch).length) {
    const { data, error } = await db.from("customer_addresses").update({ ...patch, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("id", address).eq("profile_id", id).select("id").maybeSingle();
    if (error || !data) {
      console.error("Admin customer address update failed", { code: error?.code, message: error?.message });
      redirect(failure(id, "Unable to save this address."));
    }
  }
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?success=${encodeURIComponent("Customer address updated.")}`);
}
