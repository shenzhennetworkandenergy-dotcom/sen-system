import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { getCustomerCargoJob } from "@/lib/cargo-tracking/data";
import { CargoInvoiceTemplate } from "@/lib/cargo-tracking/InvoiceTemplate";

export const dynamic = "force-dynamic";

export default async function CustomerCargoInvoicePage({ params }: { params: Promise<{ jobId: string }> }) {
  await connection(); const { profile } = await requireProfile(["customer"]); const { jobId } = await params;
  const data = await getCustomerCargoJob(jobId, profile.id); if (!data?.invoice) notFound();
  const { job, invoice, packages } = data;
  return <CargoInvoiceTemplate job={job} invoice={invoice} packages={packages} customer={job.customer} />;
}
