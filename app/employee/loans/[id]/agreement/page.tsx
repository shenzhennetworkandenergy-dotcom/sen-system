import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EmployeeLoanAgreement } from "@/components/receivables/EmployeeLoanAgreement";
import { getEmployeeLoanApplication } from "@/lib/receivables/employee-loans-data";

export const dynamic = "force-dynamic";

export default async function EmployeeAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const data = await getEmployeeLoanApplication(id);
  if (!data.application?.detail.agreement_sent_at) notFound();
  return <EmployeeLoanAgreement account={data.application.account} detail={data.application.detail} employee={data.identity} />;
}
