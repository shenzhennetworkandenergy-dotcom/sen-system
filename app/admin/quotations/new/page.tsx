import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { getVisibleCustomerIds } from "@/lib/customers/visibility";
import { defaultQuotationExpiration } from "@/lib/quotations/validity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; customer?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("quotations.create");
  const params = await searchParams;
  const db = createSupabaseAdminClient();
  const visibleCustomerIds = await getVisibleCustomerIds(profile);
  const activeCustomers = () => db
    .from("profiles")
    .select("id,full_name,email,phone,company_name")
    .eq("role", "customer")
    .eq("status", "active")
    .is("archived_at", null);
  let customerQuery = activeCustomers()
    .order("full_name")
    .limit(500);
  if (visibleCustomerIds !== null) {
    customerQuery = customerQuery.in("id", visibleCustomerIds.length ? visibleCustomerIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  const selectedId = typeof params.customer === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.customer)
    && (visibleCustomerIds === null || visibleCustomerIds.includes(params.customer)) ? params.customer : "";

  const [
    { data: customers, error: customerError },
    { data: products, error: productError },
    { data: variations, error: variationError },
    selected,
  ] = await Promise.all([
    customerQuery,
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
    selectedId ? activeCustomers().eq("id", selectedId).maybeSingle() : null,
  ]);
  const loadError = customerError ?? productError ?? variationError ?? selected?.error;
  const customerOptions = selected?.data
    ? [selected.data, ...(customers ?? []).filter((customer) => customer.id !== selectedId)] : customers ?? [];

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
          customers={customerOptions}
          initialCustomerId={selected?.data?.id}
          products={products ?? []}
          variations={variations ?? []}
          defaultExpiration={defaultQuotationExpiration()}
          canCreateCustomer={profile.role === "admin"}
        />
      )}
    </DashboardShell>
  );
}
