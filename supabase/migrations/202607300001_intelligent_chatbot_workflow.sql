-- Store bounded chatbot search context and server-validated product snapshots.

alter table public.crm_chatbot_inquiries
  add column if not exists search_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(search_history) = 'array'),
  add column if not exists selected_products jsonb not null default '[]'::jsonb
    check (jsonb_typeof(selected_products) = 'array');

create index if not exists crm_chatbot_inquiries_selected_products_gin
  on public.crm_chatbot_inquiries using gin(selected_products);
