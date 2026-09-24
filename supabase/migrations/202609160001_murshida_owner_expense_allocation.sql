-- Legacy expenses are intentionally non-distributable: their historical
-- ownership snapshot cannot be proven and must never be inferred retroactively.
alter table murshida_manzil.expenses
  add column if not exists owner_allocation_mode text not null default 'DO_NOT_DISTRIBUTE'
  check (owner_allocation_mode in ('DISTRIBUTE_TO_OWNERS', 'DO_NOT_DISTRIBUTE'));

create or replace function murshida_manzil.record_expense_with_allocations(
  requested_expense jsonb,
  requested_owner_allocation_mode text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_id uuid;
  owner_row record;
  owner_count integer := 0;
  owner_index integer := 0;
  total_basis_points bigint := 0;
  amount_cents bigint;
  allocated_cents bigint := 0;
  remainder_cents bigint;
  share_cents bigint;
begin
  if requested_owner_allocation_mode not in ('DISTRIBUTE_TO_OWNERS', 'DO_NOT_DISTRIBUTE') then
    raise exception 'Invalid owner expense allocation mode.';
  end if;
  if nullif(pg_catalog.btrim(requested_expense->>'expense_date'), '') is null
     or nullif(pg_catalog.btrim(requested_expense->>'description'), '') is null
     or coalesce((requested_expense->>'amount')::numeric, 0) <= 0 then
    raise exception 'Expense date, description, and positive amount are required.';
  end if;

  insert into murshida_manzil.expenses
    (expense_date, description, amount, category, paid_to, payment_method, notes, voucher_number, owner_allocation_mode)
  values
    ((requested_expense->>'expense_date')::date,
     pg_catalog.btrim(requested_expense->>'description'),
     (requested_expense->>'amount')::numeric,
     nullif(pg_catalog.btrim(requested_expense->>'category'), ''),
     nullif(pg_catalog.btrim(requested_expense->>'paid_to'), ''),
     nullif(pg_catalog.btrim(requested_expense->>'payment_method'), ''),
     nullif(pg_catalog.btrim(requested_expense->>'notes'), ''),
     nullif(pg_catalog.btrim(requested_expense->>'voucher_number'), ''),
     requested_owner_allocation_mode)
  returning id into expense_id;

  if requested_owner_allocation_mode = 'DO_NOT_DISTRIBUTE' then
    return expense_id;
  end if;

  select count(*), coalesce(sum(pg_catalog.round(ownership_percentage * 100)), 0)
    into owner_count, total_basis_points
    from murshida_manzil.owners
   where is_active = true;
  if owner_count = 0 or total_basis_points <> 10000 then
    raise exception 'Active ownership percentages must total exactly 100%% before recording a distributable expense.';
  end if;

  amount_cents := pg_catalog.round((requested_expense->>'amount')::numeric * 100);
  for owner_row in
    select id, ownership_percentage, row_number() over (order by created_at, id) as position
      from murshida_manzil.owners
     where is_active = true
     order by created_at, id
  loop
    share_cents := pg_catalog.floor(amount_cents * pg_catalog.round(owner_row.ownership_percentage * 100) / 10000);
    allocated_cents := allocated_cents + share_cents;
  end loop;
  remainder_cents := amount_cents - allocated_cents;

  for owner_row in
    select id, ownership_percentage, row_number() over (order by created_at, id) as position
      from murshida_manzil.owners
     where is_active = true
     order by created_at, id
  loop
    owner_index := owner_index + 1;
    share_cents := pg_catalog.floor(amount_cents * pg_catalog.round(owner_row.ownership_percentage * 100) / 10000)
      + case when owner_index <= remainder_cents then 1 else 0 end;
    insert into murshida_manzil.owner_allocations
      (owner_id, source_type, source_id, ownership_percentage_snapshot, allocated_amount)
    values
      (owner_row.id, 'expense', expense_id, owner_row.ownership_percentage, share_cents / 100.0);
  end loop;

  if (select coalesce(sum(allocated_amount), 0) from murshida_manzil.owner_allocations where source_type = 'expense' and source_id = expense_id)
      <> (requested_expense->>'amount')::numeric then
    raise exception 'Expense owner allocations do not reconcile to the expense amount.';
  end if;
  return expense_id;
end;
$$;

revoke all on function murshida_manzil.record_expense_with_allocations(jsonb, text) from public, anon, authenticated;
grant execute on function murshida_manzil.record_expense_with_allocations(jsonb, text) to service_role;
