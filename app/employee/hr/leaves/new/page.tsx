import { connection } from "next/server";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { LeaveApplicationForm } from "@/components/hr/LeaveApplicationForm";
import { leaveApplicationTypeCodes } from "@/lib/hr/leave";
import { getEmployeeHrWorkspace } from "@/lib/hr/self-service";

export const dynamic = "force-dynamic";

export default async function NewLeavePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const [data,params] = await Promise.all([getEmployeeHrWorkspace(),searchParams]);
  const employee = data.employee;
  const department = relationName(employee?.hr_departments) || "Not assigned";
  const designation = relationName(employee?.hr_designations) || employee?.job_title || "Not assigned";
  const allowedCodes = new Set<string>(leaveApplicationTypeCodes);
  return <EmployeeHrShell title="Apply for Leave" subtitle="Generate, print and submit your SEN Employee Leave Application." error={params.error}>
    {!employee
      ? <p className="rounded-xl border p-5">Your employee HR record has not been configured.</p>
      : <LeaveApplicationForm employee={{name:data.profile.full_name||"Employee",number:employee.employee_number,designation,department}} leaveTypes={data.leaveTypes.filter((type)=>allowedCodes.has(type.code))}/>
    }
  </EmployeeHrShell>;
}

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "name" in relation ? String(relation.name ?? "") : "";
}
