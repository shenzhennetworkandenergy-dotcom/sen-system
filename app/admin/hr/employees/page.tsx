import { connection } from "next/server";
import { HrPage, display, hrCard, hrField, relation } from "@/components/hr/HrPage";
import { routes } from "@/lib/constants/routes";
import { getHrEmployees, getHrReferences } from "@/lib/hr/operational";

export const dynamic = "force-dynamic";

type EmployeeSearch = {
  q?: string; status?: string; department?: string; designation?: string;
  location?: string; page?: string; success?: string; error?: string;
};

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<EmployeeSearch> }) {
  await connection();
  const params = await searchParams;
  const [data, refs] = await Promise.all([getHrEmployees(params), getHrReferences()]);
  const totalPages = Math.max(1, Math.ceil(data.count / data.pageSize));
  return (
    <HrPage title="Employee directory" subtitle="Create, search, update, archive and restore employee records without deleting history." success={params.success} error={params.error}>
      <div className="mb-4 flex justify-end"><a href={routes.adminHrNewEmployee} className="rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Add employee</a></div>
      <form className={`${hrCard} mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6`}>
        <label className="text-sm font-semibold xl:col-span-2">Search<input name="q" defaultValue={params.q} placeholder="Name, email, phone, number or job title" className={hrField}/></label>
        <label className="text-sm font-semibold">Status<select name="status" defaultValue={params.status} className={hrField}><option value="">Current employees</option><option value="active">Active</option><option value="probation">Probation</option><option value="on_leave">On leave</option><option value="terminated">Terminated</option><option value="archived">Archived</option></select></label>
        <label className="text-sm font-semibold">Department<select name="department" defaultValue={params.department} className={hrField}><option value="">All departments</option>{refs.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Designation<select name="designation" defaultValue={params.designation} className={hrField}><option value="">All designations</option>{refs.designations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Work location<select name="location" defaultValue={params.location} className={hrField}><option value="">All locations</option>{refs.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="self-end rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Apply filters</button>
      </form>
      <div className={`${hrCard} overflow-x-auto p-0`}>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]"><tr><th className="p-3">Employee</th><th>Number</th><th>Type</th><th>Department</th><th>Job</th><th>Status</th><th>Hire date</th><th></th></tr></thead>
          <tbody>{data.rows.map((employee) => {
            const person = relation(employee.profiles);
            const department = relation(employee.hr_departments);
            const avatar = person?.avatar_kind === "emoji" && person.avatar_emoji ? person.avatar_emoji : String(person?.full_name || "?").slice(0,1).toUpperCase();
            return <tr key={employee.id} className="border-t">
              <td className="p-3"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-lg font-semibold text-blue-800">{avatar}</span><span><strong>{display(person?.full_name)}</strong><p className="text-xs text-[var(--muted-text)]">{display(person?.email)} · {display(person?.phone)}</p></span></div></td>
              <td>{employee.employee_number}</td><td className="capitalize">{employee.employment_type.replaceAll("_"," ")}</td><td>{display(department?.name)}</td><td>{employee.job_title}</td><td className="capitalize">{employee.archived_at ? "archived" : employee.employment_status.replaceAll("_"," ")}</td><td>{employee.hire_date}</td><td><a href={`${routes.adminHrEmployees}/${employee.id}`} className="font-semibold text-blue-700">Open →</a></td>
            </tr>;
          })}</tbody>
        </table>
        {!data.rows.length ? <p className="p-10 text-center text-[var(--muted-text)]">No employee records match these filters.</p> : null}
      </div>
      <div className="mt-4 flex items-center justify-between"><a aria-disabled={data.page<=1} href={`?${new URLSearchParams({...params,page:String(Math.max(1,data.page-1))})}`} className="rounded border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-40">Previous</a><span>Page {data.page} of {totalPages}</span><a aria-disabled={data.page>=totalPages} href={`?${new URLSearchParams({...params,page:String(Math.min(totalPages,data.page+1))})}`} className="rounded border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-40">Next</a></div>
    </HrPage>
  );
}
