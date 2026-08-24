import { connection } from "next/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationTypeahead } from "@/components/sales/QuotationTypeahead";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { QUOTATION_SALE_CONVERSION_PERMISSIONS } from "@/lib/quotations/sale-conversion-types";

export const dynamic = "force-dynamic";

export default async function SalesFromQuotationPage() {
  await connection();
  const { profile, permissions } = await requireAllPermissions([
    ...QUOTATION_SALE_CONVERSION_PERMISSIONS,
  ]);
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) {
    redirect("/admin/sales?error=Quotation%20access%20denied.");
  }

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Create Sale from Quotation"
      subtitle="Choose an accepted quotation to review in the existing Sales form."
    >
      <section className="rounded-xl border bg-[var(--surface)] p-5">
        <QuotationTypeahead />
      </section>
    </DashboardShell>
  );
}
