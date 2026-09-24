-- Donation recurring-support reminder controls only.

alter table public.donation_monthly_support
  add column if not exists skip_note text,
  add column if not exists skipped_by uuid references public.profiles(id) on delete set null;

create or replace function public.ensure_donation_monthly_support_reminders(requested_date date default current_date)
returns integer
language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  insert into public.donation_monthly_support (
    beneficiary_id, support_month, reminder_day_of_month, amount, category_id, payment_method_id, purpose
  )
  select id, date_trunc('month', requested_date)::date, reminder_day_of_month,
         default_monthly_amount, default_category_id, default_payment_method_id, default_purpose
  from public.donation_beneficiaries
  where is_active and monthly_support_enabled
    and date_trunc('month', support_start_date) <= date_trunc('month', requested_date)
    and (support_end_date is null or support_end_date >= date_trunc('month', requested_date)::date)
  on conflict (beneficiary_id, support_month) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.skip_donation_monthly_support_reminder(
  requested_reminder_id uuid,
  requested_actor_id uuid,
  requested_note text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  current_status text;
begin
  select status into current_status
  from public.donation_monthly_support
  where id = requested_reminder_id
  for update;

  if not found then
    raise exception 'Monthly support reminder not found' using errcode = 'P0002';
  end if;
  if current_status <> 'PENDING' then
    raise exception 'Monthly support reminder is no longer pending' using errcode = '23514';
  end if;

  update public.donation_monthly_support
  set status = 'SKIPPED',
      skipped_at = now(),
      skipped_by = requested_actor_id,
      skip_note = nullif(btrim(coalesce(requested_note, '')), '')
  where id = requested_reminder_id;

  return 'SKIPPED';
end;
$$;

revoke all on function public.skip_donation_monthly_support_reminder(uuid, uuid, text) from public;
grant execute on function public.skip_donation_monthly_support_reminder(uuid, uuid, text) to service_role;
