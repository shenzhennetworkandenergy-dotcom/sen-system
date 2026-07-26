-- Safely reopen a cancelled order as a draft. Released stock is not restored.
create or replace function public.reactivate_cancelled_sales_order(actor_profile_id uuid, requested_order_id uuid, requested_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
  perform public.assert_actor_permission(actor_profile_id,'orders.confirm');
  select status into current_status from public.sales_orders where id=requested_order_id for update;
  if current_status is null then raise exception 'Order not found.'; end if;
  if current_status<>'cancelled' then raise exception 'Only a cancelled order can be reactivated.'; end if;
  update public.sales_orders set status='draft',cancelled_at=null,updated_by=actor_profile_id,updated_at=now() where id=requested_order_id;
  insert into public.order_status_events(order_id,old_status,new_status,actor_profile_id,note)
  values(requested_order_id,'cancelled','draft',actor_profile_id,coalesce(nullif(trim(requested_note),''),'Cancelled order reactivated for review'));
  return requested_order_id;
end $$;
revoke all on function public.reactivate_cancelled_sales_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reactivate_cancelled_sales_order(uuid,uuid,text) to service_role;
