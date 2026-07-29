-- Rule-based public product assistant inquiries, secured behind server routes.

create sequence if not exists public.crm_chatbot_inquiry_number_seq start 1;

create table if not exists public.crm_chatbot_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number text not null unique,
  session_id uuid not null,
  submission_key uuid not null,
  status text not null default 'collecting_contact'
    check (status in ('collecting_contact','new','contacted','qualified','converted','closed','cancelled','spam')),
  product_query text not null check (char_length(product_query) between 2 and 500),
  phone_number text,
  whatsapp text,
  source_page text not null default '/',
  language text not null default 'bn-en',
  consent_to_contact boolean not null default false,
  update_token_hash text not null check (char_length(update_token_hash)=64),
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(session_id,submission_key)
);

create index if not exists crm_chatbot_inquiries_status_created_idx
  on public.crm_chatbot_inquiries(status,created_at desc);
create index if not exists crm_chatbot_inquiries_phone_idx
  on public.crm_chatbot_inquiries(phone_number) where phone_number is not null;
create index if not exists crm_chatbot_inquiries_whatsapp_idx
  on public.crm_chatbot_inquiries(whatsapp) where whatsapp is not null;
create index if not exists crm_chatbot_inquiries_session_idx
  on public.crm_chatbot_inquiries(session_id,created_at desc);
create index if not exists crm_chatbot_inquiries_ip_created_idx
  on public.crm_chatbot_inquiries(ip_hash,created_at desc) where ip_hash is not null;

create or replace function public.crm_chatbot_touch_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end $$;

drop trigger if exists crm_chatbot_inquiries_touch_updated_at on public.crm_chatbot_inquiries;
create trigger crm_chatbot_inquiries_touch_updated_at
before update on public.crm_chatbot_inquiries
for each row execute function public.crm_chatbot_touch_updated_at();

create or replace function public.next_crm_chatbot_inquiry_number()
returns text language sql volatile security definer set search_path='' as $$
  select 'CHAT-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.crm_chatbot_inquiry_number_seq')::text,6,'0');
$$;

alter table public.crm_chatbot_inquiries enable row level security;

drop policy if exists "authorized staff read chatbot inquiries" on public.crm_chatbot_inquiries;
create policy "authorized staff read chatbot inquiries"
on public.crm_chatbot_inquiries for select to authenticated
using(public.current_user_has_permission('crm.view'));

revoke all on table public.crm_chatbot_inquiries from public,anon,authenticated;
grant select on table public.crm_chatbot_inquiries to authenticated;
grant all on table public.crm_chatbot_inquiries to service_role;
revoke all on function public.next_crm_chatbot_inquiry_number() from public,anon,authenticated;
grant execute on function public.next_crm_chatbot_inquiry_number() to service_role;
grant usage,select on sequence public.crm_chatbot_inquiry_number_seq to service_role;
