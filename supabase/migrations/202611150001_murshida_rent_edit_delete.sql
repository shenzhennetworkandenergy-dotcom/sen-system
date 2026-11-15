alter table murshida_manzil.rent_transactions
  add column auto_advance_expense boolean not null default false;
alter table murshida_manzil.expenses
  add column rent_advance_receipt_id uuid unique
  references murshida_manzil.rent_transactions(id) on delete restrict;

create index rent_transactions_tenant_recording_order_idx
  on murshida_manzil.rent_transactions (tenant_id, created_at, id);

create table murshida_manzil.rent_receipt_changes (
  id uuid primary key default gen_random_uuid(),
  rent_transaction_id uuid not null,
  operation text not null check (operation in ('edit', 'delete')),
  actor_id uuid not null,
  receipt_before jsonb not null,
  receipt_after jsonb,
  owner_allocations_before jsonb not null,
  advance_adjustments_before jsonb not null,
  linked_expense_before jsonb,
  linked_expense_allocations_before jsonb not null,
  changed_at timestamptz not null default clock_timestamp()
);

revoke all on table murshida_manzil.rent_receipt_changes from public, anon, authenticated, service_role;

create index rent_receipt_changes_deleted_number_idx
  on murshida_manzil.rent_receipt_changes ((receipt_before->>'rent_receipt_number'))
  where operation = 'delete';

-- Keep the rounding order used at issue time: owner creation order, then ID.
-- Existing allocations retain their owner and original percentage.
create function murshida_manzil.recalculate_owner_shares(allocation_type text, transaction_id uuid, amount numeric)
returns void language plpgsql set search_path = '' as $$
declare
  percentage_total numeric;
begin
  select sum(ownership_percentage_snapshot) into percentage_total
  from murshida_manzil.owner_allocations
  where source_type = allocation_type and source_id = transaction_id;
  if percentage_total is null then return; end if;
  if percentage_total <> 100 then
    raise exception 'This receipt''s historical owner percentages do not total 100%%.';
  end if;
  with shares as (
    select allocation.id,
      floor(amount * allocation.ownership_percentage_snapshot) as cents,
      row_number() over (order by owner.created_at, owner.id) as position
    from murshida_manzil.owner_allocations allocation
    join murshida_manzil.owners owner on owner.id = allocation.owner_id
    where allocation.source_type = allocation_type and allocation.source_id = transaction_id
  ), rounded as (
    select id, (cents + case when position <= amount * 100 - sum(cents) over () then 1 else 0 end) / 100
      as allocated_amount from shares
  )
  update murshida_manzil.owner_allocations allocation
  set allocated_amount = rounded.allocated_amount
  from rounded where allocation.id = rounded.id;
end;
$$;

create function murshida_manzil.allocate_rent_owner_shares(receipt_id uuid, expected_amount numeric)
returns void language plpgsql set search_path = '' as $$
declare
  settled numeric;
  active_total numeric;
begin
  select total_rent_settled into settled from murshida_manzil.rent_transactions
  where id = receipt_id for update;
  if not found then raise exception 'Rent receipt was not found.'; end if;
  if settled is distinct from expected_amount then
    raise exception 'The eligible amount must match the current rent receipt total.';
  end if;
  if exists (select 1 from murshida_manzil.owner_allocations
      where source_type = 'rent_income' and source_id = receipt_id) then
    raise exception 'This rent transaction already has owner allocations.';
  end if;
  insert into murshida_manzil.owner_allocations
    (owner_id, source_type, source_id, ownership_percentage_snapshot, allocated_amount)
  select id, 'rent_income', receipt_id, ownership_percentage, 0
  from murshida_manzil.owners where is_active;
  select sum(ownership_percentage_snapshot) into active_total from murshida_manzil.owner_allocations
  where source_type = 'rent_income' and source_id = receipt_id;
  if active_total is distinct from 100 then
    raise exception 'Active ownership percentages must total exactly 100%%.';
  end if;
  perform murshida_manzil.recalculate_owner_shares('rent_income', receipt_id, settled);
end;
$$;

create function murshida_manzil.sync_rent_advance_expense(receipt_id uuid, actor_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  rent murshida_manzil.rent_transactions%rowtype;
  linked_expense_id uuid;
  recipient text;
begin
  select * into rent from murshida_manzil.rent_transactions where id = receipt_id;
  select id into linked_expense_id from murshida_manzil.expenses
  where rent_advance_receipt_id = receipt_id;
  if not coalesce(rent.auto_advance_expense, false) or rent.advance_adjusted = 0 then
    if linked_expense_id is not null then
      delete from murshida_manzil.owner_allocations where source_type = 'expense' and source_id = linked_expense_id;
      delete from murshida_manzil.expenses where id = linked_expense_id;
    end if;
    return;
  end if;

  select name into recipient from murshida_manzil.tenants where id = rent.tenant_id;
  insert into murshida_manzil.expenses (
    rent_advance_receipt_id, expense_date, description, amount, category, paid_to,
    payment_method, voucher_number, owner_allocation_mode, created_by, updated_by
  ) values (
    receipt_id, rent.payment_date, 'পূর্বতন কেয়ারটেকার (সামিউল হাসান) কর্তৃক গ্রহণকৃত ভাড়াটিয়ার অগ্রিম সমন্বয়',
    rent.advance_adjusted, 'Advance Rent Adjustment', recipient, 'cash',
    'MM-ADV-' || receipt_id::text, 'DISTRIBUTE_TO_OWNERS', actor_id, actor_id
  ) on conflict (rent_advance_receipt_id) do update
    set expense_date = excluded.expense_date, amount = excluded.amount,
        updated_by = excluded.updated_by, updated_at = clock_timestamp()
  returning id into linked_expense_id;

  insert into murshida_manzil.owner_allocations
    (owner_id, source_type, source_id, ownership_percentage_snapshot, allocated_amount)
  select owner_id, 'expense', linked_expense_id, ownership_percentage_snapshot, 0
  from murshida_manzil.owner_allocations where source_type = 'rent_income' and source_id = receipt_id
  on conflict (owner_id, source_type, source_id) do nothing;
  if not found and not exists (select 1 from murshida_manzil.owner_allocations
      where source_type = 'expense' and source_id = linked_expense_id) then
    raise exception 'Owner shares are required to distribute the advance adjustment expense.';
  end if;
  perform murshida_manzil.recalculate_owner_shares('expense', linked_expense_id, rent.advance_adjusted);
end;
$$;

create function murshida_manzil.record_rent_receipt(actor_id uuid, requested_rent jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rent murshida_manzil.rent_transactions%rowtype;
  existing murshida_manzil.rent_transactions%rowtype;
  tenant murshida_manzil.tenants%rowtype;
  available numeric;
  receipt_id uuid;
begin
  rent := jsonb_populate_record(null::murshida_manzil.rent_transactions, requested_rent);
  select * into tenant from murshida_manzil.tenants
  where id = rent.tenant_id and is_active for update;
  if not found or tenant.unit_id is distinct from rent.unit_id or not exists (
    select 1 from murshida_manzil.units where id = tenant.unit_id and is_active
  ) then
    raise exception 'Tenant must have an active linked unit.';
  end if;
  select * into existing from murshida_manzil.rent_transactions
  where rent_receipt_number = rent.rent_receipt_number and tenant_id = tenant.id;
  if found then
    if (existing.rent_year, existing.rent_month, existing.payment_date, existing.payment_method,
        existing.monthly_rent, existing.actual_money_received, existing.advance_adjusted)
        is distinct from
       (rent.rent_year, rent.rent_month, rent.payment_date, rent.payment_method,
        rent.monthly_rent, rent.actual_money_received, rent.advance_adjusted) then
      raise exception 'This rent form has already been used. Reload before recording another receipt.';
    end if;
    return existing.id;
  end if;
  if exists (
    select 1 from murshida_manzil.rent_receipt_changes
    where operation = 'delete' and receipt_before->>'rent_receipt_number' = rent.rent_receipt_number
  ) then
    raise exception 'This receipt was deleted. Reload before recording another receipt.';
  end if;
  select greatest(0,
    coalesce((select sum(amount) from murshida_manzil.advance_payments where tenant_id = tenant.id), 0)
    - coalesce((select sum(advance_adjusted) from murshida_manzil.rent_transactions where tenant_id = tenant.id), 0)
  ) into available;
  if rent.advance_adjusted > available then
    raise exception 'Advance adjustment exceeds the remaining tenant advance balance.';
  end if;
  if rent.monthly_rent is distinct from rent.total_rent_settled then
    raise exception 'Actual money received plus advance adjusted must equal monthly rent.';
  end if;
  insert into murshida_manzil.rent_transactions (
    tenant_id, unit_id, unit_code_snapshot, unit_description_snapshot, rent_year, rent_month,
    monthly_rent, actual_money_received, advance_adjusted, total_rent_settled,
    advance_balance_before, advance_balance_after, payment_date, payment_method,
    money_receipt_number, rent_receipt_number, created_by, updated_by, created_at, updated_at, auto_advance_expense
  ) values (
    rent.tenant_id, rent.unit_id, rent.unit_code_snapshot, rent.unit_description_snapshot, rent.rent_year, rent.rent_month,
    rent.monthly_rent, rent.actual_money_received, rent.advance_adjusted, rent.total_rent_settled,
    available, available - rent.advance_adjusted, rent.payment_date, rent.payment_method,
    rent.money_receipt_number, rent.rent_receipt_number, actor_id, actor_id, clock_timestamp(), clock_timestamp(), true
  ) returning id into receipt_id;
  perform murshida_manzil.allocate_rent_owner_shares(receipt_id, rent.total_rent_settled);
  perform murshida_manzil.sync_rent_advance_expense(receipt_id, actor_id);
  return receipt_id;
end;
$$;

create function murshida_manzil.change_rent_receipt(
  actor_id uuid, receipt_id uuid, expected_updated_at timestamptz, changes jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_tenant uuid;
  original murshida_manzil.rent_transactions%rowtype;
  replacement murshida_manzil.rent_transactions%rowtype;
  before_allocations jsonb;
  before_adjustments jsonb;
  before_expense jsonb;
  before_expense_allocations jsonb;
  linked_expense_id uuid;
  balance_delta numeric;
  remaining numeric;
  operation text := case when changes is null then 'delete' else 'edit' end;
begin
  if actor_id is null then raise exception 'An administrator is required.'; end if;
  select tenant_id into owner_tenant from murshida_manzil.rent_transactions where id = receipt_id;
  if not found then raise exception 'Rent receipt was not found.'; end if;
  perform 1 from murshida_manzil.tenants where id = owner_tenant for update;
  select * into original from murshida_manzil.rent_transactions where id = receipt_id for update;
  if not found then raise exception 'Rent receipt was not found.'; end if;
  if expected_updated_at is distinct from original.updated_at then
    raise exception 'This receipt changed. Reload it before trying again.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(allocation)), '[]'::jsonb) into before_allocations
  from murshida_manzil.owner_allocations allocation
  where source_type = 'rent_income' and source_id = receipt_id;
  select coalesce(jsonb_agg(to_jsonb(adjustment)), '[]'::jsonb) into before_adjustments
  from murshida_manzil.rent_advance_adjustments adjustment
  where rent_transaction_id = receipt_id;
  select expense.id, to_jsonb(expense) into linked_expense_id, before_expense
  from murshida_manzil.expenses expense where rent_advance_receipt_id = receipt_id;
  select coalesce(jsonb_agg(to_jsonb(allocation)), '[]'::jsonb) into before_expense_allocations
  from murshida_manzil.owner_allocations allocation
  where source_type = 'expense' and source_id = linked_expense_id;

  if changes is not null then
    replacement := jsonb_populate_record(original, changes);
    if replacement.monthly_rent is null or replacement.monthly_rent <= 0
       or replacement.actual_money_received is null or replacement.actual_money_received < 0
       or replacement.advance_adjusted is null or replacement.advance_adjusted < 0
       or replacement.actual_money_received + replacement.advance_adjusted <> replacement.monthly_rent then
      raise exception 'Actual money received plus advance adjusted must equal monthly rent.';
    end if;
    if replacement.advance_adjusted > original.advance_balance_before then
      raise exception 'Advance adjustment exceeds the balance available when this receipt was recorded.';
    end if;
  end if;
  balance_delta := original.advance_adjusted - coalesce(replacement.advance_adjusted, 0);
  if balance_delta < 0 then
    select greatest(0,
      coalesce((select sum(amount) from murshida_manzil.advance_payments where tenant_id = owner_tenant), 0)
      - coalesce((select sum(advance_adjusted) from murshida_manzil.rent_transactions where tenant_id = owner_tenant), 0)
    ) into remaining;
    if remaining + balance_delta < 0 or exists (
      select 1 from murshida_manzil.rent_transactions later
      where later.tenant_id = owner_tenant and (later.created_at, later.id) > (original.created_at, original.id)
        and later.advance_balance_after + balance_delta < 0
    ) then
      raise exception 'This change would make a later or current advance balance negative.';
    end if;
  end if;

  if changes is null then
    if linked_expense_id is not null then
      delete from murshida_manzil.owner_allocations where source_type = 'expense' and source_id = linked_expense_id;
      delete from murshida_manzil.expenses where id = linked_expense_id;
    end if;
    delete from murshida_manzil.rent_advance_adjustments where rent_transaction_id = receipt_id;
    delete from murshida_manzil.owner_allocations where source_type = 'rent_income' and source_id = receipt_id;
    delete from murshida_manzil.rent_transactions where id = receipt_id;
  else
    update murshida_manzil.rent_transactions set
      rent_year = replacement.rent_year, rent_month = replacement.rent_month, monthly_rent = replacement.monthly_rent,
      actual_money_received = replacement.actual_money_received, advance_adjusted = replacement.advance_adjusted,
      total_rent_settled = replacement.monthly_rent, advance_balance_after = original.advance_balance_before - replacement.advance_adjusted,
      payment_date = replacement.payment_date, payment_method = replacement.payment_method,
      notes = replacement.notes, reference_number = replacement.reference_number,
      updated_by = actor_id, updated_at = clock_timestamp()
    where id = receipt_id returning * into replacement;
    if replacement.total_rent_settled <> original.total_rent_settled then
      perform murshida_manzil.recalculate_owner_shares('rent_income', receipt_id, replacement.total_rent_settled);
    end if;
    perform murshida_manzil.sync_rent_advance_expense(receipt_id, actor_id);
    if jsonb_array_length(before_adjustments) > 0 and
       (balance_delta <> 0 or replacement.payment_date <> original.payment_date) then
      delete from murshida_manzil.rent_advance_adjustments where rent_transaction_id = receipt_id;
      if replacement.advance_adjusted > 0 then
        insert into murshida_manzil.rent_advance_adjustments
          (tenant_id, rent_transaction_id, amount, adjustment_date, created_by)
        values (owner_tenant, receipt_id, replacement.advance_adjusted, replacement.payment_date, actor_id);
      end if;
    end if;
  end if;

  -- Existing snapshots are ordered by when rent was recorded, not the editable
  -- payment date. Apply the correction only to subsequent snapshots.
  if balance_delta <> 0 then
    update murshida_manzil.rent_transactions later
    set advance_balance_before = later.advance_balance_before + balance_delta,
        advance_balance_after = later.advance_balance_after + balance_delta,
        updated_by = actor_id, updated_at = clock_timestamp()
    where later.tenant_id = owner_tenant and (later.created_at, later.id) > (original.created_at, original.id);
  end if;

  insert into murshida_manzil.rent_receipt_changes
    (rent_transaction_id, operation, actor_id, receipt_before, receipt_after, owner_allocations_before,
      advance_adjustments_before, linked_expense_before, linked_expense_allocations_before)
  values (receipt_id, operation, actor_id, to_jsonb(original),
    case when changes is not null then to_jsonb(replacement) end, before_allocations,
    before_adjustments, before_expense, before_expense_allocations);
end;
$$;

revoke all on function murshida_manzil.recalculate_owner_shares(text, uuid, numeric) from public, anon, authenticated;
revoke all on function murshida_manzil.allocate_rent_owner_shares(uuid, numeric) from public, anon, authenticated;
revoke all on function murshida_manzil.sync_rent_advance_expense(uuid, uuid) from public, anon, authenticated;
revoke all on function murshida_manzil.record_rent_receipt(uuid, jsonb) from public, anon, authenticated;
revoke all on function murshida_manzil.change_rent_receipt(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function murshida_manzil.recalculate_owner_shares(text, uuid, numeric) to service_role;
grant execute on function murshida_manzil.allocate_rent_owner_shares(uuid, numeric) to service_role;
grant execute on function murshida_manzil.sync_rent_advance_expense(uuid, uuid) to service_role;
grant execute on function murshida_manzil.record_rent_receipt(uuid, jsonb) to service_role;
grant execute on function murshida_manzil.change_rent_receipt(uuid, uuid, timestamptz, jsonb) to service_role;

notify pgrst, 'reload schema';
