-- Keep operational quantities integral and monetary inputs at two decimal places.
-- NOT VALID preserves existing historical rows while enforcing the rule on every
-- new or updated row. Existing data can be audited and validated separately.

create or replace function pg_temp.add_numeric_rule(
  p_table_name text,
  p_column_name text,
  p_constraint_name text,
  p_expression text
) returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || p_table_name) is null or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and information_schema.columns.table_name = p_table_name
      and information_schema.columns.column_name = p_column_name
  ) then
    return;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.' || p_table_name)
      and conname = p_constraint_name
  ) then
    execute format(
      'alter table public.%I add constraint %I check (%s) not valid',
      p_table_name,
      p_constraint_name,
      p_expression
    );
  end if;
end;
$$;

create or replace function pg_temp.round_money_column(
  p_table_name text,
  p_column_name text
) returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || p_table_name) is null or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and information_schema.columns.table_name = p_table_name
      and information_schema.columns.column_name = p_column_name
  ) then
    return;
  end if;
  execute format(
    'update public.%I set %I = round(%I, 2) where %I is not null and %I <> round(%I, 2)',
    p_table_name,
    p_column_name,
    p_column_name,
    p_column_name,
    p_column_name,
    p_column_name
  );
end;
$$;

-- Whole-unit quantities.
select pg_temp.add_numeric_rule('shopping_cart_items', 'quantity', 'shopping_cart_items_quantity_whole', 'quantity = trunc(quantity)');
select pg_temp.add_numeric_rule('quotation_request_items', 'quantity', 'quotation_request_items_quantity_whole', 'quantity = trunc(quantity)');
select pg_temp.add_numeric_rule('sales_order_items', 'quantity', 'sales_order_items_quantity_whole', 'quantity = trunc(quantity)');
select pg_temp.add_numeric_rule('sales_order_items', 'allocated_quantity', 'sales_order_items_allocated_whole', 'allocated_quantity = trunc(allocated_quantity)');
select pg_temp.add_numeric_rule('sales_order_items', 'packed_quantity', 'sales_order_items_packed_whole', 'packed_quantity = trunc(packed_quantity)');
select pg_temp.add_numeric_rule('sales_order_items', 'shipped_quantity', 'sales_order_items_shipped_whole', 'shipped_quantity = trunc(shipped_quantity)');
select pg_temp.add_numeric_rule('sales_order_items', 'delivered_quantity', 'sales_order_items_delivered_whole', 'delivered_quantity = trunc(delivered_quantity)');
select pg_temp.add_numeric_rule('purchase_order_items', 'quantity_ordered', 'purchase_order_items_ordered_whole', 'quantity_ordered = trunc(quantity_ordered)');
select pg_temp.add_numeric_rule('purchase_order_items', 'quantity_received', 'purchase_order_items_received_whole', 'quantity_received = trunc(quantity_received)');
select pg_temp.add_numeric_rule('purchase_order_items', 'quantity_rejected', 'purchase_order_items_rejected_whole', 'quantity_rejected = trunc(quantity_rejected)');
select pg_temp.add_numeric_rule('purchase_receipt_items', 'quantity_received', 'purchase_receipt_items_quantity_whole', 'quantity_received = trunc(quantity_received)');
select pg_temp.add_numeric_rule('inventory_balances', 'on_hand', 'inventory_balances_on_hand_whole', 'on_hand = trunc(on_hand)');
select pg_temp.add_numeric_rule('inventory_balances', 'reserved', 'inventory_balances_reserved_whole', 'reserved = trunc(reserved)');
select pg_temp.add_numeric_rule('inventory_balances', 'incoming', 'inventory_balances_incoming_whole', 'incoming = trunc(incoming)');
select pg_temp.add_numeric_rule('inventory_balances', 'damaged', 'inventory_balances_damaged_whole', 'damaged = trunc(damaged)');
select pg_temp.add_numeric_rule('inventory_reservations', 'quantity', 'inventory_reservations_quantity_whole', 'quantity = trunc(quantity)');
select pg_temp.add_numeric_rule('shipment_items', 'quantity', 'shipment_items_quantity_whole', 'quantity = trunc(quantity)');
select pg_temp.add_numeric_rule('shipment_items', 'delivered_quantity', 'shipment_items_delivered_whole', 'delivered_quantity = trunc(delivered_quantity)');

-- Two-decimal monetary values.
select pg_temp.round_money_column('products', 'purchase_cost');
select pg_temp.round_money_column('products', 'regular_price');
select pg_temp.round_money_column('products', 'sale_price');
select pg_temp.round_money_column('product_variations', 'purchase_cost');
select pg_temp.round_money_column('product_variations', 'regular_price');
select pg_temp.round_money_column('purchase_order_items', 'unit_cost');
select pg_temp.round_money_column('purchase_order_items', 'discount_amount');
select pg_temp.round_money_column('purchase_order_items', 'tax_amount');
select pg_temp.round_money_column('sales_order_items', 'unit_price');
select pg_temp.round_money_column('sales_order_items', 'discount_amount');
select pg_temp.round_money_column('sales_order_items', 'tax_amount');
select pg_temp.round_money_column('quotation_request_items', 'target_price');

select pg_temp.add_numeric_rule('products', 'purchase_cost', 'products_purchase_cost_2dp', 'purchase_cost = round(purchase_cost, 2)');
select pg_temp.add_numeric_rule('products', 'regular_price', 'products_regular_price_2dp', 'regular_price = round(regular_price, 2)');
select pg_temp.add_numeric_rule('products', 'sale_price', 'products_sale_price_2dp', 'sale_price = round(sale_price, 2)');
select pg_temp.add_numeric_rule('product_variations', 'purchase_cost', 'product_variations_purchase_cost_2dp', 'purchase_cost = round(purchase_cost, 2)');
select pg_temp.add_numeric_rule('product_variations', 'regular_price', 'product_variations_regular_price_2dp', 'regular_price = round(regular_price, 2)');
select pg_temp.add_numeric_rule('purchase_order_items', 'unit_cost', 'purchase_order_items_unit_cost_2dp', 'unit_cost = round(unit_cost, 2)');
select pg_temp.add_numeric_rule('purchase_order_items', 'discount_amount', 'purchase_order_items_discount_2dp', 'discount_amount = round(discount_amount, 2)');
select pg_temp.add_numeric_rule('purchase_order_items', 'tax_amount', 'purchase_order_items_tax_2dp', 'tax_amount = round(tax_amount, 2)');
select pg_temp.add_numeric_rule('sales_order_items', 'unit_price', 'sales_order_items_unit_price_2dp', 'unit_price = round(unit_price, 2)');
select pg_temp.add_numeric_rule('sales_order_items', 'discount_amount', 'sales_order_items_discount_2dp', 'discount_amount = round(discount_amount, 2)');
select pg_temp.add_numeric_rule('sales_order_items', 'tax_amount', 'sales_order_items_tax_2dp', 'tax_amount = round(tax_amount, 2)');
select pg_temp.add_numeric_rule('quotation_request_items', 'target_price', 'quotation_request_items_target_price_2dp', 'target_price = round(target_price, 2)');
