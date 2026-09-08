import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { cargoLabel, getCustomerCargoJob } from "@/lib/cargo-tracking/data";

export const dynamic = "force-dynamic";

export default async function CustomerCargoDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  await connection(); const { profile } = await requireProfile(["customer"]); const { jobId } = await params;
  const data = await getCustomerCargoJob(jobId, profile.id); if (!data) notFound();
  const { job, packages, events, invoice } = data;
  return <DashboardShell title={`Cargo ${job.internal_cargo_id}`} subtitle="Your Cargo request and progress.">
    <Link href="/account/cargo" className="font-bold text-[var(--primary)]">← My Cargo</Link>
    <section className="mt-5 grid gap-4 rounded-2xl border bg-[var(--surface)] p-6 md:grid-cols-2"><p><b>Tracking:</b> {job.courier_tracking_number}</p><p><b>Method:</b> {job.shipping_method}</p><p><b>Status:</b> {cargoLabel(job.current_status)}</p><p><b>Goods:</b> {job.goods_summary}</p><p><b>Contact:</b> {job.customer_contact_person || "—"} {job.customer_contact_phone || ""}</p><p><b>Location:</b> {job.customer_service_location || "—"}</p><p className="md:col-span-2"><b>Instruction:</b> {job.customer_instruction || "—"}</p></section>
    <section className="mt-5 rounded-2xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-bold">Packages</h2><div className="mt-3 grid gap-3">{packages.map((item) => <p key={item.id} className="rounded-xl border p-3">{item.description} · {item.quantity} {item.unit} · {item.weight ?? "—"} kg</p>)}</div></section>
    <section className="mt-5 rounded-2xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-bold">Status timeline</h2><div className="mt-3 space-y-3">{events.map((event) => <div key={event.id} className="border-l-2 border-blue-500 pl-3"><b>{cargoLabel(event.status)}</b><p className="text-sm text-[var(--muted-text)]">{new Date(event.event_at).toLocaleString("en-GB")}</p>{event.note ? <p>{event.note}</p> : null}</div>)}</div></section>
    {invoice ? <section className="mt-5 rounded-2xl border bg-emerald-50 p-6"><h2 className="text-xl font-bold">Cargo Invoice</h2><p className="mt-2">{invoice.invoice_number} · {invoice.currency}</p><p>Weight: {invoice.final_billable_weight_kg} kg × Rate: {invoice.applied_rate_per_kg}</p><p className="text-2xl font-black">BDT {Number(invoice.total_amount).toLocaleString()}</p><p>Payment: {invoice.payment_status}</p><Link href={`/account/cargo/${job.id}/invoice`} className="mt-4 inline-block rounded-xl border px-4 py-2 font-bold">View / Print Invoice</Link></section> : <p className="mt-5 rounded-xl border p-5">Cargo invoice is not yet available.</p>}
  </DashboardShell>;
}
