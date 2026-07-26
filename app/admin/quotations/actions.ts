"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";

const statuses = new Set([
  "submitted",
  "reviewing",
  "quoted",
  "accepted",
  "declined",
  "closed",
]);

export async function updateQuotationAction(
  quotationId: string,
  form: FormData,
) {
  const { profile } = await requirePermission("quotations.edit");
  const status = String(form.get("status") ?? "");
  if (!statuses.has(status)) {
    redirect("/admin/quotations?error=Invalid%20quotation%20status.");
  }

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("quotation_requests")
    .update({
      status,
      assigned_to: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotationId);
  if (error) {
    redirect("/admin/quotations?error=Unable%20to%20update%20quotation.");
  }

  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "quotation.status_updated",
    module: "quotations",
    entityType: "quotation_request",
    entityId: quotationId,
    description: `Quotation status changed to ${status}.`,
    newValues: { status },
  });
  revalidatePath("/admin/quotations");
  redirect("/admin/quotations?success=Quotation%20updated.");
}
