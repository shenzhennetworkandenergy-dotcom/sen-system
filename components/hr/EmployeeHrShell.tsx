import { DashboardShell } from "@/components/dashboard/Shell";
import { getPermissionMatrix } from "@/lib/auth/permissions";
import { routes } from "@/lib/constants/routes";
import { requireEmployeeHrRecord } from "@/lib/hr/self-service";

export async function EmployeeHrShell({ title, subtitle, success, error, children }: {
  title: string; subtitle: string; success?: string; error?: string; children: React.ReactNode;
}) {
  const context = await requireEmployeeHrRecord();
  const matrix = await getPermissionMatrix(context.profile.id);
  return <DashboardShell title={title} subtitle={subtitle} employeePermissions={matrix.effectiveKeys}>
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Employee HR">
      <a className="rounded-lg border px-3 py-2 font-semibold" href={routes.employeeHr}>My HR</a>
      <a className="rounded-lg border px-3 py-2 font-semibold" href={routes.employeeHrAttendance}>Attendance</a>
      <a className="rounded-lg border px-3 py-2 font-semibold" href={routes.employeeHrLeaves}>Leave</a>
    </nav>
    {success ? <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{success}</p> : null}
    {error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p> : null}
    {children}
  </DashboardShell>;
}
