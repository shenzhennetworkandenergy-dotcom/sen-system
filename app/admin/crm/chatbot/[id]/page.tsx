import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { updateChatbotInquiryStatusAction } from "../actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { chatbotInquiryStatuses } from "@/lib/chatbot/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-BD", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Dhaka",
      }).format(new Date(value))
    : "—";
const formattedJson = (value: unknown) =>
  JSON.stringify(Array.isArray(value) ? value : [], null, 2);

export default async function ChatbotInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("crm.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: inquiry, error } = await createSupabaseAdminClient()
    .from("crm_chatbot_inquiries")
    .select("id,inquiry_number,product_query,search_history,selected_products,phone_number,whatsapp,status,consent_to_contact,source_page,language,created_at,updated_at,completed_at,read_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load this Product Assistant inquiry.");
  if (!inquiry) notFound();

  const canEdit = profile.role === "admin" || permissions.has("crm.edit");
  const facts = [
    ["Reference", inquiry.inquiry_number],
    ["Status", label(inquiry.status)],
    ["Phone", inquiry.phone_number ?? "—"],
    ["WhatsApp", inquiry.whatsapp ?? "—"],
    ["Consent to contact", inquiry.consent_to_contact ? "Yes" : "No"],
    ["Language", inquiry.language],
    ["Source page", inquiry.source_page],
    ["Created", dateTime(inquiry.created_at)],
    ["Updated", dateTime(inquiry.updated_at)],
    ["Completed", dateTime(inquiry.completed_at)],
  ];

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={`Product Assistant inquiry ${inquiry.inquiry_number}`}
      subtitle="Review the customer's product request, selected products, search history, and contact details."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin/crm/chatbot" className="rounded-lg border bg-[var(--surface)] px-4 py-2 font-bold">← All inquiries</Link>
        {canEdit ? (
          <form action={updateChatbotInquiryStatusAction.bind(null, inquiry.id)} className="flex flex-wrap gap-2">
            <select name="status" defaultValue={inquiry.status} className="rounded-lg border bg-white px-3 py-2">
              {chatbotInquiryStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
            </select>
            <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">Update status</button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(19rem,.6fr)]">
        <section className="space-y-3">
          <article className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-bold">Customer message</h2>
            <p className="mt-3 whitespace-pre-wrap text-base leading-7">{inquiry.product_query}</p>
          </article>
          <article className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-bold">Selected products</h2>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-[var(--muted-surface)] p-4 text-sm leading-6">{formattedJson(inquiry.selected_products)}</pre>
          </article>
          <article className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-bold">Search history</h2>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-[var(--muted-surface)] p-4 text-sm leading-6">{formattedJson(inquiry.search_history)}</pre>
          </article>
        </section>
        <aside className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="text-lg font-bold">Inquiry information</h2>
          <dl className="mt-3 space-y-4">
            {facts.map(([name, value]) => (
              <div key={name} className="border-b pb-3 last:border-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted-text)]">{name}</dt>
                <dd className="mt-1 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </DashboardShell>
  );
}
