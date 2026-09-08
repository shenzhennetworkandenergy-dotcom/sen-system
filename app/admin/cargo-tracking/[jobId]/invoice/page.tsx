import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { CargoInvoiceTemplate } from "@/lib/cargo-tracking/InvoiceTemplate";
import { getCargoJob } from "@/lib/cargo-tracking/data";

export const dynamic = "force-dynamic";

export default async function AdminCargoInvoicePage({ params }: { params: Promise<{ jobId: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("cargo.view");
  const { jobId } = await params;
  const data = await getCargoJob(jobId);
  if (!data?.invoice) notFound();
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "admin" ? undefined : permissions} title={`Cargo Invoice ${data.invoice.invoice_number}`} subtitle="Cargo-owned operational invoice."><CargoInvoiceTemplate job={data.job} invoice={data.invoice} packages={data.packages} customer={data.job.customer} /></DashboardShell>;
}
