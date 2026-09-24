-- Allow an explicitly authorized employee manager to assign permissions to
-- other employees while preserving the existing atomic update and audit trail.
create or replace function public.admin_set_profile_permissions(
  actor_profile_id uuid,
  target_profile_id uuid,
  requested_template_id uuid,
  allowed_permission_keys text[] default '{}',
  denied_permission_keys text[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_record public.profiles%rowtype;
  target_record public.profiles%rowtype;
  valid_count integer;
  requested_count integer;
  actor_can_manage boolean := false;
begin
  select * into actor_record from public.profiles where id=actor_profile_id;
  select * into target_record from public.profiles where id=target_profile_id for update;

  if actor_record.id is not null and actor_record.status='active' then
    actor_can_manage := actor_record.role='admin' or (
      actor_record.role='employee' and exists(
        select 1
        from public.effective_permissions_for_profile(actor_profile_id)
        where permission_key='employees.manage_permissions'
      )
    );
  end if;
  if not actor_can_manage then
    raise exception 'Active administrator or employee permission manager required';
  end if;
  if actor_profile_id=target_profile_id then
    raise exception 'Permission managers cannot edit their own permissions';
  end if;
  if target_record.id is null or target_record.role<>'employee' then
    raise exception 'Permissions can only be assigned to employees';
  end if;
  if not exists(
    select 1 from public.permission_templates
    where id=requested_template_id and is_active
  ) then
    raise exception 'Active template required';
  end if;
  if allowed_permission_keys && denied_permission_keys then
    raise exception 'A permission cannot be both allowed and denied';
  end if;

  requested_count:=coalesce(array_length(allowed_permission_keys,1),0)+coalesce(array_length(denied_permission_keys,1),0);
  select count(*) into valid_count
  from public.permissions
  where is_active and key=any(allowed_permission_keys||denied_permission_keys);
  if valid_count<>requested_count then
    raise exception 'One or more permission keys are invalid or duplicated';
  end if;

  update public.profile_permission_templates
  set is_active=false
  where profile_id=target_profile_id and is_active;
  insert into public.profile_permission_templates(profile_id,template_id,assigned_by,is_active)
  values(target_profile_id,requested_template_id,actor_profile_id,true);

  update public.profile_permission_overrides
  set is_active=false,updated_at=now()
  where profile_id=target_profile_id and is_active;
  insert into public.profile_permission_overrides(profile_id,permission_id,effect,assigned_by,is_active)
    select target_profile_id,id,'allow'::public.permission_effect,actor_profile_id,true
    from public.permissions where key=any(allowed_permission_keys)
    on conflict(profile_id,permission_id) do update
    set effect='allow',assigned_by=excluded.assigned_by,is_active=true,updated_at=now();
  insert into public.profile_permission_overrides(profile_id,permission_id,effect,assigned_by,is_active)
    select target_profile_id,id,'deny'::public.permission_effect,actor_profile_id,true
    from public.permissions where key=any(denied_permission_keys)
    on conflict(profile_id,permission_id) do update
    set effect='deny',assigned_by=excluded.assigned_by,is_active=true,updated_at=now();

  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_record.role,
    target_profile_id,
    'permissions.overrides_updated',
    'permissions',
    'profile',
    target_profile_id::text,
    'Employee permission template and overrides updated.',
    jsonb_build_object('template_id',requested_template_id,'allowed',allowed_permission_keys,'denied',denied_permission_keys)
  );
end;
$$;
revoke all on function public.admin_set_profile_permissions(uuid,uuid,uuid,text[],text[]) from public,anon,authenticated;
grant execute on function public.admin_set_profile_permissions(uuid,uuid,uuid,text[],text[]) to service_role;
comment on function public.admin_set_profile_permissions(uuid,uuid,uuid,text[],text[]) is
  'Atomically updates another employee permissions for an active admin or an employee with employees.manage_permissions; self-updates are forbidden.';
