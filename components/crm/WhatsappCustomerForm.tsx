import { whatsappCrmStatuses, type WhatsappCustomerRecord } from "@/lib/crm/whatsapp-records";

type Staff = { id: string; full_name: string | null; email: string };

export function WhatsappCustomerForm({
  action,
  record,
  staff,
}: {
  action: (form: FormData) => Promise<void>;
  record?: WhatsappCustomerRecord | null;
  staff: readonly Staff[];
}) {
  const input = "rounded-lg border px-3 py-2";
  return <form action={action} className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 md:grid-cols-2">
    <label className="grid gap-1 text-sm font-semibold">WhatsApp name<input required className={input} name="whatsapp_name" defaultValue={record?.whatsapp_name} /></label>
    <label className="grid gap-1 text-sm font-semibold">WhatsApp number<input required className={input} name="whatsapp_number" defaultValue={record?.whatsapp_number} placeholder="8801XXXXXXXXX" /></label>
    <label className="grid gap-1 text-sm font-semibold md:col-span-2">Messenger profile / conversation link<input className={input} name="messenger_profile_link" type="url" defaultValue={record?.messenger_profile_link} /></label>
    <label className="grid gap-1 text-sm font-semibold">Interested products<input className={input} name="interested_products" defaultValue={record?.interested_products} /></label>
    <label className="grid gap-1 text-sm font-semibold">Quantity / requirements<input className={input} name="quantity_requirements" defaultValue={record?.quantity_requirements} /></label>
    <label className="grid gap-1 text-sm font-semibold">Urgency<input className={input} name="urgency" defaultValue={record?.urgency} /></label>
    <label className="grid gap-1 text-sm font-semibold">Status<select className={input} name="status" defaultValue={record?.status ?? "new"}>{whatsappCrmStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold md:col-span-2">Assigned to<select className={input} name="assigned_to" defaultValue={record?.assigned_to}><option value="">Assign to me</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold md:col-span-2">Full selected conversation history<textarea required className={`${input} min-h-44 font-mono text-xs`} name="conversation_history" defaultValue={record?.conversation_history} placeholder="2026-09-28T10:15+06:00|C|Customer message" /><small className="font-normal text-[var(--muted-text)]">One line per message: timestamp|C|customer text or timestamp|S|SEN text. Store voice as [Voice transcript] text, useful files as [Attachment] descriptions, and opt-outs as [Do not contact]. Never include OTPs, passwords, payment data, unrelated chats, groups, or binary files.</small></label>
    <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)] md:col-span-2">Save customer and synchronize CRM</button>
  </form>;
}
