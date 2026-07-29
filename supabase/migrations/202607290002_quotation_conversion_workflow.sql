-- Complete quotation approval, customer linkage, invoice conversion,
-- notifications and audit workflow. Additive and backward compatible.

alter table public.quotation_requests
  add column if not exists currency char(3) not null default 'BDT',
  add column if not exists billing_address_id uuid references public.customer_addresses(id) on delete set null,
  add column if not exists shipping_address_id uuid references public.customer_addresses(id) on delete set null,
  add column if not exists billing_address_snapshot jsonb,
  add column if not exists shipping_address_snapshot jsonb,
  add column if not exists subtotal numeric(18,2) not null default 0,
  add column if not exists discount_amount numeric(18,2) not null default 0,
  add column if not exists tax_amount numeric(18,2) not null default 0,
  add column if not exists total_amount numeric(18,2) not null default 0,
  add column if not exists terms_and_conditions text,
  add column if not exists payment_terms text,
  add column if not exists delivery_information text,
  add column if not exists internal_notes text,
  add column if not exists customer_notes text,
  add column if not exists expiration_date date,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references public.profiles(id) on delete set null,
  add column if not exists converted_order_id uuid references public.sales_orders(id) on delete set null,
  add column if not exists converted_invoice_id uuid references public.sale_documents(id) on delete set null,
  add column if not exists customer_tax_identification_number text,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.quotation_requests
  drop constraint if exists quotation_requests_status_check;
alter table public.quotation_requests
  add constraint quotation_requests_status_check check (
    status in (
      'submitted','reviewing','additional_info_required','quoted','approved',
      'rejected','accepted','declined','closed','expired','converted_to_invoice'
    )
  );
alter table public.quotation_requests
  drop constraint if exists quotation_requests_amounts_check;
alter table public.quotation_requests
  add constraint quotation_requests_amounts_check check (
    subtotal >= 0 and discount_amount >= 0 and tax_amount >= 0 and total_amount >= 0
  );

alter table public.quotation_request_items
  add column if not exists description_snapshot text,
  add column if not exists unit_price numeric(18,2),
  add column if not exists discount_amount numeric(18,2) not null default 0,
  add column if not exists tax_amount numeric(18,2) not null default 0,
  add column if not exists line_subtotal numeric(18,2) not null default 0,
  add column if not exists line_total numeric(18,2) not null default 0,
  add column if not exists currency char(3) not null default 'BDT';

-- The existing notification table initially accepted only order, support and
-- system events. Extend it before quotation triggers begin writing events.
alter table public.customer_notifications
  drop constraint if exists customer_notifications_notification_type_check;
alter table public.customer_notifications
  add constraint customer_notifications_notification_type_check check (
    notification_type in (
      'order_status','support_reply','system','quotation_status','quotation_expiry',
      'quotation_submitted','quotation_staff_new','quotation_assigned',
      'quotation_additional_info_required','quotation_approved',
      'quotation_rejected','quotation_expired','quotation_converted_to_invoice',
      'quotation_updated','quotation_expiring'
    )
  );

update public.quotation_request_items
set unit_price = round(coalesce(unit_price, target_price, 0), 2),
    line_subtotal = round(quantity * coalesce(unit_price, target_price, 0), 2),
    line_total = round(
      greatest(
        (quantity * coalesce(unit_price, target_price, 0))
        - coalesce(discount_amount, 0)
        + coalesce(tax_amount, 0),
        0
      ),
      2
    )
where unit_price is null
   or line_subtotal = 0
   or line_total = 0;

update public.quotation_requests q
set subtotal = totals.subtotal,
    total_amount = greatest(totals.total - q.discount_amount + q.tax_amount, 0)
from (
  select quotation_id,
         round(coalesce(sum(line_subtotal), 0), 2) subtotal,
         round(coalesce(sum(line_total), 0), 2) total
  from public.quotation_request_items
  group by quotation_id
) totals
where totals.quotation_id = q.id
  and q.subtotal = 0
  and q.total_amount = 0;

alter table public.crm_companies
  add column if not exists tax_identification_number text;

create index if not exists quotation_requests_status_expiry_idx
  on public.quotation_requests(status, expiration_date, updated_at desc);
create index if not exists quotation_requests_assigned_idx
  on public.quotation_requests(assigned_to, status, updated_at desc);
create unique index if not exists quotation_requests_converted_order_unique
  on public.quotation_requests(converted_order_id)
  where converted_order_id is not null;
create unique index if not exists quotation_requests_converted_invoice_unique
  on public.quotation_requests(converted_invoice_id)
  where converted_invoice_id is not null;
create index if not exists crm_companies_tax_id_idx
  on public.crm_companies(lower(tax_identification_number))
  where tax_identification_number is not null;

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,v.key,v.name,v.description,v.action,v.sensitive,v.sort_order
from public.app_modules m cross join (values
  ('quotations.view_requests','View quotation requests','View newly submitted and reviewing quotation requests.','view_requests',false,11),
  ('quotations.view_all','View all quotations','View all quotation records and statuses.','view_all',true,12),
  ('quotations.reject','Reject quotations','Reject a quotation with a recorded reason.','reject',true,41),
  ('quotations.assign','Assign quotations','Assign quotation work to an active administrator or employee.','assign',true,42),
  ('quotations.print','Download or print quotations','Open printable quotation documents.','print',false,61),
  ('quotations.convert_to_invoice','Convert quotations to invoices','Create a linked sale and invoice from an approved quotation.','convert_to_invoice',true,70),
  ('quotations.create_customer','Create customers from quotations','Create and link CRM customer records during conversion.','create_customer',true,71),
  ('quotations.view_history','View quotation history','View quotation audit history and status changes.','view_history',true,80),
  ('quotations.internal_notes','Manage quotation internal notes','Read and edit staff-only quotation notes.','internal_notes',true,90)
) as v(key,name,description,action,sensitive,sort_order)
where m.key='quotations'
on conflict(key) do update
set name=excluded.name,
    description=excluded.description,
    action=excluded.action,
    is_sensitive=excluded.is_sensitive,
    sort_order=excluded.sort_order,
    is_active=true;

create or replace function public.quotation_address_snapshot(requested_address_id uuid, requested_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'recipient_name',a.recipient_name,
    'phone',a.phone,
    'alternate_phone',a.alternate_phone,
    'address_line_1',a.address_line_1,
    'address_line_2',a.address_line_2,
    'area',a.area,
    'city',a.city,
    'region',a.region,
    'postal_code',a.postal_code,
    'country_code',a.country_code,
    'delivery_instructions',a.delivery_instructions,
    'map_label',a.map_label
  )
  from public.customer_addresses a
  where a.id=requested_address_id and a.profile_id=requested_profile_id;
$$;

create or replace function public.refresh_quotation_totals(requested_quotation_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  calculated_subtotal numeric(18,2);
  calculated_item_total numeric(18,2);
begin
  update public.quotation_request_items
  set unit_price=round(coalesce(unit_price,target_price,0),2),
      target_price=round(coalesce(unit_price,target_price,0),2),
      line_subtotal=round(quantity*coalesce(unit_price,target_price,0),2),
      line_total=round(greatest(
        quantity*coalesce(unit_price,target_price,0)
        - coalesce(discount_amount,0)
        + coalesce(tax_amount,0),0),2)
  where quotation_id=requested_quotation_id;

  select round(coalesce(sum(line_subtotal),0),2),
         round(coalesce(sum(line_total),0),2)
  into calculated_subtotal,calculated_item_total
  from public.quotation_request_items
  where quotation_id=requested_quotation_id;

  update public.quotation_requests
  set subtotal=calculated_subtotal,
      total_amount=round(greatest(
        calculated_item_total-coalesce(discount_amount,0)+coalesce(tax_amount,0),0),2),
      updated_at=now()
  where id=requested_quotation_id;
end $$;

create or replace function public.queue_quotation_expiry_notifications()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare inserted_count integer;
begin
  insert into public.customer_notifications(
    profile_id,notification_type,title,message,href,entity_type,entity_id
  )
  select q.profile_id,'quotation_expiring','Quotation expiring soon',
         'Quotation '||q.reference||' will expire on '||to_char(q.expiration_date,'DD Mon YYYY')||'.',
         '/account/quotations','quotation_request',q.id
  from public.quotation_requests q
  where q.status in('quoted','approved','accepted')
    and q.expiration_date between current_date and current_date+3
    and not exists(
      select 1 from public.customer_notifications n
      where n.profile_id=q.profile_id
        and n.notification_type='quotation_expiring'
        and n.entity_type='quotation_request'
        and n.entity_id=q.id
    );
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

create or replace function public.notify_quotation_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  notification_title text;
  notification_message text;
  notification_kind text;
  staff_profile record;
begin
  if tg_op='INSERT' then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.profile_id,'quotation_submitted','Quotation request submitted',
      'Your request '||new.reference||' was submitted successfully.',
      '/account/quotations','quotation_request',new.id
    );
    for staff_profile in
      select id from public.profiles
      where role='admin' and status='active' and id<>new.profile_id
    loop
      insert into public.customer_notifications(
        profile_id,notification_type,title,message,href,entity_type,entity_id
      ) values (
        staff_profile.id,'quotation_staff_new','New quotation request',
        'Quotation request '||new.reference||' requires review.',
        '/admin/quotations/'||new.id,'quotation_request',new.id
      );
    end loop;
    return new;
  end if;

  if old.assigned_to is distinct from new.assigned_to and new.assigned_to is not null then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.assigned_to,'quotation_assigned','Quotation assigned',
      'Quotation '||new.reference||' has been assigned to you.',
      '/admin/quotations/'||new.id,'quotation_request',new.id
    );
  end if;

  if old.status is distinct from new.status then
    notification_kind:='quotation_'||new.status;
    notification_title:=case new.status
      when 'additional_info_required' then 'More quotation information required'
      when 'approved' then 'Quotation approved'
      when 'rejected' then 'Quotation rejected'
      when 'quoted' then 'Quotation updated'
      when 'converted_to_invoice' then 'Quotation converted to invoice'
      else 'Quotation status updated'
    end;
    notification_message:=case new.status
      when 'additional_info_required' then 'SEN needs additional information for '||new.reference||'.'
      when 'approved' then 'Quotation '||new.reference||' has been approved.'
      when 'rejected' then 'Quotation '||new.reference||' has been rejected.'
      when 'converted_to_invoice' then 'Quotation '||new.reference||' has been converted into a sales invoice.'
      else 'Quotation '||new.reference||' is now '||replace(new.status,'_',' ')||'.'
    end;
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.profile_id,notification_kind,notification_title,notification_message,
      '/account/quotations','quotation_request',new.id
    );
  elsif old.updated_at is distinct from new.updated_at then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.profile_id,'quotation_updated','Quotation updated',
      'Quotation '||new.reference||' has been updated.',
      '/account/quotations','quotation_request',new.id
    );
  end if;
  return new;
end $$;

drop trigger if exists quotation_notification_trigger on public.quotation_requests;
create trigger quotation_notification_trigger
after insert or update on public.quotation_requests
for each row execute function public.notify_quotation_change();

create or replace function public.convert_quotation_to_invoice(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_warehouse_id uuid,
  requested_create_customer boolean
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  quotation public.quotation_requests%rowtype;
  customer public.profiles%rowtype;
  quote_item record;
  product_row public.products%rowtype;
  created_order_id uuid:=gen_random_uuid();
  invoice_id uuid:=gen_random_uuid();
  crm_contact_id uuid;
  crm_company_id uuid;
  address_id uuid;
  address_snapshot jsonb;
  order_number text;
  invoice_number text;
  actor_role public.account_role;
  brand_name text;
  line_subtotal numeric(18,2);
  line_total numeric(18,2);
  invoice_snapshot jsonb;
  customer_created boolean:=false;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.convert_to_invoice');
  select * into quotation
  from public.quotation_requests
  where id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;
  if quotation.status='converted_to_invoice' then
    return jsonb_build_object(
      'order_id',quotation.converted_order_id,
      'invoice_id',quotation.converted_invoice_id,
      'customer_created',false
    );
  end if;
  if quotation.status not in('approved','accepted') then
    raise exception 'Only an approved quotation can be converted';
  end if;
  if requested_warehouse_id is null or not exists(
    select 1 from public.warehouses where id=requested_warehouse_id and is_active
  ) then raise exception 'Choose an active fulfilment warehouse'; end if;

  select * into customer from public.profiles where id=quotation.profile_id and status='active';
  if customer.id is null then raise exception 'Active quotation customer account not found'; end if;

  select id into crm_contact_id
  from public.crm_contacts
  where profile_id=customer.id
     or (customer.email is not null and lower(email)=lower(customer.email))
     or (
       customer.phone is not null and phone is not null
       and regexp_replace(phone,'\D','','g')=regexp_replace(customer.phone,'\D','','g')
     )
  order by (profile_id=customer.id) desc
  limit 1;

  if crm_contact_id is null and not requested_create_customer then
    raise exception 'CUSTOMER_CREATION_REQUIRED';
  end if;

  if crm_contact_id is null then
    perform public.assert_actor_permission(actor_profile_id,'quotations.create_customer');
    if nullif(trim(coalesce(quotation.company_name,customer.company_name,'')),'') is not null then
      select id into crm_company_id
      from public.crm_companies
      where customer_profile_id=customer.id
         or lower(name)=lower(coalesce(quotation.company_name,customer.company_name))
         or (customer.email is not null and lower(email)=lower(customer.email))
         or (
           quotation.customer_tax_identification_number is not null
           and lower(tax_identification_number)=lower(quotation.customer_tax_identification_number)
         )
      limit 1;
      if crm_company_id is null then
        insert into public.crm_companies(
          name,customer_profile_id,email,phone,country_name,status,
          tax_identification_number,created_by,updated_by
        ) values (
          left(coalesce(quotation.company_name,customer.company_name,customer.full_name,customer.email),180),
          customer.id,customer.email,customer.phone,customer.country::text,'active',
          nullif(left(quotation.customer_tax_identification_number,100),''),
          actor_profile_id,actor_profile_id
        ) returning id into crm_company_id;
      end if;
    end if;
    insert into public.crm_contacts(
      company_id,profile_id,full_name,email,phone,status,created_by,updated_by
    ) values (
      crm_company_id,customer.id,
      left(coalesce(nullif(trim(customer.full_name),''),customer.email),160),
      customer.email,customer.phone,'active',actor_profile_id,actor_profile_id
    ) returning id into crm_contact_id;
    customer_created:=true;
  end if;

  address_id:=coalesce(quotation.shipping_address_id,quotation.billing_address_id);
  address_snapshot:=coalesce(
    quotation.shipping_address_snapshot,
    quotation.billing_address_snapshot
  );
  if address_id is null then
    select id into address_id
    from public.customer_addresses
    where profile_id=customer.id
    order by is_default_shipping desc,updated_at desc
    limit 1;
  end if;
  if address_snapshot is null and address_id is not null then
    address_snapshot:=public.quotation_address_snapshot(address_id,customer.id);
  end if;
  if address_snapshot is null then raise exception 'Customer shipping address is required'; end if;

  perform public.refresh_quotation_totals(quotation.id);
  select * into quotation from public.quotation_requests where id=quotation.id for update;
  if not exists(select 1 from public.quotation_request_items where quotation_id=quotation.id) then
    raise exception 'Quotation has no items';
  end if;
  if exists(
    select 1 from public.quotation_request_items
    where quotation_id=quotation.id and product_id is null
  ) then raise exception 'Every quotation item must be linked to a catalogue product before conversion'; end if;

  order_number:=public.next_sales_order_number();
  insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_id,shipping_address_snapshot,
    billing_address_id,billing_address_snapshot,fulfillment_warehouse_id,status,currency,
    subtotal,discount_amount,shipping_amount,tax_amount,total_amount,internal_notes,
    customer_notes,sales_source,payment_status,created_by,updated_by
  ) values (
    created_order_id,order_number,customer.id,address_id,address_snapshot,
    coalesce(quotation.billing_address_id,address_id),
    coalesce(quotation.billing_address_snapshot,address_snapshot),
    requested_warehouse_id,'draft',quotation.currency,
    quotation.subtotal,quotation.discount_amount,0,quotation.tax_amount,quotation.total_amount,
    quotation.internal_notes,quotation.customer_notes,'existing_customer','unpaid',
    actor_profile_id,actor_profile_id
  );

  for quote_item in
    select * from public.quotation_request_items
    where quotation_id=quotation.id
    order by created_at,id
  loop
    select * into product_row from public.products where id=quote_item.product_id and status='active';
    if product_row.id is null then raise exception 'Quotation includes an unavailable product'; end if;
    select b.name into brand_name from public.brands b where b.id=product_row.brand_id;
    line_subtotal:=round(quote_item.quantity*coalesce(quote_item.unit_price,quote_item.target_price,0),2);
    line_total:=round(greatest(
      line_subtotal-coalesce(quote_item.discount_amount,0)+coalesce(quote_item.tax_amount,0),0),2);
    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,quantity,unit_price,
      line_subtotal,line_discount,line_tax,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,sku_snapshot,
      model_number_snapshot,brand_snapshot,variation_snapshot
    ) values (
      created_order_id,product_row.id,quote_item.variation_id,requested_warehouse_id,
      quote_item.quantity,round(coalesce(quote_item.unit_price,quote_item.target_price,0),2),
      line_subtotal,coalesce(quote_item.discount_amount,0),coalesce(quote_item.tax_amount,0),
      line_total,quotation.currency,product_row.serial_tracking_required,
      quote_item.product_name_snapshot,coalesce(quote_item.sku_snapshot,product_row.sku),
      product_row.model_number,brand_name,
      case when quote_item.variation_id is null then null
           else jsonb_build_object('id',quote_item.variation_id) end
    );
  end loop;

  insert into public.order_status_events(order_id,new_status,actor_profile_id,note)
  values(created_order_id,'draft',actor_profile_id,'Created from approved quotation '||quotation.reference);

  invoice_number:='SEN-INV-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6);
  select jsonb_build_object(
    'order',to_jsonb(o),
    'customer',to_jsonb(customer),
    'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)
             from public.sales_order_items i where i.order_id=created_order_id),
    'serials','[]'::jsonb,
    'quotation',jsonb_build_object('id',quotation.id,'reference',quotation.reference),
    'generated_at',now()
  ) into invoice_snapshot
  from public.sales_orders o where o.id=created_order_id;
  insert into public.sale_documents(
    id,order_id,document_number,document_type,snapshot,generated_by
  ) values (
    invoice_id,created_order_id,invoice_number,'invoice',invoice_snapshot,actor_profile_id
  );

  update public.quotation_requests
  set status='converted_to_invoice',
      converted_at=now(),
      converted_by=actor_profile_id,
      converted_order_id=created_order_id,
      converted_invoice_id=invoice_id,
      updated_by=actor_profile_id,
      updated_at=now()
  where id=quotation.id;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,
    description,new_values
  ) values (
    actor_profile_id,actor_role,customer.id,'quotation.converted_to_invoice',
    'quotations','quotation_request',quotation.id::text,
    'Approved quotation converted to a linked sales invoice.',
    jsonb_build_object(
      'quotation_reference',quotation.reference,
      'order_id',created_order_id,
      'order_number',order_number,
      'invoice_id',invoice_id,
      'invoice_number',invoice_number,
      'crm_contact_id',crm_contact_id,
      'customer_created',customer_created
    )
  );
  return jsonb_build_object(
    'order_id',created_order_id,
    'order_number',order_number,
    'invoice_id',invoice_id,
    'invoice_number',invoice_number,
    'customer_created',customer_created
  );
end $$;

revoke all on function public.quotation_address_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public.refresh_quotation_totals(uuid) from public,anon,authenticated;
revoke all on function public.queue_quotation_expiry_notifications() from public,anon,authenticated;
revoke all on function public.convert_quotation_to_invoice(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.quotation_address_snapshot(uuid,uuid) to service_role;
grant execute on function public.refresh_quotation_totals(uuid) to service_role;
grant execute on function public.queue_quotation_expiry_notifications() to service_role;
grant execute on function public.convert_quotation_to_invoice(uuid,uuid,uuid,boolean) to service_role;
