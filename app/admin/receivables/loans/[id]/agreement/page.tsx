import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EmployeeLoanAgreement } from "@/components/receivables/EmployeeLoanAgreement";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getAdminEmployeeLoanExtension } from "@/lib/receivables/employee-loans-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminEmployeeAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireAllPermissions(["receivables.view", "receivables.view_loans"]);
  const { id } = await params;
  const [extension, account] = await Promise.all([
    getAdminEmployeeLoanExtension(id),
    createSupabaseAdminClient().from("receivable_accounts").select("id,receivable_number,approved_amount,currency,final_due_date").eq("id", id).eq("category", "employee_loan").maybeSingle(),
  ]);
  if (!extension?.detail.agreement_generated_at || !account.data) notFound();
  return <EmployeeLoanAgreement account={account.data} detail={extension.detail} employee={extension.employee} />;
}
