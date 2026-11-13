-- Reuse the existing correction status and keep the submitted statement intact
-- until its owner submits a corrected version in one transaction.
create index if not exists cashbook_days_personal_correction_idx
  on public.cashbook_days (cashbook_owner_id, business_date desc)
  where cashbook_scope = 'PERSONAL' and is_closed and audit_status = 'CORRECTION_REQUIRED';

create function public.review_cashbook_submission(
  actor_profile_id uuid,
  requested_cashbook_day_id uuid,
  expected_updated_at timestamptz,
  requested_decision text,
  requested_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  day_row public.cashbook_days%rowtype;
begin
  perform public.assert_actor_permission(actor_profile_id, 'accounting.audit_cashbook');
  select * into day_row from public.cashbook_days
  where cashbook_day_id = requested_cashbook_day_id for update;
  if not found or not day_row.is_closed or day_row.audit_status <> 'PENDING_AUDIT' then
    raise exception 'Only cashbook days pending audit can be reviewed';
  end if;
  if expected_updated_at is null or day_row.updated_at is distinct from expected_updated_at then
    raise exception 'This cashbook submission changed. Reload and review the latest statement';
  end if;

  if requested_decision = 'APPROVE' then
    perform public.approve_cashbook_audit(actor_profile_id, requested_cashbook_day_id, requested_note);
  elsif requested_decision = 'RETURN' and day_row.cashbook_scope = 'PERSONAL' then
    perform public.request_cashbook_correction(actor_profile_id, requested_cashbook_day_id, requested_note);
  else
    raise exception 'Only personal cashbook days can be returned to their owner';
  end if;
end;
$$;

create function public.resubmit_cashbook_correction(
  actor_profile_id uuid,
  requested_cashbook_day_id uuid,
  requested_business_date date,
  expected_updated_at timestamptz,
  requested_opening_balance numeric,
  requested_changes jsonb
) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  day_row public.cashbook_days%rowtype;
  later_day public.cashbook_days%rowtype;
  entry_row public.cashbook_entries%rowtype;
  original_journal public.journal_entries%rowtype;
  change jsonb;
  entry_id uuid;
  replacement_id uuid;
  reversal_id uuid;
  actor_role public.account_role;
  new_closing numeric(18,2);
  balance_delta numeric(18,2);
  previous_closing numeric(18,2);
  change_history jsonb := '[]'::jsonb;
begin
  perform public.assert_actor_permission(actor_profile_id, 'accounting.create_entry');
  perform public.lock_cashbook_timeline(actor_profile_id);
  select * into day_row from public.cashbook_days
  where cashbook_day_id = requested_cashbook_day_id
    and cashbook_scope = 'PERSONAL'
    and cashbook_owner_id = actor_profile_id
    and business_date = requested_business_date
  for update;
  if not found or not day_row.is_closed or day_row.audit_status <> 'CORRECTION_REQUIRED' then
    raise exception 'Only your returned personal cashbook day can be resubmitted';
  end if;
  if expected_updated_at is null or day_row.updated_at is distinct from expected_updated_at then
    raise exception 'This cashbook correction changed. Reload the day before resubmitting';
  end if;
  if requested_opening_balance is null or requested_opening_balance < 0
     or requested_opening_balance >= 10000000000000000 then
    raise exception 'Enter a valid opening cash balance';
  end if;
  if jsonb_typeof(requested_changes) is distinct from 'array'
     or jsonb_array_length(requested_changes) > 1000 then
    raise exception 'Invalid cashbook correction entries';
  end if;
  if exists (
    select 1 from jsonb_array_elements(requested_changes) item
    where nullif(item->>'entry_id', '') is not null
    group by (item->>'entry_id')::uuid having count(*) > 1
  ) then
    raise exception 'A cashbook entry can only be corrected once per submission';
  end if;

  select role into actor_role from public.profiles where id = actor_profile_id;
  -- This intermediate state is visible only inside the transaction. Normal
  -- cashbook writers acquire the same owner lock and see a closed day.
  update public.cashbook_days
  set opening_balance = round(requested_opening_balance, 2), is_closed = false,
      closing_balance = null, closed_at = null, closed_by = null
  where cashbook_day_id = day_row.cashbook_day_id;

  for change in select value from jsonb_array_elements(requested_changes)
  loop
    entry_id := nullif(change->>'entry_id', '')::uuid;
    replacement_id := null;
    reversal_id := null;
    if entry_id is not null then
      select * into entry_row from public.cashbook_entries
      where id = entry_id and cashbook_day_id = day_row.cashbook_day_id
        and cashbook_scope = 'PERSONAL' and cashbook_owner_id = actor_profile_id
      for update;
      if not found or entry_row.sale_payment_id is not null or entry_row.source_payment_method is not null then
        raise exception 'Only manual entries on this returned cashbook day can be corrected';
      end if;
      select * into original_journal from public.journal_entries
      where id = entry_row.journal_entry_id and status = 'posted' and reference_type = 'manual'
        and reference_id = entry_row.id and entry_date = day_row.business_date and currency = 'BDT'
        and reversal_of is null
      for update;
      if not found or exists (select 1 from public.journal_entries where reversal_of = original_journal.id)
         or exists (select 1 from public.receivable_transactions where cashbook_entry_id = entry_row.id)
         or exists (select 1 from public.receivable_accounting_postings where cashbook_entry_id = entry_row.id) then
        raise exception 'This cashbook entry is linked to another transaction and cannot be corrected here';
      end if;

      reversal_id := gen_random_uuid();
      insert into public.journal_entries (
        id, entry_number, entry_date, description, reference_type, reference_id, status,
        currency, created_by, posted_by, posted_at, reversal_of
      ) values (
        reversal_id, public.next_journal_entry_number(), day_row.business_date,
        'Cashbook correction: ' || original_journal.entry_number, 'adjustment', entry_row.id,
        'posted', 'BDT', actor_profile_id, actor_profile_id, now(), original_journal.id
      );
      insert into public.journal_lines (journal_entry_id, account_id, description, debit, credit)
      select reversal_id, account_id, description, credit, debit from public.journal_lines
      where journal_entry_id = original_journal.id;
      if not found then raise exception 'The original cashbook journal has no lines to reverse'; end if;
      delete from public.cashbook_entries where id = entry_row.id;
    end if;

    if coalesce(change->>'operation', '') = 'save' then
      replacement_id := public.create_cashbook_entry(
        actor_profile_id, (change->>'description_id')::uuid, (change->>'amount')::numeric,
        change->>'payment_method', (change->>'occurred_at')::timestamptz,
        day_row.business_date, change->>'remark'
      );
    elsif change->>'operation' is distinct from 'remove' or entry_id is null then
      raise exception 'Invalid cashbook correction operation';
    end if;

    change_history := change_history || jsonb_build_array(jsonb_build_object(
      'original_entry', case when entry_id is not null then to_jsonb(entry_row) end,
      'replacement_entry_id', replacement_id, 'reversal_journal_id', reversal_id
    ));
  end loop;

  new_closing := public.close_cashbook_day(actor_profile_id, day_row.business_date);
  balance_delta := new_closing - day_row.closing_balance;
  previous_closing := day_row.closing_balance;

  -- Follow inherited balances only. An independently set opening balance ends
  -- the carry-forward chain. Never rewrite a balance an auditor approved.
  if balance_delta <> 0 then
    for later_day in
      select * from public.cashbook_days
      where cashbook_scope = 'PERSONAL' and cashbook_owner_id = actor_profile_id
        and business_date > day_row.business_date
      order by business_date
      for update
    loop
      exit when later_day.opening_balance <> previous_closing;
      if later_day.audit_status = 'APPROVED' then
        raise exception 'This correction changes the opening balance of approved cashbook day %. Ask the auditor to reconcile that balance', later_day.business_date;
      end if;
      if later_day.opening_balance + balance_delta < 0 then
        raise exception 'This correction would make the opening balance of cashbook day % negative', later_day.business_date;
      end if;
      update public.cashbook_days
      set opening_balance = opening_balance + balance_delta,
          closing_balance = closing_balance + balance_delta,
          updated_by = actor_profile_id, updated_at = clock_timestamp()
      where cashbook_day_id = later_day.cashbook_day_id;
      insert into public.audit_logs (actor_id, actor_role, action, module, entity_type, entity_id, description, old_values, new_values)
      values (actor_profile_id, actor_role, 'accounting.cashbook_carry_forward_corrected',
        'accounting', 'cashbook_day', later_day.cashbook_day_id::text, 'Updated inherited cashbook balance.',
        jsonb_build_object('opening_balance', later_day.opening_balance, 'closing_balance', later_day.closing_balance),
        jsonb_build_object('opening_balance', later_day.opening_balance + balance_delta,
          'closing_balance', later_day.closing_balance + balance_delta, 'source_day_id', day_row.cashbook_day_id));
      exit when not later_day.is_closed;
      previous_closing := later_day.closing_balance;
    end loop;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, module, entity_type, entity_id, description, old_values, new_values)
  values (actor_profile_id, actor_role, 'accounting.cashbook_correction_resubmitted',
    'accounting', 'cashbook_day', day_row.cashbook_day_id::text, 'Corrected cashbook day submitted for audit.',
    jsonb_build_object('audit_status', day_row.audit_status, 'opening_balance', day_row.opening_balance,
      'closing_balance', day_row.closing_balance, 'correction_reason', day_row.correction_reason,
      'correction_requested_by', day_row.correction_requested_by, 'correction_requested_at', day_row.correction_requested_at),
    jsonb_build_object('business_date', day_row.business_date, 'audit_status', 'PENDING_AUDIT',
      'opening_balance', round(requested_opening_balance, 2), 'closing_balance', new_closing, 'entries', change_history));
  return new_closing;
end;
$$;

revoke all on function public.review_cashbook_submission(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.resubmit_cashbook_correction(uuid, uuid, date, timestamptz, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.review_cashbook_submission(uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.resubmit_cashbook_correction(uuid, uuid, date, timestamptz, numeric, jsonb) to service_role;

notify pgrst, 'reload schema';
