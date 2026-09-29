-- Private immutable CSV storage for the WhatsApp/Messenger CRM workspace.

insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-whatsapp-csv', 'crm-whatsapp-csv', false, 52428800)
on conflict (id) do update set public = false;

insert into public.system_settings (key, value)
values ('crm_whatsapp_csv_manifest:production', '{}'::jsonb)
on conflict (key) do nothing;

create or replace function public.publish_crm_whatsapp_csv_manifest(
  storage_namespace text,
  expected_revision text,
  next_manifest jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  manifest_key text;
  current_revision text;
begin
  if storage_namespace is null
     or length(storage_namespace) > 48
     or storage_namespace !~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$' then
    raise exception 'Invalid CRM WhatsApp storage namespace';
  end if;

  if nullif(next_manifest ->> 'revision', '') is null
     or nullif(next_manifest ->> 'updatedAt', '') is null then
    raise exception 'Invalid CRM WhatsApp manifest';
  end if;

  manifest_key := 'crm_whatsapp_csv_manifest:' || storage_namespace;

  insert into public.system_settings (key, value)
  values (manifest_key, '{}'::jsonb)
  on conflict (key) do nothing;

  select value ->> 'revision'
    into current_revision
    from public.system_settings
    where key = manifest_key
    for update;

  if current_revision is distinct from expected_revision then
    return false;
  end if;

  update public.system_settings
     set value = next_manifest,
         updated_by = null,
         updated_at = now()
   where key = manifest_key;
  return true;
end;
$$;

revoke all on function public.publish_crm_whatsapp_csv_manifest(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_crm_whatsapp_csv_manifest(text,text,jsonb) to service_role;
