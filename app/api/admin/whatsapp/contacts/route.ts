import { getEffectivePermissions } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { literalQuotationPattern } from "@/lib/quotations/list-filters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { whatsappDirectoryForActor } from "@/lib/whatsapp/directory";
import { normalizeRecipient } from "@/lib/whatsapp/messages";
import { isWhatsappSameOrigin } from "@/lib/whatsapp/security";
import { hasCompanyWhatsappAccess, readWhatsappJson, whatsappInboxConfiguration } from "@/lib/whatsapp/server";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 30;

function contactFields(data: unknown) {
  if (!data || typeof data !== "object" || !("recipient" in data) || !("name" in data)
    || typeof data.recipient !== "string" || data.recipient.length > 40
    || typeof data.name !== "string" || data.name.length > 160 || !data.name.trim() || /[\0\r\n]/.test(data.name)) {
    throw new Error("Enter a name and a valid WhatsApp number.");
  }
  return { recipient: normalizeRecipient(data.recipient), display_name: data.name.trim() };
}

export async function POST(request: Request) {
  if (!isWhatsappSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const { profile } = await getCurrentProfile();
  if (!profile || !(await hasCompanyWhatsappAccess(profile))) return json({ error: "WhatsApp permission required." }, 403);
  const config = whatsappInboxConfiguration();
  if (!config) return json({ error: "The WhatsApp inbox has not been connected yet." }, 503);

  let data: Record<string, unknown>;
  try {
    const body = await readWhatsappJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
    data = body as Record<string, unknown>;
  } catch { return json({ error: "Invalid WhatsApp contacts request." }, 400); }
  const query = typeof data.query === "string" ? data.query.trim() : "";
  if (query.length > 80) return json({ error: "Search with up to 80 characters." }, 400);
  const db = createSupabaseAdminClient();
  try {
    if (data.mode === "recent" || data.mode === "contacts") {
      const offset = data.offset ?? 0;
      if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
        return json({ error: "Invalid contacts page." }, 400);
      }
      const contacts = await whatsappDirectoryForActor(profile, config.phoneId, {
        recent: data.mode === "recent", query, offset,
      });
      const canQuote = profile.role === "admin" || (await getEffectivePermissions(profile.id)).has("quotations.create");
      return json({ contacts: contacts.slice(0, PAGE_SIZE), more: contacts.length > PAGE_SIZE, canQuote });
    }

    if (profile.role !== "admin") return json({ error: "An administrator must manage WhatsApp contacts." }, 403);
    const activeCustomers = () => db.from("profiles").select("id,full_name,company_name")
      .eq("role", "customer").eq("status", "active").is("archived_at", null);

    if (data.mode === "customers") {
      if (query.length < 2) return json({ customers: [] });
      const matches = await Promise.all(
        (["full_name", "company_name"] as const).map((field) =>
          activeCustomers().ilike(field, literalQuotationPattern(query)).order(field).order("id").limit(10)),
      );
      if (matches.some((answer) => answer.error)) throw new Error("Customer lookup failed");
      const customers = new Map(matches.flatMap((answer) => (answer.data ?? []).map((customer) => [customer.id, customer] as const)));
      return json({ customers: [...customers.values()] });
    }

    if (data.mode === "save") {
      let contact: ReturnType<typeof contactFields>;
      try { contact = contactFields(data); } catch (error) { return json({ error: (error as Error).message }, 400); }
      const customerId = data.customerId ?? null;
      if (customerId !== null) {
        if (typeof customerId !== "string" || !uuid.test(customerId)) return json({ error: "Choose a valid ERP customer." }, 400);
        const { data: customer, error } = await activeCustomers().eq("id", customerId).maybeSingle();
        if (error) throw error;
        if (!customer) return json({ error: "Choose an active ERP customer." }, 400);
      }
      const { error } = await db.from("company_whatsapp_contacts").upsert({
        phone_number_id: config.phoneId, ...contact, customer_profile_id: customerId,
        updated_by: profile.id, updated_at: new Date().toISOString(),
      }, { onConflict: "phone_number_id,recipient" });
      if (error) throw error;
      return json({ saved: true });
    }

    if (data.mode === "import") {
      if (!Array.isArray(data.contacts) || !data.contacts.length || data.contacts.length > 100) {
        return json({ error: "Import up to 100 reviewed contacts in each batch." }, 400);
      }
      let contacts: ReturnType<typeof contactFields>[];
      try { contacts = data.contacts.map(contactFields); } catch (error) { return json({ error: (error as Error).message }, 400); }
      const unique = [...new Map(contacts.map((contact) => [contact.recipient, contact])).values()];
      const { data: inserted, error } = await db.from("company_whatsapp_contacts").upsert(
        unique.map((contact) => ({ phone_number_id: config.phoneId, ...contact, updated_by: profile.id })),
        { onConflict: "phone_number_id,recipient", ignoreDuplicates: true },
      ).select("recipient");
      if (error) throw error;
      return json({ added: inserted?.length ?? 0 });
    }
    return json({ error: "Unknown WhatsApp contacts action." }, 400);
  } catch { return json({ error: "Could not complete the WhatsApp contacts request. Try again." }, 503); }
}
