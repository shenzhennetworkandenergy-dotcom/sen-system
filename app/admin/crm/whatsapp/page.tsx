import { connection } from "next/server";
import Link from "next/link";

import { WhatsappCustomerForm } from "@/components/crm/WhatsappCustomerForm";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getCrmFollowupStaff } from "@/lib/crm/data";
import { readAllWhatsappCategoryRows } from "@/lib/crm/whatsapp-category-store";
import { whatsappCrmStatuses } from "@/lib/crm/whatsapp-records";
import { canAccessWhatsappRecord } from "@/lib/crm/whatsapp-sync";
import { upsertWhatsappCustomerAction } from "./actions";

export const dynamic = "force-dynamic";
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function WhatsappCrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const { profile, permissions } = await requirePermission("crm.view");
  const params = await searchParams;
  const [allRows, staff] = await Promise.all([readAllWhatsappCategoryRows(), getCrmFollowupStaff()]);
  const query = params.q?.trim().toLocaleLowerCase() ?? "";
  const rows = allRows
    .filter((record) => canAccessWhatsappRecord(profile, record))
    .filter((record) => !params.status || record.status === params.status)
    .filter((record) => !query || [record.whatsapp_name, record.whatsapp_number, record.interested_products, record.status, record.conversation_history].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const canCreate = profile.role === "admin" || permissions.has("crm.create");
  const canExport = profile.role === "admin" || permissions.has("crm.export");

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="WhatsApp Customer Follow-up" subtitle="Offline, human-approved customer collection and follow-up inside CRM only.">
    {params.success ? <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <div className="mb-3 flex flex-wrap gap-2">
      <Link href="/admin/crm" className="rounded-lg border px-3 py-2 font-bold">← CRM overview</Link>
      {canExport ? <Link href="/admin/crm/whatsapp/preview" className="rounded-lg border px-3 py-2 font-bold">Preview full CSV</Link> : null}
      {canExport ? <Link href="/admin/crm/whatsapp/export" className="rounded-lg border px-3 py-2 font-bold">Download authoritative CSV</Link> : null}
    </div>
    <form className="grid gap-2 rounded-2xl border bg-[var(--surface)] p-3 md:grid-cols-[1fr_14rem_auto]">
      <input className="rounded-lg border px-3 py-2" name="q" defaultValue={params.q} placeholder="Name, number, product, status or history" />
      <select className="rounded-lg border px-3 py-2" name="status" defaultValue={params.status}><option value="">All statuses</option>{whatsappCrmStatuses.map((status) => <option key={status} value={status}>{title(status)}</option>)}</select>
      <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">Search</button>
    </form>
    <div className="mt-3 overflow-x-auto rounded-2xl border bg-[var(--surface)]">
      <table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-[var(--muted-surface)]"><tr>{["Customer", "WhatsApp", "Product / quantity", "Status", "Follow-up report", "Last contact", "Next follow-up", ""].map((heading) => <th className="p-2" key={heading}>{heading}</th>)}</tr></thead><tbody>
        {rows.map((record) => <tr className="border-t align-top" key={record.customer_id}>
          <td className="p-2"><strong>{record.whatsapp_name}</strong><small className="block text-[var(--muted-text)]">{title(record.category_slug)}</small></td>
          <td className="p-2"><a href={record.whatsapp_link} target="_blank">{record.whatsapp_number}</a></td>
          <td className="max-w-64 p-2">{record.interested_products || "—"}<small className="block text-[var(--muted-text)]">{record.quantity_requirements}</small></td>
          <td className="p-2"><span className="rounded-full border px-2 py-1 font-bold">{title(record.status)}</span></td>
          <td className="max-w-64 p-2">{record.follow_up_report || "—"}</td>
          <td className="p-2">{record.last_communication_at ? new Date(record.last_communication_at).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" }) : "—"}</td>
          <td className="p-2">{record.next_follow_up_at ? new Date(record.next_follow_up_at).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" }) : "—"}</td>
          <td className="p-2"><Link href={`/admin/crm/whatsapp/${record.customer_id}`} className="rounded-lg border px-3 py-2 font-bold">Open</Link></td>
        </tr>)}
      </tbody></table>
      {!rows.length ? <p className="p-8 text-center text-[var(--muted-text)]">No authorized WhatsApp customer records match these filters.</p> : null}
    </div>
    {canCreate ? <details className="mt-4 rounded-2xl border bg-[var(--surface)] p-3"><summary className="cursor-pointer font-bold">Add or update a selected customer</summary><div className="mt-3"><WhatsappCustomerForm action={upsertWhatsappCustomerAction} staff={staff} /></div></details> : null}
  </DashboardShell>;
}
