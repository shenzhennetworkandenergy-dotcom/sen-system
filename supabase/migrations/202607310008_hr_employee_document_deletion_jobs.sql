-- Coordinate private storage cleanup and audited HR document deletion.

create table public.hr_employee_document_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  document_ids uuid[] not null,
  storage_paths text[] not null,
  document_snapshot jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'failed', 'completed')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index hr_employee_document_deletion_jobs_pending_idx
on public.hr_employee_document_deletion_jobs(
  actor_profile_id, employee_record_id, created_at desc
)
where status = 'pending';

alter table public.hr_employee_document_deletion_jobs enable row level security;

create or replace function public.admin_prepare_hr_employee_document_deletion(
  actor_profile_id uuid,
  requested_employee_id uuid,
  requested_document_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  document_snapshot jsonb;
  existing_job public.hr_employee_document_deletion_jobs%rowtype;
  matching_count integer;
  new_job public.hr_employee_document_deletion_jobs%rowtype;
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

  select *
  into existing_job
  from public.hr_employee_document_deletion_jobs as deletion_job
  where deletion_job.actor_profile_id =
      admin_prepare_hr_employee_document_deletion.actor_profile_id
    and deletion_job.employee_record_id = requested_employee_id
    and deletion_job.status = 'pending'
    and deletion_job.document_ids @> requested_document_ids
    and deletion_job.document_ids <@ requested_document_ids
  order by deletion_job.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'job_id', existing_job.id,
      'storage_paths', to_jsonb(existing_job.storage_paths),
      'resumed', true
    );
  end if;

  select
    count(*),
    array_agg(storage_path order by storage_path),
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'storage_path', storage_path,
        'mime_type', mime_type,
        'size_bytes', size_bytes
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

  insert into public.hr_employee_document_deletion_jobs(
    actor_profile_id,
    employee_record_id,
    document_ids,
    storage_paths,
    document_snapshot
  ) values (
    admin_prepare_hr_employee_document_deletion.actor_profile_id,
    requested_employee_id,
    requested_document_ids,
    storage_paths,
    document_snapshot
  )
  returning * into new_job;

  return jsonb_build_object(
    'job_id', new_job.id,
    'storage_paths', to_jsonb(new_job.storage_paths),
    'resumed', false
  );
end;
$$;

create or replace function public.admin_finalize_hr_employee_document_deletion(
  actor_profile_id uuid,
  requested_job_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.account_role;
  deleted_count integer;
  job public.hr_employee_document_deletion_jobs%rowtype;
begin
  perform public.assert_hr_admin(actor_profile_id);

  select *
  into job
  from public.hr_employee_document_deletion_jobs as deletion_job
  where deletion_job.id = requested_job_id
    and deletion_job.actor_profile_id =
      admin_finalize_hr_employee_document_deletion.actor_profile_id
  for update;

  if not found or job.status <> 'pending' then
    raise exception 'The document deletion job is not available to finalize';
  end if;

  delete from public.hr_employee_documents
  where employee_record_id = job.employee_record_id
    and id = any(job.document_ids);
  get diagnostics deleted_count = row_count;

  if deleted_count <> cardinality(job.document_ids) then
    raise exception 'Not all selected employee document records could be deleted';
  end if;

  select role into actor_role
  from public.profiles
  where id = admin_finalize_hr_employee_document_deletion.actor_profile_id;

  insert into public.audit_logs(
    actor_id, actor_role, action, module, entity_type, entity_id,
    description, old_values
  ) values (
    admin_finalize_hr_employee_document_deletion.actor_profile_id,
    actor_role,
    'hr.documents_deleted_permanently',
    'hr',
    'employee_document_batch',
    job.document_ids[1]::text,
    deleted_count || ' employee document(s) permanently deleted.',
    jsonb_build_object(
      'employee_id', job.employee_record_id,
      'document_ids', to_jsonb(job.document_ids),
      'documents', job.document_snapshot,
      'deletion_job_id', job.id,
      'deleted_count', deleted_count
    )
  );

  update public.hr_employee_document_deletion_jobs
  set status = 'completed',
      completed_at = now(),
      error_message = null
  where id = job.id;

  return deleted_count;
end;
$$;

create or replace function public.admin_fail_hr_employee_document_deletion(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_error_message text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_hr_admin(actor_profile_id);

  update public.hr_employee_document_deletion_jobs as deletion_job
  set status = 'failed',
      error_message = left(
        coalesce(nullif(trim(requested_error_message), ''), 'Storage cleanup failed'),
        500
      )
  where deletion_job.id = requested_job_id
    and deletion_job.actor_profile_id =
      admin_fail_hr_employee_document_deletion.actor_profile_id
    and status = 'pending';
end;
$$;

revoke all on table public.hr_employee_document_deletion_jobs
from public, anon, authenticated;

revoke all on function public.admin_prepare_hr_employee_document_deletion(
  uuid, uuid, uuid[]
) from public, anon, authenticated;
revoke all on function public.admin_finalize_hr_employee_document_deletion(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function public.admin_fail_hr_employee_document_deletion(
  uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.admin_prepare_hr_employee_document_deletion(
  uuid, uuid, uuid[]
) to service_role;
grant execute on function public.admin_finalize_hr_employee_document_deletion(
  uuid, uuid
) to service_role;
grant execute on function public.admin_fail_hr_employee_document_deletion(
  uuid, uuid, text
) to service_role;

drop function if exists public.admin_delete_hr_employee_documents(
  uuid, uuid, uuid[]
);
