import { connection } from "next/server";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { routes } from "@/lib/constants/routes";
import { getEmployeeHrWorkspace } from "@/lib/hr/self-service";
import { cancelLeaveAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EmployeeLeavePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [data,params] = await Promise.all([getEmployeeHrWorkspace(),searchParams]);
  return <EmployeeHrShell title="My leave" subtitle="Review balances and requests or submit a new request." success={params.success} error={params.error}>
    <div className="mb-4 flex justify-end"><a href={routes.employeeHrNewLeave} className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Request leave</a></div>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.leaveBalances.map((balance)=>{const type=Array.isArray(balance.hr_leave_types)?balance.hr_leave_types[0]:balance.hr_leave_types;const available=Number(balance.allocated_days)+Number(balance.adjusted_days)-Number(balance.used_days);return <article key={balance.id} className="rounded-2xl border bg-[var(--surface)] p-4 shadow-sm"><p className="font-semibold">{type?.name??"Leave"}</p><strong className="mt-2 block text-2xl">{available}</strong><p className="text-sm text-[var(--muted-text)]">days available · {balance.leave_year}</p></article>})}</section>
    <section className="mt-5 overflow-x-auto rounded-2xl border bg-[var(--surface)] shadow-sm"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr><th className="p-3">Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th>Action</th></tr></thead><tbody>{data.leaveRequests.map((request)=>{const type=Array.isArray(request.hr_leave_types)?request.hr_leave_types[0]:request.hr_leave_types;return <tr key={request.id} className="border-t"><td className="p-3">{type?.name??"Leave"}</td><td>{request.start_date} – {request.end_date}</td><td>{request.requested_days}</td><td className="capitalize">{request.status}</td><td>{request.reason}</td><td>{request.status==="pending"?<form action={cancelLeaveAction}><input type="hidden" name="leave_id" value={request.id}/><input type="hidden" name="return_to" value={routes.employeeHrLeaves}/><button className="font-semibold text-red-700">Cancel</button></form>:"—"}</td></tr>})}</tbody></table>{!data.leaveRequests.length?<p className="p-8 text-center text-[var(--muted-text)]">No leave requests submitted.</p>:null}</section>
  </EmployeeHrShell>;
}
