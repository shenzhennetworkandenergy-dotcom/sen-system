begin;

alter table public.eps_checkout_requests
  add column requested_change text check (requested_change in ('edit', 'remove'));

create or replace function public.manage_unpaid_eps_checkout(
  requested_order_id uuid,
  requested_profile_id uuid,
  requested_admin_id uuid,
  requested_mode text
) returns text
language plpgsql security definer set search_path='' as $$
declare
  sale public.sales_orders%rowtype;
  checkout public.eps_checkout_requests%rowtype;
  change_mode text;
  result text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Permission denied';
  end if;
  if requested_mode is not null and requested_mode not in ('edit','remove') then
    return 'unavailable';
  end if;

  -- Match payment initialization and verification: lock the order first.
  select * into sale from public.sales_orders
  where id=requested_order_id and customer_profile_id=requested_profile_id for update;
  select * into checkout from public.eps_checkout_requests
  where order_id=sale.id and profile_id=requested_profile_id for update;
  if checkout.order_id is null then return 'unavailable'; end if;
  if checkout.discarded_at is not null then return 'removed'; end if;
  if checkout.cart_restored_at is not null then return 'restored'; end if;
  change_mode := coalesce(checkout.requested_change, requested_mode);
  if change_mode is null then return 'unavailable'; end if;

  if coalesce(sale.paid_amount,0) <> 0 or sale.status not in ('confirmed','cancelled')
    or exists (
      select 1 from public.eps_payment_attempts
      where order_id=sale.id and status in ('paid','sandbox_paid','review_required')
    ) or exists (
      select 1 from public.sales_order_items
      where order_id=sale.id and (allocated_quantity>0 or packed_quantity>0 or shipped_quantity>0)
    ) then
    update public.eps_checkout_requests set requested_change=null
    where operation_id=checkout.operation_id and requested_change is not null;
    return 'blocked';
  end if;
  if sale.status='confirmed' and not exists (
    select 1 from public.profiles
    where id=requested_admin_id and role='admin' and status='active' and archived_at is null
  ) then return 'unavailable'; end if;

  if exists (
    select 1 from public.eps_payment_attempts
    where order_id=sale.id and status not in ('failed','cancelled')
  ) then
    -- A locally expired window cannot prove that money will not arrive.
    update public.eps_checkout_requests set requested_change=change_mode
    where operation_id=checkout.operation_id and requested_change is null;
    return 'queued';
  end if;

  if change_mode='edit' then
    result := public.restore_unpaid_eps_cart(sale.id,requested_profile_id,requested_admin_id);
    if result='restored' then
      update public.eps_checkout_requests set requested_change=null
      where operation_id=checkout.operation_id;
    end if;
    return result;
  end if;

  if sale.status='confirmed' then
    perform public.cancel_sales_order(requested_admin_id,sale.id,'Customer deleted unpaid EPS checkout');
  end if;
  update public.eps_checkout_requests set requested_change=null,discarded_at=now()
  where operation_id=checkout.operation_id;
  return 'removed';
end $$;

create or replace function public.expire_eps_unpaid_orders(requested_admin_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare
  candidate record;
  handled integer := 0;
  result text;
begin
  if coalesce(auth.role(),'') <> 'service_role' or not exists (
    select 1 from public.profiles
    where id=requested_admin_id and role='admin' and status='active' and archived_at is null
  ) then raise exception 'Permission denied'; end if;

  for candidate in
    select o.id,c.profile_id,c.requested_change from public.sales_orders o
    join public.eps_checkout_requests c on c.order_id=o.id
    where c.cart_restored_at is null and c.discarded_at is null
      and not exists (
        select 1 from public.eps_payment_attempts a where a.order_id=o.id
          and a.status in ('initializing','ready','unknown','pending')
      )
      and (
        c.requested_change is not null
        or (
          o.status='confirmed' and o.paid_amount=0
          and (c.payment_expires_at<now() or exists (
            select 1 from public.eps_payment_attempts a
            where a.order_id=o.id and a.status in ('failed','cancelled')
          ))
          and not exists (
            select 1 from public.eps_payment_attempts a
            where a.order_id=o.id and a.status not in ('failed','cancelled')
          )
          and not exists (
            select 1 from public.sales_order_items i where i.order_id=o.id
              and (i.allocated_quantity>0 or i.packed_quantity>0 or i.shipped_quantity>0)
          )
        )
      )
    order by (c.requested_change is null),c.payment_expires_at limit 10 for update of o skip locked
  loop
    if candidate.requested_change is not null then
      result := public.manage_unpaid_eps_checkout(candidate.id,candidate.profile_id,requested_admin_id,null);
    else
      result := public.restore_unpaid_eps_cart(candidate.id,candidate.profile_id,requested_admin_id);
    end if;
    if result in ('restored','removed') then handled := handled+1; end if;
  end loop;
  return handled;
end $$;

-- Reject payment starts and resumes while a checkout change is queued.
create or replace function public.begin_eps_payment(requested_order_id uuid,actor_profile_id uuid,requested_merchant_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sale public.sales_orders%rowtype; gateway public.payment_gateways%rowtype; attempt public.eps_payment_attempts%rowtype; transaction_id uuid:=gen_random_uuid(); due numeric;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Permission denied'; end if;
  select * into sale from public.sales_orders where id=requested_order_id for update;
  if sale.id is null or sale.customer_profile_id is distinct from actor_profile_id or sale.status='cancelled' then raise exception 'Order is not eligible for payment'; end if;
  if exists (
    select 1 from public.eps_checkout_requests
    where order_id=sale.id and requested_change is not null
  ) then raise exception 'This checkout is being changed'; end if;
  if not exists(select 1 from public.profiles where id=actor_profile_id and status='active' and archived_at is null and role in('customer','admin')) then raise exception 'Active customer required'; end if;
  select * into gateway from public.payment_gateways where code='eps' and adapter='eps' and enabled;
  if gateway.id is null or sale.currency<>'BDT' then raise exception 'EPS is unavailable for this order'; end if;
  due:=round(sale.total_amount-sale.paid_amount,2);
  if due<=0 or due is distinct from sale.total_amount-sale.paid_amount then raise exception 'Order amount is not eligible for online payment'; end if;
  select * into attempt from public.eps_payment_attempts where order_id=sale.id and status in('initializing','ready','unknown','pending','review_required') order by created_at desc limit 1 for update;
  if attempt.id is not null then
    if attempt.amount is distinct from due then raise exception 'Order amount changed. Check the existing payment before paying again'; end if;
    return jsonb_build_object('attempt',to_jsonb(attempt),'created',false);
  end if;
  if exists(select 1 from public.eps_payment_attempts where order_id=sale.id and status='sandbox_paid') then raise exception 'Sandbox payment already completed for this test order'; end if;
  if exists(select 1 from public.eps_checkout_requests where order_id=sale.id and payment_expires_at<now()) then raise exception 'Online checkout expired. Please contact SEN or place a new order'; end if;
  -- Only the new stock-reserved website checkout is payable through this integration.
  if not exists(select 1 from public.eps_checkout_requests where order_id=sale.id) then raise exception 'This order was not created with online checkout'; end if;
  if exists(select 1 from public.sales_order_items i where i.order_id=sale.id and not exists(select 1 from public.inventory_reservations r where r.order_item_id=i.id and r.status='active' and r.quantity>=i.quantity)) then raise exception 'Order stock reservation is unavailable'; end if;
  insert into public.payment_transactions(id,order_id,profile_id,gateway_id,status,amount,currency,safe_response)
  values(transaction_id,sale.id,actor_profile_id,gateway.id,'processing',due,'BDT',jsonb_build_object('method','eps','test_mode',gateway.test_mode));
  insert into public.eps_payment_attempts(transaction_id,order_id,profile_id,merchant_transaction_id,test_mode,amount)
  values(transaction_id,sale.id,actor_profile_id,requested_merchant_id,gateway.test_mode,due) returning * into attempt;
  return jsonb_build_object('attempt',to_jsonb(attempt),'created',true);
end $$;

notify pgrst, 'reload schema';
commit;
