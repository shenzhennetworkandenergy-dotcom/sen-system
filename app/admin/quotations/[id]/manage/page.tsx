import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationOperations } from "@/components/quotations/QuotationOperations";
import { requireQuotationView } from "@/lib/quotations/access";
import { resolveLinkedSale } from "@/lib/quotations/traceability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ManageQuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
}) {
  await connection();
  const { profile, permissions, quotationViewScope } =
    await requireQuotationView();
  const [{ id }, notice] = await Promise.all([params, searchParams]);
  const db = createSupabaseAdminClient();
  await db.rpc("queue_quotation_expiry_notifications");
  let quotationQuery = db
    .from("quotation_requests")
    .select(
      "id,reference,profile_id,status,subject,company_name,customer_tax_identification_number,required_by,expiration_date,subtotal,discount_amount,tax_amount,total_amount,currency,terms_and_conditions,payment_terms,delivery_information,customer_notes,internal_notes,assigned_to,approved_at,converted_at,converted_order_id,converted_invoice_id,created_by,profiles!quotation_requests_profile_id_fkey(id,full_name,email,role)",
    )
    .eq("id", id);
  if (quotationViewScope === "own") {
    quotationQuery = quotationQuery.eq("created_by", profile.id);
  }
  const { data: quotation, error } = await quotationQuery.maybeSingle();
  if (error || !quotation) notFound();
  const linkedSale = await resolveLinkedSale(
    quotation.converted_order_id,
    (saleId) => db
      .from("sales_orders")
      .select("id,order_number")
      .eq("id", saleId)
      .maybeSingle(),
  );
  const customer = quotation.profiles as unknown as {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
  };
  const [{ data: staff }, { data: auditRows }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id,full_name,email,role")
        .in("role", ["admin", "employee"])
        .eq("status", "active")
        .order("full_name"),
      db
        .from("audit_logs")
        .select("id,action,description,created_at,actor_id")
        .eq("entity_type", "quotation_request")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
  const actorIds = [
    ...new Set((auditRows ?? []).map((row) => row.actor_id).filter(Boolean)),
  ] as string[];
  const { data: actors } = actorIds.length
    ? await db.from("profiles").select("id,full_name,email").in("id", actorIds)
    : { data: [] };
  const actorMap = new Map((actors ?? []).map((actor) => [actor.id, actor]));
  const audits = (auditRows ?? []).map((row) => ({
    ...row,
    actor: row.actor_id ? (actorMap.get(row.actor_id) ?? null) : null,
  }));
  const administrator = profile.role === "admin";
  const can = (permission: string) =>
    administrator || permissions.has(permission);

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Quotation management"
      subtitle="Review, approve, assign, convert and audit a customer quotation."
    >
      <QuotationOperations
        quotation={quotation}
        customer={customer}
        staff={staff ?? []}
        audits={audits}
        linkedSale={linkedSale}
        capabilities={{
          edit: can("quotations.edit"),
          assign: can("quotations.assign"),
          approve: can("quotations.approve"),
          reject: can("quotations.reject"),
          issue: can("quotations.send"),
          recordCustomerOutcome: can("quotations.record_customer_outcome"),
          print: can("quotations.print"),
          convertToSale: can("quotations.convert_to_sale") && can("sales.create"),
          viewHistory: can("quotations.view_history"),
        }}
        success={notice.success}
        error={notice.error}
      />
    </DashboardShell>
  );
}
