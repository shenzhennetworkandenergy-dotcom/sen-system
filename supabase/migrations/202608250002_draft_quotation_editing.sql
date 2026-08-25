create or replace function public.update_quotation_details_and_totals(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_expected_status text,
  requested_subject text,
  requested_company_name text,
  requested_customer_tax_identification_number text,
  requested_required_by date,
  requested_expiration_date date,
  requested_terms_and_conditions text,
  requested_payment_terms text,
  requested_delivery_information text,
  requested_customer_notes text,
  requested_internal_notes text,
  requested_discount_amount numeric,
  requested_tax_amount numeric
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.edit');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';
  if actor.id is null then raise exception 'Active actor not found'; end if;

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=coalesce(actor.role='admin',false) or exists(
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

  if requested_expected_status is distinct from 'draft'
    or quotation.status is distinct from 'draft'
  then
    raise exception 'Draft quotation changed before its details could be saved';
  end if;

  update public.quotation_requests set
    subject=requested_subject,
    company_name=requested_company_name,
    customer_tax_identification_number=requested_customer_tax_identification_number,
    required_by=requested_required_by,
    expiration_date=requested_expiration_date,
    terms_and_conditions=requested_terms_and_conditions,
    payment_terms=requested_payment_terms,
    delivery_information=requested_delivery_information,
    customer_notes=requested_customer_notes,
    message=requested_customer_notes,
    internal_notes=requested_internal_notes,
    discount_amount=requested_discount_amount,
    tax_amount=requested_tax_amount,
    updated_by=actor_profile_id,
    updated_at=now()
  where id=quotation.id;

  perform public.refresh_quotation_totals(quotation.id);
  return quotation.id;
end $$;

create or replace function public.update_draft_quotation(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_expected_updated_at timestamp with time zone,
  requested_subject text,
  requested_company_name text,
  requested_customer_tax_identification_number text,
  requested_required_by date,
  requested_expiration_date date,
  requested_terms_and_conditions text,
  requested_payment_terms text,
  requested_delivery_information text,
  requested_customer_notes text,
  requested_internal_notes text,
  requested_discount_amount numeric,
  requested_tax_amount numeric,
  requested_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  existing_item public.quotation_request_items%rowtype;
  product_row public.products%rowtype;
  variation_row public.product_variations%rowtype;
  entry jsonb;
  requested_product_id uuid;
  requested_variation_id uuid;
  requested_line_key text;
  existing_line_keys text[]:=array[]::text[];
  seen_line_keys text[]:=array[]::text[];
  normalized_items jsonb:='[]'::jsonb;
  item_quantity numeric;
  item_unit_price numeric;
  item_line_discount numeric;
  item_line_tax numeric;
  item_product_name text;
  item_sku text;
  item_currency text;
  header_discount numeric:=round(coalesce(requested_discount_amount,0),2);
  header_tax numeric:=round(coalesce(requested_tax_amount,0),2);
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.edit');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';
  if actor.id is null then raise exception 'Active actor not found'; end if;

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=coalesce(actor.role='admin',false) or exists(
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

  if quotation.status is distinct from 'draft' then
    raise exception 'Only Draft quotations can be edited';
  end if;
  if quotation.updated_at is distinct from requested_expected_updated_at then
    raise exception 'Quotation changed before it could be saved';
  end if;
  if requested_items is null or jsonb_typeof(requested_items)<>'array'
    or jsonb_array_length(requested_items)<1
    or jsonb_array_length(requested_items)>50
  then
    raise exception 'A Draft quotation must contain 1 to 50 items';
  end if;
  if header_discount<0 or header_tax<0
    or header_discount>10000000 or header_tax>10000000
  then
    raise exception 'Quotation commercial values are invalid';
  end if;

  select coalesce(array_agg(
    coalesce(qi.product_id::text,'')||':'||coalesce(qi.variation_id::text,'')
  ),array[]::text[])
  into existing_line_keys
  from public.quotation_request_items qi
  where qi.quotation_id=quotation.id;

  for entry in select requested.value from jsonb_array_elements(requested_items) as requested(value)
  loop
    variation_row:=null;
    requested_product_id:=nullif(entry->>'product_id','')::uuid;
    requested_variation_id:=nullif(entry->>'variation_id','')::uuid;
    requested_line_key:=requested_product_id::text||':'||coalesce(requested_variation_id::text,'');
    item_quantity:=nullif(entry->>'quantity','')::numeric;
    item_unit_price:=round(nullif(entry->>'unit_price','')::numeric,2);
    item_line_discount:=round(coalesce(nullif(entry->>'discount_amount','')::numeric,0),2);
    item_line_tax:=round(coalesce(nullif(entry->>'tax_amount','')::numeric,0),2);

    if requested_product_id is null then raise exception 'Quotation product is required'; end if;
    if requested_line_key=any(seen_line_keys) then
      raise exception 'Each product or variation can only be added once';
    end if;
    seen_line_keys:=array_append(seen_line_keys,requested_line_key);
    if item_quantity is null or item_quantity<1 or item_quantity<>trunc(item_quantity)
      or item_quantity>1000000
    then
      raise exception 'Quotation item quantity must be a whole number of at least 1';
    end if;
    if item_unit_price is null or item_unit_price<0
      or item_line_discount<0 or item_line_tax<0
      or item_unit_price>10000000 or item_line_discount>10000000 or item_line_tax>10000000
      or item_line_discount>round(item_quantity*item_unit_price,2)
    then
      raise exception 'Quotation item commercial values are invalid';
    end if;
    if requested_variation_id is not null then
      select * into variation_row from public.product_variations pv
      where pv.id=requested_variation_id
        and pv.product_id=requested_product_id;
      if variation_row.id is null then
        raise exception 'Quotation variation does not belong to the submitted product';
      end if;
    end if;

    if requested_line_key<>all(existing_line_keys) then
      select * into product_row from public.products p
      where p.id=requested_product_id and p.status='active';
      if product_row.id is null then raise exception 'Quotation product is unavailable'; end if;
      if requested_variation_id is not null then
        select * into variation_row from public.product_variations pv
        where pv.id=requested_variation_id
          and pv.product_id=requested_product_id and pv.status='active';
        if variation_row.id is null then raise exception 'Quotation variation is unavailable'; end if;
      end if;
      item_product_name:=case when requested_variation_id is null then product_row.name
        else product_row.name||' — '||variation_row.combination_key end;
      item_sku:=coalesce(variation_row.sku,product_row.sku);
      item_currency:=quotation.currency;
    else
      select * into existing_item from public.quotation_request_items qi
      where qi.quotation_id=quotation.id
        and qi.product_id is not distinct from requested_product_id
        and qi.variation_id is not distinct from requested_variation_id
      limit 1;
      item_product_name:=existing_item.product_name_snapshot;
      item_sku:=existing_item.sku_snapshot;
      item_currency:=existing_item.currency;
    end if;

    entry:=jsonb_build_object(
      'product_id',requested_product_id,
      'variation_id',requested_variation_id,
      'product_name_snapshot',item_product_name,
      'sku_snapshot',item_sku,
      'quantity',item_quantity,
      'target_price',item_unit_price,
      'unit_price',item_unit_price,
      'discount_amount',item_line_discount,
      'tax_amount',item_line_tax,
      'currency',item_currency
    );
    normalized_items:=normalized_items||jsonb_build_array(entry);
  end loop;

  update public.quotation_requests set
    subject=requested_subject,
    company_name=requested_company_name,
    customer_tax_identification_number=requested_customer_tax_identification_number,
    required_by=requested_required_by,
    expiration_date=requested_expiration_date,
    terms_and_conditions=requested_terms_and_conditions,
    payment_terms=requested_payment_terms,
    delivery_information=requested_delivery_information,
    customer_notes=requested_customer_notes,
    message=requested_customer_notes,
    internal_notes=requested_internal_notes,
    discount_amount=header_discount,
    tax_amount=header_tax,
    updated_by=actor_profile_id,
    updated_at=now()
  where id=quotation.id;

  delete from public.quotation_request_items
  where quotation_id=quotation.id;

  for entry in select value from jsonb_array_elements(normalized_items)
  loop
    insert into public.quotation_request_items(
      quotation_id,product_id,variation_id,product_name_snapshot,sku_snapshot,
      quantity,target_price,unit_price,discount_amount,tax_amount,currency
    ) values (
      quotation.id,
      (entry->>'product_id')::uuid,
      nullif(entry->>'variation_id','')::uuid,
      entry->>'product_name_snapshot',
      nullif(entry->>'sku_snapshot',''),
      (entry->>'quantity')::numeric,
      (entry->>'target_price')::numeric,
      (entry->>'unit_price')::numeric,
      (entry->>'discount_amount')::numeric,
      (entry->>'tax_amount')::numeric,
      entry->>'currency'
    );
  end loop;

  perform public.refresh_quotation_totals(quotation.id);
  return quotation.id;
end $$;

revoke all on function public.update_quotation_details_and_totals(
  uuid,uuid,text,text,text,text,date,date,text,text,text,text,text,numeric,numeric
) from public,anon,authenticated;
grant execute on function public.update_quotation_details_and_totals(
  uuid,uuid,text,text,text,text,date,date,text,text,text,text,text,numeric,numeric
) to service_role;

revoke all on function public.update_draft_quotation(
  uuid,uuid,timestamp with time zone,text,text,text,date,date,text,text,text,text,text,numeric,numeric,jsonb
) from public,anon,authenticated;
grant execute on function public.update_draft_quotation(
  uuid,uuid,timestamp with time zone,text,text,text,date,date,text,text,text,text,text,numeric,numeric,jsonb
) to service_role;
