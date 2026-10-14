-- Reuse the Create Sale product editor for safe, atomic Draft Sale changes.
-- Confirmed and later Sales continue to use the existing revision workflow.

create or replace function public.update_draft_sale_products(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_expected_updated_at timestamptz,
  requested_reason text,
  requested_items jsonb
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  current_item public.sales_order_items%rowtype;
  product public.products%rowtype;
  variation public.product_variations%rowtype;
  entry jsonb;
  retained_ids uuid[];
  requested_id uuid;
  item_id uuid;
  next_warehouse_id uuid;
  next_quantity numeric;
  next_unit_price numeric;
  catalogue_unit_price numeric;
  next_discount_type text;
  next_discount_value numeric;
  next_line_subtotal numeric;
  next_line_discount numeric;
  next_line_tax numeric;
  next_line_total numeric;
  subtotal_total numeric:=0;
  line_total_sum numeric:=0;
  revised_total numeric;
  brand_name text;
  image_path text;
  reason text;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.edit');
  reason:=nullif(left(trim(coalesce(requested_reason,'')),500),'');
  if reason is null then raise exception 'Edit reason is required'; end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then
    raise exception 'At least one product is required';
  end if;

  select * into sale from public.sales_orders
  where id=requested_order_id for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  if sale.status<>'draft' or sale.confirmed_at is not null then
    raise exception 'Only a Draft Sale can be edited in the Create Sale form';
  end if;
  if requested_expected_updated_at is null
    or sale.updated_at is distinct from requested_expected_updated_at
  then raise exception 'This Sale changed before it could be saved'; end if;

  perform id from public.sales_order_items
  where order_id=sale.id for update;

  -- A Draft must not have physical fulfilment state. Refuse unexpected state
  -- rather than deleting or rewriting reservations, serials, or shipments.
  if exists(select 1 from public.inventory_reservations where order_id=sale.id)
    or exists(select 1 from public.order_serial_allocations where order_id=sale.id)
    or exists(select 1 from public.order_packages where order_id=sale.id)
    or exists(select 1 from public.shipments where order_id=sale.id)
    or exists(select 1 from public.shipment_documents where order_id=sale.id)
    or exists(select 1 from public.sales_stock_out_requests where sales_order_id=sale.id)
  then raise exception 'Draft Sale has fulfilment records and cannot use this editor'; end if;

  select coalesce(array_agg((value->>'id')::uuid),'{}'::uuid[])
  into retained_ids
  from jsonb_array_elements(requested_items)
  where nullif(value->>'id','') is not null;
  if coalesce(array_length(retained_ids,1),0)<>(
    select count(distinct value->>'id')
    from jsonb_array_elements(requested_items)
    where nullif(value->>'id','') is not null
  ) then raise exception 'A Sale line cannot be submitted twice'; end if;
  if exists(
    select 1 from unnest(retained_ids) requested_line_id
    where not exists(
      select 1 from public.sales_order_items current_line
      where current_line.id=requested_line_id and current_line.order_id=sale.id
    )
  ) then raise exception 'Sale item not found'; end if;

  -- Preserve historical adjustment rows for removed Draft lines.
  update public.sale_price_adjustments adjustment
  set order_item_id=null
  where adjustment.order_id=sale.id
    and adjustment.order_item_id is not null
    and not (adjustment.order_item_id=any(retained_ids));
  delete from public.sales_order_items item
  where item.order_id=sale.id and not (item.id=any(retained_ids));

  for entry in select value from jsonb_array_elements(requested_items)
  loop
    requested_id:=nullif(entry->>'id','')::uuid;
    current_item:=null;
    if requested_id is not null then
      select * into current_item from public.sales_order_items
      where id=requested_id and order_id=sale.id for update;
      if current_item.id is null then raise exception 'Sale item not found'; end if;
    end if;

    select * into product from public.products
    where id=(entry->>'product_id')::uuid and status<>'archived';
    if product.id is null then raise exception 'Product not found'; end if;
    next_warehouse_id:=(entry->>'warehouse_id')::uuid;
    if next_warehouse_id is distinct from sale.fulfillment_warehouse_id then
      raise exception 'The Sale warehouse cannot be changed in this editor';
    end if;
    variation:=null;
    if nullif(entry->>'variation_id','') is not null then
      select * into variation from public.product_variations
      where id=(entry->>'variation_id')::uuid
        and product_id=product.id and status='active';
      if variation.id is null then raise exception 'Invalid variation'; end if;
    end if;

    next_quantity:=(entry->>'quantity')::numeric;
    next_unit_price:=round((entry->>'unit_price')::numeric,2);
    next_discount_type:=entry->>'discount_type';
    next_discount_value:=round(coalesce((entry->>'discount_value')::numeric,0),2);
    if next_quantity<1 or next_quantity<>trunc(next_quantity) then
      raise exception 'Quantity must be a whole number of at least 1';
    end if;
    if next_unit_price<0 then raise exception 'Unit price cannot be negative'; end if;
    if next_discount_type not in('percentage','fixed') or next_discount_value<0
      or (next_discount_type='percentage' and next_discount_value>100)
    then raise exception 'Discount is invalid'; end if;

    catalogue_unit_price:=round(coalesce(
      variation.sale_price,variation.regular_price,
      product.sale_price,product.regular_price,0
    ),2);
    if current_item.id is null
      or current_item.product_id is distinct from product.id
      or current_item.variation_id is distinct from variation.id
    then
      if next_unit_price<>catalogue_unit_price then
        perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
      end if;
    elsif next_unit_price<>current_item.unit_price then
      perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
    end if;
    next_line_subtotal:=round(next_quantity*next_unit_price,2);
    next_line_discount:=case when next_discount_type='percentage'
      then round(next_line_subtotal*next_discount_value/100,2) else next_discount_value end;
    if next_line_discount>next_line_subtotal then
      raise exception 'Fixed discount cannot exceed the line subtotal';
    end if;
    if next_line_discount>0 and (
      current_item.id is null
      or current_item.product_id is distinct from product.id
      or current_item.variation_id is distinct from variation.id
      or next_line_discount is distinct from current_item.line_discount
      or next_discount_type is distinct from current_item.discount_type
      or next_discount_value is distinct from current_item.discount_value
    ) then
      perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
    end if;
    next_line_tax:=case
      when current_item.id is null
        or current_item.product_id is distinct from product.id
        or current_item.variation_id is distinct from variation.id
      then 0
      else current_item.line_tax
    end;
    next_line_total:=round(next_line_subtotal-next_line_discount+next_line_tax,2);
    select brand.name into brand_name from public.brands brand
    where brand.id=product.brand_id;
    select media.storage_path into image_path from public.product_media media
    where media.product_id=product.id and media.is_primary
    order by media.sort_order limit 1;

    if current_item.id is null then
      item_id:=gen_random_uuid();
      insert into public.sales_order_items(
        id,order_id,product_id,variation_id,fulfillment_warehouse_id,
        quantity,unit_price,line_subtotal,line_discount,line_tax,line_total,
        discount_type,discount_value,currency,serial_tracking_required_snapshot,
        product_name_snapshot,sku_snapshot,model_number_snapshot,brand_snapshot,
        variation_snapshot,product_image_path_snapshot
      ) values(
        item_id,sale.id,product.id,variation.id,next_warehouse_id,
        next_quantity,next_unit_price,next_line_subtotal,next_line_discount,next_line_tax,next_line_total,
        next_discount_type,next_discount_value,sale.currency,product.serial_tracking_required,
        product.name,coalesce(variation.sku,product.sku),product.model_number,brand_name,
        case when variation.id is null then null else jsonb_build_object(
          'id',variation.id,'sku',variation.sku,'combination_key',variation.combination_key
        ) end,image_path
      );
    else
      item_id:=current_item.id;
      if next_quantity<>current_item.quantity then
        insert into public.sale_price_adjustments(
          order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
        ) values(sale.id,item_id,'quantity_change',current_item.quantity,next_quantity,reason,actor_profile_id);
      end if;
      if next_unit_price<>current_item.unit_price then
        insert into public.sale_price_adjustments(
          order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
        ) values(sale.id,item_id,'manual_unit_price',current_item.unit_price,next_unit_price,reason,actor_profile_id);
      end if;
      if next_line_discount<>current_item.line_discount
        or next_discount_type<>current_item.discount_type
        or next_discount_value<>current_item.discount_value
      then
        insert into public.sale_price_adjustments(
          order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
        ) values(
          sale.id,item_id,
          case when next_discount_type='percentage' then 'percentage_discount' else 'fixed_line_discount' end,
          current_item.line_discount,
          case when next_discount_type='percentage' then next_discount_value else next_line_discount end,
          reason,actor_profile_id
        );
      end if;
      update public.sales_order_items set
        product_id=product.id,variation_id=variation.id,
        quantity=next_quantity,unit_price=next_unit_price,line_subtotal=next_line_subtotal,
        line_discount=next_line_discount,line_tax=next_line_tax,line_total=next_line_total,
        serial_tracking_required_snapshot=product.serial_tracking_required,
        product_name_snapshot=product.name,
        sku_snapshot=coalesce(variation.sku,product.sku),
        model_number_snapshot=product.model_number,brand_snapshot=brand_name,
        variation_snapshot=case when variation.id is null then null else jsonb_build_object(
          'id',variation.id,'sku',variation.sku,'combination_key',variation.combination_key
        ) end,
        product_image_path_snapshot=image_path,updated_at=now()
      where id=item_id;
    end if;
    subtotal_total:=subtotal_total+next_line_subtotal;
    line_total_sum:=line_total_sum+next_line_total;
  end loop;

  revised_total:=round(
    line_total_sum-sale.discount_amount+sale.shipping_amount+
    sale.service_amount+sale.tax_amount,2
  );
  if revised_total<0 then raise exception 'Sale total cannot be negative'; end if;
  if revised_total<sale.paid_amount then
    raise exception 'Sale total cannot be lower than the amount already paid';
  end if;
  update public.sales_orders set
    subtotal=subtotal_total,total_amount=revised_total,
    payment_status=case
      when paid_amount=0 then 'unpaid'
      when paid_amount<revised_total then 'partially_paid'
      when paid_amount=revised_total then 'paid'
      else 'overpaid' end,
    updated_by=actor_profile_id,updated_at=now()
  where id=sale.id;
  update public.sale_documents set
    status='superseded',superseded_at=now(),superseded_by=actor_profile_id,
    superseded_reason=reason
  where order_id=sale.id and status='generated';
  insert into public.order_status_events(
    order_id,old_status,new_status,actor_profile_id,note
  ) values(sale.id,'draft','draft',actor_profile_id,reason);
  return true;
end $$;

revoke all on function public.update_draft_sale_products(
  uuid,uuid,timestamptz,text,jsonb
) from public,anon,authenticated;
grant execute on function public.update_draft_sale_products(
  uuid,uuid,timestamptz,text,jsonb
) to service_role;
