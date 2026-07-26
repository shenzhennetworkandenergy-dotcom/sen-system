-- Messenger-style support and a customer-friendly order lifecycle.
-- Additive only: existing operational order, inventory, shipment and payment states remain intact.

alter table public.sales_orders
  add column if not exists customer_status text not null default 'awaiting_confirmation'
  check (customer_status in (
    'awaiting_confirmation',
    'confirmed',
    'preparing_delivery',
    'on_the_way',
    'delivered',
    'received'
  ));

update public.sales_orders
set customer_status = case
  when status = 'draft' then 'awaiting_confirmation'
  when status in ('confirmed','processing','partially_allocated','allocated') then 'confirmed'
  when status = 'packing' then 'preparing_delivery'
  when status in ('partially_shipped','shipped') then 'on_the_way'
  when status = 'delivered' then 'delivered'
  else customer_status
end
where customer_status = 'awaiting_confirmation' and status <> 'draft';

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  notification_type text not null check (notification_type in ('order_status','support_reply','system')),
  title text not null,
  message text not null,
  href text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_notifications_profile_idx
  on public.customer_notifications(profile_id,read_at,created_at desc);

alter table public.customer_notifications enable row level security;

drop policy if exists "customers read own notifications" on public.customer_notifications;
create policy "customers read own notifications"
  on public.customer_notifications for select to authenticated
  using (profile_id = auth.uid());

grant select on public.customer_notifications to authenticated;
grant all on public.customer_notifications to service_role;

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
    'Customer status: '||previous_status||' → '||requested_status
  );
end $$;

revoke all on function public.set_customer_order_status(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.set_customer_order_status(uuid,uuid,text,text)
  to service_role;

create or replace function public.notify_customer_support_reply()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  conversation public.support_conversations%rowtype;
  sender_role text;
begin
  select * into conversation
  from public.support_conversations
  where id=new.conversation_id;
  select role into sender_role from public.profiles where id=new.sender_profile_id;

  if sender_role in ('admin','employee') then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      conversation.profile_id,
      'support_reply',
      'New message from SEN',
      left(new.body,240),
      '/account/messages/'||conversation.id::text,
      'support_conversation',
      conversation.id
    );
  end if;
  return new;
end $$;

drop trigger if exists notify_customer_support_reply_trigger
  on public.support_messages;
create trigger notify_customer_support_reply_trigger
after insert on public.support_messages
for each row execute function public.notify_customer_support_reply();
