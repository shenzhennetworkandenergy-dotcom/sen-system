import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { defaultQuotationExpiration } from "@/lib/quotations/validity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("quotations.create");
  const params = await searchParams;
  const db = createSupabaseAdminClient();

  const [
    { data: customers, error: customerError },
    { data: products, error: productError },
    { data: variations, error: variationError },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("id,full_name,email,phone,company_name")
      .eq("role", "customer")
      .eq("status", "active")
      .order("full_name")
      .limit(500),
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
  const loadError = customerError ?? productError ?? variationError;

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Create quotation"
      subtitle="Prepare a customer quotation with invoice-style product selection and pricing."
    >
      {params.error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          {params.error}
        </p>
      ) : null}
      {params.success ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          {params.success}
        </p>
      ) : null}
      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          Unable to load quotation options: {loadError.message}
        </p>
      ) : (
        <QuotationBuilder
          customers={customers ?? []}
          products={products ?? []}
          variations={variations ?? []}
          defaultExpiration={defaultQuotationExpiration()}
        />
      )}
    </DashboardShell>
  );
}
