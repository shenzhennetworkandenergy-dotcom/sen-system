import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const cargoStatuses = [
  "requested", "expected_china", "received_china", "dispatched_china", "in_transit",
  "arrived_bangladesh", "received_bd_warehouse", "ready_for_customer", "handed_over",
  "delivered", "closed",
] as const;

export type CargoStatus = (typeof cargoStatuses)[number];

export const cargoPermissionKeys = [
  "cargo.view", "cargo.create", "cargo.china_receive", "cargo.china_dispatch",
  "cargo.bd_receive", "cargo.assign_location", "cargo.mark_ready", "cargo.handover",
  "cargo.close",
] as const;

export type CargoPermissionKey = (typeof cargoPermissionKeys)[number];

export const cargoPackageUnits = [
  "Piece", "Carton", "Box", "Wooden Box", "Pallet", "Bag/Sack", "Roll", "Set",
] as const;

export const nextCargoStatus = (status: CargoStatus) => {
  const index = cargoStatuses.indexOf(status);
  return index >= 0 && index < cargoStatuses.length - 1 ? cargoStatuses[index + 1] : null;
};

export const cargoPermissionForStatus = (status: CargoStatus): CargoPermissionKey => {
  if (["expected_china", "received_china"].includes(status)) return "cargo.china_receive";
  if (["dispatched_china", "in_transit"].includes(status)) return "cargo.china_dispatch";
  if (["arrived_bangladesh", "received_bd_warehouse"].includes(status)) return "cargo.bd_receive";
  if (status === "ready_for_customer") return "cargo.mark_ready";
  if (["handed_over", "delivered"].includes(status)) return "cargo.handover";
  return "cargo.close";
};

export const cargoLabel = (value: string) => value === "expected_china"
  ? "Awaiting China Warehouse Receipt"
  : value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getCargoJobs(filters: { tracking?: string; customer?: string; cargoId?: string } = {}) {
  const db = createSupabaseAdminClient();
  const customerSearch = filters.customer?.trim().slice(0, 200) ?? "";
  let customerIds: string[] | null = null;
  if (customerSearch) {
    const { data: matchingCustomers, error: customerError } = await db.from("profiles")
      .select("id").eq("role", "customer").eq("status", "active")
      .ilike("full_name", `%${customerSearch}%`).limit(500);
    if (customerError) throw new Error("Unable to search cargo customers.");
    customerIds = (matchingCustomers ?? []).map((customer) => customer.id);
    if (!customerIds.length) return [];
  }
  const identifierSearch = filters.cargoId?.trim().slice(0, 80) ?? "";
  let identifierJobIds: string[] | null = null;
  if (identifierSearch) {
    const [matchingJobs, matchingPackages] = await Promise.all([
      db.from("cargo_shipping_jobs").select("id").ilike("internal_cargo_id", `%${identifierSearch}%`).limit(200),
      db.from("cargo_shipping_packages").select("job_id").ilike("package_identifier", `%${identifierSearch}%`).limit(200),
    ]);
    if (matchingJobs.error || matchingPackages.error) throw new Error("Unable to search cargo identifiers.");
    identifierJobIds = Array.from(new Set([
      ...(matchingJobs.data ?? []).map((job) => job.id),
      ...(matchingPackages.data ?? []).map((item) => item.job_id),
    ]));
    if (!identifierJobIds.length) return [];
  }
  let query = db.from("cargo_shipping_jobs")
    .select("id,internal_cargo_id,customer_id,courier_tracking_number,goods_summary,shipping_method,current_status,created_at,updated_at,profiles!cargo_shipping_jobs_customer_id_fkey(id,full_name,email,company_name),carrier:purchase_carriers!cargo_shipping_jobs_carrier_id_fkey(id,name)")
    .order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  const trackingSearch = filters.tracking?.trim().slice(0, 160) ?? "";
  if (trackingSearch) query = query.ilike("courier_tracking_number", `%${trackingSearch}%`);
  if (customerIds) query = query.in("customer_id", customerIds);
  if (identifierJobIds) query = query.in("id", identifierJobIds);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load cargo tracking jobs.");
  return (data ?? []).map((row) => ({ ...row, customer: one(row.profiles), carrier: one(row.carrier) }));
}

export async function getCargoSearchSuggestions() {
  const db = createSupabaseAdminClient();
  const [jobs, customers] = await Promise.all([
    db.from("cargo_shipping_jobs")
      .select("id,courier_tracking_number,profiles!cargo_shipping_jobs_customer_id_fkey(full_name,email,company_name)")
      .order("updated_at", { ascending: false }).limit(200),
    db.from("profiles").select("id,full_name,email,company_name")
      .eq("role", "customer").eq("status", "active").order("full_name").limit(500),
  ]);
  if (jobs.error || customers.error) throw new Error("Unable to load cargo search suggestions.");
  return {
    tracking: (jobs.data ?? []).map((job) => ({ ...job, customer: one(job.profiles) })),
    customers: customers.data ?? [],
  };
}

export async function getCargoOptions() {
  const db = createSupabaseAdminClient();
  const [customers, chinaWarehouses, bangladeshWarehouses, carriers] = await Promise.all([
    db.from("profiles").select("id,full_name,email,phone,company_name").eq("role", "customer").eq("status", "active").order("full_name").limit(500),
    db.from("warehouses").select("id,code,name,country_code,address").eq("is_active", true).eq("country_code", "CN").order("name"),
    db.from("warehouses").select("id,code,name,country_code,address").eq("is_active", true).eq("country_code", "BD").order("name"),
    db.from("purchase_carriers").select("id,name").eq("status", "active").order("name"),
  ]);
  if (customers.error || chinaWarehouses.error || bangladeshWarehouses.error || carriers.error) throw new Error("Unable to load cargo tracking options.");
  const bangladeshWarehouseIds = (bangladeshWarehouses.data ?? []).map((warehouse) => warehouse.id);
  const locations = bangladeshWarehouseIds.length
    ? await db.from("warehouse_locations").select("id,warehouse_id,code,name").eq("is_active", true).in("warehouse_id", bangladeshWarehouseIds).order("code")
    : { data: [], error: null };
  if (locations.error) throw new Error("Unable to load cargo tracking options.");
  return {
    customers: customers.data ?? [],
    chinaWarehouses: chinaWarehouses.data ?? [],
    bangladeshWarehouses: bangladeshWarehouses.data ?? [],
    locations: locations.data ?? [],
    carriers: carriers.data ?? [],
  };
}

export async function getCargoJob(jobId: string) {
  const db = createSupabaseAdminClient();
  const [job, packages, events, options, invoice, rates] = await Promise.all([
    db.from("cargo_shipping_jobs").select("*,profiles!cargo_shipping_jobs_customer_id_fkey(id,full_name,email,phone,company_name),carrier:purchase_carriers!cargo_shipping_jobs_carrier_id_fkey(id,name),china_warehouse:warehouses!cargo_shipping_jobs_china_warehouse_id_fkey(id,code,name,address),bangladesh_warehouse:warehouses!cargo_shipping_jobs_bangladesh_warehouse_id_fkey(id,code,name,address),warehouse_locations!cargo_shipping_jobs_bangladesh_location_id_fkey(id,code,name)").eq("id", jobId).maybeSingle(),
    db.from("cargo_shipping_packages").select("id,package_identifier,sequence_number,description,quantity,unit,weight,dimensions,cbm,warehouse_location_id,china_received_at,china_received_by,ready_verified_at,ready_verified_by,handed_over_at,handed_over_by,warehouse_location:warehouse_locations!cargo_shipping_packages_warehouse_location_id_fkey(id,warehouse_id,code,name)").eq("job_id", jobId).order("sequence_number"),
    db.from("cargo_shipping_events").select("id,status,event_at,note,warehouses(id,code,name),warehouse_locations(id,code,name),profiles!cargo_shipping_events_actor_id_fkey(id,full_name,email)").eq("job_id", jobId).order("event_at", { ascending: false }).order("created_at", { ascending: false }),
    getCargoOptions(),
    db.from("cargo_invoices").select("*").eq("cargo_job_id", jobId).maybeSingle(),
    db.from("cargo_rates").select("id,shipping_method,rate_bdt_per_kg,is_active,effective_at").order("shipping_method"),
  ]);
  if (job.error || packages.error || events.error || invoice.error || rates.error) throw new Error("Unable to load cargo tracking job.");
  if (!job.data) return null;
  return {
    job: {
      ...job.data,
      customer: one(job.data.profiles),
      carrier: one(job.data.carrier),
      chinaWarehouse: one(job.data.china_warehouse),
      bangladeshWarehouse: one(job.data.bangladesh_warehouse),
      bangladeshLocation: one(job.data.warehouse_locations),
    },
    packages: (packages.data ?? []).map((item) => ({
      ...item,
      warehouseLocation: one(item.warehouse_location),
    })),
    events: (events.data ?? []).map((event) => ({
      ...event,
      warehouse: one(event.warehouses),
      location: one(event.warehouse_locations),
      actor: one(event.profiles),
    })),
    invoice: invoice.data ?? null,
    rates: rates.data ?? [],
    ...options,
  };
}

export async function getCustomerCargoJobs(customerId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("cargo_shipping_jobs")
    .select("id,internal_cargo_id,courier_tracking_number,goods_summary,shipping_method,current_status,created_at,updated_at,cargo_invoices(id,invoice_number,total_amount,payment_status,customer_visible)")
    .eq("customer_id", customerId).order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to load Cargo requests.");
  return data ?? [];
}

export async function getCustomerCargoJob(jobId: string, customerId: string) {
  const db = createSupabaseAdminClient();
  const [{ data: job, error: jobError }, { data: packages }, { data: events }, { data: invoice }] = await Promise.all([
    db.from("cargo_shipping_jobs").select("*,profiles!cargo_shipping_jobs_customer_id_fkey(id,full_name,email,phone,company_name),china_warehouse:warehouses!cargo_shipping_jobs_china_warehouse_id_fkey(id,code,name,address),bangladesh_warehouse:warehouses!cargo_shipping_jobs_bangladesh_warehouse_id_fkey(id,code,name,address),cargo_invoices(*)").eq("id", jobId).eq("customer_id", customerId).maybeSingle(),
    db.from("cargo_shipping_packages").select("id,package_identifier,sequence_number,description,quantity,unit,weight,dimensions,cbm").eq("job_id", jobId).order("sequence_number"),
    db.from("cargo_shipping_events").select("id,status,event_at,note").eq("job_id", jobId).order("event_at", { ascending: false }),
    db.from("cargo_invoices").select("*").eq("cargo_job_id", jobId).eq("customer_id", customerId).eq("customer_visible", true).maybeSingle(),
  ]);
  if (jobError || !job) return null;
  return { job: { ...job, customer: one(job.profiles), chinaWarehouse: one(job.china_warehouse), bangladeshWarehouse: one(job.bangladesh_warehouse) }, packages: packages ?? [], events: events ?? [], invoice: invoice ?? null };
}

export async function getCargoRates() {
  const { data, error } = await createSupabaseAdminClient().from("cargo_rates").select("id,shipping_method,rate_bdt_per_kg,is_active,effective_at").order("shipping_method");
  if (error) throw new Error("Unable to load Cargo rates.");
  return data ?? [];
}

export async function getCargoPackageLabel(jobId: string, packageId: string) {
  const data = await getCargoJob(jobId);
  if (!data) return null;
  const cargoPackage = data.packages.find((item) => item.id === packageId);
  return cargoPackage ? { ...data, cargoPackage } : null;
}
