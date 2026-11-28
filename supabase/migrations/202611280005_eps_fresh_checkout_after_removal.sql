begin;

create function public.find_blocking_eps_product_checkout(
  requested_profile_id uuid,
  requested_product_id uuid,
  requested_variation_id uuid
) returns table(order_id uuid, fingerprint text, total_amount numeric, quantity numeric, expired boolean)
language sql stable security invoker set search_path='' as $$
  select checkout.order_id,checkout.fingerprint,sale.total_amount,item.quantity,
         checkout.payment_expires_at<=now()
  from public.eps_checkout_requests checkout
  join public.sales_orders sale on sale.id=checkout.order_id
  join public.sales_order_items item on item.order_id=sale.id
  where checkout.profile_id=requested_profile_id and sale.customer_profile_id=requested_profile_id
    and checkout.cart_restored_at is null and checkout.discarded_at is null
    and sale.status='confirmed' and sale.paid_amount=0
    and item.product_id=requested_product_id
    and item.variation_id is not distinct from requested_variation_id
    -- Keep a removed, expired checkout in reconciliation while allowing a new purchase.
    and (
      checkout.requested_change is distinct from 'remove'
      or checkout.payment_expires_at>now()
      or exists (
        select 1 from public.eps_payment_attempts attempt
        where attempt.order_id=sale.id
          and (attempt.status in ('paid','sandbox_paid','review_required')
               or attempt.eps_transaction_id is not null
               or attempt.sale_payment_id is not null or attempt.journal_entry_id is not null)
      )
      or exists (
        select 1 from public.payment_transactions payment
        where payment.order_id=sale.id and payment.status not in ('pending','processing','failed','cancelled')
      )
      or exists (select 1 from public.sale_payments payment where payment.order_id=sale.id and payment.amount>0)
    )
  order by checkout.created_at desc,checkout.order_id,item.id
  limit 1;
$$;

revoke all on function public.find_blocking_eps_product_checkout(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.find_blocking_eps_product_checkout(uuid,uuid,uuid) to service_role;

do $migration$
declare
  checkout_definition text := pg_catalog.pg_get_functiondef(
    'public.customer_checkout_eps_order(uuid,uuid,text,text,text,uuid,text,numeric,uuid,uuid,integer,jsonb)'::regprocedure
  );
  verify_definition text := pg_catalog.pg_get_functiondef(
    'public.apply_eps_verification(uuid,text,numeric,text,text,text,uuid)'::regprocedure
  );
  old_checkout_guard text := $guard$      select 1
      from public.eps_checkout_requests checkout
      join public.sales_orders sale on sale.id=checkout.order_id
      join public.sales_order_items item on item.order_id=sale.id
      where checkout.profile_id=actor_profile_id and checkout.cart_restored_at is null
        and sale.status='confirmed' and sale.paid_amount=0
        and item.product_id=requested_product_id
        and item.variation_id is not distinct from requested_variation_id$guard$;
  new_checkout_guard text := $guard$      select 1 from public.find_blocking_eps_product_checkout(
        actor_profile_id,requested_product_id,requested_variation_id
      )$guard$;
  old_review_guard text := $guard$  if sale.status='cancelled' or sale.currency<>'BDT' or sale.total_amount-sale.paid_amount is distinct from a.amount$guard$;
  new_review_guard text := $guard$  -- A late receipt for an abandoned checkout needs review before fulfilment.
  if sale.status='cancelled' or sale.currency<>'BDT' or sale.total_amount-sale.paid_amount is distinct from a.amount
    or exists (
      select 1 from public.eps_checkout_requests checkout
      where checkout.order_id=sale.id and checkout.requested_change='remove'
        and checkout.payment_expires_at<=now()
    )$guard$;
begin
  -- Apply only to the expected guards, preserving the rest of each payment function.
  if cardinality(string_to_array(checkout_definition,old_checkout_guard))<>2
    or cardinality(string_to_array(verify_definition,old_review_guard))<>2 then
    raise exception 'Expected EPS checkout or reconciliation guard changed';
  end if;
  execute replace(checkout_definition,old_checkout_guard,new_checkout_guard);
  execute replace(verify_definition,old_review_guard,new_review_guard);
end
$migration$;

notify pgrst, 'reload schema';
commit;
