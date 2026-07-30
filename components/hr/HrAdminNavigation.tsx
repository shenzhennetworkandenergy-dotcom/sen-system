import { routes } from "@/lib/constants/routes";

const links = [
  ["Overview", routes.adminHr],
  ["Employees", routes.adminHrEmployees],
  ["Organization", routes.adminHrDepartments],
  ["Attendance", routes.adminHrAttendance],
  ["Corrections", routes.adminHrAttendanceCorrections],
  ["Leave", routes.adminHrLeaves],
  ["Payroll", routes.adminHrPayroll],
  ["Performance", routes.adminHrPerformance],
  ["Reports", routes.adminHrReports],
  ["Settings & devices", routes.adminHrSettings],
] as const;

export function HrAdminNavigation() {
  return (
    <nav aria-label="HR administration" className="mb-4 flex gap-2 overflow-x-auto rounded-xl border bg-[var(--surface)] p-2 text-sm">
      {links.map(([label, href]) => (
        <a key={href} href={href} className="shrink-0 rounded-lg px-3 py-2 font-semibold transition hover:bg-blue-50 hover:text-blue-800">
          {label}
        </a>
      ))}
    </nav>
  );
}
