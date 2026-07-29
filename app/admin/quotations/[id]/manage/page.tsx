import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationOperations } from "@/components/quotations/QuotationOperations";
import { requirePermission } from "@/lib/auth/permissions";
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
    customerCreation?: string;
  }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("quotations.view");
  const [{ id }, notice] = await Promise.all([params, searchParams]);
  const db = createSupabaseAdminClient();
  await db.rpc("queue_quotation_expiry_notifications");
  const { data: quotation, error } = await db
    .from("quotation_requests")
    .select(
      "id,reference,profile_id,status,subject,company_name,customer_tax_identification_number,required_by,expiration_date,subtotal,discount_amount,tax_amount,total_amount,currency,terms_and_conditions,payment_terms,delivery_information,customer_notes,internal_notes,assigned_to,approved_at,converted_at,converted_order_id,converted_invoice_id,profiles!quotation_requests_profile_id_fkey(id,full_name,email,role)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !quotation) notFound();
  const customer = quotation.profiles as unknown as {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
  };
  const [{ data: staff }, { data: warehouses }, { data: contacts }, { data: auditRows }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id,full_name,email,role")
        .in("role", ["admin", "employee"])
        .eq("status", "active")
        .order("full_name"),
      db
        .from("warehouses")
        .select("id,code,name")
        .eq("is_active", true)
        .order("name"),
      db
        .from("crm_contacts")
        .select("id")
        .eq("profile_id", quotation.profile_id)
        .limit(1),
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
        warehouses={warehouses ?? []}
        audits={audits}
        customerExists={Boolean(contacts?.length)}
        customerCreationRequired={notice.customerCreation === "required"}
        capabilities={{
          edit: can("quotations.edit"),
          assign: can("quotations.assign"),
          requestInformation: can("quotations.edit"),
          approve: can("quotations.approve"),
          reject: can("quotations.reject"),
          print: can("quotations.print"),
          convert: can("quotations.convert_to_invoice"),
          createCustomer: can("quotations.create_customer"),
          viewHistory: can("quotations.view_history"),
        }}
        success={notice.success}
        error={notice.error}
      />
    </DashboardShell>
  );
}
