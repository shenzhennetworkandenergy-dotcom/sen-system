import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { getAdvancePayment } from "@/lib/murshida-manzil/repository";
import { buildAdvanceMoneyReceiptData } from "@/lib/murshida-manzil/receipts";
import { AdvanceMoneyReceiptDocument } from "@/app/admin/murshida-manzil/_components/AdvanceMoneyReceiptDocument";

export const dynamic = "force-dynamic";

export default async function AdvanceReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile(["admin"]);
  const advance = await getAdvancePayment((await params).id).catch(() => null);
  if (!advance) notFound();
  return <AdvanceMoneyReceiptDocument receipt={buildAdvanceMoneyReceiptData({ id: advance.id, tenantName: advance.tenantName, tenantPhone: advance.tenantPhone, unitCodeSnapshot: advance.unit_code_snapshot, unitDescriptionSnapshot: advance.unit_description_snapshot, amount: Number(advance.amount), defaultMonthlyAdjustment: Number(advance.default_monthly_advance_adjustment ?? 0), paymentDate: advance.payment_date })} />;
}
