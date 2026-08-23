-- Transactional local acceptance tests for Sales Payment to Accounting posting.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  actor_id uuid:=gen_random_uuid();
  customer_id uuid:=gen_random_uuid();
  partial_sale_id uuid:=gen_random_uuid();
  full_sale_id uuid:=gen_random_uuid();
  methods_sale_id uuid:=gen_random_uuid();
  closed_sale_id uuid:=gen_random_uuid();
  partial_20_operation uuid:=gen_random_uuid();
  partial_40_operation uuid:=gen_random_uuid();
  partial_14_operation uuid:=gen_random_uuid();
  full_operation uuid:=gen_random_uuid();
  payment_20_id uuid;
  payment_40_id uuid;
  payment_14_id uuid;
  full_payment_id uuid;
  retry_payment_id uuid;
  payment_business_date date;
  closed_business_date date;
  cashbook_entry record;
  journal record;
  before_payment_count integer;
  before_cashbook_count integer;
  before_journal_count integer;
begin
  select coalesce(min(business_date)-2,current_date)
  into payment_business_date
  from public.cashbook_days;
  closed_business_date:=payment_business_date-1;

  insert into public.profiles(id,email,full_name,role,status)
  values
    (actor_id,'sales-payment-actor-'||actor_id||'@local.test','Sales Payment Actor','admin','active'),
    (customer_id,'tex-rise-'||customer_id||'@local.test','Tex Rise Engineering','customer','active');

  insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,status,
    subtotal,total_amount,created_by,updated_by
  ) values
    (partial_sale_id,'SEN-ORD-PARTIAL-'||left(replace(partial_sale_id::text,'-',''),8),customer_id,
      jsonb_build_object('recipient_name','Tex Rise Engineering','address_line_1','Dhaka'),
      'confirmed',74000,74000,actor_id,actor_id),
    (full_sale_id,'SEN-ORD-FULL-'||left(replace(full_sale_id::text,'-',''),8),customer_id,
      jsonb_build_object('recipient_name','Tex Rise Engineering','address_line_1','Dhaka'),
      'confirmed',74000,74000,actor_id,actor_id),
    (methods_sale_id,'SEN-ORD-METHODS-'||left(replace(methods_sale_id::text,'-',''),8),customer_id,
      jsonb_build_object('recipient_name','Tex Rise Engineering','address_line_1','Dhaka'),
      'confirmed',1000,1000,actor_id,actor_id),
    (closed_sale_id,'SEN-ORD-CLOSED-'||left(replace(closed_sale_id::text,'-',''),8),customer_id,
      jsonb_build_object('recipient_name','Tex Rise Engineering','address_line_1','Dhaka'),
      'confirmed',1000,1000,actor_id,actor_id);

  insert into public.sale_documents(
    order_id,document_number,document_type,status,snapshot,generated_by
  ) values(
    partial_sale_id,
    'SEN-INV-'||left(replace(partial_sale_id::text,'-',''),12),
    'invoice','generated','{}'::jsonb,actor_id
  );

  payment_20_id:=public.record_sale_payment(
    actor_id,partial_sale_id,20000,payment_business_date,'cash',
    'PAYMENT-REF-20K','First partial payment',partial_20_operation,null
  );
  payment_40_id:=public.record_sale_payment(
    actor_id,partial_sale_id,40000,payment_business_date,'bank_transfer',
    'PAYMENT-REF-40K','Second partial payment',partial_40_operation,null
  );
  if (select paid_amount from public.sales_orders where id=partial_sale_id)<>60000
    or (select payment_status from public.sales_orders where id=partial_sale_id)<>'partially_paid'
  then
    raise exception 'The two partial payments did not total BDT 60,000';
  end if;
  payment_14_id:=public.record_sale_payment(
    actor_id,partial_sale_id,14000,payment_business_date,'mobile_banking',
    'PAYMENT-REF-14K','Final partial payment',partial_14_operation,null
  );
  if (select paid_amount from public.sales_orders where id=partial_sale_id)<>74000
    or (select payment_status from public.sales_orders where id=partial_sale_id)<>'paid'
  then
    raise exception 'The final partial payment did not complete BDT 74,000';
  end if;
  if (select count(*) from public.sale_payments where order_id=partial_sale_id)<>3
    or (select count(*) from public.cashbook_entries where sale_payment_id in(payment_20_id,payment_40_id,payment_14_id))<>3
    or (select count(*) from public.journal_entries where reference_type='payment' and reference_id in(payment_20_id,payment_40_id,payment_14_id))<>3
  then
    raise exception 'Each partial payment must have one separate Accounting posting';
  end if;

  retry_payment_id:=public.record_sale_payment(
    actor_id,partial_sale_id,20000,payment_business_date,'cash',
    'PAYMENT-REF-20K','First partial payment',partial_20_operation,null
  );
  if retry_payment_id<>payment_20_id
    or (select count(*) from public.sale_payments where operation_id=partial_20_operation)<>1
    or (select count(*) from public.cashbook_entries where sale_payment_id=payment_20_id)<>1
    or (select count(*) from public.journal_entries where reference_type='payment' and reference_id=payment_20_id)<>1
    or (select count(*) from public.audit_logs where entity_type='sale_payment' and entity_id=payment_20_id::text)<>1
  then
    raise exception 'An idempotent retry created duplicate financial records';
  end if;
  begin
    perform public.record_sale_payment(
      actor_id,partial_sale_id,19999,payment_business_date,'cash',
      'PAYMENT-REF-20K','First partial payment',partial_20_operation,null
    );
    raise exception 'A changed retry was accepted';
  exception when others then
    if sqlerrm not like '%already used with different details%' then raise; end if;
  end;

  select * into cashbook_entry from public.cashbook_entries where sale_payment_id=payment_20_id;
  if cashbook_entry.amount<>20000
    or cashbook_entry.transaction_type<>'income'
    or cashbook_entry.payment_method<>'cash'
    or cashbook_entry.source_payment_method<>'cash'
    or cashbook_entry.business_date<>payment_business_date
  then
    raise exception 'The BDT 20,000 Cash Book income entry is incorrect';
  end if;
  select * into journal from public.journal_entries where id=cashbook_entry.journal_entry_id;
  if journal.status<>'posted'
    or journal.entry_date<>payment_business_date
    or journal.reference_type<>'payment'
    or journal.reference_id<>payment_20_id
    or (select coalesce(sum(debit),0) from public.journal_lines where journal_entry_id=journal.id)<>20000
    or (select coalesce(sum(credit),0) from public.journal_lines where journal_entry_id=journal.id)<>20000
    or not exists(
      select 1 from public.journal_lines line
      join public.accounting_accounts account on account.id=line.account_id
      where line.journal_entry_id=journal.id and account.code='1010' and line.debit=20000
    )
    or not exists(
      select 1 from public.journal_lines line
      join public.accounting_accounts account on account.id=line.account_id
      where line.journal_entry_id=journal.id and account.code='4000' and line.credit=20000
    )
  then
    raise exception 'The Sales payment journal is not balanced to Cash and Sales Revenue';
  end if;
  if cashbook_entry.remark not like '%SEN-ORD-PARTIAL-%'
    or cashbook_entry.remark not like '%SEN-INV-%'
    or cashbook_entry.remark not like '%Tex Rise Engineering%'
    or cashbook_entry.remark not like '%PAYMENT-REF-20K%'
  then
    raise exception 'The Accounting reference is missing Sales traceability';
  end if;

  full_payment_id:=public.record_sale_payment(
    actor_id,full_sale_id,74000,payment_business_date,'card',
    'PAYMENT-REF-FULL','Full payment',full_operation,null
  );
  if (select paid_amount from public.sales_orders where id=full_sale_id)<>74000
    or (select payment_status from public.sales_orders where id=full_sale_id)<>'paid'
    or (select count(*) from public.sale_payments where order_id=full_sale_id)<>1
    or (select amount from public.cashbook_entries where sale_payment_id=full_payment_id)<>74000
  then
    raise exception 'The one-time BDT 74,000 full payment is incorrect';
  end if;
  if not exists(
    select 1 from public.cashbook_entries entry
    join public.journal_lines line on line.journal_entry_id=entry.journal_entry_id
    join public.accounting_accounts account on account.id=line.account_id
    where entry.sale_payment_id=full_payment_id
      and entry.source_payment_method='card'
      and entry.payment_method='bank'
      and account.code='1020'
      and line.debit=74000
  ) then
    raise exception 'Card did not preserve its method while posting to Bank';
  end if;
  if (select sum(amount) from public.cashbook_entries where business_date=payment_business_date and sale_payment_id is not null)<>148000 then
    raise exception 'The Daily Cash Statement income total did not update correctly';
  end if;

  perform public.record_sale_payment(actor_id,methods_sale_id,100,payment_business_date,'cheque','CHEQUE-REF',null,gen_random_uuid(),null);
  perform public.record_sale_payment(actor_id,methods_sale_id,100,payment_business_date,'cash_on_delivery','COD-REF',null,gen_random_uuid(),null);
  perform public.record_sale_payment(actor_id,methods_sale_id,100,payment_business_date,'advance_payment','ADVANCE-REF',null,gen_random_uuid(),'cash');
  perform public.record_sale_payment(actor_id,methods_sale_id,100,payment_business_date,'other','OTHER-REF',null,gen_random_uuid(),'mfs');
  if not exists(select 1 from public.cashbook_entries where source_payment_method='cheque' and payment_method='bank')
    or not exists(select 1 from public.cashbook_entries where source_payment_method='cash_on_delivery' and payment_method='cash')
    or not exists(select 1 from public.cashbook_entries where source_payment_method='advance_payment' and payment_method='cash')
    or not exists(select 1 from public.cashbook_entries where source_payment_method='other' and payment_method='mfs')
  then
    raise exception 'Exact methods and explicit receipt channels were not preserved';
  end if;
  begin
    perform public.record_sale_payment(actor_id,methods_sale_id,10,payment_business_date,'credit_sale',null,null,gen_random_uuid(),null);
    raise exception 'Credit Sale was accepted as received money';
  exception when others then
    if sqlerrm not like 'Credit Sale is not a received payment%' then raise; end if;
  end;
  begin
    perform public.record_sale_payment(actor_id,methods_sale_id,10,payment_business_date,'advance_payment',null,null,gen_random_uuid(),null);
    raise exception 'Advance Payment without a channel was accepted';
  exception when others then
    if sqlerrm not like 'Select the actual Cash, Bank, or MFS receiving channel%' then raise; end if;
  end;
  begin
    perform public.record_sale_payment(actor_id,methods_sale_id,10,payment_business_date,'other',null,null,gen_random_uuid(),'unclassified');
    raise exception 'Other with an unsafe channel was accepted';
  exception when others then
    if sqlerrm not like 'Select the actual Cash, Bank, or MFS receiving channel%' then raise; end if;
  end;

  insert into public.cashbook_days(
    business_date,opening_balance,closing_balance,is_closed,closed_at,closed_by,updated_by
  ) values(closed_business_date,0,0,true,now(),actor_id,actor_id);
  select count(*) into before_payment_count from public.sale_payments;
  select count(*) into before_cashbook_count from public.cashbook_entries;
  select count(*) into before_journal_count from public.journal_entries;
  begin
    perform public.record_sale_payment(
      actor_id,closed_sale_id,500,closed_business_date,'cash',
      'CLOSED-REF',null,gen_random_uuid(),null
    );
    raise exception 'A payment was posted into a closed Cash Book date';
  exception when others then
    if sqlerrm not like 'This cashbook date is already closed%' then raise; end if;
  end;
  if (select count(*) from public.sale_payments)<>before_payment_count
    or (select count(*) from public.cashbook_entries)<>before_cashbook_count
    or (select count(*) from public.journal_entries)<>before_journal_count
  then
    raise exception 'A closed-date rejection left partial financial records';
  end if;

  begin
    perform public.cancel_sales_order(actor_id,partial_sale_id,'Cancellation must be blocked');
    raise exception 'A paid Sale was cancelled without a payment reversal';
  exception when others then
    if sqlerrm not like 'This sale has received payment and cannot be cancelled directly%' then raise; end if;
  end;
  if (select status from public.sales_orders where id=partial_sale_id)<>'confirmed'
    or (select count(*) from public.sale_payments where order_id=partial_sale_id)<>3
    or (select count(*) from public.cashbook_entries where sale_payment_id in(payment_20_id,payment_40_id,payment_14_id))<>3
  then
    raise exception 'The cancellation safeguard changed protected financial history';
  end if;
end $$;

rollback;
