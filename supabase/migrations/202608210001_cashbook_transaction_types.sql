-- Dynamic transaction types for the existing Quick Cashbook only.
-- The balance_effect preserves the established income/expense ledger behavior.

create table if not exists public.cashbook_transaction_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_bn text not null,
  balance_effect text not null check (balance_effect in ('income','expense')),
  sort_order integer not null default 100,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (char_length(trim(name_en)) between 2 and 80),
  check (char_length(trim(name_bn)) between 2 and 80)
);

create unique index if not exists cashbook_transaction_types_name_en_idx
  on public.cashbook_transaction_types (lower(name_en));
create unique index if not exists cashbook_transaction_types_name_bn_idx
  on public.cashbook_transaction_types (lower(name_bn));
create index if not exists cashbook_transaction_types_active_idx
  on public.cashbook_transaction_types (is_active,sort_order,name_en);

insert into public.cashbook_transaction_types(
  id,code,name_en,name_bn,balance_effect,sort_order,is_system,is_active
) values
  ('00000000-0000-4000-8000-000000000101','income','Income','আয়','income',10,true,true),
  ('00000000-0000-4000-8000-000000000102','expense','Expense','ব্যয়','expense',20,true,true)
on conflict (code) do nothing;

alter table public.cashbook_descriptions
  add column if not exists transaction_type_id uuid;

update public.cashbook_descriptions as descriptions
set transaction_type_id=types.id
from public.cashbook_transaction_types as types
where descriptions.transaction_type_id is null
  and types.code=descriptions.transaction_type;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='cashbook_descriptions_transaction_type_id_fkey'
  ) then
    alter table public.cashbook_descriptions
      add constraint cashbook_descriptions_transaction_type_id_fkey
      foreign key (transaction_type_id)
      references public.cashbook_transaction_types(id)
      on delete restrict;
  end if;
end $$;

create index if not exists cashbook_descriptions_transaction_type_id_idx
  on public.cashbook_descriptions (transaction_type_id,is_active,name);

create or replace function public.create_cashbook_transaction_type(
  actor_profile_id uuid,
  requested_name_en text,
  requested_name_bn text,
  requested_balance_effect text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  transaction_type_id uuid:=gen_random_uuid();
  normalized_name_en text:=trim(coalesce(requested_name_en,''));
  normalized_name_bn text:=trim(coalesce(requested_name_bn,''));
  normalized_effect text:=lower(trim(coalesce(requested_balance_effect,'')));
  actor_role public.account_role;
begin
  select role into actor_role from public.profiles where id=actor_profile_id;
  if actor_role is distinct from 'admin'::public.account_role then
    raise exception 'Only administrators can create transaction types';
  end if;
  if char_length(normalized_name_en) not between 2 and 80 then
    raise exception 'English transaction type name must be between 2 and 80 characters';
  end if;
  if char_length(normalized_name_bn) not between 2 and 80 then
    raise exception 'Bangla transaction type name must be between 2 and 80 characters';
  end if;
  if normalized_effect not in ('income','expense') then
    raise exception 'Cash flow effect must be Income or Expense';
  end if;

  insert into public.cashbook_transaction_types(
    id,code,name_en,name_bn,balance_effect,created_by
  ) values(
    transaction_type_id,
    'custom-' || left(replace(transaction_type_id::text,'-',''),16),
    normalized_name_en,
    normalized_name_bn,
    normalized_effect,
    actor_profile_id
  );

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values
  ) values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_transaction_type_created',
    'accounting',
    'cashbook_transaction_type',
    transaction_type_id::text,
    'Cashbook transaction type created.',
    jsonb_build_object(
      'name_en',normalized_name_en,
      'name_bn',normalized_name_bn,
      'balance_effect',normalized_effect
    )
  );
  return transaction_type_id;
exception
  when unique_violation then
    raise exception 'A transaction type with this English or Bangla name already exists';
end $$;

create or replace function public.create_cashbook_description_with_type(
  actor_profile_id uuid,
  requested_name text,
  requested_transaction_type_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  description_id uuid:=gen_random_uuid();
  normalized_name text:=trim(coalesce(requested_name,''));
  selected_type public.cashbook_transaction_types%rowtype;
  actor_role public.account_role;
begin
  select role into actor_role from public.profiles where id=actor_profile_id;
  if actor_role is distinct from 'admin'::public.account_role then
    raise exception 'Only administrators can create cashbook descriptions';
  end if;
  if char_length(normalized_name) not between 2 and 160 then
    raise exception 'Description must be between 2 and 160 characters';
  end if;

  select * into selected_type
  from public.cashbook_transaction_types
  where id=requested_transaction_type_id and is_active=true;
  if selected_type.id is null then
    raise exception 'Select an active transaction type';
  end if;

  insert into public.cashbook_descriptions(
    id,name,transaction_type,transaction_type_id,created_by
  ) values(
    description_id,
    normalized_name,
    selected_type.balance_effect,
    selected_type.id,
    actor_profile_id
  );

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values
  ) values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_description_created',
    'accounting',
    'cashbook_description',
    description_id::text,
    'Cashbook description created.',
    jsonb_build_object(
      'name',normalized_name,
      'transaction_type_id',selected_type.id,
      'transaction_type',selected_type.balance_effect
    )
  );
  return description_id;
exception
  when unique_violation then
    raise exception 'This description already exists for the selected cash flow effect';
end $$;

alter table public.cashbook_transaction_types enable row level security;

create policy "cashbook transaction types read"
  on public.cashbook_transaction_types for select to authenticated
  using(
    public.current_user_has_permission('accounting.view')
    or public.current_user_has_permission('accounting.manage_cashbook')
  );

revoke all on function public.create_cashbook_transaction_type(uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.create_cashbook_description_with_type(uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.create_cashbook_transaction_type(uuid,text,text,text)
  to service_role;
grant execute on function public.create_cashbook_description_with_type(uuid,text,uuid)
  to service_role;

revoke insert,update,delete on public.cashbook_transaction_types from anon,authenticated;
grant select on public.cashbook_transaction_types to authenticated,service_role;
grant all on public.cashbook_transaction_types to service_role;
