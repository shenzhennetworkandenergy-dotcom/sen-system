"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { normalizeBasicCustomerInput } from "@/lib/customers/basic";
import { createBasicCustomerRecord } from "@/lib/customers/create-basic";
import { cargoPackageUnits, cargoPermissionForStatus, nextCargoStatus, type CargoStatus } from "@/lib/cargo-tracking/data";
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

export type CargoPackageFormValues = {
  description: string;
  quantity: string;
  unit: string;
  weight: string;
  dimensions: string;
  cbm: string;
};

export type CargoJobFormValues = {
  customer_id: string;
  courier_tracking_number: string;
  goods_summary: string;
  shipping_method: string;
  carrier_name: string;
  carrier_reference: string;
  charge_basis: string;
  rate: string;
  china_warehouse_id: string;
  bangladesh_warehouse_id: string;
  note: string;
  packages: CargoPackageFormValues[];
};

export type CargoJobFormState = {
  error: string | null;
  values: CargoJobFormValues;
};

function readCargoJobValues(form: FormData): CargoJobFormValues {
  return {
    customer_id: value(form, "customer_id"),
    courier_tracking_number: value(form, "courier_tracking_number"),
    goods_summary: value(form, "goods_summary"),
    shipping_method: value(form, "shipping_method"),
    carrier_name: value(form, "carrier_name"),
    carrier_reference: value(form, "carrier_reference"),
    charge_basis: value(form, "charge_basis"),
    rate: value(form, "rate"),
    china_warehouse_id: value(form, "china_warehouse_id"),
    bangladesh_warehouse_id: value(form, "bangladesh_warehouse_id"),
    note: value(form, "note"),
    packages: Array.from({ length: 5 }, (_, index) => ({
      description: value(form, `package_${index}_description`),
      quantity: value(form, `package_${index}_quantity`),
      unit: value(form, `package_${index}_unit`),
      weight: value(form, `package_${index}_weight`),
      dimensions: value(form, `package_${index}_dimensions`),
      cbm: value(form, `package_${index}_cbm`),
    })),
  };
}

type CargoDb = ReturnType<typeof createSupabaseAdminClient>;

async function requireCountryWarehouse(db: CargoDb, warehouseId: string | null, countryCode: "CN" | "BD", label: string) {
  if (!warehouseId) return;
  const { data, error } = await db.from("warehouses").select("id").eq("id", warehouseId)
    .eq("is_active", true).eq("country_code", countryCode).maybeSingle();
  if (error || !data) throw new Error(`${label} must be an active ${countryCode} warehouse.`);
}

async function requireBangladeshLocation(db: CargoDb, locationId: string | null, warehouseId: string | null) {
  if (!locationId) return;
  if (!warehouseId) throw new Error("Choose a Bangladesh warehouse before choosing a location.");
  const { data: location, error } = await db.from("warehouse_locations").select("id,warehouse_id")
    .eq("id", locationId).eq("warehouse_id", warehouseId).eq("is_active", true).maybeSingle();
  if (error || !location) throw new Error("Choose an active location belonging to the selected Bangladesh warehouse.");
  await requireCountryWarehouse(db, location.warehouse_id, "BD", "Location warehouse");
}

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

export async function createCargoJobAction(_previousState: CargoJobFormState, form: FormData): Promise<CargoJobFormState> {
  const { profile } = await requirePermission("cargo.create");
  const submitted = readCargoJobValues(form);
  let jobId: string;
  try {
    const packages = submitted.packages.filter((item) => item.description);
    for (const cargoPackage of packages) {
      if (!cargoPackage.unit) throw new Error("Package unit is required.");
      if (!cargoPackageUnits.includes(cargoPackage.unit as (typeof cargoPackageUnits)[number])) {
        throw new Error("Choose a valid package unit.");
      }
    }
    const rate = Number(submitted.rate || 0);
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be zero or greater.");
    const db = createSupabaseAdminClient();
    const chinaWarehouseId = uuidOrNull(form, "china_warehouse_id");
    const bangladeshWarehouseId = uuidOrNull(form, "bangladesh_warehouse_id");
    await requireCountryWarehouse(db, chinaWarehouseId, "CN", "China warehouse");
    await requireCountryWarehouse(db, bangladeshWarehouseId, "BD", "Bangladesh destination");
    const carrierName = submitted.carrier_name;
    let carrierId: string | null = null;
    if (carrierName) {
      const carrier = await db.from("purchase_carriers").select("id")
        .eq("name", carrierName).eq("status", "active").maybeSingle();
      if (carrier.error || !carrier.data) throw new Error("Choose an active carrier from the shared carrier list.");
      carrierId = carrier.data.id;
    }
    const { data, error } = await db.rpc("create_cargo_shipping_job", {
      actor_profile_id: profile.id,
      requested_customer_id: submitted.customer_id,
      requested_tracking_number: submitted.courier_tracking_number,
      requested_goods_summary: submitted.goods_summary,
      requested_shipping_method: submitted.shipping_method,
      requested_charge_basis: submitted.charge_basis, requested_rate: rate,
      requested_china_warehouse_id: chinaWarehouseId,
      requested_bangladesh_warehouse_id: bangladeshWarehouseId,
      requested_carrier_id: carrierId,
      requested_carrier_reference: submitted.carrier_reference || null,
      requested_note: submitted.note || null, requested_packages: packages,
    });
    if (error || !data) {
      if (error?.code === "23505") throw new Error("This courier tracking number already has a cargo job.");
      throw new Error(error?.message || "Unable to create cargo job.");
    }
    jobId = String(data);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create cargo job.",
      values: submitted,
    };
  }
  revalidatePath("/admin/cargo-tracking");
  redirect(`/admin/cargo-tracking/${jobId}?success=${encodeURIComponent("Cargo job created.")}`);
}

export async function advanceCargoStatusAction(jobId: string, form: FormData) {
  const requestedStatus = value(form, "status") as CargoStatus;
  const { profile } = await requirePermission(cargoPermissionForStatus(requestedStatus));
  const path = `/admin/cargo-tracking/${jobId}`;
  try {
    const db = createSupabaseAdminClient();
    const { data: job, error: jobError } = await db.from("cargo_shipping_jobs")
      .select("current_status,bangladesh_warehouse_id").eq("id", jobId).maybeSingle();
    if (jobError || !job) throw new Error("Cargo job not found.");
    const expectedStatus = nextCargoStatus(job.current_status as CargoStatus);
    if (!expectedStatus || requestedStatus !== expectedStatus) {
      throw new Error(expectedStatus ? `Only ${expectedStatus} is allowed next.` : "Closed cargo jobs cannot be updated.");
    }
    const warehouseId = uuidOrNull(form, "warehouse_id");
    const locationId = uuidOrNull(form, "location_id");
    const effectiveWarehouseId = warehouseId ?? job.bangladesh_warehouse_id;
    if (warehouseId || requestedStatus === "received_bd_warehouse") {
      await requireCountryWarehouse(db, effectiveWarehouseId, "BD", "Bangladesh destination");
    }
    await requireBangladeshLocation(db, locationId, effectiveWarehouseId);
    const { error } = await db.rpc("advance_cargo_shipping_job", {
      actor_profile_id: profile.id, requested_job_id: jobId,
      requested_status: requestedStatus,
      requested_event_at: optional(form, "event_at"),
      requested_warehouse_id: warehouseId,
      requested_location_id: locationId,
      requested_note: optional(form, "note"),
    });
    if (error) throw new Error(error.message || "Unable to update cargo status.");
  } catch (error) {
    go(path, "error", error instanceof Error ? error.message : "Unable to update cargo status.");
  }
  go(path, "success", "Cargo status updated.");
}

export async function verifyCargoPackageChinaReceiveAction(jobId: string, packageId: string, form: FormData) {
  const { profile } = await requirePermission("cargo.china_receive");
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
  const { profile } = await requirePermission("cargo.assign_location");
  const path = `/admin/cargo-tracking/${jobId}`;
  try {
    const locationId = uuidOrNull(form, "location_id");
    if (!locationId) throw new Error("Choose a warehouse location.");
    const db = createSupabaseAdminClient();
    const { data: job, error: jobError } = await db.from("cargo_shipping_jobs")
      .select("bangladesh_warehouse_id").eq("id", jobId).maybeSingle();
    if (jobError || !job) throw new Error("Cargo job not found.");
    await requireCountryWarehouse(db, job.bangladesh_warehouse_id, "BD", "Bangladesh destination");
    await requireBangladeshLocation(db, locationId, job.bangladesh_warehouse_id);
    const { error } = await db.rpc("assign_cargo_package_location", {
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
  const { profile } = await requirePermission("cargo.mark_ready");
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
  const { profile } = await requirePermission("cargo.handover");
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
