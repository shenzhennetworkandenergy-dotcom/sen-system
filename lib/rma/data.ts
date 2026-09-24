import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type WarrantyCoverageView = {
  id: string;
  coverage_number: string;
  sales_order_id: string;
  sales_order_item_id: string;
  customer_profile_id: string;
  product_id: string;
  serial_number_id: string | null;
  covered_quantity: number;
  claimed_quantity: number;
  warranty_duration_months: number;
  warranty_terms: string | null;
  warranty_exclusions: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  product_name: string;
  product_sku: string;
  order_number: string;
  sen_serial: string | null;
};

export type RmaClaimView = {
  id: string;
  rma_number: string;
  customer_profile_id: string;
  warranty_coverage_id: string;
  sales_order_id: string;
  sales_order_item_id: string;
  product_id: string;
  serial_number_id: string | null;
  claim_type: string;
  quantity: number;
  description: string;
  status: string;
  resolution: string | null;
  assigned_to: string | null;
  submitted_at: string;
  updated_at: string;
  product_name: string;
  product_sku: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  sen_serial: string | null;
};

export type RmaEventView = {
  id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  customer_visible: boolean;
  created_at: string;
  actor_name: string;
};

export type RmaAttachmentView = {
  id: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type Row = Record<string, unknown>;

function unique(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

async function mapById(table: string, ids: string[], fields: string) {
  if (!ids.length) return new Map<string, Row>();
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(table).select(fields).in("id", ids);
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  return new Map(rows.map((row) => [String(row.id), row]));
}

async function enrichCoverages(rows: Row[]): Promise<WarrantyCoverageView[]> {
  const [products, orders, serials] = await Promise.all([
    mapById("products", unique(rows.map((row) => row.product_id)), "id,name,sku"),
    mapById("sales_orders", unique(rows.map((row) => row.sales_order_id)), "id,order_number"),
    mapById("serial_numbers", unique(rows.map((row) => row.serial_number_id)), "id,sen_serial"),
  ]);

  return rows.map((row) => {
    const product = products.get(String(row.product_id));
    const order = orders.get(String(row.sales_order_id));
    const serial = row.serial_number_id ? serials.get(String(row.serial_number_id)) : null;
    return {
      ...(row as Omit<WarrantyCoverageView, "product_name" | "product_sku" | "order_number" | "sen_serial">),
      product_name: String(product?.name ?? "Covered product"),
      product_sku: String(product?.sku ?? ""),
      order_number: String(order?.order_number ?? ""),
      sen_serial: serial?.sen_serial ? String(serial.sen_serial) : null,
    };
  });
}

async function enrichClaims(rows: Row[]): Promise<RmaClaimView[]> {
  const [products, orders, profiles, serials] = await Promise.all([
    mapById("products", unique(rows.map((row) => row.product_id)), "id,name,sku"),
    mapById("sales_orders", unique(rows.map((row) => row.sales_order_id)), "id,order_number"),
    mapById("profiles", unique(rows.map((row) => row.customer_profile_id)), "id,full_name,email"),
    mapById("serial_numbers", unique(rows.map((row) => row.serial_number_id)), "id,sen_serial"),
  ]);
  return rows.map((row) => {
    const product = products.get(String(row.product_id));
    const order = orders.get(String(row.sales_order_id));
    const customer = profiles.get(String(row.customer_profile_id));
    const serial = row.serial_number_id ? serials.get(String(row.serial_number_id)) : null;
    return {
      ...(row as Omit<RmaClaimView, "product_name" | "product_sku" | "order_number" | "customer_name" | "customer_email" | "sen_serial">),
      product_name: String(product?.name ?? "Product"),
      product_sku: String(product?.sku ?? ""),
      order_number: String(order?.order_number ?? ""),
      customer_name: String(customer?.full_name ?? "Customer"),
      customer_email: String(customer?.email ?? ""),
      sen_serial: serial?.sen_serial ? String(serial.sen_serial) : null,
    };
  });
}

export async function getCustomerWarrantyCoverages(profileId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("warranty_coverages").select("*").eq("customer_profile_id", profileId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Unable to load warranty coverage: ${error.message}`);
  return enrichCoverages((data ?? []) as Row[]);
}

export async function getWarrantyCoverage(profileId: string, coverageId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("warranty_coverages").select("*").eq("id", coverageId).eq("customer_profile_id", profileId).maybeSingle();
  if (error) throw new Error(`Unable to load warranty coverage: ${error.message}`);
  if (!data) return null;
  const [coverage] = await enrichCoverages([data as Row]);
  return coverage;
}

export async function getCustomerRmaClaims(profileId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("rma_claims").select("*").eq("customer_profile_id", profileId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Unable to load RMA claims: ${error.message}`);
  return enrichClaims((data ?? []) as Row[]);
}

export async function getStaffRmaClaims(status?: string, query?: string) {
  const db = createSupabaseAdminClient();
  let request = db.from("rma_claims").select("*").order("created_at", { ascending: false }).limit(100);
  if (status) request = request.eq("status", status);
  const { data, error } = await request;
  if (error) throw new Error(`Unable to load RMA queue: ${error.message}`);
  const enriched = await enrichClaims((data ?? []) as Row[]);
  const term = query?.trim().toLowerCase();
  if (!term) return enriched;
  return enriched.filter((claim) => [claim.rma_number, claim.product_name, claim.product_sku, claim.customer_name, claim.customer_email, claim.order_number, claim.sen_serial].some((value) => value?.toLowerCase().includes(term)));
}

async function getClaim(id: string, customerProfileId?: string) {
  const db = createSupabaseAdminClient();
  let request = db.from("rma_claims").select("*").eq("id", id);
  if (customerProfileId) request = request.eq("customer_profile_id", customerProfileId);
  const { data, error } = await request.maybeSingle();
  if (error) throw new Error(`Unable to load RMA claim: ${error.message}`);
  if (!data) return null;
  const [claim] = await enrichClaims([data as Row]);
  let eventRequest = db.from("rma_events").select("*").eq("rma_claim_id", id);
  if (customerProfileId) eventRequest = eventRequest.eq("customer_visible", true);
  const [{ data: eventRows, error: eventError }, { data: attachmentRows, error: attachmentError }] = await Promise.all([
    eventRequest.order("created_at", { ascending: true }).limit(200),
    db.from("rma_attachments").select("*").eq("rma_claim_id", id).order("created_at", { ascending: true }).limit(50),
  ]);
  if (eventError) throw new Error(`Unable to load RMA timeline: ${eventError.message}`);
  if (attachmentError) throw new Error(`Unable to load RMA attachments: ${attachmentError.message}`);
  const eventRowsTyped = (eventRows ?? []) as Row[];
  const actors = await mapById("profiles", unique(eventRowsTyped.map((row) => row.actor_profile_id)), "id,full_name");
  const events: RmaEventView[] = eventRowsTyped.map((row) => ({
    ...(row as Omit<RmaEventView, "actor_name">),
    actor_name: row.actor_profile_id ? String(actors.get(String(row.actor_profile_id))?.full_name ?? "SEN team") : "System",
  }));
  return { claim, events, attachments: (attachmentRows ?? []) as RmaAttachmentView[] };
}

export function getCustomerRmaClaim(profileId: string, id: string) {
  return getClaim(id, profileId);
}

export function getStaffRmaClaim(id: string) {
  return getClaim(id);
}

export async function getRmaAssignees() {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,email,role")
    .in("role", ["admin", "employee"])
    .eq("status", "active")
    .order("full_name")
    .limit(200);
  if (error) throw new Error(`Unable to load RMA assignees: ${error.message}`);
  return data ?? [];
}
