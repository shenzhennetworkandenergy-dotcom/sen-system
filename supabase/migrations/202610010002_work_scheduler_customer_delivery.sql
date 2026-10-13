alter table public.work_scheduler_items
  add column if not exists delivery_for text,
  add column if not exists customer_id uuid references public.crm_companies(id) on delete set null,
  add column if not exists customer_name_snapshot text,
  add column if not exists customer_contact_snapshot text,
  add column if not exists customer_phone_snapshot text,
  add column if not exists customer_address_snapshot text;

alter table public.work_scheduler_items
  drop constraint if exists work_scheduler_items_work_type_check;

alter table public.work_scheduler_items
  add constraint work_scheduler_items_work_type_check
  check (work_type in ('GENERAL','CUSTOMER_FOLLOW_UP','PRODUCT_DELIVERY','PROJECT_SITE_VISIT','OTHER'));

alter table public.work_scheduler_items
  add constraint work_scheduler_items_delivery_for_check
  check (delivery_for is null or delivery_for in ('CUSTOMER','OTHER'));

create index if not exists work_scheduler_items_customer_idx
  on public.work_scheduler_items(customer_id)
  where customer_id is not null;

notify pgrst, 'reload schema';
