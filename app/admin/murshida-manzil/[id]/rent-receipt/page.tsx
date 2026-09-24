import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { getRentTransaction } from "@/lib/murshida-manzil/repository";
import { buildRentReceiptData, mapRentTransactionRowToSnapshot } from "@/lib/murshida-manzil/receipts";
import { RentReceiptDocument } from "@/app/admin/murshida-manzil/_components/RentReceiptDocument";

export const dynamic = "force-dynamic";

export default async function RentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile(["admin"]);
  const transaction = await getRentTransaction((await params).id).catch(() => null);
  if (!transaction) notFound();
  const receiptSnapshot = mapRentTransactionRowToSnapshot({
    id: transaction.id,
    money_receipt_number: transaction.receiptNumber,
    rent_receipt_number: transaction.rentReceiptNumber,
    tenant_name: transaction.tenantName,
    tenant_phone: transaction.tenantPhone,
    unit_code_snapshot: transaction.unit_code_snapshot,
    unit_description_snapshot: transaction.unit_description_snapshot ?? null,
    rent_month: transaction.rent_month,
    rent_year: transaction.rent_year,
    monthly_rent: transaction.monthly_rent,
    actual_money_received: transaction.actual_money_received,
    advance_adjusted: transaction.advance_adjusted,
    total_rent_settled: transaction.total_rent_settled,
    advance_balance_before: transaction.advance_balance_before,
    advance_balance_after: transaction.advance_balance_after,
    payment_date: transaction.payment_date,
    payment_method: transaction.payment_method,
    notes: transaction.notes ?? null,
  });
  return <RentReceiptDocument receipt={buildRentReceiptData(receiptSnapshot)} />;
}
