-- Customer visibility is derived from the intersection between an employee's
-- assigned business categories and a customer's assigned business categories.
-- Administrators retain unrestricted access. Employees without assignments
-- intentionally receive an empty customer set.

create or replace function public.customer_is_visible_to_actor(
  requested_actor_profile_id uuid,
  requested_customer_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.profiles customer
      on customer.id = requested_customer_profile_id
     and customer.role = 'customer'
     and customer.status = 'active'
     and customer.archived_at is null
    where actor.id = requested_actor_profile_id
      and actor.status = 'active'
      and actor.archived_at is null
      and (
        actor.role = 'admin'
        or (
          actor.role = 'employee'
          and exists (
            select 1
            from public.employee_business_category_access employee_access
            join public.customer_business_categories category
              on category.id = employee_access.customer_business_category_id
             and category.is_active = true
            join public.customer_business_category_assignments customer_access
              on customer_access.customer_business_category_id = employee_access.customer_business_category_id
            where employee_access.employee_profile_id = actor.id
              and customer_access.customer_profile_id = customer.id
          )
        )
      )
  );
$$;

create or replace function public.visible_customer_profile_ids(
  requested_actor_profile_id uuid
) returns table (customer_profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select customer.id
  from public.profiles actor
  join public.profiles customer
    on customer.role = 'customer'
   and customer.status = 'active'
   and customer.archived_at is null
  where actor.id = requested_actor_profile_id
    and actor.status = 'active'
    and actor.archived_at is null
    and (
      actor.role = 'admin'
      or (
        actor.role = 'employee'
        and exists (
          select 1
          from public.employee_business_category_access employee_access
          join public.customer_business_categories category
            on category.id = employee_access.customer_business_category_id
           and category.is_active = true
          join public.customer_business_category_assignments customer_access
            on customer_access.customer_business_category_id = employee_access.customer_business_category_id
          where employee_access.employee_profile_id = actor.id
            and customer_access.customer_profile_id = customer.id
        )
      )
    )
  order by customer.id;
$$;

revoke all on function public.customer_is_visible_to_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.visible_customer_profile_ids(uuid) from public, anon, authenticated;
grant execute on function public.customer_is_visible_to_actor(uuid, uuid) to service_role;
grant execute on function public.visible_customer_profile_ids(uuid) to service_role;
