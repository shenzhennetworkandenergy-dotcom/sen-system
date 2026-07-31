import { connection } from "next/server";
import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { HrPage } from "@/components/hr/HrPage";
import { getHrEmployees, getHrReferences } from "@/lib/hr/operational";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<{ success?: string; warning?: string; error?: string }> }) {
  await connection();
  const [refs, existing, params] = await Promise.all([getHrReferences(), getHrEmployees({ pageSize:100 }), searchParams]);
  const assigned = new Set(existing.rows.map((item) => item.profile_id));
  const available = refs.profiles.filter((item) => !assigned.has(item.id) && item.role === "employee");
  return <HrPage title="Add employee" subtitle="Connect an existing employee account to a complete HR record." success={params.success} warning={params.warning} error={params.error}><EmployeeForm refs={{...refs,profiles:available}}/></HrPage>;
}
