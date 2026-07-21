-- Avoid querying profiles recursively from within its own RLS policies.
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_current_user_admin());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_current_user_admin())
with check (auth.uid() = id or public.is_current_user_admin());
