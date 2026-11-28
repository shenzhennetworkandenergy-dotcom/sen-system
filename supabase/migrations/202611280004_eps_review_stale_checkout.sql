begin;

-- Merchant support can confirm closure out of band when the status API stays pending.
create function public.confirm_closed_eps_checkout(
  requested_order_id uuid,
  actor_profile_id uuid,
  eps_confirmation_reference text
) returns text
language plpgsql security definer set search_path='' as $$
declare
  sale public.sales_orders%rowtype;
  checkout public.eps_checkout_requests%rowtype;
  pending_references text[];
  result text;
begin
  if coalesce(auth.role(),'') <> 'service_role' or not exists (
    select 1 from public.profiles
    where id=actor_profile_id and role='admin' and status='active' and archived_at is null
  ) then raise exception 'Permission denied'; end if;
  if coalesce(eps_confirmation_reference, '') !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{5,79}$' then
    return 'invalid_reference';
  end if;

  select * into sale from public.sales_orders where id=requested_order_id for update;
  select * into checkout from public.eps_checkout_requests
  where order_id=sale.id and profile_id=sale.customer_profile_id for update;
  if checkout.order_id is null or checkout.requested_change is null
    or checkout.discarded_at is not null or checkout.cart_restored_at is not null
    or checkout.payment_expires_at > clock_timestamp()
    or sale.status not in ('confirmed','cancelled') or sale.paid_amount is distinct from 0
    or exists (select 1 from public.sale_payments where order_id=sale.id and amount > 0)
    or exists (
      select 1 from public.sales_order_items where order_id=sale.id
      and (allocated_quantity > 0 or packed_quantity > 0 or shipped_quantity > 0)
    ) then
    return 'not_eligible';
  end if;

  -- Match the provider reconciliation lock order and exclude any active verification.
  perform 1 from public.eps_payment_attempts where order_id=sale.id order by id for update;
  if exists (
    select 1 from public.eps_payment_attempts where order_id=sale.id
    and (status in ('paid','sandbox_paid','review_required') or eps_transaction_id is not null
         or sale_payment_id is not null or journal_entry_id is not null)
  ) or exists (
    select 1 from public.payment_transactions where order_id=sale.id
    and status not in ('pending','processing','failed','cancelled')
  ) then
    return 'not_eligible';
  end if;
  if exists (
    select 1 from public.eps_payment_attempts where order_id=sale.id
    and verification_lease_until > clock_timestamp()
  ) then
    return 'verification_busy';
  end if;

  select array_agg(merchant_transaction_id order by merchant_transaction_id)
    into pending_references
    from public.eps_payment_attempts
    where order_id=sale.id and status in ('initializing','ready','unknown','pending');
  if pending_references is null then return 'not_eligible'; end if;

  update public.payment_transactions t
  set status='cancelled',updated_at=now()
  from public.eps_payment_attempts a
  where a.transaction_id=t.id and a.order_id=sale.id
    and a.merchant_transaction_id=any(pending_references);
  update public.eps_payment_attempts
  set status='cancelled',verification_lease_until=null,verification_error=null,updated_at=now()
  where order_id=sale.id and merchant_transaction_id=any(pending_references);

  result := public.manage_unpaid_eps_checkout(sale.id,checkout.profile_id,actor_profile_id,null);
  if result is distinct from (case when checkout.requested_change='remove' then 'removed' else 'restored' end) then
    raise exception 'Checkout could not be completed';
  end if;

  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values
  ) values(
    actor_profile_id,'admin',checkout.profile_id,'payments.eps_unpaid_closure_confirmed','sales',
    'sales_order',sale.id::text,'SEN recorded confirmed unpaid closure from EPS and completed the customer request.',
    jsonb_build_object('confirmation_reference',eps_confirmation_reference,
      'merchant_transaction_references',pending_references,'result',result)
  );
  return result;
end $$;

revoke all on function public.confirm_closed_eps_checkout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_closed_eps_checkout(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';

commit;
