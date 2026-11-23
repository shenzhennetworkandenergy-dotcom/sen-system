-- Additive EPS checkout and reconciliation. Existing COD, Sales and cashbook RPCs remain unchanged.
create table public.eps_checkout_requests (
  operation_id uuid primary key,
  profile_id uuid not null references public.profiles(id),
  cart_id uuid not null unique references public.shopping_carts(id),
  order_id uuid not null unique references public.sales_orders(id),
  fingerprint text not null,
  payment_expires_at timestamptz not null default (now()+interval '30 minutes'),
  created_at timestamptz not null default now()
);
create table public.eps_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.payment_transactions(id),
  order_id uuid not null references public.sales_orders(id),
  profile_id uuid not null references public.profiles(id),
  merchant_transaction_id text not null unique check(merchant_transaction_id ~ '^[0-9]{10,30}$'),
  initialization_id text,
  eps_transaction_id text,
  test_mode boolean not null,
  amount numeric(18,2) not null check(amount>0),
  status text not null default 'initializing' check(status in('initializing','ready','unknown','pending','paid','sandbox_paid','failed','cancelled','review_required')),
  checkout_url text,
  sale_payment_id uuid unique references public.sale_payments(id),
  journal_entry_id uuid unique references public.journal_entries(id),
  financial_entity text,
  verification_error text,
  verification_lease_until timestamptz,
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index eps_open_attempts_per_order on public.eps_payment_attempts(order_id)
where status in('initializing','ready','unknown','pending','review_required');
create unique index eps_unique_received_transaction on public.eps_payment_attempts(test_mode,eps_transaction_id)
where eps_transaction_id is not null and status in('paid','sandbox_paid');
create index eps_payment_attempts_reconciliation_idx on public.eps_payment_attempts(status,last_checked_at);
alter table public.eps_checkout_requests enable row level security;
alter table public.eps_payment_attempts enable row level security;
revoke all on public.eps_checkout_requests,public.eps_payment_attempts from public,anon,authenticated;
grant all on public.eps_checkout_requests,public.eps_payment_attempts to service_role;
-- Safe read access is provided through authorized server code; callback URLs never reveal customer data.

insert into public.accounting_accounts(code,name,account_type,currency)
values('EPS.CLEARING','EPS payments awaiting settlement','asset','BDT') on conflict(code) do nothing;

create or replace function public.begin_eps_payment(requested_order_id uuid,actor_profile_id uuid,requested_merchant_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sale public.sales_orders%rowtype; gateway public.payment_gateways%rowtype; attempt public.eps_payment_attempts%rowtype; transaction_id uuid:=gen_random_uuid(); due numeric;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Permission denied'; end if;
  select * into sale from public.sales_orders where id=requested_order_id for update;
  if sale.id is null or sale.customer_profile_id is distinct from actor_profile_id or sale.status='cancelled' then raise exception 'Order is not eligible for payment'; end if;
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

create or replace function public.claim_eps_verification(requested_attempt_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Permission denied'; end if;
  update public.eps_payment_attempts set verification_lease_until=now()+interval '45 seconds',last_checked_at=now()
  where id=requested_attempt_id and status not in('paid','sandbox_paid')
    and (verification_lease_until is null or verification_lease_until<now())
    and (last_checked_at is null or last_checked_at<now()-interval '15 seconds');
  return found;
end $$;

create or replace function public.apply_eps_verification(requested_attempt_id uuid,requested_merchant_id text,requested_amount numeric,
  requested_status text,requested_eps_id text,requested_entity text,requested_receiver_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare a public.eps_payment_attempts%rowtype; sale public.sales_orders%rowtype; payment_id uuid:=gen_random_uuid(); journal_id uuid:=gen_random_uuid(); clearing_id uuid; revenue_id uuid; effective_date date:=(now() at time zone 'Asia/Dhaka')::date;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Permission denied'; end if;
  -- Lock order before attempt: the same ordering is used by initiation and manual Sales payments.
  select * into sale from public.sales_orders where id=(select order_id from public.eps_payment_attempts where id=requested_attempt_id) for update;
  select * into a from public.eps_payment_attempts where id=requested_attempt_id for update;
  if a.id is null or sale.id is null then raise exception 'Payment not found'; end if;
  if a.status in('paid','sandbox_paid') then return a.status; end if;
  if a.merchant_transaction_id is distinct from requested_merchant_id or a.amount is distinct from requested_amount
    or requested_status not in('success','failed','cancelled','pending') then raise exception 'Payment verification mismatch'; end if;
  if requested_status<>'success' then
    -- A pending/out-of-order callback must not resurrect a terminal attempt.
    -- Once a received payment needs review, a later failure must not permit another charge.
    if a.status='review_required' or (a.status in('failed','cancelled') and requested_status='pending') then return a.status; end if;
    update public.eps_payment_attempts set status=requested_status,verification_lease_until=null,verification_error=null,updated_at=now() where id=a.id;
    update public.payment_transactions set status=case when requested_status='pending' then 'processing' else requested_status end,updated_at=now() where id=a.transaction_id;
    return requested_status;
  end if;
  if a.test_mode then
    update public.eps_payment_attempts set status='sandbox_paid',eps_transaction_id=nullif(left(requested_eps_id,200),''),verified_at=now(),verification_lease_until=null,verification_error=null,updated_at=now() where id=a.id;
    update public.payment_transactions set status='paid',updated_at=now() where id=a.transaction_id;
    return 'sandbox_paid'; -- Never records real Sales income, ledger postings, or paid order totals.
  end if;
  if nullif(trim(requested_eps_id),'') is null then raise exception 'Verified EPS transaction ID is required'; end if;
  if sale.status='cancelled' or sale.currency<>'BDT' or sale.total_amount-sale.paid_amount is distinct from a.amount
    or not exists(select 1 from public.profiles where id=requested_receiver_id and role='admin' and status='active' and archived_at is null) then
    update public.eps_payment_attempts set status='review_required',eps_transaction_id=left(requested_eps_id,200),verified_at=now(),verification_error='received_payment_requires_review',verification_lease_until=null,updated_at=now() where id=a.id;
    return 'review_required';
  end if;
  select id into clearing_id from public.accounting_accounts where code='EPS.CLEARING' and account_type='asset' and currency='BDT' and is_active;
  select id into revenue_id from public.accounting_accounts where code='4000' and account_type='revenue' and currency='BDT' and is_active;
  if clearing_id is null or revenue_id is null then raise exception 'EPS accounting configuration is incomplete'; end if;
  insert into public.sale_payments(id,order_id,amount,payment_date,method,reference_number,internal_note,received_by,operation_id)
  values(payment_id,sale.id,a.amount,effective_date,'other',requested_eps_id,'Automatically verified EPS payment; funds await gateway settlement.',requested_receiver_id,a.id);
  perform public.refresh_sale_payment_totals(sale.id);
  insert into public.journal_entries(id,entry_number,entry_date,description,reference_type,reference_id,status,currency,created_by,posted_by,posted_at)
  values(journal_id,public.next_journal_entry_number(),effective_date,'EPS verified payment - '||sale.order_number,'payment',payment_id,'posted','BDT',requested_receiver_id,requested_receiver_id,now());
  insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
  values(journal_id,clearing_id,'EPS funds awaiting settlement',a.amount,0),(journal_id,revenue_id,'EPS website order payment',0,a.amount);
  update public.eps_payment_attempts set status='paid',eps_transaction_id=left(requested_eps_id,200),financial_entity=left(requested_entity,80),sale_payment_id=payment_id,journal_entry_id=journal_id,verified_at=now(),verification_lease_until=null,verification_error=null,updated_at=now() where id=a.id;
  update public.payment_transactions set status='paid',gateway_transaction_id=requested_eps_id,updated_at=now() where id=a.transaction_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(requested_receiver_id,'admin',a.profile_id,'payments.eps_verified','sales','payment_transaction',a.transaction_id::text,'EPS server verification recorded the online payment exactly once.',jsonb_build_object('order_id',sale.id,'attempt_id',a.id,'sale_payment_id',payment_id,'journal_entry_id',journal_id,'amount',a.amount,'eps_transaction_id',requested_eps_id));
  return 'paid';
end $$;

revoke all on function public.begin_eps_payment(uuid,uuid,text),public.claim_eps_verification(uuid),public.apply_eps_verification(uuid,text,numeric,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.begin_eps_payment(uuid,uuid,text),public.claim_eps_verification(uuid),public.apply_eps_verification(uuid,text,numeric,text,text,text,uuid) to service_role;

create or replace function public.customer_checkout_cart_eps(
  actor_profile_id uuid,
  requested_address_id uuid,
  requested_notes text,
  requested_email text,
  requested_phone text,
  requested_operation_id uuid,
  requested_fingerprint text,
  requested_expected_total numeric
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  cart public.shopping_carts%rowtype;
  address_snapshot jsonb;
  billing_snapshot jsonb;
  new_order_id uuid := gen_random_uuid();
  entry record;
  product_row public.products%rowtype;
  variation_row public.product_variations%rowtype;
  selected_warehouse_id uuid;
  unit_price numeric;
  line_total numeric;
  order_total numeric := 0;
  available_quantity numeric;
  gateway_row public.payment_gateways%rowtype;
  previous_request public.eps_checkout_requests%rowtype;
  balance_row public.inventory_balances%rowtype;
  order_item public.sales_order_items%rowtype;
  normalized_phone text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Permission denied'; end if;
  if requested_operation_id is null or coalesce(requested_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid checkout request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_operation_id::text,0));
  select * into previous_request from public.eps_checkout_requests where operation_id=requested_operation_id;
  if previous_request.operation_id is not null then
    if previous_request.profile_id is distinct from actor_profile_id or previous_request.fingerprint is distinct from requested_fingerprint then raise exception 'Checkout request was already used'; end if;
    return previous_request.order_id;
  end if;
  select * into gateway_row from public.payment_gateways where code='eps' and adapter='eps' and enabled;
  if gateway_row.id is null then raise exception 'Online payment is not available'; end if;
  if not exists (
    select 1 from public.profiles
    where id=actor_profile_id and status='active' and archived_at is null and role in ('customer','admin')
  ) then
    raise exception 'Active customer account required';
  end if;
  if requested_email is null
    or requested_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  then
    raise exception 'Enter a valid billing email';
  end if;
  normalized_phone := regexp_replace(coalesce(requested_phone,''),'[().[:space:]-]','','g');
  if normalized_phone !~ '^\+8801[3-9][0-9]{8}$'
    and normalized_phone !~ '^01[3-9][0-9]{8}$'
    and normalized_phone !~ '^\+[1-9][0-9]{6,14}$'
  then
    raise exception 'Enter a valid contact phone number';
  end if;

  select * into cart
  from public.shopping_carts
  where profile_id=actor_profile_id and status='active'
  for update;
  if cart.id is null
    or not exists (select 1 from public.shopping_cart_items where cart_id=cart.id)
  then
    raise exception 'Cart is empty';
  end if;

  select jsonb_build_object(
    'recipient_name',recipient_name,
    'phone',phone,
    'alternate_phone',alternate_phone,
    'address_line_1',address_line_1,
    'address_line_2',address_line_2,
    'area',area,
    'city',city,
    'region',region,
    'postal_code',postal_code,
    'country_code',country_code,
    'delivery_instructions',delivery_instructions,
    'map_label',map_label
  ) into address_snapshot
  from public.customer_addresses
  where id=requested_address_id and profile_id=actor_profile_id;
  if address_snapshot is null then
    raise exception 'Choose a saved shipping address';
  end if;
  billing_snapshot := address_snapshot || jsonb_build_object(
    'email',lower(trim(requested_email)),
    'contact_phone',trim(requested_phone),
    'payment_method','eps'
  );

  select warehouse.id into selected_warehouse_id
  from public.warehouses warehouse
  where warehouse.is_active
    and not exists (
      select 1
      from public.shopping_cart_items item
      join public.products product on product.id=item.product_id
      left join public.product_variations variation
        on variation.id=item.variation_id
        and variation.product_id=item.product_id
        and variation.status='active'
      where item.cart_id=cart.id
        and (
          product.status <> 'active'
          or not product.public_catalogue_visible
          or (product.product_type='variable' and variation.id is null)
          or (product.product_type<>'variable' and item.variation_id is not null)
          or (
            coalesce((
              select sum(balance.available)
              from public.inventory_balances balance
              where balance.warehouse_id=warehouse.id
                and balance.product_id=item.product_id
                and balance.variation_id is not distinct from item.variation_id
                and balance.location_id is null
            ),0) < item.quantity
          )
        )
    )
  order by warehouse.created_at
  limit 1;
  if selected_warehouse_id is null then
    raise exception 'No fulfilment warehouse has sufficient stock for this cart';
  end if;

  insert into public.sales_orders(
    id,order_number,customer_profile_id,
    shipping_address_id,shipping_address_snapshot,
    billing_address_id,billing_address_snapshot,
    fulfillment_warehouse_id,currency,customer_notes,sales_source,
    payment_status,created_by,updated_by
  ) values (
    new_order_id,public.next_sales_order_number(),actor_profile_id,
    requested_address_id,address_snapshot,
    requested_address_id,billing_snapshot,
    selected_warehouse_id,'BDT',nullif(left(requested_notes,4000),''),
    'website','unpaid',actor_profile_id,actor_profile_id
  );

  for entry in
    select * from public.shopping_cart_items
    where cart_id=cart.id
    order by created_at
  loop
    select * into product_row
    from public.products
    where id=entry.product_id and status='active' and public_catalogue_visible;
    if product_row.id is null then
      raise exception 'A cart product is no longer available';
    end if;

    variation_row := null;
    if product_row.product_type='variable' then
      if entry.variation_id is null then
        raise exception 'Select a configuration for %',product_row.name;
      end if;
      select * into variation_row
      from public.product_variations
      where id=entry.variation_id
        and product_id=product_row.id
        and status='active';
      if variation_row.id is null then
        raise exception 'A selected product configuration is no longer available';
      end if;
      product_row.allow_backorders := variation_row.allow_backorders;
      product_row.sale_price := variation_row.sale_price;
      product_row.regular_price := variation_row.regular_price;
      product_row.sku := variation_row.sku;
      product_row.name := product_row.name || ' (' || variation_row.combination_key || ')';
    elsif entry.variation_id is not null then
      raise exception 'The cart contains an invalid product configuration';
    end if;

    select coalesce(sum(balance.available),0) into available_quantity
    from public.inventory_balances balance
    where balance.warehouse_id=selected_warehouse_id
      and balance.product_id=entry.product_id
      and balance.variation_id is not distinct from entry.variation_id;
    if available_quantity < entry.quantity and not product_row.allow_backorders then
      raise exception 'Insufficient stock for %',product_row.name;
    end if;

    if coalesce(product_row.currency,'BDT') <> 'BDT' then raise exception 'Online payment supports BDT products only'; end if;
    unit_price := round(coalesce(product_row.sale_price,product_row.regular_price,0),2);
    line_total := round(unit_price*entry.quantity,2);
    order_total := order_total+line_total;
    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,
      quantity,unit_price,line_subtotal,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,
      sku_snapshot,model_number_snapshot,variation_snapshot
    ) values (
      new_order_id,product_row.id,entry.variation_id,selected_warehouse_id,
      entry.quantity,unit_price,line_total,line_total,'BDT',
      product_row.serial_tracking_required,product_row.name,
      product_row.sku,product_row.model_number,
      case when variation_row.id is null then null else
        jsonb_build_object(
          'id',variation_row.id,
          'sku',variation_row.sku,
          'combination_key',variation_row.combination_key
        )
      end
    );
  end loop;

  if order_total <= 0 then
    raise exception 'Cart total must be greater than zero';
  end if;
  if requested_expected_total is null or order_total is distinct from requested_expected_total then
    raise exception 'Your cart price or quantity changed. Review the current cart total before paying';
  end if;
  update public.sales_orders
  set subtotal=order_total,total_amount=order_total
  where id=new_order_id;

  -- Stock is reserved before the customer is sent to EPS; reuse existing fulfilment records.
  for order_item in select * from public.sales_order_items where order_id=new_order_id order by product_id,variation_id nulls first loop
    select * into balance_row from public.inventory_balances
    where warehouse_id=order_item.fulfillment_warehouse_id and product_id=order_item.product_id
      and variation_id is not distinct from order_item.variation_id and location_id is null for update;
    if balance_row.id is null or balance_row.available<order_item.quantity then raise exception 'Insufficient stock for %',order_item.product_name_snapshot; end if;
    update public.inventory_balances set reserved=reserved+order_item.quantity,updated_at=now() where id=balance_row.id;
    insert into public.inventory_reservations(product_id,variation_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id)
    values(order_item.product_id,order_item.variation_id,order_item.fulfillment_warehouse_id,order_item.quantity,'active',
      (select order_number from public.sales_orders where id=new_order_id),actor_profile_id,new_order_id,order_item.id);
  end loop;
  update public.sales_orders set status='confirmed',confirmed_at=now() where id=new_order_id;
  insert into public.eps_checkout_requests(operation_id,profile_id,cart_id,order_id,fingerprint)
  values(requested_operation_id,actor_profile_id,cart.id,new_order_id,requested_fingerprint);
  insert into public.order_status_events(order_id,new_status,actor_profile_id,note)
  values(new_order_id,'confirmed',actor_profile_id,'Website order awaiting verified EPS payment; stock reserved');
  update public.shopping_carts
  set status='converted',converted_order_id=new_order_id,updated_at=now()
  where id=cart.id;
  return new_order_id;
end
$$;


revoke all on function public.customer_checkout_cart_eps(uuid,uuid,text,text,text,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.customer_checkout_cart_eps(uuid,uuid,text,text,text,uuid,text,numeric) to service_role;

-- Release abandoned stock only when there is no unresolved external payment.
-- Unknown or processing transactions retain stock and require verification/review.
create or replace function public.expire_eps_unpaid_orders(requested_admin_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare sale record; expired integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' or not exists(select 1 from public.profiles where id=requested_admin_id and role='admin' and status='active' and archived_at is null) then raise exception 'Permission denied'; end if;
  for sale in select o.id from public.sales_orders o join public.eps_checkout_requests c on c.order_id=o.id
    where c.payment_expires_at<now() and o.status='confirmed' and o.paid_amount=0
      and not exists(select 1 from public.eps_payment_attempts a where a.order_id=o.id and a.status not in('failed','cancelled'))
      and not exists(select 1 from public.sales_order_items i where i.order_id=o.id and (i.allocated_quantity>0 or i.packed_quantity>0 or i.shipped_quantity>0))
    order by c.payment_expires_at limit 10 for update of o skip locked
  loop
    perform public.cancel_sales_order(requested_admin_id,sale.id,'Unpaid online checkout expired with no unresolved payment');
    expired:=expired+1;
  end loop;
  return expired;
end $$;
revoke all on function public.expire_eps_unpaid_orders(uuid) from public,anon,authenticated;
grant execute on function public.expire_eps_unpaid_orders(uuid) to service_role;
