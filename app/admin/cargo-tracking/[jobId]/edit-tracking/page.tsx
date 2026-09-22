import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { isAdmin, requirePermission } from "@/lib/auth/permissions";
import { canEditCargoTrackingNumber, getCargoTrackingEditJob } from "@/lib/cargo-tracking/data";
import { updateCargoTrackingNumberAction } from "@/app/admin/cargo-tracking/actions";

export const dynamic = "force-dynamic";

export default async function EditCargoTrackingNumberPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("cargo.create");
  const { jobId } = await params;
  const [job, query] = await Promise.all([getCargoTrackingEditJob(jobId), searchParams]);
  if (!job) notFound();
  const admin = isAdmin(profile);
  const cancel = `/admin/cargo-tracking/${jobId}`;
  return <DashboardShell admin={admin} employeePermissions={admin ? undefined : permissions} title="Edit Tracking Number" subtitle="Only the courier tracking number can be changed.">
    <div className="max-w-xl rounded-xl border bg-[var(--surface)] p-5">
      {query.error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-900">{query.error}</p> : null}
      <p><span className="font-semibold">Cargo ID:</span><br />{job.internal_cargo_id}</p>
      {canEditCargoTrackingNumber(job.current_status) ? <form action={updateCargoTrackingNumberAction.bind(null, jobId)} className="mt-4 space-y-4">
        <label className="block font-semibold">Tracking Number<input name="courier_tracking_number" required maxLength={160} defaultValue={job.courier_tracking_number} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <div className="flex gap-3"><button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">Save</button><Link href={cancel} className="rounded-lg border px-4 py-2 font-semibold">Cancel</Link></div>
      </form> : <div className="mt-4"><p className="rounded-lg bg-amber-50 p-3 text-amber-900">Tracking number can no longer be edited because this cargo has already been dispatched from China.</p><Link href={cancel} className="mt-4 inline-block rounded-lg border px-4 py-2 font-semibold">Back</Link></div>}
    </div>
  </DashboardShell>;
}
