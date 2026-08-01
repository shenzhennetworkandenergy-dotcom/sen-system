create table public.serial_label_sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  width_mm numeric(6,2) not null check (width_mm between 10 and 300),
  height_mm numeric(6,2) not null check (height_mm between 10 and 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index serial_label_sizes_name_unique on public.serial_label_sizes (lower(btrim(name)));
create unique index serial_label_sizes_dimensions_unique on public.serial_label_sizes (width_mm, height_mm);

insert into public.serial_label_sizes (name, width_mm, height_mm)
values
  ('50 x 30 mm', 50, 30),
  ('60 x 40 mm', 60, 40)
on conflict do nothing;

alter table public.serial_label_sizes enable row level security;

create policy "authorized staff read serial label sizes"
on public.serial_label_sizes
for select
to authenticated
using (public.current_user_has_permission('serials.print'));

grant select on public.serial_label_sizes to authenticated;
grant all on public.serial_label_sizes to service_role;
