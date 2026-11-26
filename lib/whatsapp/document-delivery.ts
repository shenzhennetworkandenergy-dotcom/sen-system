import "server-only";

import { getEffectivePermissions } from "@/lib/auth/permissions";
import type { Profile } from "@/lib/auth/session";
import { assertCustomerVisibleToActor } from "@/lib/customers/visibility";
import { canOpenQuotationDocument, resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { canAccessSaleUnderScope, resolveSalesVisibilityScope } from "@/lib/sales/visibility";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { whatsappDirectory } from "./directory";
import type { WhatsappDocument } from "./document-link";
import { canSendCompanyWhatsapp, normalizeRecipient } from "./messages";

export async function whatsappDocumentRecipient(actor: Profile, document: WhatsappDocument, phoneId: string) {
  const permissions = actor.role === "admin" ? new Set<string>() : await getEffectivePermissions(actor.id);
  if (!canSendCompanyWhatsapp(actor, permissions)) return null;
  const db = createSupabaseAdminClient();
  let reference: string;
  let customerId: string;
  if (document.kind === "quotation") {
    if (!canOpenQuotationDocument(actor.role, permissions)) return null;
    let query = db.from("quotation_requests").select("profile_id,reference")
      .eq("id", document.id).in("status", ["quoted", "accepted"]);
    if (resolveQuotationViewScope(actor.role, permissions) === "own") query = query.eq("created_by", actor.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data?.profile_id) return null;
    reference = data.reference;
    customerId = data.profile_id;
  } else {
    const scope = resolveSalesVisibilityScope({ role: actor.role, status: actor.status, profileId: actor.id, permissions });
    if (scope.kind === "none") return null;
    const { data, error } = await db.from("sale_documents")
      .select("document_number,sale:sales_orders!inner(customer_profile_id,created_by,status)")
      .eq("id", document.id).eq("document_type", "invoice").eq("status", "generated").maybeSingle();
    if (error) throw error;
    const sale = data?.sale as unknown as { customer_profile_id: string | null; created_by: string; status: string } | null;
    if (!data || !sale?.customer_profile_id || sale.status === "cancelled" || !canAccessSaleUnderScope(scope, sale.created_by)) return null;
    reference = data.document_number;
    customerId = sale.customer_profile_id;
  }

  if (!(await assertCustomerVisibleToActor(actor, customerId).then(() => true, () => false))) return null;
  const { data: customer, error } = await db.from("profiles").select("phone,full_name,company_name")
    .eq("id", customerId).eq("role", "customer").eq("status", "active").is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!customer?.phone) return null;
  let recipient: string;
  try { recipient = normalizeRecipient(customer.phone); } catch { return null; }
  const [contact] = await whatsappDirectory(phoneId, null, { recipient });
  if (contact?.customer_profile_id !== customerId || contact.ambiguous) return null;
  return { recipient, customerId, reference, name: customer.full_name || customer.company_name || "Customer" };
}
