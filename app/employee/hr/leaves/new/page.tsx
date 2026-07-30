import { connection } from "next/server";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { routes } from "@/lib/constants/routes";
import { getEmployeeHrWorkspace } from "@/lib/hr/self-service";
import { requestLeaveAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewLeavePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const [data,params] = await Promise.all([getEmployeeHrWorkspace(),searchParams]);
  return <EmployeeHrShell title="Request leave" subtitle="Choose your leave type and dates for administrator approval." error={params.error}>
    {!data.employee?<p className="rounded-xl border p-5">Your employee HR record has not been configured.</p>:<form action={requestLeaveAction} className="mx-auto max-w-3xl rounded-2xl border bg-[var(--surface)] p-6 shadow-sm"><input type="hidden" name="return_to" value={routes.employeeHrNewLeave}/><label className="block font-semibold">Leave type<select className="mt-1 w-full rounded-lg border px-3 py-2.5" name="leave_type_id" required><option value="">Select leave type</option>{data.leaveTypes.map((type)=><option key={type.id} value={type.id}>{type.name}{type.requires_document?" (document required)":""}</option>)}</select></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="font-semibold">Start date<input className="mt-1 w-full rounded-lg border px-3 py-2.5" type="date" name="start_date" required/></label><label className="font-semibold">End date<input className="mt-1 w-full rounded-lg border px-3 py-2.5" type="date" name="end_date" required/></label></div><label className="mt-4 block font-semibold">Reason<textarea className="mt-1 min-h-28 w-full rounded-lg border px-3 py-2.5" name="reason" required minLength={3} maxLength={1000}/></label><button className="mt-5 rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Submit leave request</button></form>}
  </EmployeeHrShell>;
}
