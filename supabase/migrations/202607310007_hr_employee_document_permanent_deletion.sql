-- Initial transactional HR document deletion function, superseded by 202607310008.

create or replace function public.admin_delete_hr_employee_documents(
  actor_profile_id uuid,
  requested_employee_id uuid,
  requested_document_ids uuid[]
) returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.account_role;
  deleted_count integer;
  document_snapshot jsonb;
  matching_count integer;
  permanent_deletion_enabled boolean;
  storage_paths text[];
begin
  perform public.assert_hr_admin(actor_profile_id);

  if coalesce(array_length(requested_document_ids, 1), 0) = 0
     or array_length(requested_document_ids, 1) > 50 then
    raise exception 'Select between 1 and 50 employee documents';
  end if;

  select coalesce(value ->> 'permanent_deletion_enabled' = 'true', false)
  into permanent_deletion_enabled
  from public.system_settings
  where key = 'admin_deletion';

  if not coalesce(permanent_deletion_enabled, false) then
    raise exception 'Permanent Deletion Mode is disabled';
  end if;

  select
    count(*),
    array_agg(storage_path order by storage_path),
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'storage_path', storage_path
      )
      order by storage_path
    )
  into matching_count, storage_paths, document_snapshot
  from public.hr_employee_documents
  where employee_record_id = requested_employee_id
    and id = any(requested_document_ids);

  if matching_count <> cardinality(requested_document_ids) then
    raise exception 'One or more selected documents do not belong to this employee';
  end if;

  delete from public.hr_employee_documents
  where employee_record_id = requested_employee_id
    and id = any(requested_document_ids);
  get diagnostics deleted_count = row_count;

  if deleted_count <> cardinality(requested_document_ids) then
    raise exception 'Not all selected employee documents could be deleted';
  end if;

  select role into actor_role
  from public.profiles
  where id = actor_profile_id;

  insert into public.audit_logs(
    actor_id, actor_role, action, module, entity_type, entity_id,
    description, old_values
  ) values (
    actor_profile_id,
    actor_role,
    'hr.documents_deleted_permanently',
    'hr',
    'employee_document_batch',
    requested_document_ids[1]::text,
    deleted_count || ' employee document(s) permanently deleted.',
    jsonb_build_object(
      'employee_id', requested_employee_id,
      'document_ids', to_jsonb(requested_document_ids),
      'documents', document_snapshot,
      'deleted_count', deleted_count
    )
  );

  return storage_paths;
end;
$$;

revoke all on function public.admin_delete_hr_employee_documents(
  uuid, uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.admin_delete_hr_employee_documents(
  uuid, uuid, uuid[]
) to service_role;
