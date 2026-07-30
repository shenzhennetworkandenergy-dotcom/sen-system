\set ON_ERROR_STOP on

begin;

insert into public.supplier_categories (
  id,
  name,
  category_type,
  parent_id,
  description,
  is_active,
  display_order
) values
  ('11111111-1111-4111-8111-111111111111', 'QA Networking', 'normal', null, 'Integration test root', true, 1),
  ('22222222-2222-4222-8222-222222222222', 'QA Switches', 'normal', '11111111-1111-4111-8111-111111111111', null, true, 1),
  ('33333333-3333-4333-8333-333333333333', 'QA Cisco', 'normal', '22222222-2222-4222-8222-222222222222', null, true, 1),
  ('44444444-4444-4444-8444-444444444444', 'QA Enterprise Core', 'normal', '33333333-3333-4333-8333-333333333333', null, true, 1);

do $$
declare
  actual_level integer;
begin
  select category_level
  into actual_level
  from public.supplier_categories
  where id = '44444444-4444-4444-8444-444444444444';

  if actual_level <> 4 then
    raise exception 'Expected arbitrary-depth Level 4 category, got Level %', actual_level;
  end if;
end;
$$;

do $$
begin
  begin
    update public.supplier_categories
    set parent_id = '44444444-4444-4444-8444-444444444444'
    where id = '11111111-1111-4111-8111-111111111111';

    raise exception 'Cycle update unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%descendant%' then
        if sqlerrm not like '%cycle detected%' then
          raise;
        end if;
      end if;
  end;
end;
$$;

set local role service_role;

select public.generate_supplier_code(
  '44444444-4444-4444-8444-444444444444',
  'QANE-QASW-QACI-QAEN-12345'
) as first_code
\gset

reset role;

insert into public.suppliers (
  code,
  name,
  country_code,
  country_name,
  supplier_category_id
) values (
  :'first_code',
  'Supplier category integration test',
  'XX',
  'Integration test',
  '44444444-4444-4444-8444-444444444444'
);

set local role service_role;

do $$
declare
  second_code text;
begin
  second_code := public.generate_supplier_code(
    '44444444-4444-4444-8444-444444444444',
    'QANE-QASW-QACI-QAEN-12345'
  );

  if second_code = 'QANE-QASW-QACI-QAEN-12345' then
    raise exception 'Duplicate supplier code was generated';
  end if;

  if second_code !~ '^QANE-QASW-QACI-QAEN-[0-9]{5}$' then
    raise exception 'Generated code has the wrong category path or suffix: %', second_code;
  end if;
end;
$$;

rollback;
