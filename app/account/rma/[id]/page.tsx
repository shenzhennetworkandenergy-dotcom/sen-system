import { connection } from "next/server";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getCustomerRmaClaim } from "@/lib/rma/data";
import { titleCase } from "@/lib/rma/workflow";

export const dynamic = "force-dynamic";

export default async function CustomerRmaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const [{ id }, notice] = await Promise.all([params, searchParams]);
  const result = await getCustomerRmaClaim(profile.id, id);
  if (!result) notFound();
  const { claim, events, attachments } = result;

  return (
    <DashboardShell title={claim.rma_number} subtitle={`${claim.product_name} · Order ${claim.order_number}`}>
      {notice.success ? <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice.success}</p> : null}
      {notice.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">{notice.error}</p> : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border bg-[var(--surface)] p-5">
          <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold">Claim progress</h2><span className="rounded-full bg-blue-50 px-3 py-1 font-bold text-blue-800">{titleCase(claim.status)}</span></div>
          <div className="mt-5 grid gap-4 border-l-2 border-blue-300 pl-5">
            {events.map((event) => (
              <article key={event.id}>
                <b>{titleCase(event.event_type)}</b>{event.new_status ? <span> · {titleCase(event.new_status)}</span> : null}
                <p className="text-sm text-[var(--muted-text)]">{new Date(event.created_at).toLocaleString("en-BD")} · {event.actor_name}</p>
                {event.note ? <p className="mt-1">{event.note}</p> : null}
              </article>
            ))}
          </div>
        </section>
        <aside className="grid content-start gap-4">
          <section className="rounded-2xl border bg-[var(--surface)] p-5">
            <h2 className="font-bold">Claim details</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div><dt className="text-[var(--muted-text)]">Type</dt><dd>{titleCase(claim.claim_type)}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Quantity</dt><dd>{claim.quantity}</dd></div>
              <div><dt className="text-[var(--muted-text)]">SEN serial</dt><dd>{claim.sen_serial ?? "Not serialized"}</dd></div>
              {claim.resolution ? <div><dt className="text-[var(--muted-text)]">Resolution</dt><dd>{titleCase(claim.resolution)}</dd></div> : null}
            </dl>
            <p className="mt-4 whitespace-pre-wrap text-sm">{claim.description}</p>
          </section>
          {attachments.length ? <section className="rounded-2xl border bg-[var(--surface)] p-5"><h2 className="font-bold">Evidence</h2>{attachments.map((file) => <a key={file.id} href={`/rma-attachments/${file.id}`} className="mt-2 block font-semibold text-[var(--primary)]">{file.original_file_name}</a>)}</section> : null}
        </aside>
      </div>
    </DashboardShell>
  );
}
