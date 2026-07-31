-- Persistent unread state for CRM Product Assistant inquiries.

alter table public.crm_chatbot_inquiries
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid references public.profiles(id) on delete set null;

create index if not exists crm_chatbot_inquiries_unread_created_idx
  on public.crm_chatbot_inquiries(created_at desc)
  where read_at is null;
