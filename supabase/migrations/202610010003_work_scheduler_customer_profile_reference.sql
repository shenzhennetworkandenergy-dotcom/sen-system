alter table public.work_scheduler_items
  drop constraint if exists work_scheduler_items_customer_id_fkey;

alter table public.work_scheduler_items
  add constraint work_scheduler_items_customer_id_fkey
  foreign key (customer_id) references public.profiles(id) on delete set null;

alter table public.work_scheduler_items
  drop constraint if exists work_scheduler_items_delivery_for_check;

alter table public.work_scheduler_items
  add constraint work_scheduler_items_delivery_for_check
  check (delivery_for is null or delivery_for in ('CUSTOMER', 'OTHER', 'PROJECT_SITE'));

notify pgrst, 'reload schema';
