create table public.company_whatsapp_inbox (
  phone_number_id text not null,
  message_id text not null,
  sender text not null,
  received_at timestamptz not null,
  body text not null,
  primary key (phone_number_id, message_id),
  check (char_length(body) between 1 and 4096),
  check (sender ~ '^[1-9][0-9]{7,14}$')
);

create index company_whatsapp_inbox_recent on public.company_whatsapp_inbox
  (phone_number_id, received_at desc, message_id desc);
create index company_whatsapp_inbox_sender_recent on public.company_whatsapp_inbox
  (phone_number_id, sender, received_at desc, message_id desc);

alter table public.company_whatsapp_inbox enable row level security;
revoke all on public.company_whatsapp_inbox from public, anon, authenticated, service_role;
grant select, insert on public.company_whatsapp_inbox to service_role;
