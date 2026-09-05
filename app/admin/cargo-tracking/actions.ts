"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { normalizeBasicCustomerInput } from "@/lib/customers/basic";
import { createBasicCustomerRecord } from "@/lib/customers/create-basic";
import { nextCargoStatus, type CargoStatus } from "@/lib/cargo-tracking/data";
import { normalizePurchaseCarrier } from "@/lib/purchasing/carriers";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => value(form, key) || null;
const uuidOrNull = (form: FormData, key: string) => {
  const candidate = optional(form, key);
  if (candidate && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) throw new Error(`Invalid ${key}.`);
  return candidate;
};

function go(path: string, kind: "success" | "error", message: string): never {
  revalidatePath("/admin/cargo-tracking");
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

export async function createCargoCustomerAction(form: FormData) {
  await requireProfile(["admin"]);
  let customer: Awaited<ReturnType<typeof createBasicCustomerRecord>>;
  try {
    customer = await createBasicCustomerRecord(normalizeBasicCustomerInput({
      fullName: form.get("full_name"), companyName: form.get("company_name"),
      email: form.get("email"), phone: form.get("phone"), addressLine1: form.get("address_line_1"),
    }));
  } catch (error) {
    go("/admin/cargo-tracking/new", "error", error instanceof Error ? error.message : "Unable to add customer.");
  }
  revalidatePath("/admin/cargo-tracking/new");
  redirect(`/admin/cargo-tracking/new?customer=${customer.id}&success=${encodeURIComponent(`Customer ${customer.full_name} added to the shared customer master.`)}`);
}

export async function createCargoCarrierAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  try {
    const carrier = normalizePurchaseCarrier(form);
    const { data, error } = await createSupabaseAdminClient().from("purchase_carriers")
      .insert({ ...carrier, created_by: profile.id, updated_by: profile.id })
      .select("id,name").single();
    if (error || !data) {
      throw new Error(error?.code === "23505" ? "A carrier with this name already exists." : "Unable to create carrier.");
    }
    await writeAuditLog({
      actorId: profile.id, actorRole: profile.role, action: "cargo.carrier.created",
      module: "cargo_tracking", entityType: "purchase_carrier", entityId: data.id,
      description: "Shared carrier created from Cargo Tracking.", newValues: carrier,
    });
    revalidatePath("/admin/cargo-tracking/new");
    redirect(`/admin/cargo-tracking/new?carrier=${data.id}&success=${encodeURIComponent(`Carrier ${data.name} added to the shared carrier master.`)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    go("/admin/cargo-tracking/new", "error", error instanceof Error ? error.message : "Unable to add carrier.");
  }
}

export async function createCargoJobAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  let jobId: string;
  try {
    const packages = Array.from({ length: 5 }, (_, index) => ({
      description: value(form, `package_${index}_description`),
      quantity: value(form, `package_${index}_quantity`),
      unit: value(form, `package_${index}_unit`),
      weight: value(form, `package_${index}_weight`),
      dimensions: value(form, `package_${index}_dimensions`),
      cbm: value(form, `package_${index}_cbm`),
    })).filter((item) => item.description);
    const rate = Number(value(form, "rate") || 0);
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be zero or greater.");
    const db = createSupabaseAdminClient();
    const carrierName = value(form, "carrier_name");
    let carrierId: string | null = null;
    if (carrierName) {
      const carrier = await db.from("purchase_carriers").select("id")
        .eq("name", carrierName).eq("status", "active").maybeSingle();
      if (carrier.error || !carrier.data) throw new Error("Choose an active carrier from the shared carrier list.");
      carrierId = carrier.data.id;
    }
    const { data, error } = await db.rpc("create_cargo_shipping_job", {
      actor_profile_id: profile.id,
      requested_customer_id: value(form, "customer_id"),
      requested_tracking_number: value(form, "courier_tracking_number"),
      requested_goods_summary: value(form, "goods_summary"),
      requested_shipping_method: value(form, "shipping_method"),
      requested_charge_basis: value(form, "charge_basis"), requested_rate: rate,
      requested_china_warehouse_id: uuidOrNull(form, "china_warehouse_id"),
      requested_bangladesh_warehouse_id: uuidOrNull(form, "bangladesh_warehouse_id"),
      requested_carrier_id: carrierId,
      requested_carrier_reference: optional(form, "carrier_reference"),
      requested_note: optional(form, "note"), requested_packages: packages,
    });
    if (error || !data) {
      if (error?.code === "23505") throw new Error("This courier tracking number already has a cargo job.");
      throw new Error(error?.message || "Unable to create cargo job.");
    }
    jobId = String(data);
  } catch (error) {
    go("/admin/cargo-tracking/new", "error", error instanceof Error ? error.message : "Unable to create cargo job.");
  }
  revalidatePath("/admin/cargo-tracking");
  redirect(`/admin/cargo-tracking/${jobId}?success=${encodeURIComponent("Cargo job created.")}`);
}

export async function advanceCargoStatusAction(jobId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const path = `/admin/cargo-tracking/${jobId}`;
  try {
    const db = createSupabaseAdminClient();
    const requestedStatus = value(form, "status");
    const { data: job, error: jobError } = await db.from("cargo_shipping_jobs")
      .select("current_status").eq("id", jobId).maybeSingle();
    if (jobError || !job) throw new Error("Cargo job not found.");
    const expectedStatus = nextCargoStatus(job.current_status as CargoStatus);
    if (!expectedStatus || requestedStatus !== expectedStatus) {
      throw new Error(expectedStatus ? `Only ${expectedStatus} is allowed next.` : "Closed cargo jobs cannot be updated.");
    }
    const { error } = await db.rpc("advance_cargo_shipping_job", {
      actor_profile_id: profile.id, requested_job_id: jobId,
      requested_status: requestedStatus,
      requested_event_at: optional(form, "event_at"),
      requested_warehouse_id: uuidOrNull(form, "warehouse_id"),
      requested_location_id: uuidOrNull(form, "location_id"),
      requested_note: optional(form, "note"),
    });
    if (error) throw new Error(error.message || "Unable to update cargo status.");
  } catch (error) {
    go(path, "error", error instanceof Error ? error.message : "Unable to update cargo status.");
  }
  go(path, "success", "Cargo status updated.");
}

export async function verifyCargoPackageChinaReceiveAction(jobId: string, packageId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const path = `/admin/cargo-tracking/${jobId}`;
  try {
    const { error } = await createSupabaseAdminClient().rpc("verify_cargo_package_china_receive", {
      actor_profile_id: profile.id,
      requested_job_id: jobId,
      requested_package_id: packageId,
      requested_event_at: optional(form, "event_at"),
    });
    if (error) throw new Error(error.message || "Unable to verify package China receipt.");
  } catch (error) {
    go(path, "error", error instanceof Error ? error.message : "Unable to verify package China receipt.");
  }
  go(path, "success", "Package China receipt verified.");
}

export async function assignCargoPackageLocationAction(jobId: string, packageId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const path = `/admin/cargo-tracking/${jobId}`;
  try {
    const locationId = uuidOrNull(form, "location_id");
    if (!locationId) throw new Error("Choose a warehouse location.");
    const { error } = await createSupabaseAdminClient().rpc("assign_cargo_package_location", {
      actor_profile_id: profile.id,
      requested_job_id: jobId,
      requested_package_id: packageId,
      requested_location_id: locationId,
    });
    if (error) throw new Error(error.message || "Unable to assign package location.");
  } catch (error) {
    go(path, "error", error instanceof Error ? error.message : "Unable to assign package location.");
  }
  go(path, "success", "Package warehouse location assigned.");
}

export async function verifyCargoPackageReadyAction(jobId: string, packageId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const path = `/admin/cargo-tracking/${jobId}`;
  try {
    const { error } = await createSupabaseAdminClient().rpc("verify_cargo_package_ready", {
      actor_profile_id: profile.id,
      requested_job_id: jobId,
      requested_package_id: packageId,
      requested_event_at: optional(form, "event_at"),
    });
    if (error) throw new Error(error.message || "Unable to verify package readiness.");
  } catch (error) {
    go(path, "error", error instanceof Error ? error.message : "Unable to verify package readiness.");
  }
  go(path, "success", "Package ready-for-customer verification completed.");
}

export async function verifyCargoHandoverAction(jobId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const path = `/admin/cargo-tracking/${jobId}`;
  try {
    const recipient = value(form, "recipient");
    if (!recipient) throw new Error("Handover recipient is required.");
    const { error } = await createSupabaseAdminClient().rpc("verify_cargo_job_handover", {
      actor_profile_id: profile.id,
      requested_job_id: jobId,
      requested_recipient: recipient,
      requested_reference: optional(form, "reference"),
      requested_event_at: optional(form, "event_at"),
    });
    if (error) throw new Error(error.message || "Unable to verify cargo handover.");
  } catch (error) {
    go(path, "error", error instanceof Error ? error.message : "Unable to verify cargo handover.");
  }
  go(path, "success", "Cargo handover verified.");
}
