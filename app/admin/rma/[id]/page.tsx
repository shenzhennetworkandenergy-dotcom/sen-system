import { connection } from "next/server";
import { notFound } from "next/navigation";

import { assignRmaClaimAction, transitionRmaClaimAction } from "@/app/admin/rma/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { isAdmin, requirePermission } from "@/lib/auth/permissions";
import { getRmaAssignees, getStaffRmaClaim } from "@/lib/rma/data";
import {
  rmaResolutions,
  rmaStatuses,
  rmaTransitions,
  titleCase,
  type RmaResolution,
  type RmaStatus,
} from "@/lib/rma/workflow";

export const dynamic = "force-dynamic";

const resolutionLabels: Record<RmaResolution, string> = {
  repaired: "Repaired",
  replaced: "Replaced",
  refund_approved: "Refund approved",
  credit_issued: "Credit issued",
  claim_rejected: "Claim rejected",
  no_fault_found: "No fault found",
  damaged_beyond_repair_retired: "Damaged beyond repair / retired",
};

function permissionForStatus(status: RmaStatus) {
  if (status === "product_received") return "rma.receive";
  if (status === "resolution_in_progress") return "rma.resolve";
  if (status === "closed") return "rma.close";
  return "rma.review";
}

export default async function AdminRmaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const context = await requirePermission("rma.view");
  const [{ id }, notice] = await Promise.all([params, searchParams]);
  const [result, assignees] = await Promise.all([getStaffRmaClaim(id), getRmaAssignees()]);
  if (!result) notFound();
  const { claim, events, attachments } = result;
  const admin = isAdmin(context.profile);
  const currentStatus = rmaStatuses.includes(claim.status as RmaStatus) ? claim.status as RmaStatus : "submitted";
  const nextStatuses = rmaTransitions[currentStatus];
  const canAssign = admin || context.permissions.has("rma.assign");

  return (
    <DashboardShell admin={admin} employeePermissions={admin ? undefined : context.permissions} title={claim.rma_number} subtitle={`${claim.product_name} · ${claim.order_number}`}>
      {notice.success ? <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice.success}</p> : null}
      {notice.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">{notice.error}</p> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-2xl border bg-[var(--surface)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted-text)]">Status</p><p className="mt-1 text-lg font-bold">{titleCase(claim.status)}</p></section>
        <section className="rounded-2xl border bg-[var(--surface)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted-text)]">Customer</p><p className="mt-1 font-bold">{claim.customer_name}</p><p className="text-sm text-[var(--muted-text)]">{claim.customer_email}</p></section>
        <section className="rounded-2xl border bg-[var(--surface)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted-text)]">Claim</p><p className="mt-1 font-bold">{titleCase(claim.claim_type)} × {claim.quantity}</p><p className="text-sm text-[var(--muted-text)]">{claim.sen_serial || claim.product_sku}</p></section>
        <section className="rounded-2xl border bg-[var(--surface)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted-text)]">Submitted</p><p className="mt-1 font-bold">{new Date(claim.submitted_at).toLocaleString("en-BD")}</p></section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid content-start gap-4">
          <section className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-bold">Customer report</h2>
            <p className="mt-3 whitespace-pre-wrap">{claim.description}</p>
          </section>

          <section className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-bold">RMA timeline</h2>
            <div className="mt-4 grid gap-4 border-l-2 border-blue-300 pl-5">
              {events.map((event) => (
                <article key={event.id}>
                  <p className="font-bold">{titleCase(event.event_type)}{event.new_status ? ` · ${titleCase(event.new_status)}` : ""}</p>
                  <p className="text-xs text-[var(--muted-text)]">{new Date(event.created_at).toLocaleString("en-BD")} · {event.actor_name}</p>
                  {event.note ? <p className="mt-1 text-sm">{event.note}</p> : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="grid content-start gap-4">
          {canAssign ? (
            <form action={assignRmaClaimAction} className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
              <h2 className="font-bold">Assignment</h2>
              <input type="hidden" name="claim_id" value={claim.id}/>
              <select name="assigned_to" defaultValue={claim.assigned_to ?? ""} className="mt-3 w-full rounded-xl border px-3 py-2.5">
                <option value="">Unassigned</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email} ({person.role})</option>)}
              </select>
              <input name="note" placeholder="Assignment note (optional)" className="mt-2 w-full rounded-xl border px-3 py-2.5"/>
              <button className="mt-3 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Save assignment</button>
            </form>
          ) : null}

          {nextStatuses.map((nextStatus) => {
            const allowed = admin || context.permissions.has(permissionForStatus(nextStatus));
            if (!allowed) return null;
            return (
              <form key={nextStatus} action={transitionRmaClaimAction} className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
                <h2 className="font-bold">Move to {titleCase(nextStatus)}</h2>
                <input type="hidden" name="claim_id" value={claim.id}/>
                <input type="hidden" name="status" value={nextStatus}/>
                {nextStatus === "closed" ? (
                  <select name="resolution" required className="mt-3 w-full rounded-xl border px-3 py-2.5">
                    <option value="">Choose resolution</option>
                    {rmaResolutions.map((value) => <option key={value} value={value}>{resolutionLabels[value]}</option>)}
                  </select>
                ) : null}
                <textarea name="note" placeholder="Internal/customer update note" className="mt-3 min-h-24 w-full rounded-xl border px-3 py-2.5"/>
                <button className="mt-3 w-full rounded-xl border px-4 py-2.5 font-semibold">Confirm {titleCase(nextStatus)}</button>
              </form>
            );
          })}

          {attachments.length ? (
            <section className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
              <h2 className="font-bold">Evidence</h2>
              {attachments.map((file) => <a key={file.id} href={`/rma-attachments/${file.id}`} className="mt-2 block break-all font-semibold text-[var(--primary)]">{file.original_file_name}</a>)}
            </section>
          ) : null}
        </aside>
      </div>
    </DashboardShell>
  );
}
