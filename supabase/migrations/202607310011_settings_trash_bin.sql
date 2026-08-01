begin;

alter table public.archive_entries
  drop constraint if exists archive_entries_entity_type_check;

alter table public.archive_entries
  add constraint archive_entries_entity_type_check
  check (
    entity_type in (
      'product',
      'user',
      'brand',
      'attribute',
      'business_category',
      'employee'
    )
  );

create or replace function public.admin_restore_trash_entries(
  actor_profile_id uuid,
  requested_entry_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.archive_entries%rowtype;
  actor_role public.account_role;
  selected_count integer;
  restored_count integer := 0;
  affected_count integer;
  previous_status text;
  selected_distinct_count integer;
begin
  perform public.assert_hr_admin(actor_profile_id);

  if requested_entry_ids is null
     or cardinality(requested_entry_ids) not between 1 and 100 then
    raise exception 'Select between 1 and 100 Trash Bin items';
  end if;

  select count(distinct selected_id)
    into selected_distinct_count
  from unnest(requested_entry_ids) as selected(selected_id);

  if selected_distinct_count <> cardinality(requested_entry_ids) then
    raise exception 'Trash Bin selection contains duplicate items';
  end if;

  perform 1
  from public.archive_entries as archive_entry
  where archive_entry.id = any(requested_entry_ids)
  for update;

  select count(*)
    into selected_count
  from public.archive_entries as archive_entry
  where archive_entry.id = any(requested_entry_ids);

  if selected_count <> cardinality(requested_entry_ids) then
    raise exception 'One or more selected Trash Bin items no longer exist';
  end if;

  select profile.role
    into actor_role
  from public.profiles as profile
  where profile.id = actor_profile_id;

  for entry_row in
    select archive_entry.*
    from public.archive_entries as archive_entry
    where archive_entry.id = any(requested_entry_ids)
    order by archive_entry.archived_at, archive_entry.id
  loop
    affected_count := 0;

    if entry_row.entity_type = 'product' then
      previous_status :=
        case
          when entry_row.metadata->>'previous_status' in ('active', 'draft')
            then entry_row.metadata->>'previous_status'
          else 'draft'
        end;
      update public.products
      set status = previous_status,
          archived_at = null,
          archived_by = null,
          archive_reason = null,
          updated_by = actor_profile_id,
          updated_at = now()
      where id = entry_row.entity_id;
      get diagnostics affected_count = row_count;

    elsif entry_row.entity_type = 'user' then
      previous_status :=
        case
          when entry_row.metadata->>'previous_status'
            in ('active', 'suspended', 'disabled')
            then entry_row.metadata->>'previous_status'
          else 'active'
        end;
      update public.profiles
      set status = previous_status::public.account_status,
          archived_at = null,
          archived_by = null,
          archive_reason = null,
          updated_at = now()
      where id = entry_row.entity_id;
      get diagnostics affected_count = row_count;

    elsif entry_row.entity_type = 'brand' then
      update public.brands
      set is_active = true,
          updated_at = now()
      where id = entry_row.entity_id;
      get diagnostics affected_count = row_count;

    elsif entry_row.entity_type = 'attribute' then
      update public.attributes
      set is_active = true,
          updated_at = now()
      where id = entry_row.entity_id;
      get diagnostics affected_count = row_count;

    elsif entry_row.entity_type = 'business_category' then
      update public.business_categories
      set is_active = true,
          archived_at = null,
          updated_by = actor_profile_id,
          updated_at = now()
      where id = entry_row.entity_id;
      get diagnostics affected_count = row_count;

    elsif entry_row.entity_type = 'employee' then
      previous_status :=
        case
          when entry_row.metadata->>'previous_status'
            in ('active', 'probation', 'on_leave', 'terminated')
            then entry_row.metadata->>'previous_status'
          else 'active'
        end;
      update public.hr_employee_records
      set employment_status = previous_status,
          archived_at = null,
          archived_by = null,
          updated_by = actor_profile_id,
          updated_at = now()
      where id = entry_row.entity_id;
      get diagnostics affected_count = row_count;
    end if;

    if affected_count <> 1 then
      raise exception 'The archived % record % no longer exists',
        entry_row.entity_type,
        entry_row.entity_id;
    end if;

    insert into public.audit_logs (
      actor_id,
      actor_role,
      target_profile_id,
      action,
      module,
      entity_type,
      entity_id,
      description,
      old_values,
      new_values
    )
    values (
      actor_profile_id,
      actor_role,
      case
        when entry_row.entity_type = 'user' then entry_row.entity_id
        else null
      end,
      entry_row.entity_type || '.restored_from_trash',
      case
        when entry_row.entity_type = 'user' then 'users'
        when entry_row.entity_type = 'employee' then 'hr'
        else 'products'
      end,
      entry_row.entity_type,
      entry_row.entity_id::text,
      entry_row.display_name || ' restored from the Trash Bin.',
      jsonb_build_object(
        'archived', true,
        'archive_entry', to_jsonb(entry_row)
      ),
      jsonb_build_object('archived', false)
    );

    delete from public.archive_entries
    where id = entry_row.id;

    restored_count := restored_count + 1;
  end loop;

  return restored_count;
end;
$$;

revoke all on function public.admin_restore_trash_entries(uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_restore_trash_entries(uuid,uuid[])
  to service_role;

commit;
