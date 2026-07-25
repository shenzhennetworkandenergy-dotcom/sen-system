import { createCrmActivityAction, createCrmCompanyAction, createCrmContactAction, createCrmLeadAction, updateCrmLeadStatusAction } from "@/app/admin/crm/actions";
import { crmActivityTypes, crmLeadPriorities, crmLeadSources, crmLeadStatuses } from "@/lib/crm/types";

const input = "w-full rounded-lg border bg-[var(--surface)] px-3 py-2";
const label = "grid gap-1 text-sm font-semibold";
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function CompanyForm() {
  return <form action={createCrmCompanyAction} className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 md:grid-cols-2">
    <h2 className="md:col-span-2 text-lg font-bold">Add company</h2>
    <label className={label}>Company name *<input className={input} name="name" required maxLength={180}/></label>
    <label className={label}>Legal name<input className={input} name="legal_name" maxLength={180}/></label>
    <label className={label}>Industry<input className={input} name="industry"/></label>
    <label className={label}>Status<select className={input} name="status"><option>active</option><option>prospect</option><option>inactive</option></select></label>
    <label className={label}>Email<input className={input} name="email" type="email"/></label>
    <label className={label}>Phone<input className={input} name="phone"/></label>
    <label className={label}>Country code<input className={input} name="country_code" maxLength={2}/></label>
    <label className={label}>Country<input className={input} name="country_name"/></label>
    <label className={`${label} md:col-span-2`}>Address<textarea className={input} name="address"/></label>
    <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)] md:col-span-2">Create company</button>
  </form>;
}

export function ContactForm({ companies }: { companies: { id: string; name: string }[] }) {
  return <form action={createCrmContactAction} className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 md:grid-cols-2">
    <h2 className="md:col-span-2 text-lg font-bold">Add contact</h2>
    <label className={label}>Full name *<input className={input} name="full_name" required maxLength={160}/></label>
    <label className={label}>Company<select className={input} name="company_id"><option value="">No company</option>{companies.map((company)=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
    <label className={label}>Email<input className={input} name="email" type="email"/></label>
    <label className={label}>Phone<input className={input} name="phone"/></label>
    <label className={label}>Job title<input className={input} name="job_title"/></label>
    <label className={label}>Preferred contact<select className={input} name="preferred_contact_method"><option>email</option><option>phone</option><option>whatsapp</option><option>other</option></select></label>
    <p className="text-xs text-[var(--muted-text)] md:col-span-2">Provide an email or phone number.</p>
    <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)] md:col-span-2">Create contact</button>
  </form>;
}

export function LeadForm({ companies, contacts, staff }: { companies: {id:string;name:string}[]; contacts:{id:string;full_name:string}[]; staff:{id:string;full_name:string|null;email:string}[] }) {
  return <form action={createCrmLeadAction} className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 md:grid-cols-2">
    <label className={`${label} md:col-span-2`}>Lead title *<input className={input} name="title" required maxLength={200}/></label>
    <label className={label}>Company<select className={input} name="company_id"><option value="">Select company</option>{companies.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className={label}>Contact<select className={input} name="contact_id"><option value="">Select contact</option>{contacts.map((item)=><option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
    <label className={label}>Source<select className={input} name="source">{crmLeadSources.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select></label>
    <label className={label}>Priority<select className={input} name="priority">{crmLeadPriorities.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select></label>
    <label className={label}>Estimated value (BDT)<input className={input} name="estimated_value" type="number" min="0" step="0.01" defaultValue="0"/></label>
    <label className={label}>Expected close date<input className={input} name="expected_close_date" type="date"/></label>
    <label className={`${label} md:col-span-2`}>Assigned to<select className={input} name="assigned_to"><option value="">Unassigned</option>{staff.map((item)=><option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></label>
    <label className={`${label} md:col-span-2`}>Description<textarea className={input} name="description" rows={4}/></label>
    <p className="text-xs text-[var(--muted-text)] md:col-span-2">A company or contact is required.</p>
    <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)] md:col-span-2">Create lead</button>
  </form>;
}

export function LeadStatusForm({ leadId, current }: { leadId:string; current:string }) {
  return <form action={updateCrmLeadStatusAction.bind(null,leadId)} className="flex flex-wrap items-end gap-2">
    <label className={label}>Status<select className={input} name="status" defaultValue={current}>{crmLeadStatuses.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select></label>
    <label className={label}>Lost reason<input className={input} name="lost_reason"/></label>
    <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">Update status</button>
  </form>;
}

export function ActivityForm({ leadId, companyId, contactId }: { leadId:string; companyId?:string|null; contactId?:string|null }) {
  return <form action={createCrmActivityAction.bind(null,leadId)} className="grid gap-3 md:grid-cols-2">
    <input type="hidden" name="company_id" value={companyId ?? ""}/><input type="hidden" name="contact_id" value={contactId ?? ""}/>
    <label className={label}>Type<select className={input} name="activity_type">{crmActivityTypes.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select></label>
    <label className={label}>Subject *<input className={input} name="subject" required/></label>
    <label className={label}>Follow-up time<input className={input} name="due_at" type="datetime-local"/></label>
    <label className="flex items-center gap-2 self-end py-2"><input type="checkbox" name="completed"/> Completed</label>
    <label className={`${label} md:col-span-2`}>Details<textarea className={input} name="details" rows={3}/></label>
    <button className="rounded-lg border px-4 py-2 font-bold md:col-span-2">Record activity</button>
  </form>;
}
