begin;

alter table public.sales_orders
  add column if not exists payment_terms_type text,
  add column if not exists credit_period_days integer,
  add column if not exists payment_due_date date;

alter table public.sales_orders
  drop constraint if exists sales_orders_payment_terms_type_check,
  add constraint sales_orders_payment_terms_type_check
    check(payment_terms_type is null or payment_terms_type in ('immediate','partial','credit')),
  drop constraint if exists sales_orders_credit_period_days_check,
  add constraint sales_orders_credit_period_days_check
    check(credit_period_days is null or credit_period_days between 1 and 3650),
  drop constraint if exists sales_orders_commercial_terms_shape_check,
  add constraint sales_orders_commercial_terms_shape_check check(
    (payment_terms_type is null and credit_period_days is null) or
    (payment_terms_type='immediate' and credit_period_days is null and payment_due_date is null) or
    (payment_terms_type in ('partial','credit') and (credit_period_days is not null or payment_due_date is not null))
  );

create or replace function public.update_sale_commercial_terms(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_operation_id uuid,
  requested_payment_terms_type text,
  requested_credit_period_days integer,
  requested_payment_due_date date,
  requested_reason text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  sale_row public.sales_orders%rowtype;
  actor_row public.profiles%rowtype;
  normalized_type text:=nullif(lower(trim(requested_payment_terms_type)),'');
  normalized_reason text:=nullif(left(trim(requested_reason),1000),'');
  has_non_void_invoice boolean;
  has_all_scope boolean;
  has_own_scope boolean;
begin
  if requested_operation_id is null then
    raise exception 'Commercial terms operation ID is required';
  end if;

  select * into sale_row
  from public.sales_orders
  where id=requested_order_id
  for update;
  if not found then raise exception 'Sale not found'; end if;

  if exists(
    select 1 from public.audit_logs log
    where log.module='sales'
      and log.entity_type='sales_order'
      and log.entity_id=requested_order_id::text
      and log.action='sale.commercial_terms_updated'
      and log.metadata->>'operation_id'=requested_operation_id::text
  ) then
    return requested_order_id;
  end if;

  perform public.assert_actor_permission(actor_profile_id,'sales.edit');
  select * into actor_row from public.profiles where id=actor_profile_id;
  if actor_row.id is null or actor_row.status<>'active' then
    raise exception 'Active Sales editor is required';
  end if;

  if actor_row.role<>'admin' then
    if actor_row.role<>'employee' then raise exception 'Sales access denied'; end if;
    select exists(
      select 1 from public.effective_permissions_for_profile(actor_profile_id) permission
      where permission.permission_key in ('sales.view','sales.view_all')
    ) into has_all_scope;
    select exists(
      select 1 from public.effective_permissions_for_profile(actor_profile_id) permission
      where permission.permission_key='sales.view_own'
    ) into has_own_scope;
    if not has_all_scope and (not has_own_scope or sale_row.created_by <> actor_profile_id) then
      raise exception 'Sales access denied';
    end if;
  end if;

  select exists(
    select 1 from public.sale_documents document
    where document.order_id=requested_order_id
      and document.document_type='invoice'
      and document.status <> 'voided'
  ) into has_non_void_invoice;

  if has_non_void_invoice then
    if normalized_type is distinct from sale_row.payment_terms_type then
      raise exception 'Payment terms type cannot be changed after invoice finalization';
    end if;
    if requested_credit_period_days is distinct from sale_row.credit_period_days then
      raise exception 'Credit period cannot be changed after invoice finalization';
    end if;
    if requested_payment_due_date is null then
      raise exception 'Explicit due date is required after invoice finalization';
    end if;
    if normalized_reason is null then
      raise exception 'Correction reason is required after invoice finalization';
    end if;
  else
    if normalized_type not in ('immediate','partial','credit') then
      raise exception 'Payment terms type is invalid';
    end if;
    if requested_credit_period_days is not null and
       (requested_credit_period_days<1 or requested_credit_period_days>3650) then
      raise exception 'Credit period must be between 1 and 3650 days';
    end if;
    if normalized_type='immediate' and
       (requested_credit_period_days is not null or requested_payment_due_date is not null) then
      raise exception 'Immediate payment cannot include a credit period or due date';
    end if;
    if normalized_type in ('partial','credit') and
       requested_credit_period_days is null and requested_payment_due_date is null then
      raise exception 'Partial or credit terms require a credit period or explicit due date';
    end if;
  end if;

  update public.sales_orders set
    payment_terms_type=normalized_type,
    credit_period_days=requested_credit_period_days,
    payment_due_date=requested_payment_due_date,
    updated_by=actor_profile_id,
    updated_at=now()
  where id=requested_order_id;

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,
    previous_values,new_values,metadata
  ) values(
    actor_profile_id,actor_row.role,'sale.commercial_terms_updated','sales',
    'sales_order',requested_order_id::text,
    case when has_non_void_invoice
      then 'Sale payment due date corrected after invoice finalization.'
      else 'Sale commercial payment terms updated.' end,
    jsonb_build_object(
      'payment_terms_type',sale_row.payment_terms_type,
      'credit_period_days',sale_row.credit_period_days,
      'payment_due_date',sale_row.payment_due_date
    ),
    jsonb_build_object(
      'payment_terms_type',normalized_type,
      'credit_period_days',requested_credit_period_days,
      'payment_due_date',requested_payment_due_date,
      'reason',normalized_reason
    ),
    jsonb_build_object(
      'operation_id',requested_operation_id,
      'invoice_finalized',has_non_void_invoice,
      'reason',normalized_reason
    )
  );

  return requested_order_id;
end $$;

create or replace view public.customer_receivables_detail_v as
with invoice_rollup as (
  select
    document.order_id,
    min(timezone('Asia/Dhaka',document.created_at)::date) as anchor_date
  from public.sale_documents document
  where document.document_type='invoice'
    and document.status <> 'voided'
  group by document.order_id
), latest_invoice as (
  select distinct on(document.order_id)
    document.order_id,
    document.document_number,
    timezone('Asia/Dhaka',document.created_at)::date as invoice_date
  from public.sale_documents document
  where document.document_type='invoice'
    and document.status <> 'voided'
  order by document.order_id,document.revision_number desc,document.created_at desc,document.id desc
), last_payment as (
  select distinct on(payment.order_id)
    payment.order_id,
    payment.payment_date
  from public.sale_payments payment
  where payment.status='received'
  order by payment.order_id,payment.payment_date desc,payment.created_at desc,payment.id desc
), derived as (
  select
    sale.id as source_id,
    sale.order_number as reference_number,
    latest_invoice.document_number as invoice_number,
    latest_invoice.invoice_date,
    invoice.anchor_date as invoice_anchor_date,
    sale.customer_profile_id as customer_id,
    customer.full_name as customer_name,
    customer.company_name,
    customer.email as customer_email,
    customer.phone as customer_phone,
    coalesce(nullif(trim(customer.company_name),''),nullif(trim(customer.full_name),''),customer.email,'Customer') as party_name,
    sale.created_by as responsible_profile_id,
    coalesce(nullif(trim(salesperson.full_name),''),salesperson.email,'Salesperson') as salesperson_name,
    sale.currency,
    sale.total_amount as original_amount,
    sale.paid_amount,
    sale.refunded_amount,
    greatest(sale.total_amount-sale.paid_amount,0::numeric) as outstanding_amount,
    sale.payment_status,
    sale.payment_terms_type,
    sale.credit_period_days,
    sale.payment_due_date,
    coalesce(sale.payment_due_date,invoice.anchor_date+sale.credit_period_days) as due_date,
    coalesce(latest_invoice.invoice_date,timezone('Asia/Dhaka',sale.created_at)::date) as issue_date,
    last_payment.payment_date as last_payment_date
  from public.sales_orders sale
  join public.profiles customer on customer.id=sale.customer_profile_id
  join public.profiles salesperson on salesperson.id=sale.created_by
  left join invoice_rollup invoice on invoice.order_id=sale.id
  left join latest_invoice on latest_invoice.order_id=sale.id
  left join last_payment on last_payment.order_id=sale.id
  where sale.status not in ('draft','cancelled')
), classified as (
  select
    derived.*,
    case
      when derived.outstanding_amount<=0 then 'paid'
      when derived.due_date is null then 'no_due_date'
      when derived.due_date<timezone('Asia/Dhaka',now())::date then 'overdue'
      when derived.due_date<=timezone('Asia/Dhaka',now())::date+7 then 'due_soon'
      else 'current'
    end as receivables_status,
    case
      when derived.outstanding_amount<=0 then 'paid'
      when derived.due_date is null then 'no_due_date'
      when derived.due_date>timezone('Asia/Dhaka',now())::date then 'not_yet_due'
      when derived.due_date=timezone('Asia/Dhaka',now())::date then 'due_today'
      when timezone('Asia/Dhaka',now())::date-derived.due_date<=30 then '1_30_days_overdue'
      when timezone('Asia/Dhaka',now())::date-derived.due_date<=60 then '31_60_days_overdue'
      when timezone('Asia/Dhaka',now())::date-derived.due_date<=90 then '61_90_days_overdue'
      else '90_plus_days_overdue'
    end as aging_bucket
  from derived
)
select
  classified.*,
  case
    when classified.outstanding_amount<=0 or classified.due_date is null then null
    when classified.due_date<=timezone('Asia/Dhaka',now())::date
      then timezone('Asia/Dhaka',now())::date-classified.due_date
    else null
  end as days_overdue
from classified;

create or replace view public.customer_receivables_v as
select
  'customer_sale'::text as source_type,
  detail.source_id,
  detail.reference_number,
  detail.invoice_number,
  'customer_receivable'::text as receivable_type,
  'customer'::text as party_type,
  detail.customer_id as party_id,
  detail.party_name,
  detail.currency,
  detail.original_amount,
  detail.paid_amount,
  detail.outstanding_amount,
  detail.receivables_status as receivable_status,
  detail.issue_date,
  detail.due_date,
  detail.days_overdue,
  detail.responsible_profile_id,
  detail.last_payment_date as last_activity_date,
  false as is_opening_balance
from public.customer_receivables_detail_v detail;

create or replace view public.receivables_overview_v as
select * from public.customer_receivables_v
union all
select * from public.non_sales_receivables_v;

create or replace view public.customer_receivables_summary_v as
select
  detail.customer_id,
  detail.customer_name,
  detail.company_name,
  detail.customer_email,
  detail.customer_phone,
  detail.party_name,
  detail.currency,
  detail.responsible_profile_id,
  sum(detail.original_amount) as total_invoiced,
  sum(detail.paid_amount) as total_paid,
  sum(detail.outstanding_amount) as total_outstanding,
  sum(case when detail.receivables_status='overdue' then detail.outstanding_amount else 0::numeric end) as total_overdue,
  count(*)::integer as sale_count
from public.customer_receivables_detail_v detail
group by
  detail.customer_id,detail.customer_name,detail.company_name,detail.customer_email,
  detail.customer_phone,detail.party_name,detail.currency,detail.responsible_profile_id;

create or replace view public.customer_receivables_metrics_v as
with business_date as (
  select timezone('Asia/Dhaka',now())::date as today
), exposure as (
  select
    detail.currency,
    detail.responsible_profile_id,
    sum(detail.outstanding_amount) as customer_outstanding,
    sum(case when detail.receivables_status in ('current','due_soon') then detail.outstanding_amount else 0::numeric end) as current_outstanding,
    sum(case when detail.due_date=business_date.today and detail.outstanding_amount>0 then detail.outstanding_amount else 0::numeric end) as due_today,
    sum(case when detail.due_date>business_date.today and detail.due_date<=business_date.today+7 and detail.outstanding_amount>0 then detail.outstanding_amount else 0::numeric end) as due_next_7_days,
    sum(case when detail.receivables_status='overdue' then detail.outstanding_amount else 0::numeric end) as overdue,
    sum(case when detail.receivables_status='no_due_date' then detail.outstanding_amount else 0::numeric end) as no_due_date,
    count(*) filter(where detail.outstanding_amount>0)::integer as open_record_count
  from public.customer_receivables_detail_v detail
  cross join business_date
  group by detail.currency,detail.responsible_profile_id
), collections as (
  select
    sale.currency,
    sale.created_by as responsible_profile_id,
    sum(payment.amount) as collected_this_month
  from public.sale_payments payment
  join public.sales_orders sale on sale.id=payment.order_id
  cross join business_date
  where payment.status='received'
    and payment.payment_date>=date_trunc('month',business_date.today)::date
    and payment.payment_date<(date_trunc('month',business_date.today)+interval '1 month')::date
    and sale.status not in ('draft','cancelled')
  group by sale.currency,sale.created_by
)
select
  coalesce(exposure.currency,collections.currency) as currency,
  coalesce(exposure.responsible_profile_id,collections.responsible_profile_id) as responsible_profile_id,
  coalesce(exposure.customer_outstanding,0::numeric) as customer_outstanding,
  coalesce(exposure.current_outstanding,0::numeric) as current_outstanding,
  coalesce(exposure.due_today,0::numeric) as due_today,
  coalesce(exposure.due_next_7_days,0::numeric) as due_next_7_days,
  coalesce(exposure.overdue,0::numeric) as overdue,
  coalesce(exposure.no_due_date,0::numeric) as no_due_date,
  coalesce(collections.collected_this_month,0::numeric) as collected_this_month,
  coalesce(exposure.open_record_count,0) as open_record_count
from exposure
full join collections
  on collections.currency=exposure.currency
 and collections.responsible_profile_id=exposure.responsible_profile_id;

revoke all on public.customer_receivables_v from public,anon,authenticated;
revoke all on public.customer_receivables_detail_v from public,anon,authenticated;
revoke all on public.customer_receivables_summary_v from public,anon,authenticated;
revoke all on public.customer_receivables_metrics_v from public,anon,authenticated;
revoke all on public.receivables_overview_v from public,anon,authenticated;
grant select on public.customer_receivables_v to service_role;
grant select on public.customer_receivables_detail_v to service_role;
grant select on public.customer_receivables_summary_v to service_role;
grant select on public.customer_receivables_metrics_v to service_role;
grant select on public.receivables_overview_v to service_role;

revoke all on function public.update_sale_commercial_terms(
  uuid,uuid,uuid,text,integer,date,text
) from public,anon,authenticated;
grant execute on function public.update_sale_commercial_terms(
  uuid,uuid,uuid,text,integer,date,text
) to service_role;

select pg_notify('pgrst','reload schema');

commit;
