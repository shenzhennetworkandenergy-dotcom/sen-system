import "server-only";

import { getUnreadChatbotInquiryCount } from "@/lib/crm/chatbot-inquiries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type DashboardWorkCounts = Record<string, number>;

async function unresolvedCount(
  table: string,
  statuses: readonly string[],
): Promise<number> {
  const db = createSupabaseAdminClient();
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("status", [...statuses]);
  if (error) {
    console.error("Dashboard work count unavailable", {
      table,
      code: error.code,
    });
    return 0;
  }
  return count ?? 0;
}

export async function getDashboardWorkCounts(): Promise<DashboardWorkCounts> {
  const [crm, orders, support, quotations, shipments, purchasing] =
    await Promise.all([
      getUnreadChatbotInquiryCount(),
      unresolvedCount("sales_orders", [
        "draft",
        "confirmed",
        "processing",
        "partially_allocated",
        "allocated",
        "packing",
        "partially_shipped",
      ]),
      unresolvedCount("support_conversations", ["open", "waiting_sen"]),
      unresolvedCount("quotation_requests", ["submitted", "reviewing"]),
      unresolvedCount("shipments", [
        "draft",
        "confirmed",
        "packing",
        "ready",
        "dispatched",
        "in_transit",
        "arrived",
        "out_for_delivery",
      ]),
      unresolvedCount("purchase_orders", [
        "draft",
        "pending_approval",
        "approved",
        "ordered",
        "ready_for_shipment",
        "shipped",
        "received",
        "partially_received",
      ]),
    ]);
  return { crm, orders, support, quotations, shipments, purchasing };
}
