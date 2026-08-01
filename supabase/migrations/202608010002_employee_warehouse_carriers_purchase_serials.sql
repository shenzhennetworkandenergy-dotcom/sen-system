begin;

create table if not exists public.profile_warehouse_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  is_primary boolean not null default true,
  is_active boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profile_warehouse_one_active_primary
  on public.profile_warehouse_assignments(profile_id) where is_active and is_primary;
create index if not exists profile_warehouse_assignments_warehouse_idx
  on public.profile_warehouse_assignments(warehouse_id) where is_active;

create table if not exists public.purchase_carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 200),
  status text not null default 'active' check(status in ('active','inactive')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists purchase_carriers_name_unique
  on public.purchase_carriers(lower(trim(name)));

alter table public.serial_numbers
  add column if not exists purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null;
create index if not exists serial_numbers_purchase_item_idx
  on public.serial_numbers(purchase_order_item_id,status);

alter table public.profile_warehouse_assignments enable row level security;
alter table public.purchase_carriers enable row level security;

drop policy if exists "employee reads own warehouse assignment" on public.profile_warehouse_assignments;
create policy "employee reads own warehouse assignment" on public.profile_warehouse_assignments
  for select to authenticated
  using(profile_id=auth.uid() or public.current_user_has_permission('locations.manage'));
drop policy if exists "authorized staff read carriers" on public.purchase_carriers;
create policy "authorized staff read carriers" on public.purchase_carriers
  for select to authenticated
  using(public.current_user_has_permission('purchasing.view') or public.current_user_has_permission('shipments.view'));

grant select on public.profile_warehouse_assignments,public.purchase_carriers to authenticated,service_role;
grant insert,update,delete on public.profile_warehouse_assignments,public.purchase_carriers to service_role;

create or replace function public.confirm_purchase_order_and_generate_serials(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_note text default null
) returns integer
language plpgsql security definer set search_path=''
as $$
declare
  order_row public.purchase_orders%rowtype;
  order_item public.purchase_order_items%rowtype;
  product_row public.products%rowtype;
  remaining integer;
  chunk_size integer;
  batch_id uuid;
  serial_id uuid;
  generated text;
  generated_count integer:=0;
  i integer;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.approve');
  select * into order_row from public.purchase_orders where id=requested_order_id for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if order_row.status='ordered' then
    return (select count(*)::integer from public.serial_numbers sn join public.purchase_order_items poi on poi.id=sn.purchase_order_item_id where poi.purchase_order_id=requested_order_id);
  end if;
  if order_row.status<>'approved' then raise exception 'Only approved purchase orders can be confirmed'; end if;

  perform public.transition_purchase_order(actor_profile_id,requested_order_id,'order',requested_note);

  for order_item in select * from public.purchase_order_items where purchase_order_id=requested_order_id order by created_at,id loop
    if order_item.quantity_ordered<>trunc(order_item.quantity_ordered) then
      raise exception 'Purchase quantities must be whole numbers before SEN codes can be generated';
    end if;
    select * into product_row from public.products where id=order_item.product_id;
    remaining:=order_item.quantity_ordered::integer - (
      select count(*)::integer from public.serial_numbers where purchase_order_item_id=order_item.id
    );
    while remaining>0 loop
      chunk_size:=least(remaining,500);
      batch_id:=gen_random_uuid();
      insert into public.serial_generation_batches(
        id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,status,generated_by,generated_at
      ) values(
        batch_id,order_item.product_id,order_item.variation_id,order_row.destination_warehouse_id,
        chunk_size,'new','Expected against '||order_row.order_number,'generated',actor_profile_id,now()
      );
      for i in 1..chunk_size loop
        generated:=public.next_sen_serial(order_item.product_id);
        serial_id:=gen_random_uuid();
        insert into public.serial_numbers(
          id,sen_serial,barcode_value,product_id,variation_id,warehouse_id,status,condition,
          acquisition_reference,notes,generation_batch_id,generated_at,generated_by,purchase_order_item_id
        ) values(
          serial_id,generated,generated,order_item.product_id,order_item.variation_id,null,'expected','new',
          order_row.order_number,'Generated when supplier order was confirmed',batch_id,now(),actor_profile_id,order_item.id
        );
        insert into public.serial_number_history(
          serial_number_id,event_type,new_sen_serial,new_status,new_warehouse_id,reason,actor_id
        ) values(serial_id,'generated',generated,'expected',order_row.destination_warehouse_id,'Supplier order '||order_row.order_number,actor_profile_id);
      end loop;
      generated_count:=generated_count+chunk_size;
      remaining:=remaining-chunk_size;
    end loop;
  end loop;
  return generated_count;
end $$;

create or replace function public.reuse_expected_purchase_serial()
returns trigger language plpgsql security definer set search_path='' as $$
declare expected_row public.serial_numbers%rowtype;
begin
  if new.status='available' and new.acquisition_reference is not null then
    select sn.* into expected_row
    from public.serial_numbers sn
    join public.purchase_order_items poi on poi.id=sn.purchase_order_item_id
    join public.purchase_orders po on po.id=poi.purchase_order_id
    where po.order_number=new.acquisition_reference
      and sn.product_id=new.product_id
      and sn.variation_id is not distinct from new.variation_id
      and sn.status='expected'
    order by sn.generated_at,sn.id limit 1 for update of sn;
    if expected_row.id is not null then
      delete from public.serial_numbers where id=expected_row.id;
      new.sen_serial:=expected_row.sen_serial;
      new.barcode_value:=expected_row.barcode_value;
      new.generation_batch_id:=expected_row.generation_batch_id;
      new.purchase_order_item_id:=expected_row.purchase_order_item_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reuse_expected_purchase_serial_trigger on public.serial_numbers;
create trigger reuse_expected_purchase_serial_trigger
  before insert on public.serial_numbers for each row execute function public.reuse_expected_purchase_serial();

create or replace function public.activate_nonserialized_purchase_serials()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.serial_numbers
  set warehouse_id=(select warehouse_id from public.purchase_receipts where id=new.purchase_receipt_id),
      status='available',received_at=now(),received_by=(select received_by from public.purchase_receipts where id=new.purchase_receipt_id),
      notes='Received on '||(select receipt_number from public.purchase_receipts where id=new.purchase_receipt_id)
  where id in (
    select id from public.serial_numbers
    where purchase_order_item_id=new.purchase_order_item_id and status='expected'
    order by generated_at,id limit new.quantity_received::integer
  );
  return new;
end $$;
drop trigger if exists activate_nonserialized_purchase_serials_trigger on public.purchase_receipt_items;
create trigger activate_nonserialized_purchase_serials_trigger
  after insert on public.purchase_receipt_items for each row execute function public.activate_nonserialized_purchase_serials();

revoke all on function public.confirm_purchase_order_and_generate_serials(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_purchase_order_and_generate_serials(uuid,uuid,text) to service_role;

commit;
