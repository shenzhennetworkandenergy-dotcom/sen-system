import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function fail(context: string, error: { code?: string; message?: string; details?: string } | null) {
  if (error) console.error(context, { code: error.code, message: error.message, details: error.details });
  if (error) throw new Error(context);
}

export async function getOrderCreationOptions() {
  const db = createSupabaseAdminClient();
  const [customers, products, variations, balances, warehouses, addresses] = await Promise.all([
    db.from("profiles").select("id,email,full_name,phone,company_name,status").eq("role", "customer").eq("status", "active").order("full_name").limit(200),
    db.from("products").select("id,name,sku,model_number,brand_id,product_type,status,regular_price,sale_price,currency,serial_tracking_required").eq("status", "active").order("name").limit(500),
    db.from("product_variations").select("id,product_id,name,sku,regular_price,sale_price,status").eq("status", "active").order("name").limit(1000),
    db.from("inventory_balances").select("product_id,variation_id,warehouse_id,available").gt("available", 0).limit(2000),
    db.from("warehouses").select("id,code,name,country_code").eq("is_active", true).order("name"),
    db.from("customer_addresses").select("*").order("is_default_shipping", { ascending: false }).order("updated_at", { ascending: false }).limit(1000),
  ]);
  for (const [name, result] of Object.entries({ customers, products, variations, balances, warehouses, addresses })) fail(`Unable to load ${name}.`, result.error);
  return { customers: customers.data ?? [], products: products.data ?? [], variations: variations.data ?? [], balances: balances.data ?? [], warehouses: warehouses.data ?? [], addresses: addresses.data ?? [] };
}

export async function getOrders(params: { q?: string; status?: string; customer?: string; page?: string }, customerProfileId?: string) {
  const db = createSupabaseAdminClient(), page = Math.max(1, Number.parseInt(params.page ?? "1") || 1), size = 20;
  let query = db.from("sales_orders").select("*,profiles!sales_orders_customer_profile_id_fkey(full_name,email,phone,company_name)", { count: "exact" });
  if (customerProfileId) query = query.eq("customer_profile_id", customerProfileId);
  if (params.status) query = query.eq("status", params.status);
  if (params.customer) query = query.eq("customer_profile_id", params.customer);
  if (params.q?.trim()) query = query.ilike("order_number", `%${params.q.trim().slice(0, 80)}%`);
  const { data, error, count } = await query.order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  fail("Unable to load orders.", error); return { orders: data ?? [], count: count ?? 0, page, size };
}

export async function getOrder(orderId: string, customerProfileId?: string) {
  const db = createSupabaseAdminClient();
  let orderQuery = db.from("sales_orders").select("*,profiles!sales_orders_customer_profile_id_fkey(id,full_name,email,phone,company_name),warehouses(id,code,name)").eq("id", orderId);
  if (customerProfileId) orderQuery = orderQuery.eq("customer_profile_id", customerProfileId);
  const orderResult = await orderQuery.maybeSingle(); fail("Unable to load order.", orderResult.error); if (!orderResult.data) return null;
  const [items, reservations, allocations, packages, packed, shipments, tracking, documents] = await Promise.all([
    db.from("sales_order_items").select("*").eq("order_id", orderId).order("created_at"),
    db.from("inventory_reservations").select("*").eq("order_id", orderId).order("created_at"),
    db.from("order_serial_allocations").select("*,serial_numbers(id,sen_serial,manufacturer_serial,status,condition,warehouse_id,location_id)").eq("order_id", orderId).order("allocated_at"),
    db.from("order_packages").select("*").eq("order_id", orderId).order("created_at"),
    db.from("order_packed_items").select("*,order_packages!inner(order_id)").eq("order_packages.order_id", orderId).order("packed_at"),
    db.from("shipments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    db.from("shipment_tracking_events").select("*,tracking_status_definitions(key,name,color)").eq("order_id", orderId).order("occurred_at", { ascending: false }),
    db.from("shipment_documents").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
  ]);
  for (const [name, result] of Object.entries({ items, reservations, allocations, packages, packed, shipments, tracking, documents })) fail(`Unable to load order ${name}.`, result.error);
  return { order: orderResult.data, items: items.data ?? [], reservations: reservations.data ?? [], allocations: allocations.data ?? [], packages: packages.data ?? [], packed: packed.data ?? [], shipments: shipments.data ?? [], tracking: tracking.data ?? [], documents: documents.data ?? [] };
}

export async function getShipment(shipmentId: string, customerProfileId?: string) {
  const db = createSupabaseAdminClient();
  let query = db.from("shipments").select("*,sales_orders!inner(id,order_number,customer_profile_id,currency,total_amount)").eq("id", shipmentId);
  if (customerProfileId) query = query.eq("sales_orders.customer_profile_id", customerProfileId).eq("customer_visible", true);
  const shipment = await query.maybeSingle(); fail("Unable to load shipment.", shipment.error); if (!shipment.data) return null;
  const [items, serials, events, points, statuses, workplaces, documents, availableDocuments] = await Promise.all([
    db.from("shipment_items").select("*,sales_order_items(product_id,product_name_snapshot,sku_snapshot,quantity)").eq("shipment_id", shipmentId),
    db.from("shipment_serials").select("*,serial_numbers(sen_serial,manufacturer_serial),shipment_items!inner(shipment_id)").eq("shipment_items.shipment_id", shipmentId),
    db.from("shipment_tracking_events").select("*,tracking_status_definitions(key,name,color)").eq("shipment_id", shipmentId).order("occurred_at", { ascending: false }),
    db.from("shipment_route_points").select("*").eq("shipment_id", shipmentId).order("version", { ascending: false }).order("point_order"),
    db.from("tracking_status_definitions").select("id,key,name,description,color,customer_visible_default,sort_order").eq("is_active", true).order("sort_order"),
    db.from("work_locations").select("id,name,location_type,country_code,city,latitude,longitude").eq("is_active", true).order("name"),
    db.from("shipment_documents").select("*").eq("shipment_id", shipmentId).order("created_at", { ascending: false }),
    db.from("product_media").select("id,product_id,storage_path,original_file_name,media_purpose,visibility").eq("media_type", "document").limit(100),
  ]);
  for (const [name, result] of Object.entries({ items, serials, events, points, statuses, workplaces, documents, availableDocuments })) fail(`Unable to load shipment ${name}.`, result.error);
  const visibleEvents = customerProfileId ? (events.data ?? []).filter((event) => event.event_visibility === "customer" || event.event_visibility === "both") : events.data ?? [];
  return { shipment: shipment.data, items: items.data ?? [], serials: serials.data ?? [], events: visibleEvents, points: (points.data ?? []).filter((point) => !customerProfileId || point.customer_visible), statuses: statuses.data ?? [], workplaces: workplaces.data ?? [], documents: documents.data ?? [], availableDocuments: availableDocuments.data ?? [] };
}

export async function getShipments(params: { q?: string; status?: string; mode?: string; page?: string }) {
  const db = createSupabaseAdminClient(), page = Math.max(1, Number.parseInt(params.page ?? "1") || 1), size = 20;
  let query = db.from("shipments").select("*,sales_orders(order_number,customer_profile_id,profiles!sales_orders_customer_profile_id_fkey(full_name,email))", { count: "exact" });
  if (params.q) query = query.or(`shipment_number.ilike.%${params.q.slice(0, 80)}%,external_reference.ilike.%${params.q.slice(0, 80)}%`);
  if (params.status) query = query.eq("status", params.status); if (params.mode) query = query.eq("transport_mode", params.mode);
  const { data, error, count } = await query.order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  fail("Unable to load shipments.", error); return { shipments: data ?? [], count: count ?? 0, page, size };
}
