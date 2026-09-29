import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";

import { WhatsappConversation } from "@/components/crm/WhatsappConversation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { findWhatsappCategoryRow } from "@/lib/crm/whatsapp-category-store";
import { buildWhatsappDraftBrief, buildWhatsappFallbackDraft } from "@/lib/crm/whatsapp-drafts";
import { researchWhatsappProducts } from "@/lib/crm/whatsapp-products";
import { isWhatsappFollowupAllowed, whatsappCrmStatuses } from "@/lib/crm/whatsapp-records";
import { canAccessWhatsappRecord } from "@/lib/crm/whatsapp-sync";
import {
  recordApprovedWhatsappSendAction,
  saveWhatsappDraftAction,
  syncWhatsappCustomerAction,
  updateWhatsappCustomerStatusAction,
} from "../actions";

export const dynamic = "force-dynamic";
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function WhatsappCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const { customerId } = await params;
  const query = await searchParams;
  const { profile, permissions } = await requirePermission("crm.view");
  const record = await findWhatsappCategoryRow(customerId);
  if (!record || !canAccessWhatsappRecord(profile, record)) notFound();
  let evidence = [] as Awaited<ReturnType<typeof researchWhatsappProducts>>;
  try {
    evidence = record.interested_products ? await researchWhatsappProducts(record.interested_products) : [];
  } catch {
    evidence = [];
  }
  const generated = buildWhatsappFallbackDraft(record, evidence);
  const canEdit = profile.role === "admin" || permissions.has("crm.edit");
  const canFollowup = canEdit && isWhatsappFollowupAllowed(record);
  const brief = buildWhatsappDraftBrief(record, evidence);

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title={record.whatsapp_name} subtitle={`${record.whatsapp_number} · ${title(record.status)}`}>
    {query.success ? <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{query.success}</p> : null}
    {query.error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{query.error}</p> : null}
    <div className="mb-3 flex flex-wrap gap-2"><Link href="/admin/crm/whatsapp" className="rounded-lg border px-3 py-2 font-bold">← WhatsApp customers</Link>{canEdit ? <form action={syncWhatsappCustomerAction.bind(null, customerId)}><button className="rounded-lg border px-3 py-2 font-bold">Synchronize CRM</button></form> : null}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,.75fr)]">
      <section className="rounded-2xl border bg-[var(--surface)] p-4"><h2 className="mb-3 text-lg font-bold">Complete conversation chronology</h2><WhatsappConversation history={record.conversation_history} /></section>
      <aside className="space-y-4">
        <section className="rounded-2xl border bg-[var(--surface)] p-4"><h2 className="mb-2 text-lg font-bold">Customer facts</h2><dl className="grid grid-cols-[9rem_1fr] gap-2 text-sm"><dt>Category</dt><dd>{title(record.category_slug)}</dd><dt>Products</dt><dd>{record.interested_products || "—"}</dd><dt>Quantity</dt><dd>{record.quantity_requirements || "—"}</dd><dt>WhatsApp</dt><dd><a className="font-bold text-blue-700" href={record.whatsapp_link} target="_blank">Open chat</a></dd><dt>Messenger</dt><dd>{record.messenger_profile_link ? <a className="font-bold text-blue-700" href={record.messenger_profile_link} target="_blank">Open conversation</a> : "—"}</dd><dt>Follow-up report</dt><dd>{record.follow_up_report || "—"}</dd><dt>Next follow-up</dt><dd>{record.next_follow_up_at ? new Date(record.next_follow_up_at).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" }) : "Stopped"}</dd></dl></section>
        <section className="rounded-2xl border bg-[var(--surface)] p-4"><h2 className="mb-2 text-lg font-bold">Verified product evidence</h2>{evidence.length ? <ul className="space-y-2 text-sm">{evidence.map((item) => <li className="rounded-lg border p-3" key={`${item.product_id}-${item.variation_id}`}><strong>{item.name}</strong><p>{item.sku}{item.model ? ` · ${item.model}` : ""}</p><p>{item.price === null ? "Price requires staff review" : `${item.currency} ${item.price.toLocaleString("en-BD")}`}</p><p>{title(item.availability)}</p><a className="font-bold text-blue-700" href={item.public_url} target="_blank">Public product page</a>{item.review_warning ? <p className="mt-1 text-amber-800">{item.review_warning}</p> : null}</li>)}</ul> : <p className="text-sm text-amber-800">No verified catalogue match. Staff review is required before stating product facts.</p>}</section>
      </aside>
    </div>
    {canEdit ? <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {canFollowup ? <form action={saveWhatsappDraftAction.bind(null, customerId)} className="rounded-2xl border bg-[var(--surface)] p-4"><h2 className="mb-2 text-lg font-bold">Editable reply draft</h2><textarea className="min-h-52 w-full rounded-lg border p-3" name="draft_reply" defaultValue={record.draft_reply || generated || ""} /><p className="my-2 text-xs text-[var(--muted-text)]">Draft only. Review and approve it before manually sending in WhatsApp.</p><button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">Save draft</button><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">ChatGPT context brief</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--muted-surface)] p-3 text-xs">{brief}</pre></details></form> : <section className="rounded-2xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Follow-up stopped</h2><p className="mt-2 text-sm text-[var(--muted-text)]">Drafting and manual-send recording are disabled for this customer status.</p></section>}
      <div className="space-y-4">{canFollowup ? <form action={recordApprovedWhatsappSendAction.bind(null, customerId)} className="rounded-2xl border bg-[var(--surface)] p-4"><h2 className="mb-2 text-lg font-bold">Record an approved manual send</h2><textarea required className="min-h-32 w-full rounded-lg border p-3" name="sent_text" defaultValue={record.draft_reply || generated || ""} /><p className="my-2 text-xs text-[var(--muted-text)]">This records text you already approved and manually sent. It does not send anything to WhatsApp.</p><button className="rounded-lg border px-4 py-2 font-bold">Record manual send</button></form> : null}<form action={updateWhatsappCustomerStatusAction.bind(null, customerId)} className="flex gap-2 rounded-2xl border bg-[var(--surface)] p-4"><select className="min-w-0 flex-1 rounded-lg border px-3 py-2" name="status" defaultValue={record.status}>{whatsappCrmStatuses.map((status) => <option key={status} value={status}>{title(status)}</option>)}</select><button className="rounded-lg border px-4 py-2 font-bold">Update status</button></form></div>
    </div> : null}
  </DashboardShell>;
}
