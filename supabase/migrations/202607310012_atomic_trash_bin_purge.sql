begin;

alter table public.archive_entries
  add column if not exists purge_token uuid,
  add column if not exists purge_started_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists purge_started_at timestamptz;

create or replace function public.prevent_claimed_trash_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.purge_token is not null
     and coalesce(
       current_setting('sen.allow_claimed_trash_delete', true),
       'off'
     ) <> 'on' then
    raise exception 'This Trash Bin item is being permanently deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_claimed_trash_deletion
  on public.archive_entries;
create trigger protect_claimed_trash_deletion
before delete on public.archive_entries
for each row execute function public.prevent_claimed_trash_deletion();

create or replace function public.admin_purge_trash_database_entry(
  actor_profile_id uuid,
  requested_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.archive_entries%rowtype;
  actor_role public.account_role;
  deleted_count integer;
  media_paths text[];
  permanent_deletion_enabled boolean;
begin
  perform public.assert_hr_admin(actor_profile_id);

  select coalesce(value ->> 'permanent_deletion_enabled' = 'true', false)
    into permanent_deletion_enabled
  from public.system_settings
  where key = 'admin_deletion';
  if not coalesce(permanent_deletion_enabled, false) then
    raise exception 'Permanent Deletion Mode is disabled';
  end if;

  select *
    into entry_row
  from public.archive_entries
  where id = requested_entry_id
  for update;
  if not found then
    raise exception 'The selected Trash Bin item no longer exists';
  end if;
  if entry_row.purge_token is not null then
    raise exception 'The selected Trash Bin item is already being deleted';
  end if;
  if entry_row.entity_type = 'user' then
    raise exception 'User accounts require the Auth deletion workflow';
  end if;
  if entry_row.entity_type = 'product' then
    raise exception 'Products require the Storage cleanup workflow';
  end if;

  if entry_row.entity_type = 'product' then
    if exists(select 1 from public.inventory_balances where product_id=entry_row.entity_id)
      or exists(select 1 from public.inventory_movement_items where product_id=entry_row.entity_id)
      or exists(select 1 from public.inventory_reservations where product_id=entry_row.entity_id)
      or exists(select 1 from public.serial_numbers where product_id=entry_row.entity_id)
      or exists(select 1 from public.serial_generation_batches where product_id=entry_row.entity_id)
      or exists(select 1 from public.sales_order_items where product_id=entry_row.entity_id)
      or exists(select 1 from public.purchase_order_items where product_id=entry_row.entity_id)
      or exists(select 1 from public.purchase_receipt_items where product_id=entry_row.entity_id)
      or exists(select 1 from public.shopping_cart_items where product_id=entry_row.entity_id)
      or exists(select 1 from public.quotation_request_items where product_id=entry_row.entity_id)
      or exists(select 1 from public.product_variations where product_id=entry_row.entity_id)
    then
      raise exception 'This product has protected inventory, order, purchasing, customer, serial, or variation history';
    end if;

    select coalesce(array_agg(storage_path order by storage_path), array[]::text[])
      into media_paths
    from public.product_media
    where product_id = entry_row.entity_id;

    delete from public.product_identifier_history
    where product_id = entry_row.entity_id;
    delete from public.product_revisions
    where product_id = entry_row.entity_id;
    delete from public.products where id = entry_row.entity_id;
    get diagnostics deleted_count = row_count;

  elsif entry_row.entity_type = 'brand' then
    if exists(select 1 from public.products where brand_id=entry_row.entity_id) then
      raise exception 'This brand is assigned to products';
    end if;
    delete from public.brands where id=entry_row.entity_id;
    get diagnostics deleted_count = row_count;

  elsif entry_row.entity_type = 'attribute' then
    if exists(
      select 1 from public.product_attributes
      where attribute_id=entry_row.entity_id
    ) then
      raise exception 'This attribute is assigned to products';
    end if;
    delete from public.attributes where id=entry_row.entity_id;
    get diagnostics deleted_count = row_count;

  elsif entry_row.entity_type = 'business_category' then
    if exists(
      select 1 from public.products
      where business_category_id=entry_row.entity_id
    ) or exists(
      select 1 from public.product_categories
      where business_category_id=entry_row.entity_id
    ) then
      raise exception 'This business category is assigned to products or product categories';
    end if;
    delete from public.business_categories where id=entry_row.entity_id;
    get diagnostics deleted_count = row_count;

  elsif entry_row.entity_type = 'employee' then
    if exists(select 1 from public.hr_attendance where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_leave_requests where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_leave_balances where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_attendance_correction_requests where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_payroll_records where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_performance_reviews where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_performance_goals where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_employee_documents where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_attendance_events where employee_record_id=entry_row.entity_id)
      or exists(select 1 from public.hr_employee_document_deletion_jobs where employee_record_id=entry_row.entity_id)
    then
      raise exception 'This employee has protected attendance, leave, payroll, performance, document, or device history';
    end if;

    delete from public.hr_employee_work_schedules
    where employee_record_id=entry_row.entity_id;
    delete from public.hr_device_employee_mappings
    where employee_record_id=entry_row.entity_id;
    delete from public.hr_employee_profiles
    where employee_record_id=entry_row.entity_id;
    delete from public.hr_employee_records
    where id=entry_row.entity_id;
    get diagnostics deleted_count = row_count;

  else
    raise exception 'This Trash Bin record type is not supported';
  end if;

  if deleted_count <> 1 then
    raise exception 'The archived target record no longer exists';
  end if;

  select role into actor_role
  from public.profiles
  where id=actor_profile_id;

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,
    description,old_values
  ) values (
    actor_profile_id,
    actor_role,
    entry_row.entity_type || '.deleted_from_trash',
    case when entry_row.entity_type='employee' then 'hr' else 'products' end,
    entry_row.entity_type,
    entry_row.entity_id::text,
    entry_row.display_name || ' permanently deleted from the Trash Bin.',
    jsonb_build_object('archive_entry',to_jsonb(entry_row))
  );

  delete from public.archive_entries where id=entry_row.id;

  return jsonb_build_object(
    'entity_type',entry_row.entity_type,
    'entity_id',entry_row.entity_id,
    'storage_paths',coalesce(to_jsonb(media_paths),'[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_prepare_trash_user_purge(
  actor_profile_id uuid,
  requested_entry_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.archive_entries%rowtype;
  target_role public.account_role;
  previous_status text;
  active_admin_count integer;
  permanent_deletion_enabled boolean;
  result_token uuid := gen_random_uuid();
begin
  perform public.assert_hr_admin(actor_profile_id);
  select coalesce(value ->> 'permanent_deletion_enabled' = 'true', false)
    into permanent_deletion_enabled
  from public.system_settings where key='admin_deletion';
  if not coalesce(permanent_deletion_enabled,false) then
    raise exception 'Permanent Deletion Mode is disabled';
  end if;

  select * into entry_row
  from public.archive_entries
  where id=requested_entry_id and entity_type='user'
  for update;
  if not found then raise exception 'The selected user is no longer in the Trash Bin'; end if;
  if entry_row.purge_token is not null then
    raise exception 'This user account is already being permanently deleted';
  end if;
  if entry_row.entity_id=actor_profile_id then
    raise exception 'You cannot delete your own administrator account';
  end if;

  select role into target_role from public.profiles where id=entry_row.entity_id;
  if target_role is null then
    raise exception 'The archived user account no longer exists';
  end if;
  previous_status := coalesce(entry_row.metadata->>'previous_status','disabled');
  if target_role='admin' and previous_status='active' then
    select count(*) into active_admin_count
    from public.profiles
    where role='admin' and status='active' and archived_at is null;
    if active_admin_count=0 then
      raise exception 'The final active administrator cannot be deleted';
    end if;
  end if;

  if exists(
    select 1 from public.sales_orders
    where customer_profile_id=entry_row.entity_id
       or created_by=entry_row.entity_id
       or updated_by=entry_row.entity_id
  ) or exists(
    select 1 from public.products
    where created_by=entry_row.entity_id or updated_by=entry_row.entity_id
  ) or exists(
    select 1 from public.inventory_movements
    where initiated_by=entry_row.entity_id
  ) or exists(
    select 1 from public.purchase_orders
    where created_by=entry_row.entity_id or updated_by=entry_row.entity_id
  ) or exists(
    select 1 from public.journal_entries
    where created_by=entry_row.entity_id or posted_by=entry_row.entity_id
  ) then
    raise exception 'This account owns protected operational history';
  end if;

  update public.archive_entries
  set purge_token=result_token,
      purge_started_by=actor_profile_id,
      purge_started_at=now()
  where id=entry_row.id;
  return result_token;
end;
$$;

create or replace function public.admin_finalize_trash_user_purge(
  actor_profile_id uuid,
  requested_entry_id uuid,
  requested_purge_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.archive_entries%rowtype;
  actor_role public.account_role;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select * into entry_row
  from public.archive_entries
  where id=requested_entry_id
    and entity_type='user'
    and purge_token=requested_purge_token
  for update;
  if not found then raise exception 'The user deletion claim is no longer valid'; end if;
  if exists(select 1 from public.profiles where id=entry_row.entity_id) then
    raise exception 'The user account still exists and cannot be finalized';
  end if;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,
    description,old_values
  ) values (
    actor_profile_id,actor_role,'account.deleted_from_trash','users','user',
    entry_row.entity_id::text,
    entry_row.display_name || ' permanently deleted from the Trash Bin.',
    jsonb_build_object('archive_entry',to_jsonb(entry_row))
  );

  perform set_config('sen.allow_claimed_trash_delete','on',true);
  delete from public.archive_entries where id=entry_row.id;
end;
$$;

create or replace function public.admin_release_trash_user_purge(
  actor_profile_id uuid,
  requested_entry_id uuid,
  requested_purge_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_hr_admin(actor_profile_id);
  update public.archive_entries
  set purge_token=null,purge_started_by=null,purge_started_at=null
  where id=requested_entry_id
    and entity_type='user'
    and purge_token=requested_purge_token
    and (
      purge_started_by=actor_profile_id
      or purge_started_at < now() - interval '15 minutes'
    );
end;
$$;

create or replace function public.admin_prepare_trash_product_purge(
  actor_profile_id uuid,
  requested_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.archive_entries%rowtype;
  media_paths text[];
  permanent_deletion_enabled boolean;
  result_token uuid := gen_random_uuid();
  deleted_count integer;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select coalesce(value ->> 'permanent_deletion_enabled' = 'true', false)
    into permanent_deletion_enabled
  from public.system_settings where key='admin_deletion';
  if not coalesce(permanent_deletion_enabled,false) then
    raise exception 'Permanent Deletion Mode is disabled';
  end if;

  select * into entry_row
  from public.archive_entries
  where id=requested_entry_id and entity_type='product'
  for update;
  if not found then raise exception 'The selected product is no longer in the Trash Bin'; end if;
  if entry_row.purge_token is not null then
    return jsonb_build_object(
      'purge_token',entry_row.purge_token,
      'storage_paths',coalesce(entry_row.metadata->'purge_storage_paths','[]'::jsonb),
      'resumed',true
    );
  end if;

  if exists(select 1 from public.inventory_balances where product_id=entry_row.entity_id)
    or exists(select 1 from public.inventory_movement_items where product_id=entry_row.entity_id)
    or exists(select 1 from public.inventory_reservations where product_id=entry_row.entity_id)
    or exists(select 1 from public.serial_numbers where product_id=entry_row.entity_id)
    or exists(select 1 from public.serial_generation_batches where product_id=entry_row.entity_id)
    or exists(select 1 from public.sales_order_items where product_id=entry_row.entity_id)
    or exists(select 1 from public.purchase_order_items where product_id=entry_row.entity_id)
    or exists(select 1 from public.purchase_receipt_items where product_id=entry_row.entity_id)
    or exists(select 1 from public.shopping_cart_items where product_id=entry_row.entity_id)
    or exists(select 1 from public.quotation_request_items where product_id=entry_row.entity_id)
    or exists(select 1 from public.product_variations where product_id=entry_row.entity_id)
  then
    raise exception 'This product has protected inventory, order, purchasing, customer, serial, or variation history';
  end if;

  select coalesce(array_agg(storage_path order by storage_path),array[]::text[])
    into media_paths
  from public.product_media
  where product_id=entry_row.entity_id;

  delete from public.product_identifier_history where product_id=entry_row.entity_id;
  delete from public.product_revisions where product_id=entry_row.entity_id;
  delete from public.products where id=entry_row.entity_id;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then raise exception 'The archived product no longer exists'; end if;

  update public.archive_entries
  set purge_token=result_token,
      purge_started_by=actor_profile_id,
      purge_started_at=now(),
      metadata=metadata || jsonb_build_object(
        'purge_storage_paths',to_jsonb(media_paths)
      )
  where id=entry_row.id;

  return jsonb_build_object(
    'purge_token',result_token,
    'storage_paths',to_jsonb(media_paths),
    'resumed',false
  );
end;
$$;

create or replace function public.admin_finalize_trash_product_purge(
  actor_profile_id uuid,
  requested_entry_id uuid,
  requested_purge_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.archive_entries%rowtype;
  actor_role public.account_role;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select * into entry_row
  from public.archive_entries
  where id=requested_entry_id
    and entity_type='product'
    and purge_token=requested_purge_token
  for update;
  if not found then raise exception 'The product deletion claim is no longer valid'; end if;
  if exists(select 1 from public.products where id=entry_row.entity_id) then
    raise exception 'The product still exists and cannot be finalized';
  end if;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,
    description,old_values
  ) values (
    actor_profile_id,actor_role,'product.deleted_from_trash','products','product',
    entry_row.entity_id::text,
    entry_row.display_name || ' permanently deleted from the Trash Bin.',
    jsonb_build_object('archive_entry',to_jsonb(entry_row))
  );

  perform set_config('sen.allow_claimed_trash_delete','on',true);
  delete from public.archive_entries where id=entry_row.id;
end;
$$;

create or replace function public.hr_archive_employee(
  actor_profile_id uuid,
  requested_employee_id uuid,
  requested_restore boolean default false
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  employee_row public.hr_employee_records%rowtype;
  target_profile uuid;
  actor_role public.account_role;
  display_name text;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select * into employee_row
  from public.hr_employee_records
  where id=requested_employee_id
  for update;
  if not found then raise exception 'Employee record was not found'; end if;

  select coalesce(profile.full_name,profile.email,employee_row.employee_number)
    into display_name
  from public.profiles as profile
  where profile.id=employee_row.profile_id;

  update public.hr_employee_records set
    archived_at=case when requested_restore then null else now() end,
    archived_by=case when requested_restore then null else actor_profile_id end,
    employment_status=case
      when requested_restore then
        case
          when (
            select metadata->>'previous_status'
            from public.archive_entries
            where entity_type='employee' and entity_id=requested_employee_id
          ) in ('active','probation','on_leave','terminated')
          then (
            select metadata->>'previous_status'
            from public.archive_entries
            where entity_type='employee' and entity_id=requested_employee_id
          )
          else 'active'
        end
      else 'terminated'
    end,
    updated_by=actor_profile_id,
    updated_at=now()
  where id=requested_employee_id
  returning profile_id into target_profile;

  if requested_restore then
    delete from public.archive_entries
    where entity_type='employee' and entity_id=requested_employee_id;
  else
    insert into public.archive_entries(
      entity_type,entity_id,display_name,reason,metadata,archived_by,archived_at
    ) values (
      'employee',requested_employee_id,display_name,'Employee archived from HR',
      jsonb_build_object(
        'employee_number',employee_row.employee_number,
        'previous_status',employee_row.employment_status
      ),
      actor_profile_id,now()
    )
    on conflict(entity_type,entity_id) do update set
      display_name=excluded.display_name,
      reason=excluded.reason,
      metadata=excluded.metadata,
      archived_by=excluded.archived_by,
      archived_at=excluded.archived_at;
  end if;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,
    entity_id,description
  ) values (
    actor_profile_id,actor_role,target_profile,
    case when requested_restore then 'hr.employee_restored' else 'hr.employee_archived' end,
    'hr','employee_record',requested_employee_id::text,
    'Employee HR lifecycle and Trash Bin state changed.'
  );
end;
$$;

revoke all on function public.admin_purge_trash_database_entry(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_prepare_trash_user_purge(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_trash_user_purge(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_release_trash_user_purge(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_prepare_trash_product_purge(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_trash_product_purge(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_purge_trash_database_entry(uuid,uuid)
  to service_role;
grant execute on function public.admin_prepare_trash_user_purge(uuid,uuid)
  to service_role;
grant execute on function public.admin_finalize_trash_user_purge(uuid,uuid,uuid)
  to service_role;
grant execute on function public.admin_release_trash_user_purge(uuid,uuid,uuid)
  to service_role;
grant execute on function public.admin_prepare_trash_product_purge(uuid,uuid)
  to service_role;
grant execute on function public.admin_finalize_trash_product_purge(uuid,uuid,uuid)
  to service_role;

commit;
