-- Repair the customer-facing order progression permission for databases where
-- 202607260003 has already been applied. Changing delivery progress is a
-- sensitive order operation and must use the existing confirmation permission.

create or replace function public.set_customer_order_status(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_status text,
  requested_note text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.sales_orders%rowtype;
  previous_status text;
  status_title text;
  status_message text;
begin
  if requested_status not in (
    'confirmed','preparing_delivery','on_the_way','delivered','received'
  ) then
    raise exception 'Invalid customer order status';
  end if;

  perform public.assert_actor_permission(actor_profile_id,'orders.confirm');
  select * into target
  from public.sales_orders
  where id=requested_order_id
  for update;

  if target.id is null then raise exception 'Order not found'; end if;
  if target.status='cancelled' then raise exception 'Cancelled orders cannot be progressed'; end if;

  previous_status := target.customer_status;
  if previous_status = requested_status then return; end if;

  update public.sales_orders
  set customer_status=requested_status,
      updated_by=actor_profile_id,
      updated_at=now()
  where id=target.id;

  status_title := case requested_status
    when 'confirmed' then 'Order confirmed'
    when 'preparing_delivery' then 'Preparing your order'
    when 'on_the_way' then 'Your order is on the way'
    when 'delivered' then 'Order delivered'
    when 'received' then 'Delivery completed'
  end;
  status_message := case requested_status
    when 'confirmed' then 'SEN confirmed your order and is preparing the next steps.'
    when 'preparing_delivery' then 'Your order is being prepared for delivery.'
    when 'on_the_way' then 'Your order has left SEN and is on the way to you.'
    when 'delivered' then 'SEN marked your order as delivered.'
    when 'received' then 'Your receipt of the order has been confirmed successfully.'
  end;

  insert into public.customer_notifications(
    profile_id,notification_type,title,message,href,entity_type,entity_id
  ) values (
    target.customer_profile_id,
    'order_status',
    status_title,
    coalesce(nullif(left(requested_note,500),''),status_message),
    '/account/orders/'||target.id::text,
    'sales_order',
    target.id
  );

  insert into public.order_status_events(
    order_id,old_status,new_status,actor_profile_id,note
  ) values (
    target.id,
    target.status,
    target.status,
    actor_profile_id,
    'Customer status: '||previous_status||' -> '||requested_status
  );
end $$;

revoke all on function public.set_customer_order_status(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.set_customer_order_status(uuid,uuid,text,text)
  to service_role;
