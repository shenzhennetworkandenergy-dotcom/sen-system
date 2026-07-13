-- One-time manual bootstrap for the first SEN administrator.
-- Run only after shafayet445@gmail.com has registered through Supabase Auth.
-- This does not create an auth account or password and must never be exposed via public APIs.
do $$
declare target_user_id uuid;
begin
  select id into target_user_id from auth.users where lower(email) = lower('shafayet445@gmail.com') limit 1;
  if target_user_id is null then
    raise exception 'First admin email shafayet445@gmail.com does not exist in auth.users. Register it before running this script.';
  end if;
  update public.profiles set role = 'admin', status = 'active', updated_by = target_user_id where id = target_user_id;
  insert into public.audit_logs (actor_user_id, actor_role, action, module, entity_type, entity_id, description, old_values, new_values)
  values (target_user_id, 'admin', 'first_admin_bootstrapped', 'admin', 'profile', target_user_id::text, 'First SEN administrator role was bootstrapped manually.', null, jsonb_build_object('role','admin','status','active'));
end $$;
