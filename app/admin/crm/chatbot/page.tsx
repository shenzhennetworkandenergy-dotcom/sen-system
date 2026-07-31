import { connection } from "next/server";
import Link from "next/link";

import {
  openChatbotInquiryAction,
  updateChatbotInquiryStatusAction,
} from "./actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { chatbotInquiryStatuses } from "@/lib/chatbot/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateTime = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(value)) : "—";
const selectedProductNames = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (item as Record<string, unknown>).name)
    .filter((name): name is string => typeof name === "string")
    .join("\n") || "—";
const searchQueries = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (item as Record<string, unknown>).query)
    .filter((query): query is string => typeof query === "string")
    .join(" → ") || "—";

export default async function ChatbotInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; success?: string; error?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("crm.view");
  const params = await searchParams;
  const status = chatbotInquiryStatuses.find((item) => item === params.status);
  const queryText = (params.q ?? "").replace(/[%_(),.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const page = Math.max(1, Number(params.page) || 1);
  const size = 40;
  let query = createSupabaseAdminClient()
    .from("crm_chatbot_inquiries")
    .select("id,inquiry_number,product_query,search_history,selected_products,phone_number,whatsapp,status,consent_to_contact,source_page,created_at,completed_at,read_at,read_by", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (status) query = query.eq("status", status);
  if (queryText) query = query.or(`inquiry_number.ilike.%${queryText}%,product_query.ilike.%${queryText}%,phone_number.ilike.%${queryText}%,whatsapp.ilike.%${queryText}%`);
  const { data, count, error } = await query;
  const canEdit = profile.role === "admin" || permissions.has("crm.edit");

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Product Assistant inquiries"
      subtitle="Review consent-based product sourcing requests collected by the bilingual website assistant."
    >
      {params.success ? <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">{params.success}</p> : null}
      {params.error ? <p className="mb-3 rounded-xl bg-red-50 p-3 text-red-900">{params.error}</p> : null}
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href="/admin/crm" className="rounded-lg border bg-[var(--surface)] px-4 py-2 font-bold">CRM overview</Link>
        <Link href="/admin/crm/chatbot/export" className="rounded-lg border bg-[var(--surface)] px-4 py-2 font-bold">Export inquiries CSV</Link>
      </div>
      <form className="mb-3 grid gap-2 rounded-2xl border bg-[var(--surface)] p-3 md:grid-cols-[1fr_14rem_auto]">
        <input name="q" defaultValue={params.q} placeholder="Reference, request or phone" className="rounded-lg border px-3 py-2" />
        <select name="status" defaultValue={status ?? ""} className="rounded-lg border px-3 py-2">
          <option value="">All statuses</option>
          {chatbotInquiryStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}
        </select>
        <button className="rounded-lg border px-4 py-2 font-bold">Apply filters</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-[var(--surface)]">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]">
            <tr>{["Reference","Product request","Selected products","Search history","Phone","WhatsApp","Status","Consent","Source page","Created","Completed",""].map((head) => <th key={head} className="p-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {(data ?? []).map((item) => (
              <tr key={item.id} className={`border-t align-top ${item.read_at ? "" : "bg-red-50/70 font-medium"}`}>
                <td className="p-3 font-semibold">
                  <span>{item.inquiry_number}</span>
                  {!item.read_at ? <span className="ml-2 inline-flex rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Unread</span> : null}
                </td>
                <td className="max-w-md whitespace-pre-wrap p-3">{item.product_query}</td>
                <td className="max-w-md whitespace-pre-wrap p-3">{selectedProductNames(item.selected_products)}</td>
                <td className="max-w-sm p-3">{searchQueries(item.search_history)}</td>
                <td className="p-3">{item.phone_number ?? "—"}</td>
                <td className="p-3">{item.whatsapp ?? "—"}</td>
                <td className="p-3">{label(item.status)}</td>
                <td className="p-3">{item.consent_to_contact ? "Yes" : "No"}</td>
                <td className="max-w-52 break-all p-3">{item.source_page}</td>
                <td className="p-3">{dateTime(item.created_at)}</td>
                <td className="p-3">{dateTime(item.completed_at)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <form action={openChatbotInquiryAction.bind(null, item.id)}>
                      <button className={`rounded-lg px-3 py-1.5 font-bold text-white ${item.read_at ? "bg-slate-700" : "bg-red-600 shadow-sm"}`}>Open</button>
                    </form>
                    {canEdit ? (
                    <form action={updateChatbotInquiryStatusAction.bind(null, item.id)} className="flex gap-2">
                      <select name="status" defaultValue={item.status} className="rounded-lg border px-2 py-1.5">
                        {chatbotInquiryStatuses.map((option) => <option key={option} value={option}>{label(option)}</option>)}
                      </select>
                      <button className="rounded-lg border px-3 py-1.5 font-bold">Save</button>
                    </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error ? <p className="p-8 text-center text-red-800">Unable to load chatbot inquiries.</p> : null}
        {!error && !data?.length ? <p className="p-8 text-center text-[var(--muted-text)]">No chatbot inquiries match these filters.</p> : null}
      </div>
      <div className="mt-3 flex justify-between text-sm">
        <span>{count ?? 0} inquiry(s)</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={`?page=${page - 1}`} className="rounded border px-3 py-1">Previous</Link> : null}
          {page * size < (count ?? 0) ? <Link href={`?page=${page + 1}`} className="rounded border px-3 py-1">Next</Link> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
