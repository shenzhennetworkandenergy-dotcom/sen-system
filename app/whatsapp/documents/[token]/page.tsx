import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QuotationDocumentPage from "@/app/admin/quotations/[id]/page";
import SaleDocumentPage from "@/app/admin/sales/[saleId]/documents/[documentId]/page";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyWhatsappDocumentToken } from "@/lib/whatsapp/document-link";
import { whatsappInboxConfiguration } from "@/lib/whatsapp/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SEN document", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharedWhatsappDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const config = whatsappInboxConfiguration();
  const grant = config && verifyWhatsappDocumentToken(token, config.appSecret);
  if (!grant) notFound();

  const db = createSupabaseAdminClient();
  const { data: customer, error } = await db.from("profiles").select("id")
    .eq("id", grant.customerId).eq("role", "customer").eq("status", "active").is("archived_at", null).maybeSingle();
  if (error || !customer) notFound();

  if (grant.kind === "quotation") return <QuotationDocumentPage
    params={Promise.resolve({ id: grant.id })} sharedCustomerId={grant.customerId} />;

  const { data: invoice, error: invoiceError } = await db.from("sale_documents").select("order_id")
    .eq("id", grant.id).eq("document_type", "invoice").eq("status", "generated").maybeSingle();
  if (invoiceError || !invoice) notFound();
  return <SaleDocumentPage params={Promise.resolve({ saleId: invoice.order_id, documentId: grant.id })} sharedCustomerId={grant.customerId} />;
}
