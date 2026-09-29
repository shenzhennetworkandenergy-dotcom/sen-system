import { connection } from "next/server";

import { FollowupActionForms } from "@/components/crm/FollowupForms";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getCrmFollowupWorkspace } from "@/lib/crm/data";
import { formatCrmDateTime } from "@/lib/crm/followups";
import { crmCommunicationChannels, crmFollowupQueueStatuses } from "@/lib/crm/types";

export const dynamic = "force-dynamic";
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const relation = <T,>(value: unknown) => value as T | null;
const phoneLink = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
};

export default async function CrmFollowupsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const { profile, permissions } = await requirePermission("crm.followups_view");
  const params = await searchParams;
  const canViewAll = profile.role === "admin" || permissions.has("crm.followups_view_all");
  const canEdit = profile.role === "admin" || permissions.has("crm.followups_edit");
  const canComplete = profile.role === "admin" || permissions.has("crm.followups_complete");
  const canAssign = profile.role === "admin" || permissions.has("crm.followups_assign");
  const data = await getCrmFollowupWorkspace(profile.id, canViewAll, params);
  const cards = [
    ["Due today", data.metrics.due, "due", "border-blue-300 bg-blue-50 text-blue-950"],
    ["Overdue", data.metrics.overdue, "overdue", "border-red-300 bg-red-50 text-red-950"],
    ["Upcoming", data.metrics.upcoming, "upcoming", "border-sky-300 bg-sky-50 text-sky-950"],
    ["Waiting customer", data.metrics.waiting, "waiting_customer", "border-amber-300 bg-amber-50 text-amber-950"],
    ["Needs attention", data.metrics.attention, "attention", "border-orange-300 bg-orange-50 text-orange-950"],
    ["Completed today", data.metrics.completedToday, "completed_today", "border-emerald-300 bg-emerald-50 text-emerald-950"],
  ] as const;
  const returnTo = "/admin/crm/follow-ups";
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="CRM Follow-ups" subtitle="Operational customer follow-up queue and permanent interaction history.">
    {params.success ? <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <div className="mb-3 flex flex-wrap gap-2"><a href="/admin/crm" className="rounded-lg border px-3 py-2 font-bold">← CRM overview</a><a href="?mine=1" className="rounded-lg border px-3 py-2 font-bold">My follow-ups</a><a href="?quick=today" className="rounded-lg border px-3 py-2 font-bold">Today</a><a href="?quick=overdue" className="rounded-lg border px-3 py-2 font-bold">Overdue</a><a href="?quick=week" className="rounded-lg border px-3 py-2 font-bold">This week</a></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, count, status, style]) => <a key={status} href={`?status=${status}`} className={`rounded-2xl border p-4 shadow-sm ${style}`}><span className="text-xs font-bold uppercase tracking-wide">{label}</span><strong className="mt-1 block text-3xl">{count}</strong></a>)}</div>
    <p className="mt-2 text-xs text-[var(--muted-text)]">Needs Attention means urgent, overdue by at least 3 days, unassigned, or explicitly marked for manual review. Dates use Asia/Dhaka.</p>
    <form className="mt-4 grid gap-2 rounded-2xl border bg-[var(--surface)] p-3 md:grid-cols-3 xl:grid-cols-6">
      <input className="rounded-lg border px-3 py-2" name="q" defaultValue={params.q} placeholder="Customer, company, contact or lead" />
      <select className="rounded-lg border px-3 py-2" name="status" defaultValue={params.status}><option value="">Active queues</option>{crmFollowupQueueStatuses.map((item) => <option key={item} value={item}>{title(item)}</option>)}<option value="attention">Needs Attention</option><option value="completed_today">Completed Today</option></select>
      <select className="rounded-lg border px-3 py-2" name="priority" defaultValue={params.priority}><option value="">All priorities</option>{["low", "normal", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select>
      <select className="rounded-lg border px-3 py-2" name="channel" defaultValue={params.channel}><option value="">All channels</option>{crmCommunicationChannels.map((item) => <option key={item}>{item}</option>)}</select>
      {canViewAll ? <select className="rounded-lg border px-3 py-2" name="assigned_to" defaultValue={params.assigned_to}><option value="">All owners</option>{data.staff.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select> : <input type="hidden" name="mine" value="1" />}
      <div className="grid grid-cols-2 gap-1"><input aria-label="From date" className="rounded-lg border px-2 py-2" name="from" type="date" defaultValue={params.from} /><input aria-label="To date" className="rounded-lg border px-2 py-2" name="to" type="date" defaultValue={params.to} /></div>
      <button className="rounded-lg bg-[var(--primary)] px-3 py-2 font-bold text-[var(--primary-foreground)] md:col-span-3 xl:col-span-6">Apply filters</button>
    </form>
    <div className="mt-4 overflow-x-auto rounded-2xl border bg-[var(--surface)]">
      <table className="w-full min-w-[1450px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Customer / company", "Contact", "Lead", "Phone / WhatsApp", "Interest / requirement", "Status", "Priority", "Last contact", "Next follow-up", "Reason", "Assigned to", "Actions"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.rows.map((row) => {
        const lead = relation<{ id: string; lead_number: string; title: string; do_not_contact: boolean }>(row.crm_leads);
        const company = relation<{ name: string; phone: string | null }>(row.crm_companies);
        const contact = relation<{ full_name: string; phone: string | null }>(row.crm_contacts);
        const assignee = relation<{ full_name: string | null; email: string }>(row.profiles);
        const phone = contact?.phone ?? company?.phone;
        const whatsapp = row.preferred_channel === "whatsapp" ? phoneLink(phone) : null;
        const rowStyle = row.queue_status === "overdue" ? "bg-red-50/60" : row.queue_status === "due" ? "bg-blue-50/60" : row.status === "waiting_customer" ? "bg-amber-50/60" : row.priority === "urgent" ? "bg-orange-50/60" : "";
        return <tr key={row.id} className={`border-t align-top ${rowStyle}`}><td className="p-3 font-bold">{company?.name ?? contact?.full_name ?? "—"}</td><td className="p-3">{contact?.full_name ?? "—"}</td><td className="p-3"><strong>{lead?.title}</strong><small className="block text-[var(--muted-text)]">{lead?.lead_number}</small></td><td className="p-3">{phone ?? "—"}{whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-1 block font-bold text-green-700">Open WhatsApp</a> : null}</td><td className="max-w-[18rem] p-3">{row.interest_summary ?? "—"}</td><td className="p-3"><span className="rounded-full border px-2 py-1 text-xs font-bold">{title(row.queue_status)}</span>{row.needs_attention ? <small className="mt-1 block font-bold text-orange-700">Needs attention</small> : null}</td><td className="p-3 font-bold">{title(row.priority)}</td><td className="p-3">{formatCrmDateTime(row.last_contact_at)}</td><td className="p-3 font-semibold">{formatCrmDateTime(row.next_follow_up_at)}</td><td className="p-3">{title(row.reason)}{row.reason_details ? <small className="block text-[var(--muted-text)]">{row.reason_details}</small> : null}</td><td className="p-3">{assignee?.full_name ?? assignee?.email ?? "Unassigned"}</td><td className="p-3"><div className="mb-2 flex gap-1"><a href={`/admin/crm/leads/${lead?.id}`} className={"rounded-lg border px-2 py-1 font-bold"}>Open profile</a><a href={`/admin/crm/leads/${lead?.id}#followup-history`} className="rounded-lg border px-2 py-1 font-bold">History</a></div><FollowupActionForms followup={row} staff={data.staff} canEdit={canEdit} canComplete={canComplete} canAssign={canAssign} returnTo={returnTo} /></td></tr>;
      })}</tbody></table>
      {!data.rows.length ? <p className="p-10 text-center text-[var(--muted-text)]">{params.status === "due" || params.quick === "today" ? "No follow-ups due today." : params.status === "overdue" || params.quick === "overdue" ? "No overdue follow-ups." : "No follow-ups match these filters."}</p> : null}
    </div>
  </DashboardShell>;
}
