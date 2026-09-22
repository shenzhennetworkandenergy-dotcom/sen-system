import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  MoneyReceiptDocument,
  type MoneyReceiptRecord,
} from "@/components/sales/MoneyReceiptDocument";
import { requirePermission } from "@/lib/auth/permissions";
import { assertReceiptSnapshotShape } from "@/lib/sales/money-receipt";
import {
  canAccessSale,
  resolveSalesViewScope,
} from "@/lib/sales/money-receipt-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SaleMoneyReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string; paymentId: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("sales.money_receipt");
  const { saleId, paymentId } = await params;
  const db = createSupabaseAdminClient();

  const { data: sale, error: saleError } = await db
    .from("sales_orders")
    .select("id,order_number,created_by")
    .eq("id", saleId)
    .maybeSingle();
  if (saleError || !sale) notFound();

  const scope = resolveSalesViewScope(profile.role, permissions);
  if (!canAccessSale(scope, profile.id, sale.created_by ?? null)) notFound();

  const { data, error } = await db
    .from("sale_money_receipts")
    .select("id,payment_id,order_id,receipt_number,receipt_date,created_at,snapshot")
    .eq("payment_id", paymentId)
    .eq("order_id", saleId)
    .maybeSingle();
  if (error || !data) notFound();

  try {
    assertReceiptSnapshotShape(data.snapshot);
  } catch {
    notFound();
  }
  const receipt = data as MoneyReceiptRecord;
  if (
    receipt.payment_id !== paymentId ||
    receipt.order_id !== saleId ||
    receipt.snapshot.sale.id !== saleId ||
    receipt.snapshot.payment.id !== paymentId ||
    receipt.snapshot.payment.status !== "received"
  ) {
    notFound();
  }

  return <MoneyReceiptDocument receipt={receipt} saleHref={`/admin/sales/${saleId}`} />;
}
