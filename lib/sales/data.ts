import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeSalePaymentAccountingLink } from "@/lib/sales/payment-accounting";

type SalesFilters = { q?: string; customer?: string; employee?: string; status?: string; payment?: string; date?: string; page?: string; ownProfileId?: string };

function assertResult(context: string, error: { code?: string; message?: string; details?: string } | null) {
  if (!error) return;
  console.error(context, { code: error.code, message: error.message, details: error.details });
  throw new Error(context);
}

export async function getSalesDashboard(filters: SalesFilters) {
  const db = createSupabaseAdminClient();
  const page = Math.max(1, Number.parseInt(filters.page ?? "1") || 1), size = 20;
  let query = db.from("sales_orders").select("*,customer:profiles!sales_orders_customer_profile_id_fkey(id,full_name,email,company_name),employee:profiles!sales_orders_created_by_fkey(id,full_name,email),shipments(id,status)", { count: "exact" });
  if (filters.ownProfileId) query = query.eq("created_by", filters.ownProfileId);
  if (filters.customer) query = query.eq("customer_profile_id", filters.customer);
  if (filters.employee) query = query.eq("created_by", filters.employee);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.payment) query = query.eq("payment_status", filters.payment);
  if (filters.date) query = query.gte("created_at", `${filters.date}T00:00:00`).lte("created_at", `${filters.date}T23:59:59.999`);
  if (filters.q?.trim()) query = query.ilike("order_number", `%${filters.q.trim().slice(0, 80)}%`);
  const list = await query.order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  assertResult("Unable to load sales.", list.error);

  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const scope = filters.ownProfileId ? { created_by: filters.ownProfileId } : {};
  const [todaySales, monthSales, allSales, customers, employees] = await Promise.all([
    db.from("sales_orders").select("total_amount").match(scope).gte("created_at", today).neq("status", "cancelled"),
    db.from("sales_orders").select("total_amount").match(scope).gte("created_at", month).neq("status", "cancelled"),
    db.from("sales_orders").select("status,payment_status,total_amount,paid_amount").match(scope).limit(5000),
    db.from("profiles").select("id,full_name,email").eq("role", "customer").eq("status", "active").order("full_name").limit(500),
    db.from("profiles").select("id,full_name,email").in("role", ["employee", "admin"]).eq("status", "active").order("full_name").limit(500),
  ]);
  for (const [name, result] of Object.entries({ todaySales, monthSales, allSales, customers, employees })) assertResult(`Unable to load sales ${name}.`, result.error);
  const all = allSales.data ?? [], sum = (rows: { total_amount: number | string }[]) => rows.reduce((total, row) => total + Number(row.total_amount), 0);
  const metrics = {
    today: sum(todaySales.data ?? []),
    month: sum(monthSales.data ?? []),
    pending: all.filter((sale) => !["delivered", "cancelled"].includes(sale.status)).length,
    awaitingPayment: all.filter((sale) => sale.payment_status === "unpaid").length,
    partiallyPaid: all.filter((sale) => sale.payment_status === "partially_paid").length,
    readyToShip: all.filter((sale) => ["allocated", "packing"].includes(sale.status)).length,
    completed: all.filter((sale) => sale.status === "delivered").length,
    outstanding: all.filter((sale) => sale.status !== "cancelled").reduce((total, sale) => total + Math.max(Number(sale.total_amount) - Number(sale.paid_amount), 0), 0),
  };
  return { sales: list.data ?? [], count: list.count ?? 0, page, size, metrics, customers: customers.data ?? [], employees: employees.data ?? [] };
}

export async function getSale(saleId: string) {
  const db = createSupabaseAdminClient();
  const order = await db.from("sales_orders").select("*,customer:profiles!sales_orders_customer_profile_id_fkey(id,full_name,email,phone,company_name),employee:profiles!sales_orders_created_by_fkey(id,full_name,email),warehouses(id,code,name)").eq("id", saleId).maybeSingle();
  assertResult("Unable to load sale.", order.error);
  if (!order.data) return null;
  const [items, reservations, allocations, payments, adjustments, documents, shipments, events, audit, stockOutRequest] = await Promise.all([
    db.from("sales_order_items").select("*").eq("order_id", saleId).order("created_at"),
    db.from("inventory_reservations").select("*").eq("order_id", saleId).order("created_at"),
    db.from("order_serial_allocations").select("*,serial_numbers(id,sen_serial,manufacturer_serial,status,condition)").eq("order_id", saleId).order("allocated_at"),
    db.from("sale_payments").select("*,profiles!sale_payments_received_by_fkey(full_name,email)").eq("order_id", saleId).order("created_at", { ascending: false }),
    db.from("sale_price_adjustments").select("*,profiles!sale_price_adjustments_actor_profile_id_fkey(full_name,email)").eq("order_id", saleId).order("created_at", { ascending: false }),
    db.from("sale_documents").select("*").eq("order_id", saleId).order("created_at", { ascending: false }),
    db.from("shipments").select("*").eq("order_id", saleId).order("created_at", { ascending: false }),
    db.from("order_status_events").select("*").eq("order_id", saleId).order("created_at", { ascending: false }),
    db.from("audit_logs").select("*").eq("entity_id", saleId).order("created_at", { ascending: false }).limit(100),
    db.from("sales_stock_out_requests").select("id,request_number,status,required_quantity,released_quantity,remaining_quantity,invoice_revision_pending,current_revision_number,version").eq("sales_order_id", saleId).maybeSingle(),
  ]);
  for (const [name, result] of Object.entries({ items, reservations, allocations, payments, adjustments, documents, shipments, events, audit, stockOutRequest })) assertResult(`Unable to load sale ${name}.`, result.error);
  const paymentRows = payments.data ?? [];
  const paymentIds = paymentRows.map((payment) => payment.id);
  const accountingLinks = paymentIds.length
    ? await db.from("cashbook_entries")
      .select("id,sale_payment_id,journal_entry_id,journal_entries!cashbook_entries_journal_entry_id_fkey(entry_number)")
      .in("sale_payment_id", paymentIds)
    : { data: [], error: null };
  assertResult("Unable to load sale payment Accounting links.", accountingLinks.error);
  const accountingByPayment = new Map(
    (accountingLinks.data ?? []).map((entry) => [
      entry.sale_payment_id,
      normalizeSalePaymentAccountingLink(entry),
    ]),
  );
  return {
    order: order.data,
    items: items.data ?? [],
    reservations: reservations.data ?? [],
    allocations: allocations.data ?? [],
    payments: paymentRows.map((payment) => ({
      ...payment,
      accounting: accountingByPayment.get(payment.id) ?? null,
    })),
    adjustments: adjustments.data ?? [],
    documents: documents.data ?? [],
    shipments: shipments.data ?? [],
    events: events.data ?? [],
    audit: audit.data ?? [],
    stockOutRequest: stockOutRequest.data ?? null,
  };
}

export async function getCustomerSalesHistory(profileId: string) {
  const db = createSupabaseAdminClient();
  const [orders, payments, allocations] = await Promise.all([
    db.from("sales_orders").select("id,order_number,status,payment_status,total_amount,paid_amount,currency,created_at,sales_order_items(product_name_snapshot,quantity)").eq("customer_profile_id", profileId).order("created_at", { ascending: false }),
    db.from("sale_payments").select("id,amount,payment_date,method,status,sales_orders!inner(customer_profile_id)").eq("sales_orders.customer_profile_id", profileId).order("payment_date", { ascending: false }),
    db.from("order_serial_allocations").select("id,status,serial_numbers(sen_serial,manufacturer_serial),sales_orders!inner(customer_profile_id)").eq("sales_orders.customer_profile_id", profileId).in("status", ["packed", "shipped", "delivered"]).order("allocated_at", { ascending: false }),
  ]);
  for (const [name, result] of Object.entries({ orders, payments, allocations })) assertResult(`Unable to load customer sales ${name}.`, result.error);
  return { orders: orders.data ?? [], payments: payments.data ?? [], allocations: allocations.data ?? [] };
}
