import "server-only";

import { getEffectivePermissions } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StockOutQueueCard = {
  id: string;
  requestNumber: string;
  status: string;
  invoiceNumber: string;
  invoiceRevision: number;
  orderNumber: string;
  customerName: string;
  warehouseName: string;
  requiredQuantity: number;
  releasedQuantity: number;
  remainingQuantity: number;
  invoiceRevisionPending: boolean;
  updatedAt: string;
};

type StockOutRequestRow = {
  id: string;
  request_number: string;
  sales_order_id: string;
  current_invoice_document_id: string;
  warehouse_id: string;
  customer_profile_id: string;
  status: string;
  current_revision_number: number;
  required_quantity: number | string;
  released_quantity: number | string;
  remaining_quantity: number | string;
  invoice_revision_pending: boolean;
  version: number | string;
  updated_at: string;
};

async function getAuthorizedWarehouseIds(profileId: string) {
  const db = createSupabaseAdminClient();
  const [profileResult, permissions, assignmentResult] = await Promise.all([
    db.from("profiles").select("id,role,status").eq("id", profileId).maybeSingle(),
    getEffectivePermissions(profileId),
    db
      .from("profile_warehouse_assignments")
      .select("warehouse_id")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .is("ended_at", null),
  ]);
  if (profileResult.error || assignmentResult.error) {
    throw new Error("Unable to validate Stock Out warehouse access.");
  }
  if (
    profileResult.data?.role !== "employee" ||
    profileResult.data.status !== "active" ||
    !permissions.has("inventory.release_sales_stock")
  ) {
    return [];
  }
  const assignedIds = [
    ...new Set((assignmentResult.data ?? []).map((row) => row.warehouse_id)),
  ];
  if (!assignedIds.length) return [];
  const warehouseResult = await db
    .from("warehouses")
    .select("id")
    .in("id", assignedIds)
    .eq("is_active", true);
  if (warehouseResult.error) throw new Error("Unable to validate active warehouses.");
  return (warehouseResult.data ?? []).map((warehouse) => warehouse.id);
}

function keyed<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getAuthorizedStockOutQueue(
  profileId: string,
): Promise<StockOutQueueCard[]> {
  const warehouseIds = await getAuthorizedWarehouseIds(profileId);
  if (!warehouseIds.length) return [];
  const db = createSupabaseAdminClient();
  const requestResult = await db
    .from("sales_stock_out_requests")
    .select("*")
    .in("warehouse_id", warehouseIds)
    .in("status", ["pending_release", "partially_released"])
    .order("updated_at", { ascending: false })
    .limit(500);
  if (requestResult.error) throw new Error("Unable to load Stock Out requests.");
  const requests = (requestResult.data ?? []) as StockOutRequestRow[];
  if (!requests.length) return [];

  const [documentResult, orderResult, customerResult, warehouseResult] =
    await Promise.all([
      db
        .from("sale_documents")
        .select("id,document_number,revision_number,status")
        .in("id", requests.map((request) => request.current_invoice_document_id)),
      db
        .from("sales_orders")
        .select("id,order_number")
        .in("id", requests.map((request) => request.sales_order_id)),
      db
        .from("profiles")
        .select("id,full_name,email,company_name")
        .in("id", requests.map((request) => request.customer_profile_id)),
      db
        .from("warehouses")
        .select("id,name,code")
        .in("id", warehouseIds),
    ]);
  if (
    documentResult.error ||
    orderResult.error ||
    customerResult.error ||
    warehouseResult.error
  ) {
    throw new Error("Unable to load Stock Out request details.");
  }

  const documents = keyed(documentResult.data ?? []);
  const orders = keyed(orderResult.data ?? []);
  const customers = keyed(customerResult.data ?? []);
  const warehouses = keyed(warehouseResult.data ?? []);
  return requests.map((request) => {
    const document = documents.get(request.current_invoice_document_id);
    const order = orders.get(request.sales_order_id);
    const customer = customers.get(request.customer_profile_id);
    const warehouse = warehouses.get(request.warehouse_id);
    return {
      id: request.id,
      requestNumber: request.request_number,
      status: request.status,
      invoiceNumber: document?.document_number ?? "Invoice unavailable",
      invoiceRevision: Number(document?.revision_number ?? request.current_revision_number),
      orderNumber: order?.order_number ?? "Sale unavailable",
      customerName:
        customer?.company_name || customer?.full_name || customer?.email || "Customer unavailable",
      warehouseName: warehouse ? `${warehouse.name} (${warehouse.code})` : "Warehouse unavailable",
      requiredQuantity: Number(request.required_quantity),
      releasedQuantity: Number(request.released_quantity),
      remainingQuantity: Number(request.remaining_quantity),
      invoiceRevisionPending: request.invoice_revision_pending,
      updatedAt: request.updated_at,
    };
  });
}

export type StockOutRequestDetail = {
  request: StockOutRequestRow;
  invoice: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  customer: Record<string, unknown> | null;
  warehouse: Record<string, unknown> | null;
  currentRevision: Record<string, unknown> | null;
  items: Array<Record<string, unknown> & {
    packedQuantity: number;
    preassignedSerials: Array<Record<string, unknown>>;
  }>;
  releases: Array<Record<string, unknown>>;
  releaseItems: Array<Record<string, unknown>>;
  releaseSerials: Array<Record<string, unknown>>;
  serialChanges: Array<Record<string, unknown>>;
};

export async function getAuthorizedStockOutRequest(
  profileId: string,
  requestId: string,
): Promise<StockOutRequestDetail | null> {
  const warehouseIds = await getAuthorizedWarehouseIds(profileId);
  if (!warehouseIds.length) return null;
  const db = createSupabaseAdminClient();
  const requestResult = await db
    .from("sales_stock_out_requests")
    .select("*")
    .eq("id", requestId)
    .in("warehouse_id", warehouseIds)
    .maybeSingle();
  if (requestResult.error) throw new Error("Unable to load the Stock Out request.");
  const request = requestResult.data as StockOutRequestRow | null;
  if (!request) return null;

  const [invoiceResult, orderResult, customerResult, warehouseResult, itemResult,
    revisionResult, releaseResult] = await Promise.all([
    db.from("sale_documents").select("*").eq("id", request.current_invoice_document_id).maybeSingle(),
    db.from("sales_orders").select("*").eq("id", request.sales_order_id).maybeSingle(),
    db.from("profiles").select("id,full_name,email,company_name,phone").eq("id", request.customer_profile_id).maybeSingle(),
    db.from("warehouses").select("id,name,code,country_name").eq("id", request.warehouse_id).maybeSingle(),
    db.from("sales_stock_out_request_items").select("*").eq("request_id", request.id).order("created_at"),
    db.from("sales_stock_out_request_revisions").select("*").eq("request_id", request.id).order("revision_number", { ascending: false }).limit(1).maybeSingle(),
    db.from("sales_stock_out_releases").select("*").eq("request_id", request.id).order("released_at", { ascending: false }),
  ]);
  const primaryResults = [invoiceResult, orderResult, customerResult, warehouseResult, itemResult, revisionResult, releaseResult];
  if (primaryResults.some((result) => result.error)) {
    throw new Error("Unable to load Stock Out request history.");
  }
  const items = itemResult.data ?? [];
  const releases = releaseResult.data ?? [];
  const currentRevision = revisionResult.data;

  const [orderItemsResult, revisionItemsResult, releaseItemsResult, serialChangesResult] = await Promise.all([
    db.from("sales_order_items").select("id,packed_quantity,allocated_quantity").eq("order_id", request.sales_order_id),
    currentRevision
      ? db.from("sales_stock_out_request_revision_items").select("*").eq("revision_id", currentRevision.id)
      : Promise.resolve({ data: [], error: null }),
    releases.length
      ? db.from("sales_stock_out_release_items").select("*").in("release_id", releases.map((release) => release.id))
      : Promise.resolve({ data: [], error: null }),
    items.length
      ? db.from("sales_stock_out_serial_changes").select("*").in("request_item_id", items.map((item) => item.id)).order("changed_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orderItemsResult.error || revisionItemsResult.error || releaseItemsResult.error || serialChangesResult.error) {
    throw new Error("Unable to load Stock Out item history.");
  }
  const revisionItems = revisionItemsResult.data ?? [];
  const releaseItems = releaseItemsResult.data ?? [];
  const preassignedIds = [...new Set(revisionItems.flatMap((item) => item.preassigned_serial_ids ?? []))];
  const [preassignedResult, releaseSerialsResult] = await Promise.all([
    preassignedIds.length
      ? db.from("serial_numbers").select("id,sen_serial,manufacturer_serial,status,condition,warehouse_id").in("id", preassignedIds)
      : Promise.resolve({ data: [], error: null }),
    releaseItems.length
      ? db.from("sales_stock_out_release_serials").select("*").in("release_item_id", releaseItems.map((item) => item.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (preassignedResult.error || releaseSerialsResult.error) {
    throw new Error("Unable to load Stock Out serial history.");
  }
  const currentOrderItems = keyed(orderItemsResult.data ?? []);
  const revisionByRequestItem = new Map(revisionItems.map((item) => [item.request_item_id, item]));
  const serialsById = keyed(preassignedResult.data ?? []);
  const detailedItems = items.map((item) => {
    const revisionItem = revisionByRequestItem.get(item.id);
    const currentOrderItem = currentOrderItems.get(item.sales_order_item_id);
    return {
      ...item,
      packedQuantity: Number(currentOrderItem?.packed_quantity ?? item.packed_quantity_snapshot ?? 0),
      preassignedSerials: (revisionItem?.preassigned_serial_ids ?? [])
        .map((id: string) => serialsById.get(id))
        .filter(Boolean),
    };
  });

  return {
    request,
    invoice: invoiceResult.data,
    order: orderResult.data,
    customer: customerResult.data,
    warehouse: warehouseResult.data,
    currentRevision,
    items: detailedItems,
    releases,
    releaseItems,
    releaseSerials: releaseSerialsResult.data ?? [],
    serialChanges: serialChangesResult.data ?? [],
  };
}

export async function searchEligibleStockOutSerials(
  profileId: string,
  requestItemId: string,
  query: string,
) {
  const warehouseIds = await getAuthorizedWarehouseIds(profileId);
  if (!warehouseIds.length) return [];
  const db = createSupabaseAdminClient();
  const itemResult = await db
    .from("sales_stock_out_request_items")
    .select("*")
    .eq("id", requestItemId)
    .maybeSingle();
  if (itemResult.error || !itemResult.data) return [];
  const requestItem = itemResult.data;
  const requestResult = await db
    .from("sales_stock_out_requests")
    .select("*")
    .eq("id", requestItem.request_id)
    .eq("warehouse_id", requestItem.warehouse_id)
    .in("warehouse_id", warehouseIds)
    .maybeSingle();
  if (requestResult.error || !requestResult.data) return [];
  const request = requestResult.data;
  if (
    !["pending_release", "partially_released"].includes(request.status) ||
    request.invoice_revision_pending ||
    Number(requestItem.remaining_quantity) <= 0
  ) return [];

  const eligibleStatuses = ["available", "reserved", "allocated", "packed"];
  const ineligibleConditions = ["damaged", "unavailable", "quarantined", "lost", "disposed"];
  let serialQuery = db
    .from("serial_numbers")
    .select("id,sen_serial,manufacturer_serial,product_id,variation_id,warehouse_id,status,condition")
    .eq("product_id", requestItem.product_id)
    .eq("warehouse_id", request.warehouse_id)
    .in("status", eligibleStatuses)
    .limit(50);
  serialQuery = requestItem.variation_id
    ? serialQuery.eq("variation_id", requestItem.variation_id)
    : serialQuery.is("variation_id", null);
  const term = query.trim().replace(/[,%()]/g, "").slice(0, 100);
  if (term) {
    serialQuery = serialQuery.or(
      `sen_serial.ilike.%${term}%,manufacturer_serial.ilike.%${term}%`,
    );
  }
  const serialResult = await serialQuery;
  if (serialResult.error) throw new Error("Unable to search SEN Serials.");
  const candidates = (serialResult.data ?? []).filter((serial) =>
    serial.product_id === requestItem.product_id &&
    serial.variation_id === requestItem.variation_id &&
    serial.warehouse_id === request.warehouse_id &&
    eligibleStatuses.includes(serial.status) &&
    !ineligibleConditions.includes(String(serial.condition).toLowerCase())
  );
  if (!candidates.length) return [];
  const serialIds = candidates.map((serial) => serial.id);
  const [allocationResult, releasedResult, revisionResult] = await Promise.all([
    db.from("order_serial_allocations").select("serial_number_id,order_item_id,status").in("serial_number_id", serialIds).in("status", ["active", "packed", "warehouse_released"]),
    db.from("sales_stock_out_release_serials").select("serial_number_id").in("serial_number_id", serialIds),
    db.from("sales_stock_out_request_revisions").select("id").eq("request_id", request.id).eq("revision_number", request.current_revision_number).maybeSingle(),
  ]);
  if (allocationResult.error || releasedResult.error || revisionResult.error) {
    throw new Error("Unable to validate SEN Serial eligibility.");
  }
  const releasedIds = new Set((releasedResult.data ?? []).map((row) => row.serial_number_id));
  const allocations = allocationResult.data ?? [];
  const revisionItemResult = revisionResult.data
    ? await db.from("sales_stock_out_request_revision_items").select("preassigned_serial_ids").eq("revision_id", revisionResult.data.id).eq("request_item_id", requestItem.id).maybeSingle()
    : { data: null, error: null };
  if (revisionItemResult.error) throw new Error("Unable to load assigned SEN Serials.");
  const preassigned = new Set(revisionItemResult.data?.preassigned_serial_ids ?? []);

  return candidates
    .filter((serial) => {
      if (releasedIds.has(serial.id)) return false;
      const conflicts = allocations.filter((allocation) => allocation.serial_number_id === serial.id);
      return conflicts.every((allocation) => allocation.order_item_id === requestItem.sales_order_item_id);
    })
    .map((serial) => ({ ...serial, preselected: preassigned.has(serial.id) }));
}
