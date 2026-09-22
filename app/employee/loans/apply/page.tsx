import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireEmployeeHrRecord } from "@/lib/hr/self-service";
import { LoanTermsFlow } from "./LoanTermsFlow";

export const dynamic = "force-dynamic";

export default async function LoanGuidancePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const [context, query] = await Promise.all([requireEmployeeHrRecord(), searchParams]);
  return <DashboardShell employeePermissions={[]} title="ঋণের জন্য আবেদন" subtitle="নির্দেশনা ও শর্তগুলো ধাপে ধাপে পড়ে সম্মতি দেওয়ার পর আবেদনপত্র খুলবে।">
    {!context.employee ? <p className="mx-auto max-w-4xl rounded-xl border bg-white p-6">আপনার সক্রিয় কর্মচারী রেকর্ড কনফিগার করা নেই।</p> : <LoanTermsFlow error={query.error} />}
  </DashboardShell>;
}
