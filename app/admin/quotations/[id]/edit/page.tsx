import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import {
  QuotationBuilder,
  type DraftQuotationValues,
} from "@/components/quotations/QuotationBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function EditDraftQuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("quotations.edit");
  const quotationViewScope = resolveQuotationViewScope(profile.role, permissions);
  if (!quotationViewScope) notFound();
  const [{ id }, notice] = await Promise.all([params, searchParams]);
  const db = createSupabaseAdminClient();
  let quotationQuery = db
    .from("quotation_requests")
    .select(
      "id,reference,status,subject,message,company_name,customer_tax_identification_number,required_by,expiration_date,discount_amount,tax_amount,terms_and_conditions,payment_terms,delivery_information,customer_notes,internal_notes,updated_at,created_by,profiles!quotation_requests_profile_id_fkey(id,full_name,email,phone,company_name),quotation_request_items(product_id,variation_id,quantity,unit_price,discount_amount,tax_amount)",
    )
    .eq("id", id)
    .eq("status", "draft");
  if (quotationViewScope === "own") {
    quotationQuery = quotationQuery.eq("created_by", profile.id);
  }
  const { data: quotation, error } = await quotationQuery.maybeSingle();
  if (error || !quotation) notFound();

  const items = quotation.quotation_request_items ?? [];
  const existingProductIds = [...new Set(items.map((item) => item.product_id))];
  const existingVariationIds = [
    ...new Set(
      items
        .map((item) => item.variation_id)
        .filter((variationId): variationId is string => Boolean(variationId)),
    ),
  ];
  const [
    { data: activeProducts, error: activeProductError },
    { data: activeVariations, error: activeVariationError },
  ] = await Promise.all([
    db
      .from("products")
      .select(
        "id,name,sku,model_number,brand_id,product_type,regular_price,sale_price,serial_tracking_required",
      )
      .eq("status", "active")
      .order("name")
      .limit(1000),
    db
      .from("product_variations")
      .select("id,product_id,name:combination_key,sku,regular_price,sale_price")
      .eq("status", "active")
      .order("combination_key")
      .limit(2000),
  ]);
  if (activeProductError || activeVariationError) notFound();

  const activeProductIds = new Set((activeProducts ?? []).map((product) => product.id));
  const activeVariationIds = new Set(
    (activeVariations ?? []).map((variation) => variation.id),
  );
  const missingProductIds = existingProductIds.filter(
    (productId) => !activeProductIds.has(productId),
  );
  const missingVariationIds = existingVariationIds.filter(
    (variationId) => !activeVariationIds.has(variationId),
  );
  const [{ data: existingProducts }, { data: existingVariations }] =
    await Promise.all([
      missingProductIds.length
        ? db
            .from("products")
            .select(
              "id,name,sku,model_number,brand_id,product_type,regular_price,sale_price,serial_tracking_required",
            )
            .in("id", missingProductIds)
        : Promise.resolve({ data: [] }),
      missingVariationIds.length
        ? db
            .from("product_variations")
            .select("id,product_id,name:combination_key,sku,regular_price,sale_price")
            .in("id", missingVariationIds)
        : Promise.resolve({ data: [] }),
    ]);
  const products = [
    ...(activeProducts ?? []),
    ...(existingProducts ?? []),
  ];
  const variations = [
    ...(activeVariations ?? []),
    ...(existingVariations ?? []),
  ];
  const customer = quotation.profiles as unknown as {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    company_name: string | null;
  } | null;
  if (!customer) notFound();
  const initialDraft: DraftQuotationValues = {
    id: quotation.id,
    reference: quotation.reference,
    updatedAt: quotation.updated_at,
    subject: quotation.subject ?? "",
    companyName: quotation.company_name ?? "",
    customerTaxIdentificationNumber:
      quotation.customer_tax_identification_number ?? "",
    requiredBy: quotation.required_by ?? "",
    expirationDate: quotation.expiration_date ?? "",
    discountAmount: Number(quotation.discount_amount ?? 0),
    taxAmount: Number(quotation.tax_amount ?? 0),
    termsAndConditions: quotation.terms_and_conditions ?? "",
    paymentTerms: quotation.payment_terms ?? "",
    deliveryInformation: quotation.delivery_information ?? "",
    customerNotes: quotation.customer_notes ?? quotation.message ?? "",
    internalNotes: quotation.internal_notes ?? "",
    items: items.map((item) => ({
      productId: item.product_id,
      variationId: item.variation_id,
      quantity: item.quantity,
      unitPrice: item.unit_price ?? 0,
      discountAmount: item.discount_amount ?? 0,
      taxAmount: item.tax_amount ?? 0,
    })),
  };

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={`Edit draft ${quotation.reference}`}
      subtitle="Update the customer quotation while it remains a Draft."
    >
      {notice.error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          {notice.error}
        </p>
      ) : null}
      {notice.success ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          {notice.success}
        </p>
      ) : null}
      <QuotationBuilder
        customers={[]}
        products={products}
        variations={variations}
        defaultExpiration={initialDraft.expirationDate}
        mode="edit"
        fixedCustomer={customer}
        initialDraft={initialDraft}
      />
    </DashboardShell>
  );
}
