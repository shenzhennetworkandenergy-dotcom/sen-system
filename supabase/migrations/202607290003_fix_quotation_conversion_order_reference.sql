-- Recreate the quotation conversion function after renaming its local order
-- identifier. The original name conflicted with sales_order_items.order_id
-- while PostgreSQL compiled the invoice snapshot query.

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

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.convert_quotation_to_invoice(uuid,uuid,uuid,boolean)'::regprocedure
  )
  into function_definition;

  function_definition := replace(
    function_definition,
    'order_id uuid := gen_random_uuid()',
    'created_order_id uuid := gen_random_uuid()'
  );
  function_definition := replace(
    function_definition,
    'order_id uuid:=gen_random_uuid()',
    'created_order_id uuid:=gen_random_uuid()'
  );
  function_definition := replace(
    function_definition,
    'order_id,order_number,customer.id,address_id,address_snapshot',
    'created_order_id,order_number,customer.id,address_id,address_snapshot'
  );
  function_definition := replace(
    function_definition,
    'order_id,product_row.id,quote_item.variation_id,requested_warehouse_id',
    'created_order_id,product_row.id,quote_item.variation_id,requested_warehouse_id'
  );
  function_definition := replace(
    function_definition,
    'values(order_id,''draft'',actor_profile_id',
    'values(created_order_id,''draft'',actor_profile_id'
  );
  function_definition := replace(
    function_definition,
    'i.order_id = order_id',
    'i.order_id = created_order_id'
  );
  function_definition := replace(
    function_definition,
    'i.order_id=order_id',
    'i.order_id=created_order_id'
  );
  function_definition := replace(
    function_definition,
    'o.id = order_id',
    'o.id = created_order_id'
  );
  function_definition := replace(
    function_definition,
    'o.id=order_id',
    'o.id=created_order_id'
  );
  function_definition := replace(
    function_definition,
    'invoice_id,order_id,invoice_number',
    'invoice_id,created_order_id,invoice_number'
  );
  function_definition := replace(
    function_definition,
    'converted_order_id = order_id',
    'converted_order_id = created_order_id'
  );
  function_definition := replace(
    function_definition,
    'converted_order_id=order_id',
    'converted_order_id=created_order_id'
  );
  function_definition := replace(
    function_definition,
    '''order_id'', order_id',
    '''order_id'', created_order_id'
  );
  function_definition := replace(
    function_definition,
    '''order_id'',order_id',
    '''order_id'',created_order_id'
  );

  execute function_definition;
end $$;

revoke all on function public.convert_quotation_to_invoice(uuid,uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.convert_quotation_to_invoice(uuid,uuid,uuid,boolean)
  to service_role;
