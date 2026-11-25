-- Company WhatsApp is an explicit, sensitive grant. Existing grants/templates stay unchanged.
-- Only adds a catalogue row; no schema changes or automatic employee access.
do $$
begin
  if not exists (select 1 from public.app_modules where key = 'crm' and is_active) then
    raise exception 'Active CRM permission module is required';
  end if;
end;
$$;

insert into public.permissions (module_id, key, name, description, action, is_sensitive, sort_order)
select id, 'crm.send_whatsapp', 'Use company WhatsApp',
  'Read and send company WhatsApp messages within assigned customer categories.',
  'send_whatsapp', true, 60
from public.app_modules where key = 'crm' and is_active
on conflict (key) do nothing;
