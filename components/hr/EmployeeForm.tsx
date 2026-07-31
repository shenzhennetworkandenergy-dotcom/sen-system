import { hrField, hrPrimary } from "./HrPage";
import { saveEmployeeAction } from "@/app/admin/hr/hr-actions";
import { CurrencyCombobox } from "@/components/forms/CurrencyCombobox";
import { EmployeeScheduleEditor } from "./EmployeeScheduleEditor";
import type { EmployeeScheduleRow } from "@/lib/hr/types";

type Reference = { id: string; name?: string | null; full_name?: string | null; email?: string | null; role?: string; status?: string; timezone?: string | null };

export function EmployeeForm({
  refs,
  record,
  personal,
  schedule,
}: {
  refs: {
    departments: Reference[];
    teams: Reference[];
    designations: Reference[];
    profiles: Reference[];
    locations: Reference[];
    settings?: { workday_start?: string | null; workday_end?: string | null } | null;
  };
  record?: Record<string, unknown> | null;
  personal?: Record<string, unknown> | null;
  schedule?: EmployeeScheduleRow[] | null;
}) {
  const value = (source: Record<string, unknown> | null | undefined, key: string) => String(source?.[key] ?? "");
  const label = (item: Reference) => item.name || item.full_name || item.email || item.id;
  return (
    <form action={saveEmployeeAction} className="space-y-5" encType="multipart/form-data">
      {record ? <input type="hidden" name="employee_id" value={value(record,"id")}/> : null}
      <input type="hidden" name="return_to" value={record ? `/admin/hr/employees/${value(record,"id")}` : "/admin/hr/employees/new"}/>
      <section className="rounded-2xl border bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Employment</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-semibold">Account<select name="profile_id" required defaultValue={value(record,"profile_id")} className={hrField}><option value="">Select employee account</option>{refs.profiles.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
          <label className="text-sm font-semibold">Job title<input name="job_title" required minLength={2} defaultValue={value(record,"job_title")} className={hrField}/></label>
          <label className="text-sm font-semibold">Hire date<input type="date" name="hire_date" required defaultValue={value(record,"hire_date")} className={hrField}/></label>
          <label className="text-sm font-semibold">Employment type<select name="employment_type" defaultValue={value(record,"employment_type") || "full_time"} className={hrField}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></label>
          <label className="text-sm font-semibold">Status<select name="employment_status" defaultValue={value(record,"employment_status") || "active"} className={hrField}><option value="active">Active</option><option value="probation">Probation</option><option value="on_leave">On leave</option><option value="terminated">Terminated</option></select></label>
          <label className="text-sm font-semibold">Department<select name="department_id" defaultValue={value(record,"department_id")} className={hrField}><option value="">Unassigned</option>{refs.departments.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
          <label className="text-sm font-semibold">Team<select name="team_id" defaultValue={value(record,"team_id")} className={hrField}><option value="">Unassigned</option>{refs.teams.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
          <label className="text-sm font-semibold">Designation<select name="designation_id" defaultValue={value(record,"designation_id")} className={hrField}><option value="">Unassigned</option>{refs.designations.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
          <label className="text-sm font-semibold">Work location<select name="work_location_id" defaultValue={value(record,"work_location_id")} className={hrField}><option value="">Unassigned</option>{refs.locations.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
          <label className="text-sm font-semibold">Manager<select name="manager_profile_id" defaultValue={value(record,"manager_profile_id")} className={hrField}><option value="">No manager</option>{refs.profiles.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
          <label className="text-sm font-semibold">Base salary<input type="number" min="0" step="0.01" name="base_salary" defaultValue={value(record,"base_salary")} className={hrField}/></label>
          <label className="text-sm font-semibold">Currency<CurrencyCombobox name="salary_currency" defaultValue={value(record,"salary_currency") || "BDT"} required className={hrField}/></label>
          <label className="text-sm font-semibold">Emergency contact<input name="emergency_name" defaultValue={value(record,"emergency_contact_name")} className={hrField}/></label>
          <label className="text-sm font-semibold">Emergency phone<input name="emergency_phone" defaultValue={value(record,"emergency_contact_phone")} className={hrField}/></label>
        </div>
      </section>
      <section className="rounded-2xl border bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Personal and statutory information</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["preferred_name","Preferred name"],["date_of_birth","Date of birth"],["nationality","Nationality"],["national_id","National ID"],
            ["passport_number","Passport number"],["personal_email","Personal email"],["personal_phone","Personal phone"],["blood_group","Blood group"],
            ["marital_status","Marital status"],["bank_name","Bank name"],["bank_account_name","Bank account name"],["bank_account_number","Bank account number"],
            ["bank_routing_number","Bank routing number"],["tax_identifier","Tax identifier"],
          ].map(([name,title]) => <label key={name} className="text-sm font-semibold">{title}<input type={name==="date_of_birth"?"date":"text"} name={name} defaultValue={value(personal,name)} className={hrField}/></label>)}
          <label className="text-sm font-semibold">Gender<select name="gender" defaultValue={value(personal,"gender")} className={hrField}><option value="">Not specified</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
          <label className="text-sm font-semibold md:col-span-2">Present address<textarea name="present_address" defaultValue={value(personal,"present_address")} className={hrField}/></label>
          <label className="text-sm font-semibold md:col-span-2">Permanent address<textarea name="permanent_address" defaultValue={value(personal,"permanent_address")} className={hrField}/></label>
          <label className="text-sm font-semibold md:col-span-4">Internal notes<textarea name="personal_notes" defaultValue={value(personal,"notes")} className={hrField}/></label>
        </div>
      </section>
      <EmployeeScheduleEditor
        rows={schedule}
        startTime={String(refs.settings?.workday_start ?? "09:00").slice(0,5)}
        endTime={String(refs.settings?.workday_end ?? "18:00").slice(0,5)}
        timezone={refs.locations[0]?.timezone || "Asia/Dhaka"}
      />
      <button className={hrPrimary}>{record ? "Save employee changes" : "Create employee record"}</button>
    </form>
  );
}
