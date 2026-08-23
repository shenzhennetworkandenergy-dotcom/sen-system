-- Controlled quotation outcomes and one-to-one draft Sale conversion.
-- Existing quotation states, legacy invoice conversion, and downstream Sales
-- fulfilment remain unchanged.

begin;

alter table public.quotation_requests
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references public.profiles(id) on delete set null,
  add column if not exists customer_accepted_at timestamptz,
  add column if not exists customer_accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists customer_declined_at timestamptz,
  add column if not exists customer_declined_by uuid references public.profiles(id) on delete set null,
  add column if not exists customer_decline_reason text;

alter table public.quotation_requests
  drop constraint if exists quotation_requests_status_check;
alter table public.quotation_requests
  add constraint quotation_requests_status_check check (
    status in (
      'draft','submitted','reviewing','additional_info_required','quoted','approved',
      'rejected','accepted','declined','closed','expired','converted_to_invoice',
      'converted_to_sale'
    )
  );

alter table public.customer_notifications
  drop constraint if exists customer_notifications_notification_type_check;
alter table public.customer_notifications
  add constraint customer_notifications_notification_type_check check (
    notification_type in (
      'order_status','support_reply','system','quotation_status','quotation_expiry',
      'quotation_submitted','quotation_staff_new','quotation_assigned',
      'quotation_additional_info_required','quotation_approved',
      'quotation_rejected','quotation_expired','quotation_converted_to_invoice',
      'quotation_updated','quotation_expiring','quotation_issued',
      'quotation_accepted','quotation_declined','quotation_converted_to_sale'
    )
  );

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order,is_active
)
select m.id,v.key,v.name,v.description,v.action,v.sensitive,v.sort_order,true
from public.app_modules m cross join (values
  (
    'quotations.record_customer_outcome',
    'Record customer quotation outcome',
    'Record customer acceptance or rejection with actor, date and reason.',
    'record_customer_outcome',true,45
  ),
  (
    'quotations.convert_to_sale',
    'Create Sales from Quotations',
    'Create one linked draft Sale from an accepted quotation.',
    'convert_to_sale',true,72
  )
) as v(key,name,description,action,sensitive,sort_order)
where m.key='quotations'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

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
    if new.status='submitted' then
      insert into public.customer_notifications(
        profile_id,notification_type,title,message,href,entity_type,entity_id
      ) values (
        new.profile_id,'quotation_submitted','Quotation request submitted',
        'Your request '||new.reference||' was submitted successfully.',
        '/account/quotations','quotation_request',new.id
      );
      for staff_profile in
        select p.id from public.profiles p
        where p.role='admin' and p.status='active' and p.id<>new.profile_id
      loop
        insert into public.customer_notifications(
          profile_id,notification_type,title,message,href,entity_type,entity_id
        ) values (
          staff_profile.id,'quotation_staff_new','New quotation request',
          'Quotation request '||new.reference||' requires review.',
          '/admin/quotations/'||new.id,'quotation_request',new.id
        );
      end loop;
    end if;
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
    notification_kind:=case new.status
      when 'draft' then null
      when 'approved' then 'quotation_approved'
      when 'quoted' then 'quotation_issued'
      when 'accepted' then 'quotation_accepted'
      when 'declined' then 'quotation_declined'
      when 'rejected' then 'quotation_rejected'
      when 'additional_info_required' then 'quotation_additional_info_required'
      when 'expired' then 'quotation_expired'
      when 'converted_to_invoice' then 'quotation_converted_to_invoice'
      when 'converted_to_sale' then 'quotation_converted_to_sale'
      else 'quotation_status'
    end;
    notification_title:=case new.status
      when 'approved' then 'Quotation internally approved'
      when 'quoted' then 'Quotation issued'
      when 'accepted' then 'Quotation acceptance recorded'
      when 'declined' then 'Quotation rejection recorded'
      when 'rejected' then 'Quotation rejected by SEN'
      when 'additional_info_required' then 'More quotation information required'
      when 'expired' then 'Quotation expired'
      when 'converted_to_invoice' then 'Quotation converted to invoice'
      when 'converted_to_sale' then 'Quotation converted to Sale'
      else 'Quotation status updated'
    end;
    notification_message:=case new.status
      when 'approved' then 'Quotation '||new.reference||' was internally approved by SEN.'
      when 'quoted' then 'Quotation '||new.reference||' was issued to you.'
      when 'accepted' then 'Your acceptance of quotation '||new.reference||' was recorded by SEN staff.'
      when 'declined' then 'Your rejection of quotation '||new.reference||' was recorded by SEN staff.'
      when 'rejected' then 'Quotation '||new.reference||' was rejected by SEN.'
      when 'additional_info_required' then 'SEN needs additional information for '||new.reference||'.'
      when 'expired' then 'Quotation '||new.reference||' has expired.'
      when 'converted_to_invoice' then 'Quotation '||new.reference||' has been converted into a sales invoice.'
      when 'converted_to_sale' then 'Quotation '||new.reference||' has been converted into a draft Sale.'
      else 'Quotation '||new.reference||' is now '||replace(new.status,'_',' ')||'.'
    end;
    if notification_kind is not null then
      insert into public.customer_notifications(
        profile_id,notification_type,title,message,href,entity_type,entity_id
      ) values (
        new.profile_id,notification_kind,notification_title,notification_message,
        '/account/quotations','quotation_request',new.id
      );
    end if;
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

create or replace function public.transition_quotation_business_status(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_transition text,
  requested_reason text default null
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  required_permission text;
  previous_status text;
  next_status text;
  audit_description text;
  normalized_reason text;
  can_view_all boolean;
  can_view_own boolean;
begin
  required_permission:=case requested_transition
    when 'approve' then 'quotations.approve'
    when 'reject' then 'quotations.reject'
    when 'issue' then 'quotations.send'
    when 'accept' then 'quotations.record_customer_outcome'
    when 'decline' then 'quotations.record_customer_outcome'
    else null
  end;
  if required_permission is null then raise exception 'Invalid quotation transition'; end if;
  perform public.assert_actor_permission(actor_profile_id,required_permission);
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=actor.role='admin' or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not (
    can_view_own and coalesce(quotation.created_by=actor_profile_id,false)
  ) then
    raise exception 'Quotation access denied';
  end if;

  normalized_reason:=nullif(left(btrim(coalesce(requested_reason,'')),2000),'');
  previous_status:=quotation.status;
  if requested_transition='approve' then
    if quotation.status not in ('draft','reviewing','quoted') then
      raise exception 'Quotation cannot be internally approved from its current state';
    end if;
    next_status:='approved';
    audit_description:='Quotation internally approved by staff.';
    update public.quotation_requests set
      status=next_status,approved_at=now(),approved_by=actor_profile_id,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='reject' then
    if quotation.status not in ('draft','reviewing','approved','quoted') then
      raise exception 'Quotation cannot be internally rejected from its current state';
    end if;
    next_status:='rejected';
    audit_description:='Quotation internally rejected by staff.';
    update public.quotation_requests set
      status=next_status,rejected_at=now(),rejected_by=actor_profile_id,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='issue' then
    if quotation.status<>'approved' then
      raise exception 'Only an internally approved quotation can be issued';
    end if;
    next_status:='quoted';
    audit_description:='Quotation issued to the customer by staff.';
    update public.quotation_requests set
      status=next_status,issued_at=now(),issued_by=actor_profile_id,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='accept' then
    if quotation.status<>'quoted' then
      raise exception 'Only an issued quotation can have customer acceptance recorded';
    end if;
    if quotation.expiration_date is not null and quotation.expiration_date<current_date then
      raise exception 'Expired quotation cannot be accepted';
    end if;
    next_status:='accepted';
    audit_description:='Customer acceptance recorded by staff.';
    update public.quotation_requests set
      status=next_status,customer_accepted_at=now(),
      customer_accepted_by=actor_profile_id,updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='decline' then
    if quotation.status<>'quoted' then
      raise exception 'Only an issued quotation can have customer rejection recorded';
    end if;
    if requested_reason is null or normalized_reason is null then
      raise exception 'Customer rejection reason is required';
    end if;
    next_status:='declined';
    audit_description:='Customer rejection recorded by staff.';
    update public.quotation_requests set
      status=next_status,customer_declined_at=now(),
      customer_declined_by=actor_profile_id,customer_decline_reason=normalized_reason,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  else
    raise exception 'Invalid quotation transition';
  end if;

  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,
    description,old_values,new_values
  ) values (
    actor_profile_id,actor.role,quotation.profile_id,
    case requested_transition
      when 'accept' then 'quotation.customer_acceptance_recorded'
      when 'decline' then 'quotation.customer_rejection_recorded'
      else 'quotation.'||requested_transition
    end,
    'quotations','quotation_request',quotation.id::text,audit_description,
    jsonb_build_object('status',previous_status),
    jsonb_build_object(
      'status',next_status,'transition',requested_transition,
      'reason',normalized_reason,'recorded_at',now()
    )
  );
  return next_status;
end $$;

create or replace function public.search_eligible_quotations_for_sale(
  actor_profile_id uuid,
  requested_query text,
  requested_limit integer default 20
) returns table(
  quotation_id uuid,
  reference text,
  customer_id uuid,
  customer_name text,
  customer_company text,
  customer_email text,
  total_amount numeric,
  currency text,
  expiration_date date
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  search_query text:=btrim(coalesce(requested_query,''));
  search_pattern text;
  result_limit integer:=least(greatest(coalesce(requested_limit,20),1),20);
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.convert_to_sale');
  perform public.assert_actor_permission(actor_profile_id,'sales.create');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';
  can_view_all:=actor.role='admin' or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not can_view_own then raise exception 'Quotation access denied'; end if;
  if search_query='' then return; end if;
  search_pattern:='%'||search_query||'%';

  return query
  select
    q.id,q.reference,q.profile_id,
    coalesce(nullif(p.full_name,''),p.email),
    coalesce(nullif(q.company_name,''),p.company_name),
    p.email,q.total_amount,q.currency::text,q.expiration_date
  from public.quotation_requests q
  join public.profiles p on p.id=q.profile_id
  where q.status='accepted'
    and (q.expiration_date is null or q.expiration_date>=current_date)
    and q.converted_order_id is null
    and (
      can_view_all
      or (can_view_own and q.created_by=actor_profile_id)
    )
    and (
      q.reference ilike search_pattern
      or p.full_name ilike search_pattern
      or coalesce(q.company_name,p.company_name,'') ilike search_pattern
      or p.email ilike search_pattern
    )
  order by
    case when lower(q.reference)=lower(search_query) then 0 else 1 end,
    q.updated_at desc,q.reference
  limit result_limit;
end $$;

create or replace function public.create_sale_from_quotation(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_customer_id uuid,
  requested_address_id uuid,
  requested_address jsonb,
  requested_billing_address_id uuid,
  requested_billing_address jsonb,
  requested_warehouse_id uuid,
  requested_source text,
  requested_expected_delivery_date date,
  requested_discount numeric,
  requested_shipping numeric,
  requested_service numeric,
  requested_tax numeric,
  requested_internal_notes text,
  requested_customer_notes text,
  requested_items jsonb,
  requested_adjustments jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  quote_item public.quotation_request_items%rowtype;
  product_row public.products%rowtype;
  variation_row public.product_variations%rowtype;
  entry jsonb;
  adjustment jsonb;
  source_quotation_item_id uuid;
  requested_product_id uuid;
  requested_variation_id uuid;
  item_warehouse_id uuid;
  item_quantity numeric;
  item_unit_price numeric;
  item_line_discount numeric;
  item_line_tax numeric;
  baseline_unit_price numeric;
  catalogue_unit_price numeric;
  header_discount numeric:=round(coalesce(requested_discount,0),2);
  header_shipping numeric:=round(coalesce(requested_shipping,0),2);
  header_service numeric:=round(coalesce(requested_service,0),2);
  header_tax numeric:=round(coalesce(requested_tax,0),2);
  normalized_items jsonb:='[]'::jsonb;
  seen_source_ids uuid[]:='{}'::uuid[];
  created_sale_id uuid;
  created_sale_number text;
  created_sale_status text;
  accepted_values_edited boolean:=false;
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.convert_to_sale');
  perform public.assert_actor_permission(actor_profile_id,'sales.create');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=actor.role='admin' or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not (
    can_view_own and coalesce(quotation.created_by=actor_profile_id,false)
  ) then
    raise exception 'Quotation access denied';
  end if;

  if quotation.converted_order_id is not null then
    select o.order_number into created_sale_number
    from public.sales_orders o where o.id=quotation.converted_order_id;
    return jsonb_build_object(
      'sale_id',quotation.converted_order_id,
      'order_id',quotation.converted_order_id,
      'order_number',created_sale_number,
      'existing',true
    );
  end if;
  if quotation.status<>'accepted' then
    raise exception 'Only a customer-accepted quotation can be converted';
  end if;
  if quotation.expiration_date is not null and quotation.expiration_date<current_date then
    raise exception 'Expired quotation cannot be converted';
  end if;
  if requested_customer_id is distinct from quotation.profile_id then
    raise exception 'Sale customer must match the quotation customer';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=requested_customer_id and p.role='customer' and p.status='active'
  ) then raise exception 'Active quotation customer is required'; end if;

  if not exists(
    select 1 from public.quotation_request_items qi
    where qi.quotation_id=quotation.id
  ) then raise exception 'Quotation has no items'; end if;
  if exists(
    select 1
    from public.quotation_request_items qi
    left join public.products p on p.id=qi.product_id and p.status='active'
    left join public.product_variations pv
      on pv.id=qi.variation_id and pv.product_id=qi.product_id and pv.status='active'
    where qi.quotation_id=quotation.id
      and (p.id is null or (qi.variation_id is not null and pv.id is null))
  ) then raise exception 'Quotation includes an unavailable catalogue item'; end if;

  if requested_items is null or jsonb_typeof(requested_items)<>'array'
    or jsonb_array_length(requested_items)=0
  then
    raise exception 'At least one Sale item is required';
  end if;
  if requested_adjustments is not null and jsonb_typeof(requested_adjustments)<>'array' then
    raise exception 'Sale adjustments are invalid';
  end if;
  if header_discount<0 or header_shipping<0 or header_service<0 or header_tax<0 then
    raise exception 'Sale totals cannot be negative';
  end if;

  for entry in
    select requested.value from jsonb_array_elements(requested_items) as requested(value)
  loop
    source_quotation_item_id:=nullif(entry->>'source_quotation_item_id','')::uuid;
    requested_product_id:=nullif(entry->>'product_id','')::uuid;
    requested_variation_id:=nullif(entry->>'variation_id','')::uuid;
    item_warehouse_id:=nullif(entry->>'warehouse_id','')::uuid;
    item_quantity:=nullif(entry->>'quantity','')::numeric;
    item_unit_price:=round(nullif(entry->>'unit_price','')::numeric,2);
    item_line_discount:=round(coalesce(nullif(entry->>'line_discount','')::numeric,0),2);
    item_line_tax:=round(coalesce(nullif(entry->>'line_tax','')::numeric,0),2);

    if requested_product_id is null then raise exception 'Sale product is required'; end if;
    if item_quantity is null or item_quantity<1 or item_quantity<>trunc(item_quantity) then
      raise exception 'Sale item quantity must be a whole number of at least 1';
    end if;
    if item_unit_price is null or item_unit_price<0
      or item_line_discount<0 or item_line_tax<0
      or item_line_discount>round(item_quantity*item_unit_price,2)
    then raise exception 'Sale item commercial values are invalid'; end if;

    select * into product_row from public.products p
    where p.id=requested_product_id and p.status='active';
    if product_row.id is null then raise exception 'Sale product is unavailable'; end if;
    select * into variation_row from public.product_variations pv
    where requested_variation_id is not null
      and pv.id=requested_variation_id
      and pv.product_id=requested_product_id and pv.status='active';
    if requested_variation_id is not null and variation_row.id is null then
      raise exception 'Sale variation is unavailable';
    end if;

    if source_quotation_item_id is not null then
      if source_quotation_item_id=any(seen_source_ids) then
        raise exception 'Each quotation item may be used only once';
      end if;
      seen_source_ids:=array_append(seen_source_ids,source_quotation_item_id);
      select * into quote_item from public.quotation_request_items qi
      where qi.id=source_quotation_item_id and qi.quotation_id=quotation.id;
      if quote_item.id is null then raise exception 'Quotation source item is invalid'; end if;
      if requested_product_id is distinct from quote_item.product_id
        or requested_variation_id is distinct from quote_item.variation_id
      then raise exception 'Quotation source product cannot be replaced in place'; end if;

      baseline_unit_price:=round(coalesce(quote_item.unit_price,quote_item.target_price,0),2);
      if item_unit_price<>baseline_unit_price then
        perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
        accepted_values_edited:=true;
      end if;
      if item_line_discount<>round(coalesce(quote_item.discount_amount,0),2) then
        perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
        accepted_values_edited:=true;
      end if;
      if item_quantity<>quote_item.quantity
        or item_line_tax<>round(coalesce(quote_item.tax_amount,0),2)
      then accepted_values_edited:=true; end if;
    else
      accepted_values_edited:=true;
      catalogue_unit_price:=round(coalesce(
        variation_row.sale_price,variation_row.regular_price,
        product_row.sale_price,product_row.regular_price,0
      ),2);
      if item_unit_price<>catalogue_unit_price then
        perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
      end if;
      if item_line_discount>0 then
        perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
      end if;
    end if;

    normalized_items:=normalized_items||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'product_id',requested_product_id,
      'variation_id',requested_variation_id,
      'warehouse_id',item_warehouse_id,
      'quantity',item_quantity,
      'unit_price',item_unit_price,
      'line_discount',item_line_discount,
      'line_tax',item_line_tax
    )));
  end loop;

  if header_discount<>round(coalesce(quotation.discount_amount,0),2) then
    perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
    accepted_values_edited:=true;
  end if;
  if header_shipping<>0 or header_service<>0
    or header_tax<>round(coalesce(quotation.tax_amount,0),2)
    or cardinality(seen_source_ids)<>(
      select count(*) from public.quotation_request_items qi
      where qi.quotation_id=quotation.id
    )
  then accepted_values_edited:=true; end if;

  for adjustment in
    select requested.value
    from jsonb_array_elements(coalesce(requested_adjustments,'[]'::jsonb)) as requested(value)
  loop
    if nullif(adjustment->>'order_item_id','') is not null then
      raise exception 'Creation adjustments cannot reference an existing Sale item';
    end if;
    if adjustment->>'adjustment_type' is null or adjustment->>'adjustment_type' not in (
      'manual_unit_price','percentage_discount','fixed_line_discount',
      'order_discount','shipping_charge','service_charge','tax'
    ) then raise exception 'Sale adjustment type is invalid'; end if;
    if nullif(btrim(coalesce(adjustment->>'reason','')),'') is null then
      raise exception 'Price adjustment reason required';
    end if;
    if nullif(adjustment->>'new_value','') is null
      or nullif(adjustment->>'new_value','')::numeric<0
    then
      raise exception 'Sale adjustment value is invalid';
    end if;
  end loop;

  created_sale_id:=public.create_minimal_sale(
    actor_profile_id,requested_customer_id,requested_address_id,requested_address,
    requested_billing_address_id,requested_billing_address,requested_warehouse_id,
    requested_source,requested_expected_delivery_date,header_discount,header_shipping,
    header_service,header_tax,requested_internal_notes,requested_customer_notes,
    normalized_items,coalesce(requested_adjustments,'[]'::jsonb)
  );
  select o.order_number,o.status into created_sale_number,created_sale_status
  from public.sales_orders o where o.id=created_sale_id;
  if created_sale_id is null or created_sale_status<>'draft' then
    raise exception 'Draft Sale creation failed';
  end if;

  insert into public.order_status_events(
    order_id,old_status,new_status,actor_profile_id,note
  ) values (
    created_sale_id,'draft','draft',actor_profile_id,
    'Draft Sale created from accepted quotation '||quotation.reference
  );

  update public.quotation_requests set
    status='converted_to_sale',converted_order_id=created_sale_id,
    converted_at=now(),converted_by=actor_profile_id,
    updated_by=actor_profile_id,updated_at=now()
  where id=quotation.id and converted_order_id is null;

  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,
    description,old_values,new_values
  ) values (
    actor_profile_id,actor.role,quotation.profile_id,'quotation.converted_to_sale',
    'quotations','quotation_request',quotation.id::text,
    'Customer-accepted quotation converted to one linked draft Sale by staff.',
    jsonb_build_object('status',quotation.status,'converted_order_id',quotation.converted_order_id),
    jsonb_build_object(
      'status','converted_to_sale','quotation_reference',quotation.reference,
      'sale_id',created_sale_id,'order_number',created_sale_number,
      'accepted_values_edited',accepted_values_edited,'converted_at',now()
    )
  );

  return jsonb_build_object(
    'sale_id',created_sale_id,'order_id',created_sale_id,
    'order_number',created_sale_number,'existing',false
  );
end $$;

revoke all on function public.transition_quotation_business_status(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.transition_quotation_business_status(uuid,uuid,text,text)
  to service_role;

revoke all on function public.search_eligible_quotations_for_sale(uuid,text,integer)
  from public,anon,authenticated;
grant execute on function public.search_eligible_quotations_for_sale(uuid,text,integer)
  to service_role;

revoke all on function public.create_sale_from_quotation(
  uuid,uuid,uuid,uuid,jsonb,uuid,jsonb,uuid,text,date,numeric,numeric,numeric,numeric,
  text,text,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.create_sale_from_quotation(
  uuid,uuid,uuid,uuid,jsonb,uuid,jsonb,uuid,text,date,numeric,numeric,numeric,numeric,
  text,text,jsonb,jsonb
) to service_role;

commit;
