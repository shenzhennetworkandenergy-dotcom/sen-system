import {
  cancelCrmFollowupAction,
  completeCrmFollowupAction,
  createCrmFollowupAction,
  recordCrmFollowupActivityAction,
  rescheduleCrmFollowupAction,
  setCrmDoNotContactAction,
  updateCrmFollowupAction,
} from "@/app/admin/crm/actions";
import {
  crmActivityDirections,
  crmCommunicationChannels,
  crmFollowupReasons,
} from "@/lib/crm/types";

const input = "w-full rounded-lg border bg-[var(--surface)] px-3 py-2";
const label = "grid gap-1 text-sm font-semibold";
const button = "rounded-lg border px-3 py-2 text-sm font-bold";
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

type Staff = { id: string; full_name: string | null; email: string };
type Followup = {
  id: string;
  reason: string;
  reason_details: string | null;
  instruction: string;
  interest_summary: string | null;
  conversation_summary: string | null;
  preferred_channel: string;
  assigned_to: string | null;
  priority: string;
  status: string;
  manual_review: boolean;
  next_follow_up_at: string | null;
};

function HiddenReturn({ value }: { value: string }) {
  return <input type="hidden" name="return_to" value={value} />;
}

function FollowupFields({ staff, current, canAssign }: { staff: Staff[]; current?: Followup; canAssign: boolean }) {
  return <>
    <label className={label}>Status<select className={input} name="status" defaultValue={current?.status ?? "active"}><option value="active">Active</option><option value="waiting_customer">Waiting Customer</option></select></label>
    <label className={label}>Reason<select className={input} name="reason" defaultValue={current?.reason ?? "general_follow_up"}>{crmFollowupReasons.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>
    <label className={label}>Reason details<input className={input} name="reason_details" defaultValue={current?.reason_details ?? ""} maxLength={500} /></label>
    <label className={label}>Preferred channel<select className={input} name="preferred_channel" defaultValue={current?.preferred_channel ?? "whatsapp"}>{crmCommunicationChannels.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>
    <label className={label}>Priority<select className={input} name="priority" defaultValue={current?.priority ?? "normal"}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
    <label className={label}>Assigned to<select className={input} name="assigned_to" defaultValue={current?.assigned_to ?? ""} disabled={!canAssign}><option value="">Current lead owner / me</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select>{!canAssign && current?.assigned_to ? <input type="hidden" name="assigned_to" value={current.assigned_to} /> : null}</label>
    <label className={`${label} md:col-span-2`}>Follow-up instruction *<textarea className={input} name="instruction" required rows={2} defaultValue={current?.instruction ?? ""} /></label>
    <label className={`${label} md:col-span-2`}>Customer interest / requirement<textarea className={input} name="interest_summary" rows={2} defaultValue={current?.interest_summary ?? ""} /></label>
    <label className={`${label} md:col-span-2`}>Conversation summary<textarea className={input} name="conversation_summary" rows={2} defaultValue={current?.conversation_summary ?? ""} /></label>
    <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2"><input type="checkbox" name="manual_review" defaultChecked={current?.manual_review} /> Requires manual review</label>
  </>;
}

export function CreateFollowupForm({ leadId, staff, canAssign, returnTo }: { leadId: string; staff: Staff[]; canAssign: boolean; returnTo: string }) {
  return <form action={createCrmFollowupAction.bind(null, leadId)} className="grid gap-3 md:grid-cols-2">
    <HiddenReturn value={returnTo} />
    <FollowupFields staff={staff} canAssign={canAssign} />
    <label className={label}>Last contact<input className={input} name="last_contact_at" type="datetime-local" /></label>
    <label className={label}>Next follow-up *<input className={input} name="next_follow_up_at" type="datetime-local" required /></label>
    <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)] md:col-span-2">Add follow-up</button>
  </form>;
}

export function FollowupActionForms({ followup, staff, canEdit, canComplete, canAssign, returnTo }: { followup: Followup; staff: Staff[]; canEdit: boolean; canComplete: boolean; canAssign: boolean; returnTo: string }) {
  const active = ["active", "waiting_customer"].includes(followup.status);
  if (!active) return <span className="text-xs text-[var(--muted-text)]">Historical record</span>;
  return <div className="grid min-w-[12rem] gap-1">
    {canEdit ? <details><summary className={button}>Add activity</summary><form action={recordCrmFollowupActivityAction.bind(null, followup.id)} className="mt-2 grid gap-2 rounded-xl border p-3"><HiddenReturn value={returnTo} /><label className={label}>Type<select className={input} name="activity_type"><option value="note">Note</option><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="customer_reply">Customer Reply</option><option value="quotation_discussion">Quotation Discussion</option><option value="other">Other</option></select></label><label className={label}>Channel<select className={input} name="channel" defaultValue={followup.preferred_channel}>{crmCommunicationChannels.map((item) => <option key={item}>{item}</option>)}</select></label><label className={label}>Direction<select className={input} name="direction">{crmActivityDirections.map((item) => <option key={item}>{item}</option>)}</select></label><label className={label}>Summary *<textarea className={input} name="summary" required /></label><label className={label}>Outcome<input className={input} name="outcome" /></label><label className={label}>Customer response<textarea className={input} name="customer_response" /></label><button className={button}>Save activity</button></form></details> : null}
    {canEdit ? <details><summary className={button}>Reschedule</summary><form action={rescheduleCrmFollowupAction.bind(null, followup.id)} className="mt-2 grid gap-2 rounded-xl border p-3"><HiddenReturn value={returnTo} /><label className={label}>New date and time *<input className={input} type="datetime-local" name="next_follow_up_at" required /></label><label className={label}>Why rescheduled? *<textarea className={input} name="reschedule_reason" required /></label><label className={label}>Next instruction *<textarea className={input} name="instruction" defaultValue={followup.instruction} required /></label><button className={button}>Confirm reschedule</button></form></details> : null}
    {canComplete ? <details><summary className={`${button} border-emerald-300 text-emerald-800`}>Complete</summary><form action={completeCrmFollowupAction.bind(null, followup.id)} className="mt-2 grid gap-2 rounded-xl border p-3"><HiddenReturn value={returnTo} /><label className={label}>Outcome *<input className={input} name="outcome" required /></label><label className={label}>Summary *<textarea className={input} name="summary" required /></label><label className={label}>Channel<select className={input} name="channel" defaultValue={followup.preferred_channel}>{crmCommunicationChannels.map((item) => <option key={item}>{item}</option>)}</select></label><label className={label}>Customer response / notes<textarea className={input} name="customer_response" /></label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="schedule_next" /> Schedule another follow-up</label><label className={label}>Next date<input className={input} type="datetime-local" name="next_follow_up_at" /></label><label className={label}>Next reason<select className={input} name="next_reason">{crmFollowupReasons.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label><label className={label}>Next instruction<textarea className={input} name="next_instruction" /></label><label className={label}>Next priority<select className={input} name="next_priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select></label><button className={button}>Complete follow-up</button></form></details> : null}
    {canEdit ? <details><summary className={`${button} border-red-200 text-red-700`}>Cancel</summary><form action={cancelCrmFollowupAction.bind(null, followup.id)} className="mt-2 grid gap-2 rounded-xl border p-3"><HiddenReturn value={returnTo} /><label className={label}>Cancellation reason *<textarea className={input} name="cancellation_reason" required /></label><button className={button}>Cancel follow-up</button></form></details> : null}
    {canEdit ? <details><summary className={button}>Edit details</summary><form action={updateCrmFollowupAction.bind(null, followup.id)} className="mt-2 grid gap-2 rounded-xl border p-3 md:grid-cols-2"><HiddenReturn value={returnTo} /><FollowupFields staff={staff} current={followup} canAssign={canAssign} /><button className={`${button} md:col-span-2`}>Save changes</button></form></details> : null}
  </div>;
}

export function DoNotContactForm({ leadId, enabled, reason, returnTo }: { leadId: string; enabled: boolean; reason?: string | null; returnTo: string }) {
  return <form action={setCrmDoNotContactAction.bind(null, leadId)} className="grid gap-2"><HiddenReturn value={returnTo} /><label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="enabled" defaultChecked={enabled} /> Do not contact</label><label className={label}>Reason<textarea className={input} name="reason" defaultValue={reason ?? ""} /></label><button className={button}>Update contact restriction</button></form>;
}
