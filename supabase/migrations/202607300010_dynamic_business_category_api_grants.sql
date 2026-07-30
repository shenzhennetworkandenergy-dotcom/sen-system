begin;

grant usage on schema public to anon, authenticated, service_role;

grant select on table public.business_categories to anon;
grant select on table public.business_categories to authenticated;
grant all on table public.business_categories to service_role;

grant select on table public.business_category_fields to anon;
grant select on table public.business_category_fields to authenticated;
grant all on table public.business_category_fields to service_role;

grant execute on function public.admin_save_business_category(uuid, uuid, jsonb, jsonb)
  to authenticated, service_role;
grant execute on function public.admin_move_business_category(uuid, uuid, text)
  to authenticated, service_role;

drop policy if exists "public read active business categories"
  on public.business_categories;
create policy "public read active business categories"
on public.business_categories for select to anon
using (is_active and archived_at is null);

drop policy if exists "public read active business category fields"
  on public.business_category_fields;
create policy "public read active business category fields"
on public.business_category_fields for select to anon
using (
  is_active
  and exists (
    select 1
    from public.business_categories category
    where category.id = business_category_id
      and category.is_active
      and category.archived_at is null
  )
);

notify pgrst, 'reload schema';

commit;
