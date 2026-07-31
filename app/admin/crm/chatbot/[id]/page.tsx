import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { updateChatbotInquiryStatusAction } from "../actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import {
  normalizeInquirySearchHistory,
  normalizeInquirySelectedProducts,
} from "@/lib/chatbot/inquiry-display";
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
const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-BD")}`;
  }
};

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
  const selectedProducts = normalizeInquirySelectedProducts(inquiry.selected_products);
  const searchHistory = normalizeInquirySearchHistory(inquiry.search_history);
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Selected products</h2>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">
                {selectedProducts.length} selected
              </span>
            </div>
            {selectedProducts.length ? (
              <div className="mt-3 grid gap-3">
                {selectedProducts.map((product, index) => (
                  <div key={`${product.id ?? product.name}-${index}`} className="rounded-xl border bg-[var(--muted-surface)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold leading-6">
                          {product.slug ? (
                            <Link href={`/products/${product.slug}`} target="_blank" className="hover:text-[var(--primary)] hover:underline">
                              {product.name} ↗
                            </Link>
                          ) : product.name}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--muted-text)]">
                          {[product.sku && `SKU: ${product.sku}`, product.modelNumber && `Model: ${product.modelNumber}`]
                            .filter(Boolean).join(" · ") || "No SKU or model recorded"}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                        product.available === false
                          ? "bg-red-100 text-red-800"
                          : product.available === true
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-700"
                      }`}>
                        {product.available === false ? "Out of stock" : product.available === true ? "Available" : "Stock not recorded"}
                      </span>
                    </div>
                    {product.price !== null ? (
                      <p className="mt-3 font-bold text-[var(--primary)]">
                        {money(product.price, product.currency)}
                        {product.priceMax !== null && product.priceMax > product.price
                          ? ` – ${money(product.priceMax, product.currency)}`
                          : ""}
                      </p>
                    ) : null}
                    {product.variationLabel ? <p className="mt-2 text-sm"><b>Variation:</b> {product.variationLabel}</p> : null}
                    {product.attributes.length ? (
                      <dl className="mt-3 flex flex-wrap gap-2">
                        {product.attributes.map(([name, value]) => (
                          <div key={`${name}-${value}`} className="rounded-lg border bg-white px-3 py-1.5 text-xs">
                            <dt className="inline font-bold">{name}: </dt>
                            <dd className="inline">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {product.shortDescription ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">{product.shortDescription}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-[var(--muted-surface)] p-4 text-[var(--muted-text)]">
                No product was selected for this inquiry.
              </p>
            )}
          </article>
          <article className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-bold">Search timeline</h2>
            {searchHistory.length ? (
              <ol className="mt-4 space-y-4">
                {searchHistory.map((event, index) => (
                  <li key={`${event.sequence}-${event.query}-${index}`} className="relative border-l-2 border-sky-200 pl-5">
                    <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-sky-500 ring-4 ring-white" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold">“{event.query}”</p>
                      <span className="text-xs text-[var(--muted-text)]">
                        Search {index + 1}{event.recordedAt ? ` · ${dateTime(event.recordedAt)}` : ""}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-[var(--muted-text)]">
                      {event.results.length} matching product{event.results.length === 1 ? "" : "s"}
                    </p>
                    {event.results.length ? (
                      <ul className="mt-2 grid gap-1.5 text-sm">
                        {event.results.map((result, resultIndex) => (
                          <li key={`${result.id ?? result.name}-${resultIndex}`} className="rounded-lg bg-[var(--muted-surface)] px-3 py-2">
                            {result.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--muted-text)]">No matching products were returned.</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-xl bg-[var(--muted-surface)] p-4 text-[var(--muted-text)]">
                No search history was recorded.
              </p>
            )}
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
