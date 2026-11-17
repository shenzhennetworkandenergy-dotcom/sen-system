-- Quotation validity governs recording acceptance. A quotation already accepted
-- by the customer remains eligible for a linked draft sale after expiry.
-- The existing three-argument search retains its behavior during rollout.
-- The new search applies the authorized customer filter before limiting or paging.

create or replace function public.search_eligible_quotations_for_sale(
  actor_profile_id uuid,
  requested_query text,
  requested_limit integer,
  requested_customer_id uuid,
  requested_offset integer,
  requested_visible_customer_ids uuid[]
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
  search_query text:=left(btrim(coalesce(requested_query,'')),80);
  escaped_query text;
  search_pattern text;
  result_limit integer:=least(greatest(coalesce(requested_limit,20),1),
    case when requested_customer_id is null then 20 else 21 end);
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
  if search_query='' and requested_customer_id is null then return; end if;
  escaped_query:=replace(search_query,E'\\',E'\\\\');
  escaped_query:=replace(escaped_query,'%',E'\\%');
  escaped_query:=replace(escaped_query,'_',E'\\_');
  search_pattern:='%'||escaped_query||'%';

  return query
  select
    q.id,q.reference,q.profile_id,
    coalesce(nullif(p.full_name,''),nullif(p.email,''),nullif(p.company_name,''),'Customer'),
    coalesce(nullif(q.company_name,''),p.company_name),
    p.email,q.total_amount,q.currency::text,q.expiration_date
  from public.quotation_requests q
  join public.profiles p
    on p.id=q.profile_id and p.role='customer' and p.status='active' and p.archived_at is null
  where q.status='accepted'
    and q.converted_order_id is null
    and (requested_customer_id is null or q.profile_id=requested_customer_id)
    and (requested_visible_customer_ids is null or q.profile_id=any(requested_visible_customer_ids))
    and (
      can_view_all
      or (can_view_own and q.created_by=actor_profile_id)
    )
    and (
      search_query=''
      or q.reference ilike search_pattern escape E'\\'
      or p.full_name ilike search_pattern escape E'\\'
      or coalesce(q.company_name,p.company_name,'') ilike search_pattern escape E'\\'
      or p.email ilike search_pattern escape E'\\'
    )
  order by
    case when lower(q.reference)=lower(search_query) then 0 else 1 end,
    q.updated_at desc,q.reference,q.id
  limit result_limit
  offset greatest(coalesce(requested_offset,0),0);
end $$;

revoke all on function public.search_eligible_quotations_for_sale(uuid,text,integer,uuid,integer,uuid[])
  from public, anon, authenticated;
grant execute on function public.search_eligible_quotations_for_sale(uuid,text,integer,uuid,integer,uuid[])
  to service_role;

-- Keep the existing conversion transaction, including its row lock and retry behavior.
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
  expected_adjustment jsonb;
  expected_adjustments jsonb:='[]'::jsonb;
  validated_adjustments jsonb:='[]'::jsonb;
  adjustment_index integer;
  matching_adjustment_index integer;
  consumed_adjustment_indexes integer[]:='{}'::integer[];
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
  if quotation.currency is distinct from 'BDT' then
    raise exception 'Only BDT quotations can be converted to a Sale';
  end if;
  if requested_customer_id is distinct from quotation.profile_id then
    raise exception 'Sale customer must match the quotation customer';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=requested_customer_id and p.role='customer' and p.status='active'
  ) then raise exception 'Active quotation customer is required'; end if;
  if requested_address_id is not null and not exists(
    select 1 from public.customer_addresses a
    where a.id=requested_address_id and a.profile_id=requested_customer_id
  ) then
    raise exception 'Shipping address does not belong to the quotation customer';
  end if;
  if requested_billing_address_id is not null and not exists(
    select 1 from public.customer_addresses a
    where a.id=requested_billing_address_id and a.profile_id=requested_customer_id
  ) then
    raise exception 'Billing address does not belong to the quotation customer';
  end if;

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
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',source_quotation_item_id,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','manual_unit_price',
          'previous_value',baseline_unit_price,
          'new_value',item_unit_price
        ));
      end if;
      if item_line_discount<>round(coalesce(quote_item.discount_amount,0),2) then
        perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
        accepted_values_edited:=true;
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',source_quotation_item_id,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','fixed_line_discount',
          'previous_value',round(coalesce(quote_item.discount_amount,0),2),
          'new_value',item_line_discount
        ));
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
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',null,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','manual_unit_price',
          'previous_value',catalogue_unit_price,
          'new_value',item_unit_price
        ));
      end if;
      if item_line_discount>0 then
        perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',null,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','fixed_line_discount',
          'previous_value',catalogue_unit_price,
          'new_value',item_line_discount
        ));
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
    expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
      'source_quotation_item_id',null,
      'product_id',null,
      'variation_id',null,
      'adjustment_type','order_discount',
      'previous_value',round(coalesce(quotation.discount_amount,0),2),
      'new_value',header_discount
    ));
  end if;
  if header_service>0 then
    expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
      'source_quotation_item_id',null,
      'product_id',null,
      'variation_id',null,
      'adjustment_type','service_charge',
      'previous_value',0,
      'new_value',header_service
    ));
  end if;
  if header_shipping<>0 or header_service<>0
    or header_tax<>round(coalesce(quotation.tax_amount,0),2)
    or cardinality(seen_source_ids)<>(
      select count(*) from public.quotation_request_items qi
      where qi.quotation_id=quotation.id
    )
  then accepted_values_edited:=true; end if;

  if jsonb_array_length(coalesce(requested_adjustments,'[]'::jsonb))
    <>jsonb_array_length(expected_adjustments)
  then
    raise exception 'Sale adjustments do not match reviewed commercial edits';
  end if;
  for expected_adjustment in
    select expected.value from jsonb_array_elements(expected_adjustments) as expected(value)
  loop
    matching_adjustment_index:=null;
    for adjustment,adjustment_index in
      select requested.value,requested.ordinality::integer
      from jsonb_array_elements(coalesce(requested_adjustments,'[]'::jsonb))
        with ordinality as requested(value,ordinality)
    loop
      if adjustment_index=any(consumed_adjustment_indexes) then continue; end if;
      if adjustment->>'adjustment_type'=expected_adjustment->>'adjustment_type'
        and nullif(adjustment->>'source_quotation_item_id','')::uuid
          is not distinct from nullif(expected_adjustment->>'source_quotation_item_id','')::uuid
        and nullif(adjustment->>'product_id','')::uuid
          is not distinct from nullif(expected_adjustment->>'product_id','')::uuid
        and nullif(adjustment->>'variation_id','')::uuid
          is not distinct from nullif(expected_adjustment->>'variation_id','')::uuid
        and nullif(adjustment->>'previous_value','')::numeric
          is not distinct from nullif(expected_adjustment->>'previous_value','')::numeric
        and nullif(adjustment->>'new_value','')::numeric
          is not distinct from nullif(expected_adjustment->>'new_value','')::numeric
      then
        matching_adjustment_index:=adjustment_index;
        exit;
      end if;
    end loop;
    if matching_adjustment_index is null then
      raise exception 'Sale adjustments do not match reviewed commercial edits';
    end if;
    if nullif(adjustment->>'order_item_id','') is not null then
      raise exception 'Creation adjustments cannot reference an existing Sale item';
    end if;
    if nullif(btrim(coalesce(adjustment->>'reason','')),'') is null then
      raise exception 'Price adjustment reason required';
    end if;
    consumed_adjustment_indexes:=array_append(
      consumed_adjustment_indexes,matching_adjustment_index
    );
    validated_adjustments:=validated_adjustments||jsonb_build_array(adjustment);
  end loop;

  created_sale_id:=public.create_minimal_sale(
    actor_profile_id,requested_customer_id,requested_address_id,requested_address,
    requested_billing_address_id,requested_billing_address,requested_warehouse_id,
    requested_source,requested_expected_delivery_date,header_discount,header_shipping,
    header_service,header_tax,requested_internal_notes,requested_customer_notes,
    normalized_items,validated_adjustments
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

notify pgrst, 'reload schema';
