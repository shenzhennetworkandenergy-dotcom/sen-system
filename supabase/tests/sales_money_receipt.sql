-- Transactional local acceptance test for Sales Money Receipts.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  admin_id uuid := gen_random_uuid();
  employee_allowed_id uuid := gen_random_uuid();
  employee_denied_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  main_sale_id uuid := gen_random_uuid();
  own_sale_id uuid := gen_random_uuid();
  denied_sale_id uuid := gen_random_uuid();
  main_payment_1_id uuid := gen_random_uuid();
  main_payment_2_id uuid := gen_random_uuid();
  main_payment_3_id uuid := gen_random_uuid();
  own_payment_id uuid := gen_random_uuid();
  denied_payment_id uuid := gen_random_uuid();
  main_receipt_1_id uuid;
  main_receipt_1_retry_id uuid;
  main_receipt_2_id uuid;
  main_receipt_3_id uuid;
  own_receipt_id uuid;
  main_receipt_1 record;
  main_receipt_2 record;
  main_receipt_3 record;
  own_receipt record;
  main_receipt_1_snapshot jsonb;
  template_id uuid;
  main_invoice_1 text := 'SEN-INV-MAIN-REV1';
  main_invoice_2 text := 'SEN-INV-MAIN-REV2';
  billing_snapshot jsonb := jsonb_build_object(
    'recipient_name','Money Receipt Billing',
    'phone','01710000001',
    'address_line_1','Billing Road 12',
    'city','Dhaka',
    'country_code','BD'
  );
  shipping_snapshot jsonb := jsonb_build_object(
    'recipient_name','Money Receipt Shipping',
    'phone','01710000002',
    'address_line_1','Shipping Road 99',
    'city','Chattogram',
    'country_code','BD'
  );
  before_sale_payments integer;
  before_cashbook_entries integer;
  before_journal_entries integer;
  before_journal_lines integer;
  before_inventory_movements integer;
  before_inventory_movement_items integer;
  before_inventory_balances integer;
  before_shipments integer;
  before_inventory_reservations integer;
  before_order_serial_allocations integer;
  before_order_status_events integer;
  before_sale_documents integer;
  before_sale_total numeric;
  before_sale_paid_amount numeric;
  before_sale_payment_status text;
  before_inventory_on_hand numeric;
  before_inventory_reserved numeric;
  visible_count integer;
  fixture_receipt_ids uuid[];
begin
  main_payment_1_id := gen_random_uuid();
  main_payment_2_id := gen_random_uuid();
  main_payment_3_id := gen_random_uuid();
  own_payment_id := gen_random_uuid();
  denied_payment_id := gen_random_uuid();

  -- Hosted Supabase has auth.users and a profile trigger; the native schema
  -- intentionally does not.  Keep this fixture runnable in either database.
  if to_regclass('auth.users') is not null then
    execute $auth$
      insert into auth.users(
        instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at
      ) values
        ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,$3,now(),$4::jsonb,$5::jsonb,now(),now()),
        ('00000000-0000-0000-0000-000000000000',$6,'authenticated','authenticated',$7,$3,now(),$8::jsonb,$9::jsonb,now(),now()),
        ('00000000-0000-0000-0000-000000000000',$10,'authenticated','authenticated',$11,$3,now(),$12::jsonb,$13::jsonb,now(),now()),
        ('00000000-0000-0000-0000-000000000000',$14,'authenticated','authenticated',$15,$3,now(),$16::jsonb,$17::jsonb,now(),now())
      on conflict(id) do nothing
    $auth$
    using
      admin_id,
      'money-receipt-admin@sen.local',
      'offline-only',
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Money Receipt Admin","phone":"01710000010","company_name":"SEN Admin Desk"}',
      employee_allowed_id,
      'money-receipt-employee@sen.local',
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Money Receipt Employee","phone":"01710000011"}',
      employee_denied_id,
      'money-receipt-denied@sen.local',
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Money Receipt Denied","phone":"01710000012"}',
      customer_id,
      'money-receipt-customer@sen.local',
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Money Receipt Customer","phone":"01710000013","company_name":"Money Receipt Customer Co"}';
  end if;

  insert into public.profiles(id,email,full_name,phone,company_name,role,status)
  values
    (admin_id,'money-receipt-admin@sen.local','Money Receipt Admin','01710000010','SEN Admin Desk','admin','active'),
    (employee_allowed_id,'money-receipt-employee@sen.local','Money Receipt Employee','01710000011',null,'employee','active'),
    (employee_denied_id,'money-receipt-denied@sen.local','Money Receipt Denied','01710000012',null,'employee','active'),
    (customer_id,'money-receipt-customer@sen.local','Money Receipt Customer','01710000013','Money Receipt Customer Co','customer','active')
  on conflict(id) do update set
    email=excluded.email,full_name=excluded.full_name,phone=excluded.phone,
    company_name=excluded.company_name,role=excluded.role,status=excluded.status;

  select id into template_id
  from public.permission_templates
  where key='standard_employee' and is_active
  limit 1;
  if template_id is null then raise exception 'Standard employee template not found'; end if;
  perform public.admin_set_profile_permissions(
    admin_id,
    employee_allowed_id,
    template_id,
    array['sales.money_receipt','sales.view_own'],
    array[]::text[]
  );
  perform public.admin_set_profile_permissions(
    admin_id,
    employee_denied_id,
    template_id,
    array[]::text[],
    array[]::text[]
  );

  insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_id,shipping_address_snapshot,
    billing_address_id,billing_address_snapshot,fulfillment_warehouse_id,status,currency,
    subtotal,discount_amount,shipping_amount,tax_amount,total_amount,
    internal_notes,customer_notes,confirmed_at,cancelled_at,delivered_at,
    created_by,updated_by,created_at,updated_at,payment_status,paid_amount,refunded_amount
  ) values
    (
      main_sale_id,
      'SEN-MR-ORD-MAIN',
      customer_id,
      null,
      shipping_snapshot,
      null,
      billing_snapshot,
      null,
      'confirmed',
      'BDT',
      100000,
      0,
      0,
      0,
      100000,
      'Main sale for money receipt testing',
      'Main sale customer note',
      '2026-08-31 08:00:00+00',
      null,
      null,
      admin_id,
      admin_id,
      '2026-08-31 08:00:00+00',
      '2026-08-31 08:00:00+00',
      'paid',
      100000,
      0
    ),
    (
      own_sale_id,
      'SEN-MR-ORD-OWN',
      customer_id,
      null,
      shipping_snapshot,
      null,
      billing_snapshot,
      null,
      'confirmed',
      'BDT',
      25000,
      0,
      0,
      0,
      25000,
      'Employee-owned sale for scope testing',
      'Employee-owned customer note',
      '2026-08-31 09:00:00+00',
      null,
      null,
      employee_allowed_id,
      employee_allowed_id,
      '2026-08-31 09:00:00+00',
      '2026-08-31 09:00:00+00',
      'paid',
      25000,
      0
    ),
    (
      denied_sale_id,
      'SEN-MR-ORD-DENIED',
      customer_id,
      null,
      shipping_snapshot,
      null,
      billing_snapshot,
      null,
      'confirmed',
      'BDT',
      12000,
      0,
      0,
      0,
      12000,
      'Denied employee sale for permission testing',
      'Denied employee customer note',
      '2026-08-31 10:00:00+00',
      null,
      null,
      employee_denied_id,
      employee_denied_id,
      '2026-08-31 10:00:00+00',
      '2026-08-31 10:00:00+00',
      'paid',
      12000,
      0
    );

  insert into public.sale_payments(
    id,order_id,amount,payment_date,method,reference_number,internal_note,status,received_by,created_at
  ) values
    (
      main_payment_1_id,
      main_sale_id,
      50000,
      date '2026-08-31',
      'cash',
      'MR-MAIN-50000-1',
      'Main sale payment one',
      'received',
      admin_id,
      '2026-08-31 08:10:00+00'
    ),
    (
      main_payment_2_id,
      main_sale_id,
      30000,
      date '2026-08-31',
      'bank_transfer',
      'MR-MAIN-30000-2',
      'Main sale payment two',
      'received',
      admin_id,
      '2026-08-31 08:20:00+00'
    ),
    (
      main_payment_3_id,
      main_sale_id,
      20000,
      date '2026-08-31',
      'mobile_banking',
      'MR-MAIN-20000-3',
      'Main sale payment three',
      'received',
      admin_id,
      '2026-08-31 08:30:00+00'
    ),
    (
      own_payment_id,
      own_sale_id,
      25000,
      date '2026-08-31',
      'cash',
      'MR-OWN-25000',
      'Employee-owned payment',
      'received',
      employee_allowed_id,
      '2026-08-31 09:10:00+00'
    ),
    (
      denied_payment_id,
      denied_sale_id,
      12000,
      date '2026-08-31',
      'cash',
      'MR-DENIED-12000',
      'Denied employee payment',
      'voided',
      employee_denied_id,
      '2026-08-31 10:10:00+00'
    );

  insert into public.sale_documents(
    id,order_id,document_number,document_type,status,snapshot,generated_by,revision_number,created_at
  ) values
    (
      gen_random_uuid(),
      main_sale_id,
      main_invoice_1,
      'invoice',
      'generated',
      '{}'::jsonb,
      admin_id,
      1,
      '2026-08-30 14:00:00+00'
    ),
    (
      gen_random_uuid(),
      main_sale_id,
      main_invoice_2,
      'invoice',
      'generated',
      '{}'::jsonb,
      admin_id,
      2,
      '2026-08-30 13:00:00+00'
    );

  select count(*) into before_sale_payments from public.sale_payments;
  select count(*) into before_cashbook_entries from public.cashbook_entries;
  select count(*) into before_journal_entries from public.journal_entries;
  select count(*) into before_journal_lines from public.journal_lines;
  select count(*) into before_inventory_movements from public.inventory_movements;
  select count(*) into before_inventory_movement_items from public.inventory_movement_items;
  select count(*) into before_inventory_balances from public.inventory_balances;
  select count(*) into before_shipments from public.shipments;
  select count(*) into before_inventory_reservations from public.inventory_reservations;
  select count(*) into before_order_serial_allocations from public.order_serial_allocations;
  select count(*) into before_order_status_events from public.order_status_events;
  select count(*) into before_sale_documents from public.sale_documents;
  select total_amount,paid_amount,payment_status
  into before_sale_total,before_sale_paid_amount,before_sale_payment_status
  from public.sales_orders
  where id=main_sale_id;
  select coalesce(sum(on_hand),0), coalesce(sum(reserved),0)
  into before_inventory_on_hand, before_inventory_reserved
  from public.inventory_balances;

  main_receipt_1_id := public.generate_sale_money_receipt(admin_id, main_payment_1_id);
  if main_receipt_1_id is null then raise exception 'Admin receipt generation returned null'; end if;
  select * into main_receipt_1 from public.sale_money_receipts where id=main_receipt_1_id;
  if main_receipt_1.payment_id <> main_payment_1_id
    or main_receipt_1.order_id <> main_sale_id
    or main_receipt_1.receipt_number is null
    or main_receipt_1.receipt_date <> date '2026-08-31'
    or main_receipt_1.generated_by <> admin_id
    or main_receipt_1.snapshot->'sale'->>'order_number' <> 'SEN-MR-ORD-MAIN'
    or (main_receipt_1.snapshot->'sale'->>'total_amount')::numeric <> 100000
    or main_receipt_1.snapshot->'sale'->>'currency' <> 'BDT'
    or main_receipt_1.snapshot->'customer'->>'full_name' <> 'Money Receipt Customer'
    or main_receipt_1.snapshot->'customer'->>'company_name' <> 'Money Receipt Customer Co'
    or main_receipt_1.snapshot->'contact'->>'full_name' <> 'Money Receipt Customer'
    or main_receipt_1.snapshot->'contact'->>'phone' <> '01710000013'
    or main_receipt_1.snapshot->'address' <> billing_snapshot
    or main_receipt_1.snapshot->'payment'->>'id' <> main_payment_1_id::text
    or (main_receipt_1.snapshot->'payment'->>'amount')::numeric <> 50000
    or main_receipt_1.snapshot->'payment'->>'method' <> 'cash'
    or main_receipt_1.snapshot->'payment'->>'reference_number' <> 'MR-MAIN-50000-1'
    or main_receipt_1.snapshot->'payment'->>'status' <> 'received'
    or main_receipt_1.snapshot->'payment'->'received_by'->>'id' <> admin_id::text
    or main_receipt_1.snapshot->'payment'->'received_by'->>'full_name' <> 'Money Receipt Admin'
    or (main_receipt_1.snapshot->'summary'->>'previously_paid')::numeric <> 0
    or (main_receipt_1.snapshot->'summary'->>'this_payment')::numeric <> 50000
    or (main_receipt_1.snapshot->'summary'->>'total_paid')::numeric <> 50000
    or (main_receipt_1.snapshot->'summary'->>'remaining')::numeric <> 50000
    or main_receipt_1.snapshot->'summary'->>'status' <> 'PARTIAL PAYMENT'
    or main_receipt_1.snapshot->>'invoice_number' <> main_invoice_2
    or main_receipt_1.snapshot->>'amount_in_words' <> 'Bangladeshi Taka Fifty Thousand Only'
    or main_receipt_1.snapshot ? 'internal_note'
  then
    raise exception 'The first money receipt snapshot is incorrect';
  end if;

  main_receipt_1_snapshot := main_receipt_1.snapshot;
  if (select count(*) from public.sale_money_receipts where payment_id=main_payment_2_id) <> 0 then
    raise exception 'A payment received without a receipt must remain receipt-free until explicitly generated';
  end if;

  -- A direct insert must not be able to forge the customer, address, or
  -- historical payment summary while reusing a real payment's core fields.
  begin
    insert into public.sale_money_receipts(
      id,payment_id,order_id,receipt_number,receipt_date,snapshot,generated_by
    ) values (
      gen_random_uuid(),
      main_payment_2_id,
      main_sale_id,
      'SEN-MR-20990101-99999',
      date '2026-08-31',
      jsonb_build_object(
        'receipt_number','SEN-MR-20990101-99999',
        'receipt_date','2026-08-31',
        'generated_at','2026-08-31T08:20:00Z',
        'sale',jsonb_build_object(
          'id',main_sale_id,
          'order_number','SEN-MR-ORD-MAIN',
          'total_amount',100000,
          'currency','BDT'
        ),
        'customer',jsonb_build_object(
          'id',gen_random_uuid(),
          'full_name','FORGED CUSTOMER'
        ),
        'contact',jsonb_build_object('full_name','FORGED CONTACT'),
        'address',jsonb_build_object('forged',true),
        'payment',jsonb_build_object(
          'id',main_payment_2_id,
          'amount',999,
          'payment_date','2026-08-31',
          'method','bank_transfer',
          'reference_number','MR-MAIN-30000-2',
          'status','received',
          'received_by',jsonb_build_object('id',admin_id)
        ),
        'invoice_number','FORGED-INVOICE',
        'summary',jsonb_build_object(
          'previously_paid',999999,
          'this_payment',1,
          'total_paid',1,
          'remaining',99999,
          'status','FULL PAYMENT'
        ),
        'amount_in_words','FORGED WORDS'
      ),
      admin_id
    );
    raise exception 'Forged snapshot insert was accepted';
  exception when others then
    if sqlerrm = 'Forged snapshot insert was accepted' then raise; end if;
  end;

  begin
    insert into public.sale_money_receipts(
      id,payment_id,order_id,receipt_number,receipt_date,snapshot,generated_by
    ) values (
      gen_random_uuid(),
      main_payment_2_id,
      main_sale_id,
      'FORGED-RECEIPT-NUMBER',
      date '2026-08-31',
      jsonb_build_object('generated_at','2026-08-31T08:20:00Z'),
      admin_id
    );
    raise exception 'Forged receipt number insert was accepted';
  exception when others then
    if sqlerrm = 'Forged receipt number insert was accepted' then raise; end if;
  end;

  main_receipt_1_retry_id := public.generate_sale_money_receipt(admin_id, main_payment_1_id);
  if main_receipt_1_retry_id <> main_receipt_1_id
    or (select count(*) from public.sale_money_receipts where payment_id=main_payment_1_id) <> 1
    or (select count(*) from public.audit_logs where action='sales.money_receipt_generated' and entity_type='sale_money_receipt' and entity_id=main_receipt_1_id::text) <> 1
  then
    raise exception 'Idempotent receipt generation created duplicate records';
  end if;

  main_receipt_2_id := public.generate_sale_money_receipt(admin_id, main_payment_2_id);
  select * into main_receipt_2 from public.sale_money_receipts where id=main_receipt_2_id;
  if main_receipt_2.receipt_number is null
    or (main_receipt_2.snapshot->'payment'->>'id')::uuid <> main_payment_2_id
    or (main_receipt_2.snapshot->'payment'->>'amount')::numeric <> 30000
    or main_receipt_2.snapshot->'payment'->>'method' <> 'bank_transfer'
    or (main_receipt_2.snapshot->'summary'->>'previously_paid')::numeric <> 50000
    or (main_receipt_2.snapshot->'summary'->>'this_payment')::numeric <> 30000
    or (main_receipt_2.snapshot->'summary'->>'total_paid')::numeric <> 80000
    or (main_receipt_2.snapshot->'summary'->>'remaining')::numeric <> 20000
    or main_receipt_2.snapshot->'summary'->>'status' <> 'PARTIAL PAYMENT'
    or main_receipt_2.snapshot->>'invoice_number' <> main_invoice_2
    or main_receipt_2.snapshot->>'amount_in_words' <> 'Bangladeshi Taka Thirty Thousand Only'
  then
    raise exception 'The second money receipt snapshot is incorrect';
  end if;

  main_receipt_3_id := public.generate_sale_money_receipt(admin_id, main_payment_3_id);
  select * into main_receipt_3 from public.sale_money_receipts where id=main_receipt_3_id;
  if main_receipt_3.receipt_number is null
    or (main_receipt_3.snapshot->'payment'->>'id')::uuid <> main_payment_3_id
    or (main_receipt_3.snapshot->'payment'->>'amount')::numeric <> 20000
    or main_receipt_3.snapshot->'payment'->>'method' <> 'mobile_banking'
    or (main_receipt_3.snapshot->'summary'->>'previously_paid')::numeric <> 80000
    or (main_receipt_3.snapshot->'summary'->>'this_payment')::numeric <> 20000
    or (main_receipt_3.snapshot->'summary'->>'total_paid')::numeric <> 100000
    or (main_receipt_3.snapshot->'summary'->>'remaining')::numeric <> 0
    or main_receipt_3.snapshot->'summary'->>'status' <> 'FULL PAYMENT'
    or main_receipt_3.snapshot->>'invoice_number' <> main_invoice_2
    or main_receipt_3.snapshot->>'amount_in_words' <> 'Bangladeshi Taka Twenty Thousand Only'
  then
    raise exception 'The third money receipt snapshot is incorrect';
  end if;

  if (select snapshot from public.sale_money_receipts where id=main_receipt_1_id) <> main_receipt_1_snapshot then
    raise exception 'An earlier money receipt changed after a later payment';
  end if;

  own_receipt_id := public.generate_sale_money_receipt(employee_allowed_id, own_payment_id);
  select * into own_receipt from public.sale_money_receipts where id=own_receipt_id;
  if own_receipt.receipt_number is null
    or own_receipt.payment_id <> own_payment_id
    or own_receipt.order_id <> own_sale_id
    or own_receipt.generated_by <> employee_allowed_id
    or (own_receipt.snapshot->'payment'->>'amount')::numeric <> 25000
    or own_receipt.snapshot->'payment'->>'reference_number' <> 'MR-OWN-25000'
    or own_receipt.snapshot->'payment'->'received_by'->>'id' <> employee_allowed_id::text
    or own_receipt.snapshot->'summary'->>'status' <> 'FULL PAYMENT'
    or own_receipt.snapshot->>'invoice_number' is not null
  then
    raise exception 'The employee-owned money receipt snapshot is incorrect';
  end if;

  -- RED check for the isolated own-sale authorization helper.  The existing
  -- sales_orders RLS policy does not expose own-only rows, so this check must
  -- resolve ownership without broadening that global policy.
  perform set_config('request.jwt.claim.sub',employee_allowed_id::text,true);
  if not public.can_current_user_view_sale_money_receipt(own_sale_id) then
    raise exception 'Own-sale Money Receipt authorization was denied';
  end if;
  perform set_config('request.jwt.claim.sub','',true);

  begin
    perform public.generate_sale_money_receipt(employee_denied_id, denied_payment_id);
    raise exception 'An employee without explicit permission was allowed to generate a money receipt';
  exception when others then
    if sqlerrm <> 'Permission denied' then raise; end if;
  end;

  begin
    perform public.generate_sale_money_receipt(employee_allowed_id, main_payment_2_id);
    raise exception 'An employee was allowed to generate a receipt for another employee sale';
  exception when others then
    if sqlerrm <> 'Sales view permission required' then raise; end if;
  end;

  begin
    perform public.generate_sale_money_receipt(admin_id, denied_payment_id);
    raise exception 'A non-received payment was accepted';
  exception when others then
    if sqlerrm <> 'Only received payments can have a money receipt' then raise; end if;
  end;

  begin
    update public.sale_money_receipts
    set receipt_number='MUTATED'
    where id=main_receipt_1_id;
    raise exception 'A money receipt update was accepted';
  exception when others then
    if sqlerrm <> 'Sales money receipts are immutable' then raise; end if;
  end;

  begin
    delete from public.sale_money_receipts where id=main_receipt_1_id;
    raise exception 'A money receipt delete was accepted';
  exception when others then
    if sqlerrm <> 'Sales money receipts are immutable' then raise; end if;
  end;

  if (select count(*) from public.sale_money_receipts where payment_id in (main_payment_1_id,main_payment_2_id,main_payment_3_id,own_payment_id)) <> 4 then
    raise exception 'Each payment should have exactly one money receipt';
  end if;
  if (select count(*) from public.sale_money_receipts where payment_id=main_payment_1_id) <> 1
    or (select count(*) from public.sale_money_receipts where payment_id=main_payment_2_id) <> 1
    or (select count(*) from public.sale_money_receipts where payment_id=main_payment_3_id) <> 1
    or (select count(*) from public.sale_money_receipts where payment_id=own_payment_id) <> 1
  then
    raise exception 'One-to-zero/one money receipt mapping was violated';
  end if;

  if (select count(*) from public.sale_payments) <> before_sale_payments
    or (select count(*) from public.cashbook_entries) <> before_cashbook_entries
    or (select count(*) from public.journal_entries) <> before_journal_entries
    or (select count(*) from public.journal_lines) <> before_journal_lines
    or (select count(*) from public.inventory_movements) <> before_inventory_movements
    or (select count(*) from public.inventory_movement_items) <> before_inventory_movement_items
    or (select count(*) from public.inventory_balances) <> before_inventory_balances
    or (select count(*) from public.shipments) <> before_shipments
    or (select count(*) from public.inventory_reservations) <> before_inventory_reservations
    or (select count(*) from public.order_serial_allocations) <> before_order_serial_allocations
    or (select count(*) from public.order_status_events) <> before_order_status_events
    or (select count(*) from public.sale_documents) <> before_sale_documents
    or (select total_amount from public.sales_orders where id=main_sale_id) <> before_sale_total
    or (select paid_amount from public.sales_orders where id=main_sale_id) <> before_sale_paid_amount
    or (select payment_status from public.sales_orders where id=main_sale_id) <> before_sale_payment_status
    or (select coalesce(sum(on_hand),0) from public.inventory_balances) <> before_inventory_on_hand
    or (select coalesce(sum(reserved),0) from public.inventory_balances) <> before_inventory_reserved
  then
    raise exception 'Money receipt generation changed payment, accounting, ledger, or inventory state';
  end if;

  -- Exercise the actual receipt RLS policy under the API roles.  The native
  -- test database does not grant auth-schema usage by default, so grant it
  -- only inside this rollback-only transaction.
  fixture_receipt_ids := array[main_receipt_1_id,main_receipt_2_id,main_receipt_3_id,own_receipt_id];
  execute 'grant usage on schema auth to authenticated,anon';
  perform set_config('sen.actor_id','',true);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',employee_allowed_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select count(*) into visible_count from public.sale_money_receipts where id=any(fixture_receipt_ids);
  if visible_count <> 1
    or (select count(*) from public.sale_money_receipts where id=any(array[main_receipt_1_id,main_receipt_2_id,main_receipt_3_id])) <> 0
  then
    raise exception 'Own-scope staff could not read only their own Money Receipts';
  end if;

  -- A guessed payment/order URL must remain hidden even when the employee has
  -- the receipt permission: RLS must reject the other employee's sale before
  -- any application-level route can expose it.
  select count(*) into visible_count
  from public.sale_money_receipts
  where payment_id=main_payment_1_id;
  if visible_count <> 0 then
    raise exception 'Own-scope staff could read a Money Receipt for another sale';
  end if;
  select count(*) into visible_count
  from public.sale_money_receipts
  where payment_id=main_payment_1_id and order_id=own_sale_id;
  if visible_count <> 0 then
    raise exception 'Mismatched payment/order Money Receipt URL was visible';
  end if;
  execute 'reset role';

  perform public.admin_set_profile_permissions(
    admin_id,
    employee_allowed_id,
    template_id,
    array['sales.money_receipt','sales.view'],
    array[]::text[]
  );
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',employee_allowed_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select count(*) into visible_count from public.sale_money_receipts where id=any(fixture_receipt_ids);
  if visible_count <> 4 then raise exception 'Broad Sales Money Receipt access was unexpectedly narrowed'; end if;
  execute 'reset role';

  perform public.admin_set_profile_permissions(
    admin_id,
    employee_allowed_id,
    template_id,
    array['sales.money_receipt'],
    array[]::text[]
  );
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',employee_allowed_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select count(*) into visible_count from public.sale_money_receipts where id=any(fixture_receipt_ids);
  if visible_count <> 0 then raise exception 'Money Receipt-only staff gained Sales scope'; end if;
  execute 'reset role';

  perform public.admin_set_profile_permissions(
    admin_id,
    employee_allowed_id,
    template_id,
    array['sales.view_own'],
    array[]::text[]
  );
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',employee_allowed_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select count(*) into visible_count from public.sale_money_receipts where id=any(fixture_receipt_ids);
  if visible_count <> 0 then raise exception 'Sales own-only staff without receipt permission was allowed to read'; end if;
  execute 'reset role';

  -- A staff member with only sales.money_receipt and no applicable Sales
  -- scope must not see receipts, even if the permission is granted directly.
  perform public.admin_set_profile_permissions(
    admin_id,
    employee_denied_id,
    template_id,
    array['sales.money_receipt'],
    array[]::text[]
  );
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',employee_denied_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select count(*) into visible_count from public.sale_money_receipts where id=any(fixture_receipt_ids);
  if visible_count <> 0 then raise exception 'Money Receipt-only staff gained unrelated Sales visibility'; end if;
  execute 'reset role';
  perform public.admin_set_profile_permissions(
    admin_id,
    employee_denied_id,
    template_id,
    array[]::text[],
    array[]::text[]
  );

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select count(*) into visible_count from public.sale_money_receipts where id=any(fixture_receipt_ids);
  if visible_count <> 4 then raise exception 'Admin could not read all Money Receipts'; end if;
  execute 'reset role';

  begin
    execute 'set local role anon';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claim.role','anon',true);
    select count(*) into visible_count from public.sale_money_receipts;
    if visible_count <> 0 then raise exception 'Unauthenticated role read Money Receipts'; end if;
    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
  end;
end $$;

rollback;
