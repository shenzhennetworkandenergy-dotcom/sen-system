alter table public.cashbook_entries
  add column remark text not null default ''
  check (char_length(remark) <= 240);

create or replace function public.create_cashbook_entry(
  actor_profile_id uuid,
  requested_description_id uuid,
  requested_amount numeric,
  requested_payment_method text,
  requested_occurred_at timestamptz,
  requested_business_date date,
  requested_remark text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  created_entry_id uuid;
  normalized_remark text:=trim(coalesce(requested_remark,''));
begin
  if char_length(normalized_remark)>240 then
    raise exception 'Short remark cannot exceed 240 characters';
  end if;

  created_entry_id:=public.create_cashbook_entry(
    actor_profile_id,
    requested_description_id,
    requested_amount,
    requested_payment_method,
    requested_occurred_at,
    requested_business_date
  );

  update public.cashbook_entries
  set remark=normalized_remark
  where id=created_entry_id;

  return created_entry_id;
end $$;

revoke all on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date,text) from public,anon,authenticated;
grant execute on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date,text) to service_role;
