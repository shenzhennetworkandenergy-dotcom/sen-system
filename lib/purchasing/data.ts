import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { purchaseStatuses, type PurchaseStatus } from "@/lib/purchasing/types";

export type PurchaseListParams = {
  q?: string;
  supplier?: string;
  warehouse?: string;
  status?: string;
  date?: string;
  page?: string;
};

export async function getPurchaseOptions() {
  const db = createSupabaseAdminClient();
  const [suppliersResult, warehousesResult, productsResult, variationsResult] = await Promise.all([
    db.from("suppliers").select("id,code,name,default_currency,payment_terms_days").eq("status", "active").order("name"),
    db.from("warehouses").select("id,code,name,country_name").eq("is_active", true).order("name"),
    db.from("products").select("id,name,sku,product_type,purchase_cost,serial_tracking_required").neq("status", "archived").order("name").limit(500),
    db.from("product_variations").select("id,product_id,sku,combination_key,purchase_cost").eq("status", "active").order("sku").limit(1000),
  ]);
  const error = suppliersResult.error ?? warehousesResult.error ?? productsResult.error ?? variationsResult.error;
  if (error) {
    console.error("Purchase options query failed", { code: error.code, message: error.message });
    throw new Error("Unable to load purchase-order options.");
  }
  return {
    suppliers: suppliersResult.data ?? [],
    warehouses: warehousesResult.data ?? [],
    products: productsResult.data ?? [],
    variations: variationsResult.data ?? [],
  };
}

export async function getPurchaseDashboard(params: PurchaseListParams) {
  const db = createSupabaseAdminClient();
  const page = Math.max(1, Number.parseInt(params.page ?? "1") || 1);
  const size = 25;
  let query = db.from("purchase_orders").select(
    "id,order_number,status,currency,order_date,expected_delivery_date,total_amount,payment_status,created_at,suppliers(id,code,name),warehouses:destination_warehouse_id(id,code,name),purchase_order_items(quantity_ordered,quantity_received)",
    { count: "exact" },
  );
  if (params.q) query = query.ilike("order_number", `%${params.q.slice(0, 80)}%`);
  if (params.supplier) query = query.eq("supplier_id", params.supplier);
  if (params.warehouse) query = query.eq("destination_warehouse_id", params.warehouse);
  if (params.status && purchaseStatuses.includes(params.status as PurchaseStatus)) query = query.eq("status", params.status);
  if (params.date) query = query.eq("order_date", params.date);
  const ordersResult = await query.order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  const [suppliersResult, warehousesResult, totalsResult] = await Promise.all([
    db.from("suppliers").select("id,name").neq("status", "archived").order("name"),
    db.from("warehouses").select("id,code,name").eq("is_active", true).order("name"),
    db.from("purchase_orders").select("status,total_amount,currency,expected_delivery_date"),
  ]);
  const error = ordersResult.error ?? suppliersResult.error ?? warehousesResult.error ?? totalsResult.error;
  if (error) {
    console.error("Purchasing dashboard query failed", { code: error.code, message: error.message });
    throw new Error("Unable to load purchasing.");
  }
  const all = totalsResult.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return {
    orders: ordersResult.data ?? [],
    count: ordersResult.count ?? 0,
    page,
    size,
    suppliers: suppliersResult.data ?? [],
    warehouses: warehousesResult.data ?? [],
    metrics: {
      draft: all.filter((item) => item.status === "draft").length,
      awaitingApproval: all.filter((item) => item.status === "pending_approval").length,
      open: all.filter((item) => ["approved", "ordered", "ready_for_shipment", "shipped", "received", "partially_received"].includes(item.status)).length,
      overdue: all.filter((item) => ["ordered", "ready_for_shipment", "shipped"].includes(item.status) && item.expected_delivery_date && item.expected_delivery_date < today).length,
      received: all.filter((item) => ["stock_received", "closed"].includes(item.status)).length,
      openValue: all.filter((item) => !["cancelled", "closed"].includes(item.status)).reduce((sum, item) => sum + Number(item.total_amount), 0),
    },
  };
}

export async function getPurchaseOrder(id: string) {
  const db = createSupabaseAdminClient();
  const [orderResult, itemsResult, eventsResult, receiptsResult, inboundShipmentResult, carriersResult] = await Promise.all([
    db.from("purchase_orders").select("*,suppliers(*),warehouses:destination_warehouse_id(id,code,name,address,country_code,country_name)").eq("id", id).maybeSingle(),
    db.from("purchase_order_items").select("*,products(id,name,sku,serial_tracking_required),product_variations(id,sku,combination_key)").eq("purchase_order_id", id).order("created_at"),
    db.from("purchase_order_status_events").select("id,previous_status,new_status,note,created_at,profiles:actor_profile_id(full_name,email)").eq("purchase_order_id", id).order("created_at", { ascending: false }),
    db.from("purchase_receipts").select("id,receipt_number,receipt_date,supplier_delivery_reference,supplier_invoice_reference,status,created_at,profiles:received_by(full_name,email),purchase_receipt_items(id,purchase_order_item_id,quantity_received,serial_generation_batch_id)").eq("purchase_order_id", id).order("created_at", { ascending: false }),
    db.from("purchase_inbound_shipments").select("*").eq("purchase_order_id", id).maybeSingle(),
    db.from("purchase_carriers").select("id,name").eq("status", "active").order("name"),
  ]);
  const error = orderResult.error ?? itemsResult.error ?? eventsResult.error ?? receiptsResult.error ?? inboundShipmentResult.error ?? carriersResult.error;
  if (error) {
    console.error("Purchase order query failed", { code: error.code, message: error.message, orderId: id });
    throw new Error("Unable to load purchase order.");
  }
  if (!orderResult.data) return null;
  return {
    order: orderResult.data,
    items: itemsResult.data ?? [],
    events: eventsResult.data ?? [],
    receipts: receiptsResult.data ?? [],
    inboundShipment: inboundShipmentResult.data,
    carriers: carriersResult.data ?? [],
  };
}

export async function getInboundPurchaseShipments() {
  const result = await createSupabaseAdminClient()
    .from("purchase_inbound_shipments")
    .select(
      "id,status,transport_mode,carrier_name,tracking_number,expected_arrival_at,shipped_at,received_at,updated_at,purchase_orders(id,order_number,suppliers(name),warehouses:destination_warehouse_id(name,code))",
    )
    .order("updated_at", { ascending: false })
    .limit(50);
  if (result.error) {
    console.error("Supplier inbound shipment query failed", {
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error("Unable to load supplier inbound shipments.");
  }
  return result.data ?? [];
}

export async function getSuppliers(params: { q?: string; status?: string; page?: string }) {
  const db = createSupabaseAdminClient();
  const page = Math.max(1, Number.parseInt(params.page ?? "1") || 1), size = 25;
  let query = db.from("suppliers").select("*,supplier_categories(id,name,category_level),brands(id,name)", { count: "exact" });
  if (params.q) query = query.or(`name.ilike.%${params.q.slice(0, 80)}%,code.ilike.%${params.q.slice(0, 80)}%,email.ilike.%${params.q.slice(0, 80)}%`);
  if (params.status && ["active", "on_hold", "archived"].includes(params.status)) query = query.eq("status", params.status);
  const result = await query.order("name").range((page - 1) * size, page * size - 1);
  if (result.error) {
    console.error("Supplier query failed", { code: result.error.code, message: result.error.message });
    throw new Error("Unable to load suppliers.");
  }
  return { suppliers: result.data ?? [], count: result.count ?? 0, page, size };
}

export async function getSupplier(id: string) {
  const db = createSupabaseAdminClient();
  const [supplierResult, ordersResult] = await Promise.all([
    db.from("suppliers").select("*,supplier_categories(id,name,category_level),brands(id,name)").eq("id", id).maybeSingle(),
    db.from("purchase_orders").select("id,order_number,status,total_amount,currency,order_date,expected_delivery_date").eq("supplier_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const error = supplierResult.error ?? ordersResult.error;
  if (error) throw new Error("Unable to load supplier.");
  return supplierResult.data ? { supplier: supplierResult.data, orders: ordersResult.data ?? [] } : null;
}

