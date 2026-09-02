import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CashbookAuditReview } from "@/components/accounting/CashbookAuditReview";
import { DashboardShell } from "@/components/dashboard/Shell";
import { getCashbookAuditDay, parseCashbookAuditDate } from "@/lib/accounting/audit";
import { requirePermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function CashbookAuditDetailPage({ params, searchParams }: { params: Promise<{ date: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("accounting.audit_cashbook");
  const { date: rawDate } = await params;
  const date = parseCashbookAuditDate(rawDate);
  if (!date) notFound();
  const notices = await searchParams;
  const result = await getCashbookAuditDay(date);
  if (!result) notFound();

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Cashbook Audit Review" subtitle="Read-only finalized statement review.">
    {notices.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{notices.success}</p> : null}
    {notices.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{notices.error}</p> : null}
    <CashbookAuditReview day={result.day} statement={result.statement} />
  </DashboardShell>;
}
