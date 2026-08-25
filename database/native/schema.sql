-- Generated native PostgreSQL 17 baseline for SEN Windows/LAN operation.
-- Source: verified public schema; Supabase Auth ownership is replaced by local credentials.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
do $$ begin
  create role sen_app nologin bypassrls;
exception when duplicate_object then null; end $$;
grant service_role to sen_app;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('sen.actor_id', true), '')::uuid, nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('sen.actor_role', true), ''), nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', current_user)
$$;

--
-- PostgreSQL database dump
--

\restrict 8xw5WTNkNeDsEs7imcTvQK6SStc1ZEzi7dTUJzAhE1MPOAJkK3Dtdkgbnbu8Mby

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: account_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_role AS ENUM (
    'customer',
    'employee',
    'admin'
);


--
-- Name: account_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_status AS ENUM (
    'active',
    'suspended',
    'disabled'
);


--
-- Name: customer_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.customer_type AS ENUM (
    'individual',
    'company'
);


--
-- Name: permission_effect; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.permission_effect AS ENUM (
    'allow',
    'deny'
);


--
-- Name: activate_nonserialized_purchase_serials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_nonserialized_purchase_serials() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  product_is_serialized boolean;
  receipt_row public.purchase_receipts%rowtype;
  received_serial public.serial_numbers%rowtype;
  first_batch_id uuid;
begin
  select serial_tracking_required into product_is_serialized
  from public.products
  where id=new.product_id;
  if coalesce(product_is_serialized,false) then return new; end if;

  select * into receipt_row
  from public.purchase_receipts
  where id=new.purchase_receipt_id;

  for received_serial in
    update public.serial_numbers
    set warehouse_id=receipt_row.warehouse_id,
        status='available',
        received_at=now(),
        received_by=receipt_row.received_by,
        notes='Received on '||receipt_row.receipt_number,
        last_movement_id=receipt_row.inventory_movement_id,
        updated_at=now()
    where id in(
      select id from public.serial_numbers
      where purchase_order_item_id=new.purchase_order_item_id and status='expected'
      order by generated_at,id
      limit new.quantity_received::integer
    )
    returning *
  loop
    first_batch_id:=coalesce(first_batch_id,received_serial.generation_batch_id);
    insert into public.serial_number_history(
      serial_number_id,event_type,previous_status,new_sen_serial,new_status,
      new_warehouse_id,movement_id,reason,actor_id
    ) values(
      received_serial.id,'received','expected',received_serial.sen_serial,'available',
      receipt_row.warehouse_id,receipt_row.inventory_movement_id,
      'Purchase receipt '||receipt_row.receipt_number,receipt_row.received_by
    );
    perform public.capture_serial_event(
      received_serial.id,receipt_row.inventory_movement_id,null,'serial.received',
      receipt_row.received_by,'Purchase receipt '||receipt_row.receipt_number
    );
  end loop;

  update public.purchase_receipt_items
  set serial_generation_batch_id=first_batch_id
  where id=new.id and first_batch_id is not null;
  update public.serial_generation_batches batches
  set status=case
    when exists(
      select 1 from public.serial_numbers serials
      where serials.generation_batch_id=batches.id and serials.status='expected'
    ) then 'partially_received'
    else 'received'
  end
  where batches.id in(
    select distinct serials.generation_batch_id
    from public.serial_numbers serials
    where serials.purchase_order_item_id=new.purchase_order_item_id
      and serials.generation_batch_id is not null
  );
  return new;
end $$;


--
-- Name: add_shipment_tracking_event(uuid, uuid, uuid, uuid, jsonb, text, text, text, text, text, timestamp with time zone, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_shipment_tracking_event(actor_profile_id uuid, requested_shipment_id uuid, requested_status_id uuid, requested_workplace_id uuid, requested_location jsonb, requested_location_source text, requested_internal_note text, requested_customer_title text, requested_customer_message text, requested_visibility text, requested_occurred_at timestamp with time zone, requested_correction_reason text DEFAULT NULL::text, requested_supersedes_event_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare s public.shipments%rowtype; workplace public.work_locations%rowtype; snapshot jsonb; event_id uuid:=gen_random_uuid(); begin
 perform public.assert_actor_permission(actor_profile_id,'shipments.update_status'); select * into s from public.shipments where id=requested_shipment_id for update; if s.id is null or s.status in('cancelled','delivered') and requested_supersedes_event_id is null then raise exception 'Shipment is not eligible for tracking update'; end if; if not exists(select 1 from public.tracking_status_definitions where id=requested_status_id and is_active) then raise exception 'Active tracking status required'; end if; if requested_visibility not in('internal','customer','both') then raise exception 'Invalid visibility'; end if;
 if requested_workplace_id is not null then select * into workplace from public.work_locations where id=requested_workplace_id and is_active; end if; snapshot:=coalesce(requested_location,case when workplace.id is null then '{}'::jsonb else jsonb_build_object('name',workplace.name,'address',workplace.address_line,'city',workplace.city,'country_code',workplace.country_code,'latitude',workplace.latitude,'longitude',workplace.longitude) end);
 insert into public.shipment_tracking_events(id,shipment_id,order_id,tracking_status_id,actor_profile_id,workplace_id,location_snapshot,latitude,longitude,location_source,transport_mode_snapshot,internal_note,customer_visible_title,customer_visible_message,event_visibility,correction_reason,supersedes_event_id,occurred_at) values(event_id,s.id,s.order_id,requested_status_id,actor_profile_id,requested_workplace_id,snapshot,(snapshot->>'latitude')::numeric,(snapshot->>'longitude')::numeric,coalesce(requested_location_source,case when workplace.id is not null then 'workplace' else 'manual' end),s.transport_mode,left(requested_internal_note,2000),left(requested_customer_title,200),left(requested_customer_message,2000),requested_visibility,left(requested_correction_reason,1000),requested_supersedes_event_id,coalesce(requested_occurred_at,now()));
 update public.shipments set latest_tracking_status_id=requested_status_id,latest_location_snapshot=snapshot,status=case when status='dispatched' then 'in_transit' else status end,updated_by=actor_profile_id,updated_at=now() where id=s.id; return event_id;
end $$;


--
-- Name: admin_adjust_inventory(uuid, uuid, uuid, uuid, numeric, uuid, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_adjust_inventory(actor_profile_id uuid, requested_warehouse_id uuid, requested_product_id uuid, requested_variation_id uuid, quantity_change numeric, requested_reason_id uuid, requested_notes text, requested_serials text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare p public.products%rowtype; b public.inventory_balances%rowtype; r public.stock_adjustment_reasons%rowtype; m_id uuid:=gen_random_uuid(); new_on_hand numeric; actor_role public.account_role; affected_serials integer;
begin
  if quantity_change is null or quantity_change=0 then raise exception 'Quantity change cannot be zero'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='inventory.adjust_stock') then raise exception 'Permission denied'; end if;
  select * into p from public.products where id=requested_product_id and status<>'archived'; if p.id is null then raise exception 'Product not found'; end if;
  select * into r from public.stock_adjustment_reasons where id=requested_reason_id and is_active; if r.id is null then raise exception 'Active adjustment reason required'; end if;
  if quantity_change>0 and r.direction='decrease' then raise exception 'Selected reason only permits stock decreases'; end if;
  if quantity_change<0 and r.direction='increase' then raise exception 'Selected reason only permits stock increases'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if p.serial_tracking_required and (quantity_change<>trunc(quantity_change) or coalesce(array_length(requested_serials,1),0)<>abs(quantity_change)::integer or (select count(distinct trim(s)) from unnest(requested_serials) s)<>abs(quantity_change)::integer) then raise exception 'Every serialized unit requires one unique serial number'; end if;
  if p.serial_tracking_required and quantity_change<0 and (select count(*) from public.serial_numbers where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available')<>abs(quantity_change)::integer then raise exception 'One or more serials are unavailable'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(requested_warehouse_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select * into b from public.inventory_balances where warehouse_id=requested_warehouse_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null for update;
  if p.serial_tracking_required and quantity_change<0 and (select count(*) from public.serial_numbers where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available')<>abs(quantity_change)::integer then raise exception 'One or more serials are unavailable'; end if;
  new_on_hand:=b.on_hand+quantity_change; if new_on_hand<0 or new_on_hand<b.reserved+b.damaged+b.unavailable then raise exception 'Insufficient available stock'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,destination_warehouse_id,source_warehouse_id,reason_id,notes,initiated_by,confirmed_at) values(m_id,'ADJ-'||upper(substr(replace(m_id::text,'-',''),1,12)),case when b.on_hand=0 and quantity_change>0 then 'opening_balance' else 'manual_adjustment' end,'confirmed',case when quantity_change>0 then requested_warehouse_id end,case when quantity_change<0 then requested_warehouse_id end,requested_reason_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=new_on_hand,updated_at=now() where id=b.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,requested_warehouse_id,quantity_change,new_on_hand);
  if p.serial_tracking_required and quantity_change>0 then insert into public.serial_numbers(manufacturer_serial,product_id,variation_id,warehouse_id,last_movement_id) select distinct trim(s),requested_product_id,requested_variation_id,requested_warehouse_id,m_id from unnest(requested_serials) s; end if;
  if p.serial_tracking_required and quantity_change<0 then update public.serial_numbers set status='removed',last_movement_id=m_id,updated_at=now() where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available'; get diagnostics affected_serials=row_count; if affected_serials<>abs(quantity_change)::integer then raise exception 'One or more serials are unavailable'; end if; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.adjusted','inventory','inventory_movement',m_id::text,'Inventory quantity adjusted.',jsonb_build_object('product_id',requested_product_id,'variation_id',requested_variation_id,'warehouse_id',requested_warehouse_id,'quantity_change',quantity_change,'reason',r.key));
  return m_id;
end $$;


--
-- Name: admin_adjust_serialized_inventory(uuid, uuid, uuid, uuid, integer, uuid, text, uuid[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_adjust_serialized_inventory(actor_profile_id uuid, requested_warehouse_id uuid, requested_product_id uuid, requested_variation_id uuid, quantity_change integer, requested_reason_id uuid, requested_notes text, requested_serial_ids uuid[] DEFAULT '{}'::uuid[], requested_manufacturer_serials text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare p public.products%rowtype; b public.inventory_balances%rowtype; r public.stock_adjustment_reasons%rowtype; m_id uuid:=gen_random_uuid(); actor_role public.account_role; new_on_hand numeric; serial_id uuid; generated text; manufacturer text; normalized text; i integer; affected integer;
begin
  if quantity_change=0 then raise exception 'Quantity change cannot be zero'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key=case when quantity_change>0 then 'inventory.receive' else 'inventory.adjust_stock' end) then raise exception 'Permission denied'; end if;
  select * into p from public.products where id=requested_product_id and serial_tracking_required and status<>'archived'; if p.id is null then raise exception 'Serialized product not found'; end if;
  select * into r from public.stock_adjustment_reasons where id=requested_reason_id and is_active; if r.id is null then raise exception 'Active adjustment reason required'; end if;
  if quantity_change>0 and r.direction='decrease' or quantity_change<0 and r.direction='increase' then raise exception 'Selected reason does not permit this direction'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if quantity_change>0 and coalesce(array_length(requested_serial_ids,1),0) not in(0,quantity_change) then raise exception 'Serial count must equal quantity'; end if;
  if quantity_change<0 and coalesce(array_length(requested_serial_ids,1),0)<>abs(quantity_change) then raise exception 'Serial count must equal quantity'; end if;
  if (select count(distinct x) from unnest(requested_serial_ids) x)<>coalesce(array_length(requested_serial_ids,1),0) then raise exception 'Duplicate serial selection'; end if;
  if (select role from public.profiles where id=actor_profile_id)='employee' and not exists(select 1 from public.profile_work_locations pw join public.work_locations wl on wl.id=pw.work_location_id where pw.profile_id=actor_profile_id and pw.is_primary and pw.is_active and wl.is_active) then raise exception 'A verified primary workplace is required'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(requested_warehouse_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select * into b from public.inventory_balances where warehouse_id=requested_warehouse_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null for update;
  new_on_hand:=b.on_hand+quantity_change; if new_on_hand<0 or new_on_hand<b.reserved+b.damaged+b.unavailable then raise exception 'Insufficient available stock'; end if;
  if quantity_change>0 and array_length(requested_serial_ids,1) is not null and (select count(*) from public.serial_numbers where id=any(requested_serial_ids) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and status='expected')<>quantity_change then raise exception 'One or more expected serials are invalid'; end if;
  if quantity_change<0 and (select count(*) from public.serial_numbers where id=any(requested_serial_ids) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available')<>abs(quantity_change) then raise exception 'One or more selected serials are unavailable'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,destination_warehouse_id,source_warehouse_id,reason_id,notes,initiated_by,confirmed_at) values(m_id,'ADJ-'||upper(substr(replace(m_id::text,'-',''),1,12)),case when quantity_change>0 then 'purchase_receipt' else 'manual_adjustment' end,'confirmed',case when quantity_change>0 then requested_warehouse_id end,case when quantity_change<0 then requested_warehouse_id end,requested_reason_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=new_on_hand,updated_at=now() where id=b.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,requested_warehouse_id,quantity_change,new_on_hand);
  if quantity_change>0 and array_length(requested_serial_ids,1) is not null then
    update public.serial_numbers set warehouse_id=requested_warehouse_id,status='available',received_at=now(),received_by=actor_profile_id,last_movement_id=m_id,updated_at=now() where id=any(requested_serial_ids); get diagnostics affected=row_count;
    foreach serial_id in array requested_serial_ids loop insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,new_warehouse_id,movement_id,reason,actor_id) values(serial_id,'received','expected','available',requested_warehouse_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.received',actor_profile_id,requested_notes); end loop;
  elsif quantity_change>0 then
    for i in 1..quantity_change loop manufacturer:=nullif(trim(coalesce(requested_manufacturer_serials[i],'')),''); normalized:=public.normalize_manufacturer_serial(manufacturer); if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized) then raise exception 'Manufacturer serial already exists: %',manufacturer; end if; generated:=public.next_sen_serial(requested_product_id); serial_id:=gen_random_uuid(); insert into public.serial_numbers(id,manufacturer_serial,manufacturer_serial_normalized,sen_serial,barcode_value,product_id,variation_id,warehouse_id,status,condition,last_movement_id,generated_at,generated_by,received_at,received_by) values(serial_id,manufacturer,normalized,generated,generated,requested_product_id,requested_variation_id,requested_warehouse_id,'available','new',m_id,now(),actor_profile_id,now(),actor_profile_id); insert into public.serial_number_history(serial_number_id,event_type,new_sen_serial,new_manufacturer_serial,new_status,new_warehouse_id,movement_id,reason,actor_id) values(serial_id,'received',generated,manufacturer,'available',requested_warehouse_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.received',actor_profile_id,requested_notes); end loop;
  else
    update public.serial_numbers set status='removed',last_movement_id=m_id,updated_at=now() where id=any(requested_serial_ids); get diagnostics affected=row_count; if affected<>abs(quantity_change) then raise exception 'Serial count mismatch'; end if;
    foreach serial_id in array requested_serial_ids loop insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,previous_warehouse_id,movement_id,reason,actor_id) values(serial_id,'adjusted_out','available','removed',requested_warehouse_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.adjusted',actor_profile_id,requested_notes); end loop;
  end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.adjusted','inventory','inventory_movement',m_id::text,'Serialized inventory adjusted.',jsonb_build_object('product_id',requested_product_id,'warehouse_id',requested_warehouse_id,'quantity_change',quantity_change));
  return m_id;
end $$;


--
-- Name: admin_delete_hr_attendance(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_hr_attendance(actor_profile_id uuid, requested_attendance_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  deleted_count integer;
  matching_count integer;
  actor_role public.account_role;
  permanent_deletion_enabled boolean;
begin
  perform public.assert_hr_admin(actor_profile_id);

  if coalesce(array_length(requested_attendance_ids, 1), 0) = 0
     or array_length(requested_attendance_ids, 1) > 100 then
    raise exception 'Select between 1 and 100 attendance records';
  end if;

  select coalesce(value ->> 'permanent_deletion_enabled' = 'true', false)
  into permanent_deletion_enabled
  from public.system_settings
  where key = 'admin_deletion';

  if not coalesce(permanent_deletion_enabled, false) then
    raise exception 'Permanent Deletion Mode is disabled';
  end if;

  select count(*) into matching_count
  from public.hr_attendance
  where id = any(requested_attendance_ids);

  if matching_count <> cardinality(requested_attendance_ids) then
    raise exception 'One or more attendance records were not found';
  end if;

  update public.hr_attendance_correction_requests
  set attendance_id = null,
      updated_at = now()
  where attendance_id = any(requested_attendance_ids);

  delete from public.hr_attendance
  where id = any(requested_attendance_ids);
  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    raise exception 'No matching attendance records were found';
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
    'hr.attendance_deleted_permanently',
    'hr',
    'attendance_batch',
    requested_attendance_ids[1]::text,
    deleted_count || ' attendance record(s) permanently deleted.',
    jsonb_build_object(
      'attendance_ids', to_jsonb(requested_attendance_ids),
      'deleted_count', deleted_count
    )
  );

  return deleted_count;
end;
$$;


--
-- Name: admin_fail_hr_employee_document_deletion(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_fail_hr_employee_document_deletion(actor_profile_id uuid, requested_job_id uuid, requested_error_message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    and deletion_job.status = 'pending';
end;
$$;


--
-- Name: admin_finalize_hr_employee_document_deletion(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_finalize_hr_employee_document_deletion(actor_profile_id uuid, requested_job_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_finalize_trash_product_purge(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_finalize_trash_product_purge(actor_profile_id uuid, requested_entry_id uuid, requested_purge_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_finalize_trash_user_purge(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_finalize_trash_user_purge(actor_profile_id uuid, requested_entry_id uuid, requested_purge_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_move_business_category(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_move_business_category(actor_profile_id uuid, requested_category_id uuid, requested_direction text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_order integer;
  neighbor_id uuid;
  neighbor_order integer;
begin
  if requested_direction not in ('up','down') then
    raise exception 'Invalid move direction';
  end if;
  if not exists (
    select 1
    from public.effective_permissions_for_profile(actor_profile_id)
    where permission_key = 'products.edit'
  ) then
    raise exception 'Permission denied';
  end if;

  with ranked as (
    select id, row_number() over (order by sort_order, name, id)::integer * 10 as position
    from public.business_categories
    where archived_at is null
  )
  update public.business_categories category
     set sort_order = ranked.position
    from ranked
   where category.id = ranked.id;

  select sort_order into current_order
  from public.business_categories
  where id = requested_category_id and archived_at is null
  for update;
  if current_order is null then raise exception 'Business category not found'; end if;

  if requested_direction = 'up' then
    select id, sort_order into neighbor_id, neighbor_order
    from public.business_categories
    where archived_at is null and sort_order < current_order
    order by sort_order desc limit 1 for update;
  else
    select id, sort_order into neighbor_id, neighbor_order
    from public.business_categories
    where archived_at is null and sort_order > current_order
    order by sort_order limit 1 for update;
  end if;

  if neighbor_id is not null then
    update public.business_categories
       set sort_order = case
         when id = requested_category_id then neighbor_order
         when id = neighbor_id then current_order
       end,
       updated_by = actor_profile_id,
       updated_at = now()
     where id in (requested_category_id, neighbor_id);
  end if;
end
$$;


--
-- Name: admin_prepare_hr_employee_document_deletion(uuid, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_prepare_hr_employee_document_deletion(actor_profile_id uuid, requested_employee_id uuid, requested_document_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_prepare_trash_product_purge(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_prepare_trash_product_purge(actor_profile_id uuid, requested_entry_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_prepare_trash_user_purge(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_prepare_trash_user_purge(actor_profile_id uuid, requested_entry_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_purge_trash_database_entry(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_purge_trash_database_entry(actor_profile_id uuid, requested_entry_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_release_trash_user_purge(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_release_trash_user_purge(actor_profile_id uuid, requested_entry_id uuid, requested_purge_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_restore_trash_entries(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_restore_trash_entries(actor_profile_id uuid, requested_entry_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_save_business_category(uuid, uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_business_category(actor_profile_id uuid, requested_category_id uuid, requested_category jsonb, requested_fields jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  saved_id uuid;
  required_permission text;
begin
  required_permission := case
    when requested_category_id is null then 'products.create'
    else 'products.edit'
  end;
  if not exists (
    select 1
    from public.effective_permissions_for_profile(actor_profile_id)
    where permission_key = required_permission
  ) then
    raise exception 'Permission denied';
  end if;
  if jsonb_typeof(requested_category) <> 'object'
     or jsonb_typeof(requested_fields) <> 'array' then
    raise exception 'Invalid business category data';
  end if;

  if requested_category_id is null then
    insert into public.business_categories (
      name, slug, description, tagline, theme_color, icon, image_path,
      is_active, sort_order, created_by, updated_by
    )
    values (
      requested_category->>'name',
      requested_category->>'slug',
      requested_category->>'description',
      requested_category->>'tagline',
      requested_category->>'theme_color',
      requested_category->>'icon',
      requested_category->>'image_path',
      coalesce((requested_category->>'is_active')::boolean, true),
      coalesce((requested_category->>'sort_order')::integer, 0),
      actor_profile_id,
      actor_profile_id
    )
    returning id into saved_id;
  else
    update public.business_categories
       set name = requested_category->>'name',
           slug = requested_category->>'slug',
           description = requested_category->>'description',
           tagline = requested_category->>'tagline',
           theme_color = requested_category->>'theme_color',
           icon = requested_category->>'icon',
           image_path = requested_category->>'image_path',
           is_active = coalesce((requested_category->>'is_active')::boolean, true),
           sort_order = coalesce((requested_category->>'sort_order')::integer, 0),
           updated_by = actor_profile_id,
           updated_at = now()
     where id = requested_category_id
       and archived_at is null
     returning id into saved_id;
    if saved_id is null then
      raise exception 'Business category not found';
    end if;
  end if;

  delete from public.business_category_fields
   where business_category_id = saved_id;

  insert into public.business_category_fields (
    business_category_id, field_key, label, field_type, placeholder,
    help_text, unit, options, is_required, is_filterable,
    use_for_variations, is_active, sort_order
  )
  select
    saved_id, field_key, label, field_type, placeholder, help_text, unit,
    coalesce(options, '[]'::jsonb), is_required, is_filterable,
    use_for_variations, is_active, sort_order
  from jsonb_to_recordset(requested_fields) as field_rows(
    field_key text,
    label text,
    field_type text,
    placeholder text,
    help_text text,
    unit text,
    options jsonb,
    is_required boolean,
    is_filterable boolean,
    use_for_variations boolean,
    is_active boolean,
    sort_order integer
  );

  return saved_id;
end
$$;


--
-- Name: admin_save_product(uuid, uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_product(actor_profile_id uuid, requested_product_id uuid, requested_product jsonb, requested_category_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  saved_id uuid;
  actor_role public.account_role;
  old_product jsonb;
  required_permission text;
  unknown_keys text[];
  serial_count bigint;
  requested_business_category_id uuid;
begin
  if jsonb_typeof(requested_product) <> 'object' then
    raise exception 'Product data must be an object';
  end if;

  select array_agg(key order by key)
    into unknown_keys
    from jsonb_object_keys(requested_product) as submitted(key)
   where not (
     key = any(array[
       'name','slug','sku','model_number','barcode',
       'manufacturer_part_number','product_type','status','featured',
       'sen_business_category','business_category_id','brand_id',
       'short_description','description','specifications','internal_notes',
       'warranty_information','purchase_cost','regular_price','sale_price',
       'currency','weight','length','width','height','country_of_origin',
       'manage_stock','stock_status','low_stock_threshold','allow_backorders',
       'sold_individually','serial_tracking_required','batch_tracking_enabled',
       'public_catalogue_visible'
     ])
   );
  if unknown_keys is not null then
    raise exception 'Unsupported product fields: %',
      array_to_string(unknown_keys, ', ');
  end if;

  required_permission := case
    when requested_product_id is null then 'products.create'
    else 'products.edit'
  end;
  if not exists (
    select 1
      from public.effective_permissions_for_profile(actor_profile_id)
     where permission_key = required_permission
  ) then
    raise exception 'Permission denied';
  end if;

  requested_business_category_id :=
    nullif(requested_product->>'business_category_id', '')::uuid;
  if requested_business_category_id is null then
    select id
      into requested_business_category_id
      from public.business_categories
     where archived_at is null
       and is_active
       and lower(name) =
         lower(coalesce(requested_product->>'sen_business_category', ''))
     order by sort_order, name
     limit 1;
  end if;
  if requested_business_category_id is null
     or not exists (
       select 1
         from public.business_categories
        where id = requested_business_category_id
          and is_active
          and archived_at is null
     ) then
    raise exception 'An active business category is required';
  end if;

  if requested_category_id is not null
     and not exists (
       select 1
         from public.product_categories
        where id = requested_category_id
          and is_active
          and business_category_id = requested_business_category_id
     ) then
    raise exception
      'Product classification must use the selected business category';
  end if;

  if coalesce(
       (requested_product->>'serial_tracking_required')::boolean,
       false
     )
     and nullif(trim(requested_product->>'model_number'), '') is null then
    raise exception 'Model number is required for serial-tracked products';
  end if;

  select role into actor_role
    from public.profiles
   where id = actor_profile_id;

  if requested_product_id is null then
    insert into public.products (
      name, slug, sku, model_number, barcode, manufacturer_part_number,
      product_type, status, featured, sen_business_category,
      business_category_id, brand_id, short_description, description,
      specifications, internal_notes, warranty_information, purchase_cost,
      regular_price, sale_price, currency, weight, length, width, height,
      country_of_origin, manage_stock, stock_status, low_stock_threshold,
      allow_backorders, sold_individually, serial_tracking_required,
      batch_tracking_enabled, public_catalogue_visible, created_by, updated_by
    )
    values (
      requested_product->>'name',
      requested_product->>'slug',
      requested_product->>'sku',
      nullif(trim(requested_product->>'model_number'), ''),
      requested_product->>'barcode',
      requested_product->>'manufacturer_part_number',
      requested_product->>'product_type',
      requested_product->>'status',
      coalesce((requested_product->>'featured')::boolean, false),
      requested_product->>'sen_business_category',
      requested_business_category_id,
      nullif(requested_product->>'brand_id', '')::uuid,
      requested_product->>'short_description',
      requested_product->>'description',
      coalesce(
        nullif(requested_product->'specifications', 'null'::jsonb),
        '{}'::jsonb
      ),
      requested_product->>'internal_notes',
      requested_product->>'warranty_information',
      (requested_product->>'purchase_cost')::numeric,
      (requested_product->>'regular_price')::numeric,
      (requested_product->>'sale_price')::numeric,
      requested_product->>'currency',
      (requested_product->>'weight')::numeric,
      (requested_product->>'length')::numeric,
      (requested_product->>'width')::numeric,
      (requested_product->>'height')::numeric,
      requested_product->>'country_of_origin',
      coalesce((requested_product->>'manage_stock')::boolean, false),
      requested_product->>'stock_status',
      coalesce((requested_product->>'low_stock_threshold')::numeric, 0),
      coalesce((requested_product->>'allow_backorders')::boolean, false),
      coalesce((requested_product->>'sold_individually')::boolean, false),
      coalesce(
        (requested_product->>'serial_tracking_required')::boolean,
        false
      ),
      coalesce((requested_product->>'batch_tracking_enabled')::boolean, false),
      coalesce(
        (requested_product->>'public_catalogue_visible')::boolean,
        false
      ),
      actor_profile_id,
      actor_profile_id
    )
    returning id into saved_id;
  else
    select to_jsonb(product)
      into old_product
      from public.products as product
     where product.id = requested_product_id
       for update;
    if old_product is null then
      raise exception 'Product not found';
    end if;

    select count(*)
      into serial_count
      from public.serial_numbers
     where product_id = requested_product_id;

    update public.products
       set name = requested_product->>'name',
           slug = requested_product->>'slug',
           sku = requested_product->>'sku',
           model_number =
             nullif(trim(requested_product->>'model_number'), ''),
           barcode = requested_product->>'barcode',
           manufacturer_part_number =
             requested_product->>'manufacturer_part_number',
           product_type = requested_product->>'product_type',
           status = requested_product->>'status',
           featured =
             coalesce((requested_product->>'featured')::boolean, false),
           sen_business_category =
             requested_product->>'sen_business_category',
           business_category_id = requested_business_category_id,
           brand_id = nullif(requested_product->>'brand_id', '')::uuid,
           short_description = requested_product->>'short_description',
           description = requested_product->>'description',
           specifications = coalesce(
             nullif(requested_product->'specifications', 'null'::jsonb),
             '{}'::jsonb
           ),
           internal_notes = requested_product->>'internal_notes',
           warranty_information =
             requested_product->>'warranty_information',
           purchase_cost = (requested_product->>'purchase_cost')::numeric,
           regular_price = (requested_product->>'regular_price')::numeric,
           sale_price = (requested_product->>'sale_price')::numeric,
           currency = requested_product->>'currency',
           weight = (requested_product->>'weight')::numeric,
           length = (requested_product->>'length')::numeric,
           width = (requested_product->>'width')::numeric,
           height = (requested_product->>'height')::numeric,
           country_of_origin = requested_product->>'country_of_origin',
           manage_stock =
             coalesce((requested_product->>'manage_stock')::boolean, false),
           stock_status = requested_product->>'stock_status',
           low_stock_threshold = coalesce(
             (requested_product->>'low_stock_threshold')::numeric,
             0
           ),
           allow_backorders = coalesce(
             (requested_product->>'allow_backorders')::boolean,
             false
           ),
           sold_individually = coalesce(
             (requested_product->>'sold_individually')::boolean,
             false
           ),
           serial_tracking_required = coalesce(
             (requested_product->>'serial_tracking_required')::boolean,
             false
           ),
           batch_tracking_enabled = coalesce(
             (requested_product->>'batch_tracking_enabled')::boolean,
             false
           ),
           public_catalogue_visible = coalesce(
             (requested_product->>'public_catalogue_visible')::boolean,
             false
           ),
           updated_by = actor_profile_id,
           updated_at = now()
     where id = requested_product_id
     returning id into saved_id;

    if serial_count > 0
       and (
         (old_product->>'brand_id')
           is distinct from (requested_product->>'brand_id')
         or (old_product->>'model_number')
           is distinct from
             nullif(trim(requested_product->>'model_number'), '')
       ) then
      insert into public.audit_logs (
        actor_id, actor_role, action, module, entity_type, entity_id,
        description, old_values, new_values
      )
      values (
        actor_profile_id, actor_role, 'product.model_changed', 'products',
        'product', saved_id::text,
        'Product brand or model changed; existing serial values were preserved.',
        jsonb_build_object(
          'brand_id', old_product->>'brand_id',
          'model_number', old_product->>'model_number'
        ),
        jsonb_build_object(
          'brand_id', requested_product->>'brand_id',
          'model_number', requested_product->>'model_number',
          'existing_serial_count', serial_count
        )
      );
    end if;
  end if;

  delete from public.product_category_assignments
   where product_id = saved_id;
  if requested_category_id is not null then
    insert into public.product_category_assignments (
      product_id, category_id, is_primary
    )
    values (saved_id, requested_category_id, true);
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, module, entity_type, entity_id,
    description, old_values, new_values
  )
  values (
    actor_profile_id,
    actor_role,
    case
      when requested_product_id is null then 'product.created'
      else 'product.updated'
    end,
    'products',
    'product',
    saved_id::text,
    case
      when requested_product_id is null then 'Product created.'
      else 'Product updated.'
    end,
    old_product,
    jsonb_build_object(
      'name', requested_product->>'name',
      'sku', requested_product->>'sku',
      'model_number', requested_product->>'model_number',
      'status', requested_product->>'status',
      'product_type', requested_product->>'product_type',
      'business_category_id', requested_business_category_id,
      'category_id', requested_category_id
    )
  );

  return saved_id;
end
$$;


--
-- Name: admin_set_profile_permissions(uuid, uuid, uuid, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_profile_permissions(actor_profile_id uuid, target_profile_id uuid, requested_template_id uuid, allowed_permission_keys text[] DEFAULT '{}'::text[], denied_permission_keys text[] DEFAULT '{}'::text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION admin_set_profile_permissions(actor_profile_id uuid, target_profile_id uuid, requested_template_id uuid, allowed_permission_keys text[], denied_permission_keys text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_set_profile_permissions(actor_profile_id uuid, target_profile_id uuid, requested_template_id uuid, allowed_permission_keys text[], denied_permission_keys text[]) IS 'Atomically updates another employee permissions for an active admin or an employee with employees.manage_permissions; self-updates are forbidden.';


--
-- Name: admin_transfer_inventory(uuid, uuid, uuid, uuid, uuid, numeric, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_transfer_inventory(actor_profile_id uuid, source_id uuid, destination_id uuid, requested_product_id uuid, requested_variation_id uuid, transfer_quantity numeric, requested_notes text, requested_serials text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare p public.products%rowtype; src public.inventory_balances%rowtype; dst public.inventory_balances%rowtype; m_id uuid:=gen_random_uuid(); actor_role public.account_role; locked_id uuid; src_id uuid; dst_id uuid; affected_serials integer;
begin
  if source_id=destination_id or transfer_quantity is null or transfer_quantity<=0 then raise exception 'A positive transfer between different warehouses is required'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='inventory.transfer') then raise exception 'Permission denied'; end if;
  select * into p from public.products where id=requested_product_id and status<>'archived'; if p.id is null then raise exception 'Product not found'; end if;
  if (select count(*) from public.warehouses where id in(source_id,destination_id) and is_active)<>2 then raise exception 'Two active warehouses are required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if p.serial_tracking_required and (transfer_quantity<>trunc(transfer_quantity) or coalesce(array_length(requested_serials,1),0)<>transfer_quantity::integer or (select count(distinct trim(s)) from unnest(requested_serials) s)<>transfer_quantity::integer) then raise exception 'Every serialized unit must be selected'; end if;
  select id into src_id from public.inventory_balances where warehouse_id=source_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null; if src_id is null then raise exception 'Insufficient available source stock'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(destination_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select id into dst_id from public.inventory_balances where warehouse_id=destination_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null;
  for locked_id in select id from public.inventory_balances where id in(src_id,dst_id) order by id loop perform 1 from public.inventory_balances where id=locked_id for update; end loop;
  select * into src from public.inventory_balances where id=src_id; select * into dst from public.inventory_balances where id=dst_id;
  if src.available<transfer_quantity then raise exception 'Insufficient available source stock'; end if;
  if p.serial_tracking_required and (select count(*) from public.serial_numbers where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=source_id and status='available')<>transfer_quantity::integer then raise exception 'One or more serials are unavailable'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,source_warehouse_id,destination_warehouse_id,notes,initiated_by,confirmed_at) values(m_id,'TRF-'||upper(substr(replace(m_id::text,'-',''),1,12)),'warehouse_transfer','confirmed',source_id,destination_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=on_hand-transfer_quantity,updated_at=now() where id=src.id; update public.inventory_balances set on_hand=on_hand+transfer_quantity,updated_at=now() where id=dst.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,source_id,-transfer_quantity,src.on_hand-transfer_quantity),(m_id,requested_product_id,requested_variation_id,destination_id,transfer_quantity,dst.on_hand+transfer_quantity);
  if p.serial_tracking_required then update public.serial_numbers set warehouse_id=destination_id,location_id=null,last_movement_id=m_id,status='available',updated_at=now() where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=source_id and status='available'; get diagnostics affected_serials=row_count; if affected_serials<>transfer_quantity::integer then raise exception 'One or more serials are unavailable'; end if; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.transferred','inventory','inventory_movement',m_id::text,'Inventory transferred between warehouses.',jsonb_build_object('product_id',requested_product_id,'variation_id',requested_variation_id,'source_warehouse_id',source_id,'destination_warehouse_id',destination_id,'quantity',transfer_quantity));
  return m_id;
end $$;


--
-- Name: admin_transfer_serialized_inventory(uuid, uuid, uuid, uuid, uuid, integer, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_transfer_serialized_inventory(actor_profile_id uuid, source_id uuid, destination_id uuid, requested_product_id uuid, requested_variation_id uuid, transfer_quantity integer, requested_notes text, requested_serial_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare src public.inventory_balances%rowtype; dst public.inventory_balances%rowtype; m_id uuid:=gen_random_uuid(); actor_role public.account_role; serial_id uuid; affected integer; lock_id uuid; src_balance_id uuid; dst_balance_id uuid;
begin
  if source_id=destination_id or transfer_quantity<1 then raise exception 'A positive transfer between different warehouses is required'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='inventory.transfer') then raise exception 'Permission denied'; end if;
  if coalesce(array_length(requested_serial_ids,1),0)<>transfer_quantity or (select count(distinct x) from unnest(requested_serial_ids)x)<>transfer_quantity then raise exception 'Every serialized unit must be selected exactly once'; end if;
  if not exists(select 1 from public.products where id=requested_product_id and serial_tracking_required and status<>'archived') then raise exception 'Serialized product not found'; end if;
  if (select role from public.profiles where id=actor_profile_id)='employee' and not exists(select 1 from public.profile_work_locations pw join public.work_locations wl on wl.id=pw.work_location_id where pw.profile_id=actor_profile_id and pw.is_primary and pw.is_active and wl.is_active) then raise exception 'A verified primary workplace is required'; end if;
  select id into src_balance_id from public.inventory_balances where warehouse_id=source_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null; if src_balance_id is null then raise exception 'Insufficient source stock'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(destination_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select id into dst_balance_id from public.inventory_balances where warehouse_id=destination_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null;
  for lock_id in select id from public.inventory_balances where id in(src_balance_id,dst_balance_id) order by id loop perform 1 from public.inventory_balances where id=lock_id for update; end loop;
  select * into src from public.inventory_balances where id=src_balance_id; select * into dst from public.inventory_balances where id=dst_balance_id;
  if src.available<transfer_quantity then raise exception 'Insufficient source stock'; end if;
  if (select count(*) from public.serial_numbers where id=any(requested_serial_ids) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=source_id and status='available')<>transfer_quantity then raise exception 'One or more selected serials are unavailable'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,source_warehouse_id,destination_warehouse_id,notes,initiated_by,confirmed_at) values(m_id,'TRF-'||upper(substr(replace(m_id::text,'-',''),1,12)),'warehouse_transfer','confirmed',source_id,destination_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=on_hand-transfer_quantity,updated_at=now() where id=src.id; update public.inventory_balances set on_hand=on_hand+transfer_quantity,updated_at=now() where id=dst.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,source_id,-transfer_quantity,src.on_hand-transfer_quantity),(m_id,requested_product_id,requested_variation_id,destination_id,transfer_quantity,dst.on_hand+transfer_quantity);
  update public.serial_numbers set warehouse_id=destination_id,location_id=null,last_movement_id=m_id,status='available',updated_at=now() where id=any(requested_serial_ids); get diagnostics affected=row_count; if affected<>transfer_quantity then raise exception 'Serial count mismatch'; end if;
  foreach serial_id in array requested_serial_ids loop insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,previous_warehouse_id,new_warehouse_id,movement_id,reason,actor_id) values(serial_id,'transferred','available','available',source_id,destination_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.transferred',actor_profile_id,requested_notes); end loop;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.transferred','inventory','inventory_movement',m_id::text,'Serialized inventory transferred.',jsonb_build_object('product_id',requested_product_id,'source_warehouse_id',source_id,'destination_warehouse_id',destination_id,'quantity',transfer_quantity));
  return m_id;
end $$;


--
-- Name: admin_update_profile_access(uuid, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_profile_access(actor_profile_id uuid, target_profile_id uuid, requested_role text, requested_status text, requested_template_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_record public.profiles%rowtype;
  target_record public.profiles%rowtype;
  selected_template_id uuid;
  active_admin_count integer;
begin
  select * into actor_record from public.profiles where id=actor_profile_id for update;
  select * into target_record from public.profiles where id=target_profile_id for update;
  if actor_record.id is null or actor_record.role <> 'admin' or actor_record.status <> 'active' then raise exception 'Active administrator required'; end if;
  if target_record.id is null then raise exception 'Target profile not found'; end if;
  if requested_role not in ('customer','employee','admin') or requested_status not in ('active','suspended','disabled') then raise exception 'Invalid role or status'; end if;
  if actor_profile_id=target_profile_id and (requested_role<>target_record.role::text or requested_status<>target_record.status::text) then raise exception 'Administrators cannot change their own role or status'; end if;
  if target_record.role='admin' and target_record.status='active' and (requested_role<>'admin' or requested_status<>'active') then
    select count(*) into active_admin_count from public.profiles where role='admin' and status='active';
    if active_admin_count<=1 then raise exception 'Cannot remove or suspend the final active admin'; end if;
  end if;
  if requested_role='employee' then
    select id into selected_template_id from public.permission_templates
      where id=coalesce(requested_template_id,(select id from public.permission_templates where is_default and is_active limit 1)) and is_active;
    if selected_template_id is null then raise exception 'An active employee permission template is required'; end if;
    update public.profile_permission_templates set is_active=false where profile_id=target_profile_id and is_active;
    insert into public.profile_permission_templates(profile_id,template_id,assigned_by,is_active)
      values(target_profile_id,selected_template_id,actor_profile_id,true);
  else
    update public.profile_permission_templates set is_active=false where profile_id=target_profile_id and is_active;
    update public.profile_permission_overrides set is_active=false,updated_at=now() where profile_id=target_profile_id and is_active;
  end if;
  update public.profiles set role=requested_role::public.account_role,status=requested_status::public.account_status,updated_at=now() where id=target_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_record.role,target_profile_id,'account.access_changed','users','profile',target_profile_id::text,'Account role or status changed.',
    jsonb_build_object('role',target_record.role,'status',target_record.status),jsonb_build_object('role',requested_role,'status',requested_status,'template_id',selected_template_id));
end;
$$;


--
-- Name: allocate_order_serials(uuid, uuid, uuid[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_order_serials(actor_profile_id uuid, requested_order_item_id uuid, requested_serial_ids uuid[], requested_method text DEFAULT 'manual'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare item public.sales_order_items%rowtype; o public.sales_orders%rowtype; serial_id uuid; s public.serial_numbers%rowtype; remaining integer; added integer:=0; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.allocate'); select * into item from public.sales_order_items where id=requested_order_item_id for update; select * into o from public.sales_orders where id=item.order_id for update; if not item.serial_tracking_required_snapshot then raise exception 'Item does not require serial allocation'; end if; if o.status in('draft','cancelled','shipped','delivered') then raise exception 'Order is not eligible for allocation'; end if;
 remaining:=(item.quantity-item.allocated_quantity)::integer; if coalesce(array_length(requested_serial_ids,1),0)=0 or array_length(requested_serial_ids,1)>remaining then raise exception 'Select no more than the remaining serial quantity'; end if;
 foreach serial_id in array requested_serial_ids loop
   select * into s from public.serial_numbers where id=serial_id for update; if s.id is null or s.product_id<>item.product_id or s.variation_id is distinct from item.variation_id or s.warehouse_id<>item.fulfillment_warehouse_id or s.status<>'available' or lower(s.condition) in('damaged','lost','disposed','quarantined') then raise exception 'Serial is not eligible for this order item'; end if;
   insert into public.order_serial_allocations(order_id,order_item_id,serial_number_id,warehouse_id,allocation_method,allocated_by) values(item.order_id,item.id,s.id,s.warehouse_id,requested_method,actor_profile_id);
   update public.serial_numbers set status='allocated',updated_at=now() where id=s.id; added:=added+1;
 end loop;
 update public.sales_order_items set allocated_quantity=allocated_quantity+added,updated_at=now() where id=item.id; perform public.derive_sales_order_status(item.order_id); return added;
end $$;


--
-- Name: assert_actor_permission(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_actor_permission(actor_profile_id uuid, requested_permission text) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare permission_aliases text[];
begin
  if not exists(select 1 from public.profiles p where p.id=actor_profile_id and p.status='active') then raise exception 'Inactive actor'; end if;
  permission_aliases:=case requested_permission
    when 'orders.create' then array['sales.create']
    when 'orders.edit' then array['sales.edit']
    when 'orders.confirm' then array['sales.reserve_stock']
    when 'orders.allocate' then array['sales.allocate_serials']
    when 'orders.pack' then array['sales.edit']
    when 'orders.cancel' then array['sales.cancel']
    when 'accounting.create_entry' then array['accounting.manage_cashbook']
    when 'inventory.receive' then array['inventory.receive_new_stock']
    else array[]::text[]
  end;
  if not exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key=requested_permission or e.permission_key=any(permission_aliases)
  ) then raise exception 'Permission denied'; end if;
end $$;


--
-- Name: assert_cashbook_predecessor_closed(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_cashbook_predecessor_closed(requested_business_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  predecessor public.cashbook_days%rowtype;
begin
  select * into predecessor
  from public.cashbook_days
  where business_date<requested_business_date
  order by business_date desc
  limit 1;

  if predecessor.business_date is not null and not predecessor.is_closed then
    raise exception 'Close the previous cashbook day before continuing';
  end if;
end $$;


--
-- Name: assert_hr_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_hr_admin(actor_profile_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.profiles
    where id=actor_profile_id and role='admin' and status='active' and archived_at is null
  ) then raise exception 'Active administrator access is required'; end if;
end $$;


--
-- Name: assign_rma_claim(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_rma_claim(actor_profile_id uuid, requested_claim_id uuid, requested_assigned_to uuid, requested_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c record; actor record; assignee record;
begin
  select id,role,status into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.status<>'active' then raise exception 'Active profile required'; end if;
  if actor.role<>'admin' then perform public.assert_actor_permission(actor.id,'rma.assign'); end if;
  select * into c from public.rma_claims where id=requested_claim_id for update;
  if c.id is null then raise exception 'RMA claim not found'; end if;
  if requested_assigned_to is not null then
    select id,role,status into assignee from public.profiles where id=requested_assigned_to;
    if assignee.id is null or assignee.status<>'active' or assignee.role not in ('admin','employee') then raise exception 'Choose an active SEN team member'; end if;
  end if;
  update public.rma_claims set assigned_to=requested_assigned_to,updated_at=now() where id=c.id;
  insert into public.rma_events(rma_claim_id,actor_profile_id,event_type,note,metadata)
  values(c.id,actor.id,'assignment_changed',nullif(trim(coalesce(requested_note,'')),''),jsonb_build_object('assigned_to',requested_assigned_to));
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,metadata,old_values,new_values)
  values(actor.id,actor.role,c.customer_profile_id,'rma.assignment_changed','rma','rma_claim',c.id::text,'RMA assignment changed.',jsonb_build_object('rma_claim_id',c.id),jsonb_build_object('assigned_to',c.assigned_to),jsonb_build_object('assigned_to',requested_assigned_to));
  return c.id;
end $$;


--
-- Name: auto_allocate_order_serials(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_allocate_order_serials(actor_profile_id uuid, requested_order_item_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare item public.sales_order_items%rowtype; ids uuid[]; needed integer; begin select * into item from public.sales_order_items where id=requested_order_item_id; if item.id is null then raise exception 'Order item not found'; end if; needed:=(item.quantity-item.allocated_quantity)::integer; if needed<=0 then return 0; end if; select array_agg(id order by coalesce(received_at,created_at),created_at) into ids from (select id,received_at,created_at from public.serial_numbers where product_id=item.product_id and variation_id is not distinct from item.variation_id and warehouse_id=item.fulfillment_warehouse_id and status='available' and lower(condition) not in('damaged','lost','disposed','quarantined') order by coalesce(received_at,created_at),created_at limit needed for update skip locked) eligible; if coalesce(array_length(ids,1),0)<>needed then raise exception 'Not enough eligible serials'; end if; return public.allocate_order_serials(actor_profile_id,requested_order_item_id,ids,'auto'); end $$;


--
-- Name: cancel_sales_order(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_sales_order(actor_profile_id uuid, requested_order_id uuid, requested_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o public.sales_orders%rowtype; r public.inventory_reservations%rowtype; a public.order_serial_allocations%rowtype; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.cancel'); select * into o from public.sales_orders where id=requested_order_id for update; if o.status in('shipped','partially_shipped','delivered','cancelled') then raise exception 'Dispatched or cancelled orders cannot be cancelled'; end if;
 for r in select * from public.inventory_reservations where order_id=o.id and status='active' for update loop update public.inventory_balances set reserved=greatest(reserved-r.quantity,0),updated_at=now() where warehouse_id=r.warehouse_id and product_id=r.product_id and variation_id is not distinct from r.variation_id and location_id is null; update public.inventory_reservations set status='cancelled',released_at=now(),updated_at=now() where id=r.id; end loop;
 for a in select * from public.order_serial_allocations where order_id=o.id and status in('active','packed') for update loop update public.serial_numbers set status='available',updated_at=now() where id=a.serial_number_id and status in('allocated','packed','reserved'); update public.order_serial_allocations set status='cancelled',released_by=actor_profile_id,released_at=now(),release_reason=left(requested_reason,500) where id=a.id; end loop;
 update public.sales_orders set status='cancelled',cancelled_at=now(),updated_by=actor_profile_id,updated_at=now() where id=o.id; insert into public.order_status_events(order_id,old_status,new_status,actor_profile_id,note) values(o.id,o.status,'cancelled',actor_profile_id,left(requested_reason,1000));
end $$;


--
-- Name: capture_product_revision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capture_product_revision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.product_revisions(product_id,snapshot,actor_id) values(new.id,to_jsonb(new)-'internal_notes',coalesce(new.updated_by,new.created_by));
  return new;
end $$;


--
-- Name: capture_serial_event(uuid, uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capture_serial_event(requested_serial_id uuid, requested_movement_id uuid, requested_status_id uuid, requested_event_type text, actor_profile_id uuid, requested_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  assignment public.work_locations%rowtype;
  warehouse_record public.warehouses%rowtype;
  event_id uuid:=gen_random_uuid();
  actor_role public.account_role;
begin
  select role into actor_role
  from public.profiles
  where id=actor_profile_id and status='active';
  if actor_role is null then raise exception 'Active actor required'; end if;

  select locations.* into assignment
  from public.profile_work_locations assignments
  join public.work_locations locations on locations.id=assignments.work_location_id
  where assignments.profile_id=actor_profile_id
    and assignments.is_primary
    and assignments.is_active
    and locations.is_active
  order by assignments.assigned_at desc
  limit 1;
  if actor_role='employee' and assignment.id is null then
    raise exception 'A verified primary workplace is required';
  end if;

  if assignment.id is null and requested_serial_id is not null then
    select warehouses.* into warehouse_record
    from public.serial_numbers serials
    join public.warehouses warehouses on warehouses.id=serials.warehouse_id
    where serials.id=requested_serial_id;
  end if;

  insert into public.serial_tracking_events(
    id,serial_number_id,movement_id,tracking_status_id,event_type,actor_profile_id,
    workplace_id,workplace_name_snapshot,address_snapshot,city_snapshot,country_snapshot,
    latitude_snapshot,longitude_snapshot,location_source,note
  ) values(
    event_id,requested_serial_id,requested_movement_id,requested_status_id,requested_event_type,
    actor_profile_id,assignment.id,coalesce(assignment.name,warehouse_record.name),
    coalesce(assignment.address_line,warehouse_record.address),assignment.city,
    coalesce(assignment.country_code,warehouse_record.country_name),assignment.latitude,
    assignment.longitude,case when assignment.id is not null then 'profile_work_location' else 'warehouse' end,
    left(requested_note,1000)
  );
  return event_id;
end $$;


--
-- Name: cashbook_opening_balance_for(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cashbook_opening_balance_for(requested_business_date date) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((
    select case
      when business_date=requested_business_date then opening_balance
      else closing_balance
    end
    from public.cashbook_days
    where business_date<=requested_business_date
      and (business_date=requested_business_date or is_closed=true)
    order by business_date desc
    limit 1
  ),0)::numeric(18,2)
$$;


--
-- Name: close_cashbook_day(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_cashbook_day(actor_profile_id uuid, requested_business_date date) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  day_row public.cashbook_days%rowtype;
  income_total numeric(18,2);
  expense_total numeric(18,2);
  final_balance numeric(18,2);
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_business_date is null then
    raise exception 'Business date is required';
  end if;

  perform public.lock_cashbook_timeline();
  perform public.assert_cashbook_predecessor_closed(requested_business_date);
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(requested_business_date,public.cashbook_opening_balance_for(requested_business_date),actor_profile_id)
  on conflict(business_date) do nothing;

  select * into day_row from public.cashbook_days
  where business_date=requested_business_date for update;
  if day_row.is_closed then
    raise exception 'This cashbook day is already closed';
  end if;

  select
    coalesce(sum(amount) filter(where transaction_type='income'),0),
    coalesce(sum(amount) filter(where transaction_type='expense'),0)
  into income_total,expense_total
  from public.cashbook_entries
  where business_date=requested_business_date;

  final_balance:=day_row.opening_balance+income_total-expense_total;
  update public.cashbook_days
  set is_closed=true,closing_balance=final_balance,closed_at=now(),
      closed_by=actor_profile_id,updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_day_closed',
    'accounting',
    'cashbook_day',
    requested_business_date::text,
    'Cashbook day closed.',
    jsonb_build_object(
      'opening_balance',day_row.opening_balance,
      'income',income_total,
      'expense',expense_total,
      'closing_balance',final_balance
    )
  );
  return final_balance;
end $$;


--
-- Name: close_stock_received_purchase_order(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_stock_received_purchase_order(actor_profile_id uuid, requested_order_id uuid, requested_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists(
    select 1 from public.purchase_orders
    where id=requested_order_id and status='stock_received'
    for update
  ) then
    raise exception 'Only a stock-received purchase order can be closed';
  end if;

  update public.purchase_orders set status='received' where id=requested_order_id;
  perform public.transition_purchase_order(
    actor_profile_id,requested_order_id,'close',requested_note
  );
  update public.purchase_order_status_events
  set previous_status='stock_received'
  where id=(
    select id from public.purchase_order_status_events
    where purchase_order_id=requested_order_id
    order by created_at desc,id desc
    limit 1
  );
end $$;


--
-- Name: confirm_order_shipment(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_order_shipment(actor_profile_id uuid, requested_shipment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform public.assert_actor_permission(actor_profile_id,'shipments.edit'); if not exists(select 1 from public.shipments where id=requested_shipment_id and status='draft') then raise exception 'Only draft shipments can be confirmed'; end if; update public.shipments set status='confirmed',confirmed_at=now(),updated_by=actor_profile_id,updated_at=now() where id=requested_shipment_id; end $$;


--
-- Name: confirm_purchase_order_and_generate_serials(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_purchase_order_and_generate_serials(actor_profile_id uuid, requested_order_id uuid, requested_note text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  order_row public.purchase_orders%rowtype;
  order_item public.purchase_order_items%rowtype;
  product_row public.products%rowtype;
  remaining integer;
  chunk_size integer;
  batch_id uuid;
  serial_id uuid;
  generated text;
  generated_count integer:=0;
  i integer;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.approve');
  select * into order_row from public.purchase_orders where id=requested_order_id for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if order_row.status='ordered' then
    return (select count(*)::integer from public.serial_numbers sn join public.purchase_order_items poi on poi.id=sn.purchase_order_item_id where poi.purchase_order_id=requested_order_id);
  end if;
  if order_row.status<>'approved' then raise exception 'Only approved purchase orders can be confirmed'; end if;

  perform public.transition_purchase_order(actor_profile_id,requested_order_id,'order',requested_note);

  for order_item in select * from public.purchase_order_items where purchase_order_id=requested_order_id order by created_at,id loop
    if order_item.quantity_ordered<>trunc(order_item.quantity_ordered) then
      raise exception 'Purchase quantities must be whole numbers before SEN codes can be generated';
    end if;
    select * into product_row from public.products where id=order_item.product_id;
    remaining:=order_item.quantity_ordered::integer - (
      select count(*)::integer from public.serial_numbers where purchase_order_item_id=order_item.id
    );
    while remaining>0 loop
      chunk_size:=least(remaining,500);
      batch_id:=gen_random_uuid();
      insert into public.serial_generation_batches(
        id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,status,generated_by,generated_at
      ) values(
        batch_id,order_item.product_id,order_item.variation_id,order_row.destination_warehouse_id,
        chunk_size,'new','Expected against '||order_row.order_number,'generated',actor_profile_id,now()
      );
      for i in 1..chunk_size loop
        generated:=public.next_sen_serial(order_item.product_id);
        serial_id:=gen_random_uuid();
        insert into public.serial_numbers(
          id,sen_serial,barcode_value,product_id,variation_id,warehouse_id,status,condition,
          acquisition_reference,notes,generation_batch_id,generated_at,generated_by,purchase_order_item_id
        ) values(
          serial_id,generated,generated,order_item.product_id,order_item.variation_id,null,'expected','new',
          order_row.order_number,'Generated when supplier order was confirmed',batch_id,now(),actor_profile_id,order_item.id
        );
        insert into public.serial_number_history(
          serial_number_id,event_type,new_sen_serial,new_status,new_warehouse_id,reason,actor_id
        ) values(serial_id,'generated',generated,'expected',order_row.destination_warehouse_id,'Supplier order '||order_row.order_number,actor_profile_id);
      end loop;
      generated_count:=generated_count+chunk_size;
      remaining:=remaining-chunk_size;
    end loop;
  end loop;
  return generated_count;
end $$;


--
-- Name: confirm_sales_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_sales_order(actor_profile_id uuid, requested_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o public.sales_orders%rowtype; item public.sales_order_items%rowtype; b public.inventory_balances%rowtype; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.confirm'); select * into o from public.sales_orders where id=requested_order_id for update; if o.status<>'draft' then raise exception 'Only draft orders can be confirmed'; end if;
 for item in select * from public.sales_order_items where order_id=requested_order_id order by id loop
   select * into b from public.inventory_balances where warehouse_id=item.fulfillment_warehouse_id and product_id=item.product_id and variation_id is not distinct from item.variation_id and location_id is null for update;
   if b.id is null or b.available<item.quantity then raise exception 'Insufficient available inventory for %',item.product_name_snapshot; end if;
   update public.inventory_balances set reserved=reserved+item.quantity,updated_at=now() where id=b.id;
   insert into public.inventory_reservations(product_id,variation_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id) values(item.product_id,item.variation_id,item.fulfillment_warehouse_id,item.quantity,'active',o.order_number,actor_profile_id,o.id,item.id);
 end loop;
 update public.sales_orders set status='confirmed',confirmed_at=now(),updated_by=actor_profile_id,updated_at=now() where id=o.id;
 insert into public.order_status_events(order_id,old_status,new_status,actor_profile_id,note) values(o.id,'draft','confirmed',actor_profile_id,'Order confirmed and inventory reserved');
end $$;


--
-- Name: convert_quotation_to_invoice(uuid, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_quotation_to_invoice(actor_profile_id uuid, requested_quotation_id uuid, requested_warehouse_id uuid, requested_create_customer boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  quotation public.quotation_requests%rowtype;
  customer public.profiles%rowtype;
  quote_item record;
  product_row public.products%rowtype;
  created_order_id uuid:=gen_random_uuid();
  invoice_id uuid:=gen_random_uuid();
  crm_contact_id uuid;
  crm_company_id uuid;
  address_id uuid;
  address_snapshot jsonb;
  order_number text;
  invoice_number text;
  actor_role public.account_role;
  brand_name text;
  line_subtotal numeric(18,2);
  line_total numeric(18,2);
  invoice_snapshot jsonb;
  customer_created boolean:=false;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.convert_to_invoice');
  select * into quotation
  from public.quotation_requests
  where id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;
  if quotation.status='converted_to_invoice' then
    return jsonb_build_object(
      'order_id',quotation.converted_order_id,
      'invoice_id',quotation.converted_invoice_id,
      'customer_created',false
    );
  end if;
  if quotation.status not in('approved','accepted') then
    raise exception 'Only an approved quotation can be converted';
  end if;
  if requested_warehouse_id is null or not exists(
    select 1 from public.warehouses where id=requested_warehouse_id and is_active
  ) then raise exception 'Choose an active fulfilment warehouse'; end if;

  select * into customer from public.profiles where id=quotation.profile_id and status='active';
  if customer.id is null then raise exception 'Active quotation customer account not found'; end if;

  select id into crm_contact_id
  from public.crm_contacts
  where profile_id=customer.id
     or (customer.email is not null and lower(email)=lower(customer.email))
     or (
       customer.phone is not null and phone is not null
       and regexp_replace(phone,'\D','','g')=regexp_replace(customer.phone,'\D','','g')
     )
  order by (profile_id=customer.id) desc
  limit 1;

  if crm_contact_id is null and not requested_create_customer then
    raise exception 'CUSTOMER_CREATION_REQUIRED';
  end if;

  if crm_contact_id is null then
    perform public.assert_actor_permission(actor_profile_id,'quotations.create_customer');
    if nullif(trim(coalesce(quotation.company_name,customer.company_name,'')),'') is not null then
      select id into crm_company_id
      from public.crm_companies
      where customer_profile_id=customer.id
         or lower(name)=lower(coalesce(quotation.company_name,customer.company_name))
         or (customer.email is not null and lower(email)=lower(customer.email))
         or (
           quotation.customer_tax_identification_number is not null
           and lower(tax_identification_number)=lower(quotation.customer_tax_identification_number)
         )
      limit 1;
      if crm_company_id is null then
        insert into public.crm_companies(
          name,customer_profile_id,email,phone,country_name,status,
          tax_identification_number,created_by,updated_by
        ) values (
          left(coalesce(quotation.company_name,customer.company_name,customer.full_name,customer.email),180),
          customer.id,customer.email,customer.phone,customer.country::text,'active',
          nullif(left(quotation.customer_tax_identification_number,100),''),
          actor_profile_id,actor_profile_id
        ) returning id into crm_company_id;
      end if;
    end if;
    insert into public.crm_contacts(
      company_id,profile_id,full_name,email,phone,status,created_by,updated_by
    ) values (
      crm_company_id,customer.id,
      left(coalesce(nullif(trim(customer.full_name),''),customer.email),160),
      customer.email,customer.phone,'active',actor_profile_id,actor_profile_id
    ) returning id into crm_contact_id;
    customer_created:=true;
  end if;

  address_id:=coalesce(quotation.shipping_address_id,quotation.billing_address_id);
  address_snapshot:=coalesce(
    quotation.shipping_address_snapshot,
    quotation.billing_address_snapshot
  );
  if address_id is null then
    select id into address_id
    from public.customer_addresses
    where profile_id=customer.id
    order by is_default_shipping desc,updated_at desc
    limit 1;
  end if;
  if address_snapshot is null and address_id is not null then
    address_snapshot:=public.quotation_address_snapshot(address_id,customer.id);
  end if;
  if address_snapshot is null then raise exception 'Customer shipping address is required'; end if;

  perform public.refresh_quotation_totals(quotation.id);
  select * into quotation from public.quotation_requests where id=quotation.id for update;
  if not exists(select 1 from public.quotation_request_items where quotation_id=quotation.id) then
    raise exception 'Quotation has no items';
  end if;
  if exists(
    select 1 from public.quotation_request_items
    where quotation_id=quotation.id and product_id is null
  ) then raise exception 'Every quotation item must be linked to a catalogue product before conversion'; end if;

  order_number:=public.next_sales_order_number();
  insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_id,shipping_address_snapshot,
    billing_address_id,billing_address_snapshot,fulfillment_warehouse_id,status,currency,
    subtotal,discount_amount,shipping_amount,tax_amount,total_amount,internal_notes,
    customer_notes,sales_source,payment_status,created_by,updated_by
  ) values (
    created_order_id,order_number,customer.id,address_id,address_snapshot,
    coalesce(quotation.billing_address_id,address_id),
    coalesce(quotation.billing_address_snapshot,address_snapshot),
    requested_warehouse_id,'draft',quotation.currency,
    quotation.subtotal,quotation.discount_amount,0,quotation.tax_amount,quotation.total_amount,
    quotation.internal_notes,quotation.customer_notes,'existing_customer','unpaid',
    actor_profile_id,actor_profile_id
  );

  for quote_item in
    select * from public.quotation_request_items
    where quotation_id=quotation.id
    order by created_at,id
  loop
    select * into product_row from public.products where id=quote_item.product_id and status='active';
    if product_row.id is null then raise exception 'Quotation includes an unavailable product'; end if;
    select b.name into brand_name from public.brands b where b.id=product_row.brand_id;
    line_subtotal:=round(quote_item.quantity*coalesce(quote_item.unit_price,quote_item.target_price,0),2);
    line_total:=round(greatest(
      line_subtotal-coalesce(quote_item.discount_amount,0)+coalesce(quote_item.tax_amount,0),0),2);
    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,quantity,unit_price,
      line_subtotal,line_discount,line_tax,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,sku_snapshot,
      model_number_snapshot,brand_snapshot,variation_snapshot
    ) values (
      created_order_id,product_row.id,quote_item.variation_id,requested_warehouse_id,
      quote_item.quantity,round(coalesce(quote_item.unit_price,quote_item.target_price,0),2),
      line_subtotal,coalesce(quote_item.discount_amount,0),coalesce(quote_item.tax_amount,0),
      line_total,quotation.currency,product_row.serial_tracking_required,
      quote_item.product_name_snapshot,coalesce(quote_item.sku_snapshot,product_row.sku),
      product_row.model_number,brand_name,
      case when quote_item.variation_id is null then null
           else jsonb_build_object('id',quote_item.variation_id) end
    );
  end loop;

  insert into public.order_status_events(order_id,new_status,actor_profile_id,note)
  values(created_order_id,'draft',actor_profile_id,'Created from approved quotation '||quotation.reference);

  invoice_number:='SEN-INV-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6);
  select jsonb_build_object(
    'order',to_jsonb(o),
    'customer',to_jsonb(customer),
    'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)
             from public.sales_order_items i where i.order_id=created_order_id),
    'serials','[]'::jsonb,
    'quotation',jsonb_build_object('id',quotation.id,'reference',quotation.reference),
    'generated_at',now()
  ) into invoice_snapshot
  from public.sales_orders o where o.id=created_order_id;
  insert into public.sale_documents(
    id,order_id,document_number,document_type,snapshot,generated_by
  ) values (
    invoice_id,created_order_id,invoice_number,'invoice',invoice_snapshot,actor_profile_id
  );

  update public.quotation_requests
  set status='converted_to_invoice',
      converted_at=now(),
      converted_by=actor_profile_id,
      converted_order_id=created_order_id,
      converted_invoice_id=invoice_id,
      updated_by=actor_profile_id,
      updated_at=now()
  where id=quotation.id;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,
    description,new_values
  ) values (
    actor_profile_id,actor_role,customer.id,'quotation.converted_to_invoice',
    'quotations','quotation_request',quotation.id::text,
    'Approved quotation converted to a linked sales invoice.',
    jsonb_build_object(
      'quotation_reference',quotation.reference,
      'order_id',created_order_id,
      'order_number',order_number,
      'invoice_id',invoice_id,
      'invoice_number',invoice_number,
      'crm_contact_id',crm_contact_id,
      'customer_created',customer_created
    )
  );
  return jsonb_build_object(
    'order_id',created_order_id,
    'order_number',order_number,
    'invoice_id',invoice_id,
    'invoice_number',invoice_number,
    'customer_created',customer_created
  );
end $$;


--
-- Name: create_cashbook_description(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_cashbook_description(actor_profile_id uuid, requested_name text, requested_transaction_type text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  description_id uuid:=gen_random_uuid();
  normalized_name text:=trim(coalesce(requested_name,''));
  normalized_type text:=lower(trim(coalesce(requested_transaction_type,'')));
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if char_length(normalized_name) not between 2 and 160 then
    raise exception 'Description must be between 2 and 160 characters';
  end if;
  if normalized_type not in ('income','expense') then
    raise exception 'Transaction type must be income or expense';
  end if;

  insert into public.cashbook_descriptions(id,name,transaction_type,created_by)
  values(description_id,normalized_name,normalized_type,actor_profile_id);

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_description_created',
    'accounting',
    'cashbook_description',
    description_id::text,
    'Cashbook description created.',
    jsonb_build_object('name',normalized_name,'transaction_type',normalized_type)
  );
  return description_id;
exception
  when unique_violation then
    raise exception 'This description already exists for the selected transaction type';
end $$;


--
-- Name: create_cashbook_entry(uuid, uuid, numeric, text, timestamp with time zone, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_cashbook_entry(actor_profile_id uuid, requested_description_id uuid, requested_amount numeric, requested_payment_method text, requested_occurred_at timestamp with time zone, requested_business_date date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cashbook_id uuid:=gen_random_uuid();
  journal_id uuid:=gen_random_uuid();
  description_row public.cashbook_descriptions%rowtype;
  payment_account_id uuid;
  counter_account_id uuid;
  normalized_method text:=lower(trim(coalesce(requested_payment_method,'')));
  entry_time timestamptz:=requested_occurred_at;
  entry_date date;
  day_is_closed boolean;
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_amount is null or requested_amount<=0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if normalized_method not in ('cash','bank','mfs') then
    raise exception 'Payment method must be Cash, Bank, or MFS';
  end if;
  if requested_occurred_at is null or requested_business_date is null then
    raise exception 'Transaction date and business date are required';
  end if;
  entry_date:=(entry_time at time zone 'Asia/Dhaka')::date;
  if entry_date<>requested_business_date then
    raise exception 'Transaction date must match the selected cashbook date';
  end if;

  perform public.lock_cashbook_timeline();
  perform public.assert_cashbook_predecessor_closed(entry_date);
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(entry_date,public.cashbook_opening_balance_for(entry_date),actor_profile_id)
  on conflict(business_date) do nothing;
  select is_closed into day_is_closed
  from public.cashbook_days where business_date=entry_date for update;
  if day_is_closed then
    raise exception 'This cashbook day is closed';
  end if;

  select * into description_row
  from public.cashbook_descriptions
  where id=requested_description_id and is_active=true;
  if description_row.id is null then
    raise exception 'Select an active cashbook description';
  end if;

  select id into payment_account_id
  from public.accounting_accounts
  where code=case normalized_method when 'cash' then '1010' when 'bank' then '1020' else '1030' end
    and currency='BDT' and is_active=true;

  select id into counter_account_id
  from public.accounting_accounts
  where code=case description_row.transaction_type when 'income' then '4000' else '6000' end
    and currency='BDT' and is_active=true;

  if payment_account_id is null or counter_account_id is null then
    raise exception 'Required accounting account is unavailable';
  end if;

  insert into public.journal_entries(
    id,entry_number,entry_date,description,reference_type,reference_id,status,
    currency,created_by,posted_by,posted_at
  ) values(
    journal_id,
    public.next_journal_entry_number(),
    entry_date,
    description_row.name,
    'manual',
    cashbook_id,
    'posted',
    'BDT',
    actor_profile_id,
    actor_profile_id,
    now()
  );

  if description_row.transaction_type='income' then
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
    values
      (journal_id,payment_account_id,description_row.name,requested_amount,0),
      (journal_id,counter_account_id,description_row.name,0,requested_amount);
  else
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
    values
      (journal_id,counter_account_id,description_row.name,requested_amount,0),
      (journal_id,payment_account_id,description_row.name,0,requested_amount);
  end if;

  insert into public.cashbook_entries(
    id,description_id,transaction_type,amount,payment_method,transaction_at,
    business_date,journal_entry_id,created_by
  ) values(
    cashbook_id,
    description_row.id,
    description_row.transaction_type,
    round(requested_amount,2),
    normalized_method,
    entry_time,
    entry_date,
    journal_id,
    actor_profile_id
  );

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_entry_created',
    'accounting',
    'cashbook_entry',
    cashbook_id::text,
    'Cashbook entry created and posted.',
    jsonb_build_object(
      'transaction_type',description_row.transaction_type,
      'amount',round(requested_amount,2),
      'payment_method',normalized_method,
      'journal_entry_id',journal_id
    )
  );
  return cashbook_id;
end $$;


--
-- Name: create_cashbook_entry(uuid, uuid, numeric, text, timestamp with time zone, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_cashbook_entry(actor_profile_id uuid, requested_description_id uuid, requested_amount numeric, requested_payment_method text, requested_occurred_at timestamp with time zone, requested_business_date date, requested_remark text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  created_entry_id uuid;
  normalized_remark text:=trim(coalesce(requested_remark,''));
begin
  if char_length(normalized_remark)>240 then
    raise exception 'Short remark cannot exceed 240 characters';
  end if;

  created_entry_id:=public.create_cashbook_entry(
    actor_profile_id,
    requested_description_id,
    requested_amount,
    requested_payment_method,
    requested_occurred_at,
    requested_business_date
  );

  update public.cashbook_entries
  set remark=normalized_remark
  where id=created_entry_id;

  return created_entry_id;
end $$;


--
-- Name: create_crm_activity(uuid, uuid, uuid, uuid, text, text, text, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_crm_activity(actor_profile_id uuid, requested_lead_id uuid, requested_company_id uuid, requested_contact_id uuid, requested_activity_type text, requested_subject text, requested_details text, requested_due_at timestamp with time zone, requested_completed boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare activity_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.edit');
  if requested_lead_id is null and requested_company_id is null and requested_contact_id is null then raise exception 'Activity must belong to a CRM record'; end if;
  if requested_activity_type not in('note','call','email','meeting','follow_up') then raise exception 'Invalid activity type'; end if;
  if char_length(trim(coalesce(requested_subject,'')))<2 then raise exception 'Activity subject is required'; end if;
  insert into public.crm_activities(
    id,lead_id,company_id,contact_id,activity_type,subject,details,due_at,completed_at,actor_profile_id
  ) values (
    activity_id,requested_lead_id,requested_company_id,requested_contact_id,requested_activity_type,
    left(trim(requested_subject),200),nullif(left(trim(requested_details),3000),''),
    requested_due_at,case when requested_completed then now() else null end,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'crm.activity_created','crm','crm_activity',activity_id::text,
    'CRM activity recorded.',jsonb_build_object('lead_id',requested_lead_id,'type',requested_activity_type));
  return activity_id;
end $$;


--
-- Name: create_crm_company(uuid, text, text, uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_crm_company(actor_profile_id uuid, requested_name text, requested_legal_name text, requested_customer_profile_id uuid, requested_industry text, requested_website_url text, requested_email text, requested_phone text, requested_country_code text, requested_country_name text, requested_address text, requested_status text, requested_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare company_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.create');
  if char_length(trim(coalesce(requested_name,'')))<2 then raise exception 'Company name is required'; end if;
  if coalesce(requested_status,'active') not in('active','inactive','prospect') then raise exception 'Invalid company status'; end if;
  if requested_customer_profile_id is not null and not exists(
    select 1 from public.profiles where id=requested_customer_profile_id and role='customer'
  ) then raise exception 'Linked account must be a customer profile'; end if;
  insert into public.crm_companies(
    id,name,legal_name,customer_profile_id,industry,website_url,email,phone,country_code,country_name,
    address,status,notes,created_by,updated_by
  ) values (
    company_id,left(trim(requested_name),180),nullif(left(trim(requested_legal_name),180),''),
    requested_customer_profile_id,nullif(left(trim(requested_industry),120),''),
    nullif(left(trim(requested_website_url),300),''),nullif(left(trim(requested_email),200),''),
    nullif(left(trim(requested_phone),60),''),nullif(upper(left(trim(requested_country_code),2)),''),
    nullif(left(trim(requested_country_name),100),''),nullif(left(trim(requested_address),600),''),
    coalesce(requested_status,'active'),nullif(left(trim(requested_notes),2000),''),
    actor_profile_id,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'crm.company_created','crm','crm_company',company_id::text,
    'CRM company created.',jsonb_build_object('name',requested_name));
  return company_id;
end $$;


--
-- Name: create_crm_contact(uuid, uuid, uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_crm_contact(actor_profile_id uuid, requested_company_id uuid, requested_profile_id uuid, requested_full_name text, requested_job_title text, requested_email text, requested_phone text, requested_preferred_method text, requested_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare contact_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.create');
  if char_length(trim(coalesce(requested_full_name,'')))<2 then raise exception 'Contact name is required'; end if;
  if requested_company_id is not null and not exists(select 1 from public.crm_companies where id=requested_company_id) then raise exception 'CRM company not found'; end if;
  if requested_profile_id is not null and not exists(select 1 from public.profiles where id=requested_profile_id) then raise exception 'Profile not found'; end if;
  if nullif(trim(coalesce(requested_email,'')),'') is null and nullif(trim(coalesce(requested_phone,'')),'') is null and requested_profile_id is null then
    raise exception 'Contact email, phone or linked profile is required';
  end if;
  if coalesce(requested_preferred_method,'email') not in('email','phone','whatsapp','other') then raise exception 'Invalid contact method'; end if;
  insert into public.crm_contacts(
    id,company_id,profile_id,full_name,job_title,email,phone,preferred_contact_method,notes,created_by,updated_by
  ) values (
    contact_id,requested_company_id,requested_profile_id,left(trim(requested_full_name),160),
    nullif(left(trim(requested_job_title),120),''),nullif(left(trim(requested_email),200),''),
    nullif(left(trim(requested_phone),60),''),coalesce(requested_preferred_method,'email'),
    nullif(left(trim(requested_notes),2000),''),actor_profile_id,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'crm.contact_created','crm','crm_contact',contact_id::text,
    'CRM contact created.',jsonb_build_object('name',requested_full_name,'company_id',requested_company_id));
  return contact_id;
end $$;


--
-- Name: create_crm_lead(uuid, text, uuid, uuid, text, text, text, numeric, text, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_crm_lead(actor_profile_id uuid, requested_title text, requested_company_id uuid, requested_contact_id uuid, requested_description text, requested_source text, requested_priority text, requested_estimated_value numeric, requested_currency text, requested_expected_close_date date, requested_assigned_to uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lead_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.create');
  if char_length(trim(coalesce(requested_title,'')))<2 then raise exception 'Lead title is required'; end if;
  if requested_company_id is not null and not exists(select 1 from public.crm_companies where id=requested_company_id) then raise exception 'CRM company not found'; end if;
  if requested_contact_id is not null and not exists(select 1 from public.crm_contacts where id=requested_contact_id) then raise exception 'CRM contact not found'; end if;
  if requested_company_id is null and requested_contact_id is null then raise exception 'A company or contact is required'; end if;
  if coalesce(requested_source,'other') not in('website','referral','phone','email','social','event','existing_customer','other') then raise exception 'Invalid lead source'; end if;
  if coalesce(requested_priority,'medium') not in('low','medium','high','urgent') then raise exception 'Invalid lead priority'; end if;
  if coalesce(requested_estimated_value,0)<0 then raise exception 'Estimated value cannot be negative'; end if;
  if requested_assigned_to is not null and not exists(
    select 1 from public.profiles where id=requested_assigned_to and role in('employee','admin') and status='active'
  ) then raise exception 'Lead assignee must be an active staff profile'; end if;
  insert into public.crm_leads(
    id,lead_number,title,company_id,contact_id,description,source,priority,estimated_value,currency,
    expected_close_date,assigned_to,created_by,updated_by
  ) values (
    lead_id,public.next_crm_lead_number(),left(trim(requested_title),200),requested_company_id,requested_contact_id,
    nullif(left(trim(requested_description),3000),''),coalesce(requested_source,'other'),
    coalesce(requested_priority,'medium'),coalesce(requested_estimated_value,0),
    upper(left(coalesce(nullif(trim(requested_currency),''),'BDT'),3)),requested_expected_close_date,
    requested_assigned_to,actor_profile_id,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,requested_assigned_to,'crm.lead_created','crm','crm_lead',lead_id::text,
    'CRM lead created.',jsonb_build_object('title',requested_title,'value',requested_estimated_value));
  return lead_id;
end $$;


--
-- Name: create_hr_employee(uuid, uuid, uuid, text, text, date, uuid, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_hr_employee(actor_profile_id uuid, requested_profile_id uuid, requested_department_id uuid, requested_job_title text, requested_employment_type text, requested_hire_date date, requested_work_location_id uuid, requested_manager_profile_id uuid, requested_base_salary numeric, requested_currency text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare record_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'hr.manage_employees');
  if not exists(select 1 from public.profiles where id=requested_profile_id and role in('employee','admin') and status='active') then raise exception 'An active staff profile is required'; end if;
  insert into public.hr_employee_records(id,profile_id,employee_number,department_id,job_title,employment_type,hire_date,work_location_id,manager_profile_id,base_salary,salary_currency,created_by,updated_by)
  values(record_id,requested_profile_id,public.next_employee_number(),requested_department_id,left(trim(requested_job_title),120),requested_employment_type,requested_hire_date,requested_work_location_id,requested_manager_profile_id,requested_base_salary,upper(coalesce(requested_currency,'BDT')),actor_profile_id,actor_profile_id);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,requested_profile_id,'hr.employee_created','hr','employee_record',record_id::text,'HR employee record created.',jsonb_build_object('profile_id',requested_profile_id,'job_title',requested_job_title));
  return record_id;
end $$;


--
-- Name: create_journal_entry(uuid, date, text, text, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_journal_entry(actor_profile_id uuid, requested_date date, requested_description text, requested_reference_type text, requested_reference_id uuid, requested_currency text, requested_lines jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare entry_id uuid:=gen_random_uuid(); actor_role public.account_role; debit_total numeric; credit_total numeric; item jsonb;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  select role into actor_role from public.profiles where id=actor_profile_id and status='active';
  if jsonb_typeof(requested_lines)<>'array' or jsonb_array_length(requested_lines)<2 then raise exception 'At least two journal lines are required'; end if;
  select coalesce(sum((value->>'debit')::numeric),0),coalesce(sum((value->>'credit')::numeric),0)
    into debit_total,credit_total from jsonb_array_elements(requested_lines);
  if debit_total<=0 or debit_total<>credit_total then raise exception 'Journal debits and credits must be equal and greater than zero'; end if;
  insert into public.journal_entries(id,entry_number,entry_date,description,reference_type,reference_id,currency,created_by)
  values(entry_id,public.next_journal_entry_number(),coalesce(requested_date,current_date),left(trim(requested_description),500),coalesce(requested_reference_type,'manual'),requested_reference_id,upper(coalesce(requested_currency,'BDT')),actor_profile_id);
  for item in select value from jsonb_array_elements(requested_lines) loop
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
    values(entry_id,(item->>'account_id')::uuid,nullif(left(trim(item->>'description'),500),''),coalesce((item->>'debit')::numeric,0),coalesce((item->>'credit')::numeric,0));
  end loop;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.journal_created','accounting','journal_entry',entry_id::text,'Draft journal entry created.',jsonb_build_object('debit',debit_total,'credit',credit_total));
  return entry_id;
end $$;


--
-- Name: create_minimal_sale(uuid, uuid, uuid, jsonb, uuid, jsonb, uuid, text, date, numeric, numeric, numeric, numeric, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_minimal_sale(actor_profile_id uuid, requested_customer_id uuid, requested_address_id uuid, requested_address jsonb, requested_billing_address_id uuid, requested_billing_address jsonb, requested_warehouse_id uuid, requested_source text, requested_expected_delivery_date date, requested_discount numeric, requested_shipping numeric, requested_service numeric, requested_tax numeric, requested_internal_notes text, requested_customer_notes text, requested_items jsonb, requested_adjustments jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare created_order_id uuid; billing_snapshot jsonb; entry jsonb;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.create');
  if requested_source not in ('website','facebook','whatsapp','phone','email','direct_office','existing_customer','sales_representative','referral','other') then raise exception 'Invalid sales source'; end if;
  if requested_service < 0 then raise exception 'Invalid service amount'; end if;
  if requested_billing_address_id is not null then
    select jsonb_build_object('recipient_name',recipient_name,'phone',phone,'alternate_phone',alternate_phone,'address_line_1',address_line_1,'address_line_2',address_line_2,'area',area,'city',city,'region',region,'postal_code',postal_code,'country_code',country_code,'delivery_instructions',delivery_instructions,'latitude',latitude,'longitude',longitude,'map_label',map_label)
    into billing_snapshot from public.customer_addresses
    where id=requested_billing_address_id and profile_id=requested_customer_id;
    if billing_snapshot is null then raise exception 'Billing address not found'; end if;
  end if;
  billing_snapshot:=coalesce(billing_snapshot,requested_billing_address);
  created_order_id:=public.create_sales_order(actor_profile_id,requested_customer_id,requested_address_id,requested_address,requested_warehouse_id,'BDT',requested_discount,requested_shipping,requested_tax,requested_internal_notes,requested_customer_notes,requested_items);
  update public.sales_orders set billing_address_id=requested_billing_address_id,billing_address_snapshot=billing_snapshot,sales_source=requested_source,expected_delivery_date=requested_expected_delivery_date,service_amount=greatest(coalesce(requested_service,0),0),total_amount=total_amount+greatest(coalesce(requested_service,0),0),updated_at=now() where id=created_order_id;
  for entry in select * from jsonb_array_elements(coalesce(requested_adjustments,'[]'::jsonb)) loop
    if coalesce(trim(entry->>'reason'),'')='' then raise exception 'Price adjustment reason required'; end if;
    insert into public.sale_price_adjustments(order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id)
    values(created_order_id,nullif(entry->>'order_item_id','')::uuid,entry->>'adjustment_type',nullif(entry->>'previous_value','')::numeric,(entry->>'new_value')::numeric,left(entry->>'reason',500),actor_profile_id);
  end loop;
  return created_order_id;
end $$;


--
-- Name: create_order_shipment(uuid, uuid, text, uuid, uuid, jsonb, jsonb, timestamp with time zone, timestamp with time zone, integer, numeric, text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order_shipment(actor_profile_id uuid, requested_order_id uuid, requested_transport_mode text, requested_origin_id uuid, requested_destination_id uuid, requested_origin jsonb, requested_destination jsonb, requested_estimated_departure timestamp with time zone, requested_estimated_arrival timestamp with time zone, requested_package_count integer, requested_weight numeric, requested_dimensions text, requested_internal_notes text, requested_customer_note text, requested_items jsonb, requested_route_points jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare shipment_id uuid:=gen_random_uuid(); entry jsonb; point jsonb; item public.sales_order_items%rowtype; qty numeric; shipment_item_id uuid; allocation_ids uuid[]; allocation_id uuid; a public.order_serial_allocations%rowtype; point_index integer:=0; begin
 perform public.assert_actor_permission(actor_profile_id,'shipments.create'); if requested_transport_mode not in('air','sea','road','local_delivery','customer_pickup','other') then raise exception 'Invalid transport mode'; end if; if not exists(select 1 from public.sales_orders where id=requested_order_id and status not in('draft','cancelled','delivered')) then raise exception 'Order is not eligible for shipment'; end if;
 insert into public.shipments(id,shipment_number,order_id,transport_mode,origin_work_location_id,destination_work_location_id,origin_snapshot,destination_snapshot,estimated_departure_at,estimated_arrival_at,package_count,gross_weight,dimensions,internal_notes,customer_visible_note,created_by,updated_by) values(shipment_id,public.next_shipment_number(),requested_order_id,requested_transport_mode,requested_origin_id,requested_destination_id,coalesce(requested_origin,'{}'),coalesce(requested_destination,'{}'),requested_estimated_departure,requested_estimated_arrival,greatest(coalesce(requested_package_count,1),1),requested_weight,left(requested_dimensions,300),left(requested_internal_notes,2000),left(requested_customer_note,2000),actor_profile_id,actor_profile_id);
 for entry in select * from jsonb_array_elements(requested_items) loop select * into item from public.sales_order_items where id=(entry->>'order_item_id')::uuid and order_id=requested_order_id for update; qty:=(entry->>'quantity')::numeric; if item.id is null or qty<=0 or item.shipped_quantity+qty>item.quantity then raise exception 'Shipment quantity exceeds remaining order quantity'; end if; insert into public.shipment_items(shipment_id,order_item_id,quantity) values(shipment_id,item.id,qty) returning id into shipment_item_id; if item.serial_tracking_required_snapshot then allocation_ids:=array(select jsonb_array_elements_text(coalesce(entry->'allocation_ids','[]'))::uuid); if coalesce(array_length(allocation_ids,1),0)<>qty::integer then raise exception 'Exact assigned serial count is required'; end if; foreach allocation_id in array allocation_ids loop select * into a from public.order_serial_allocations where id=allocation_id and order_item_id=item.id and status='packed' for update; if a.id is null then raise exception 'Shipment serial must be assigned and packed'; end if; insert into public.shipment_serials(shipment_item_id,allocation_id,serial_number_id) values(shipment_item_id,a.id,a.serial_number_id); end loop; end if; end loop;
 for point in select * from jsonb_array_elements(coalesce(requested_route_points,'[]')) loop insert into public.shipment_route_points(shipment_id,point_order,label,point_type,latitude,longitude,is_estimated,customer_visible,created_by) values(shipment_id,point_index,left(point->>'label',160),coalesce(point->>'point_type','estimated'),(point->>'latitude')::numeric,(point->>'longitude')::numeric,coalesce((point->>'is_estimated')::boolean,true),coalesce((point->>'customer_visible')::boolean,true),actor_profile_id); point_index:=point_index+1; end loop;
 return shipment_id;
end $$;


--
-- Name: create_purchase_order(uuid, uuid, uuid, text, date, date, text, integer, numeric, numeric, numeric, numeric, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_purchase_order(actor_profile_id uuid, requested_supplier_id uuid, requested_warehouse_id uuid, requested_currency text, requested_order_date date, requested_expected_date date, requested_supplier_reference text, requested_payment_terms integer, requested_discount numeric, requested_shipping numeric, requested_tax numeric, requested_other numeric, requested_internal_notes text, requested_supplier_notes text, requested_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare order_id uuid:=gen_random_uuid(); item jsonb; product_row public.products%rowtype;
  variation_row public.product_variations%rowtype; quantity numeric; unit_cost numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.create');
  if not exists(select 1 from public.suppliers where id=requested_supplier_id and status='active') then raise exception 'Active supplier required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active destination warehouse required'; end if;
  if requested_expected_date is not null and requested_expected_date<coalesce(requested_order_date,current_date) then raise exception 'Expected delivery cannot be before order date'; end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then raise exception 'At least one purchase item is required'; end if;
  if coalesce(requested_discount,0)<0 or coalesce(requested_shipping,0)<0 or coalesce(requested_tax,0)<0 or coalesce(requested_other,0)<0 then raise exception 'Order amounts cannot be negative'; end if;

  insert into public.purchase_orders(
    id,order_number,supplier_id,destination_warehouse_id,currency,order_date,expected_delivery_date,
    supplier_reference,payment_terms_days,discount_amount,shipping_amount,tax_amount,other_amount,
    internal_notes,supplier_notes,created_by,updated_by
  ) values (
    order_id,public.next_purchase_order_number(),requested_supplier_id,requested_warehouse_id,
    upper(left(coalesce(nullif(trim(requested_currency),''),'BDT'),3)),coalesce(requested_order_date,current_date),
    requested_expected_date,nullif(left(trim(requested_supplier_reference),200),''),
    greatest(0,least(coalesce(requested_payment_terms,0),365)),coalesce(requested_discount,0),
    coalesce(requested_shipping,0),coalesce(requested_tax,0),coalesce(requested_other,0),
    nullif(left(trim(requested_internal_notes),2000),''),nullif(left(trim(requested_supplier_notes),2000),''),
    actor_profile_id,actor_profile_id
  );

  for item in select value from jsonb_array_elements(requested_items) loop
    select * into product_row from public.products where id=(item->>'product_id')::uuid and status<>'archived';
    if product_row.id is null then raise exception 'Active product required'; end if;
    variation_row:=null;
    if nullif(item->>'variation_id','') is not null then
      select * into variation_row from public.product_variations
      where id=(item->>'variation_id')::uuid and product_id=product_row.id and status='active';
      if variation_row.id is null then raise exception 'Invalid product variation'; end if;
    end if;
    quantity:=(item->>'quantity')::numeric; unit_cost:=(item->>'unit_cost')::numeric;
    if quantity<=0 or unit_cost<0 then raise exception 'Item quantity and unit cost are invalid'; end if;
    if product_row.serial_tracking_required and quantity<>trunc(quantity) then raise exception 'Serialized product quantities must be whole numbers'; end if;
    insert into public.purchase_order_items(
      purchase_order_id,product_id,variation_id,product_name_snapshot,sku_snapshot,description,
      quantity_ordered,unit_cost,discount_amount,tax_amount
    ) values (
      order_id,product_row.id,variation_row.id,product_row.name,coalesce(variation_row.sku,product_row.sku),
      nullif(left(trim(item->>'description'),500),''),quantity,unit_cost,
      greatest(coalesce((item->>'discount_amount')::numeric,0),0),
      greatest(coalesce((item->>'tax_amount')::numeric,0),0)
    );
  end loop;
  perform public.refresh_purchase_order_totals(order_id);
  insert into public.purchase_order_status_events(purchase_order_id,new_status,note,actor_profile_id)
  values(order_id,'draft','Purchase order created.',actor_profile_id);
  return order_id;
end $$;


--
-- Name: create_sales_order(uuid, uuid, uuid, jsonb, uuid, text, numeric, numeric, numeric, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_sales_order(actor_profile_id uuid, requested_customer_id uuid, requested_address_id uuid, requested_address jsonb, requested_warehouse_id uuid, requested_currency text, requested_discount numeric, requested_shipping numeric, requested_tax numeric, requested_internal_notes text, requested_customer_notes text, requested_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare order_id uuid:=gen_random_uuid(); address_snapshot jsonb; entry jsonb; p public.products%rowtype; v public.product_variations%rowtype; brand_name text; image_path text; qty numeric; unit numeric; line_discount numeric; line_tax numeric; line_subtotal numeric; line_total numeric; subtotal_total numeric:=0; total_total numeric:=0; currency_code text:=upper(coalesce(requested_currency,'BDT')); item_warehouse uuid; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.create');
 if not exists(select 1 from public.profiles where id=requested_customer_id and role='customer' and status='active') then raise exception 'Active customer required'; end if;
 if length(currency_code)<>3 then raise exception 'Invalid currency'; end if;
 if requested_address_id is not null then select jsonb_build_object('recipient_name',recipient_name,'phone',phone,'alternate_phone',alternate_phone,'address_line_1',address_line_1,'address_line_2',address_line_2,'area',area,'city',city,'region',region,'postal_code',postal_code,'country_code',country_code,'delivery_instructions',delivery_instructions,'latitude',latitude,'longitude',longitude,'map_label',map_label) into address_snapshot from public.customer_addresses where id=requested_address_id and profile_id=requested_customer_id; end if;
 address_snapshot:=coalesce(address_snapshot,requested_address); if address_snapshot is null or coalesce(address_snapshot->>'recipient_name','')='' or coalesce(address_snapshot->>'address_line_1','')='' then raise exception 'Shipping address required'; end if;
 if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then raise exception 'At least one order item is required'; end if;
 insert into public.sales_orders(id,order_number,customer_profile_id,shipping_address_id,shipping_address_snapshot,fulfillment_warehouse_id,currency,discount_amount,shipping_amount,tax_amount,internal_notes,customer_notes,created_by,updated_by) values(order_id,public.next_sales_order_number(),requested_customer_id,requested_address_id,address_snapshot,requested_warehouse_id,currency_code,greatest(coalesce(requested_discount,0),0),greatest(coalesce(requested_shipping,0),0),greatest(coalesce(requested_tax,0),0),nullif(left(requested_internal_notes,4000),''),nullif(left(requested_customer_notes,4000),''),actor_profile_id,actor_profile_id);
 for entry in select * from jsonb_array_elements(requested_items) loop
   select * into p from public.products where id=(entry->>'product_id')::uuid and status<>'archived'; if p.id is null then raise exception 'Product not found'; end if;
   item_warehouse:=coalesce((entry->>'warehouse_id')::uuid,requested_warehouse_id,p.default_warehouse_id); if item_warehouse is null or not exists(select 1 from public.warehouses where id=item_warehouse and is_active) then raise exception 'Active warehouse required'; end if;
   qty:=(entry->>'quantity')::numeric; if qty<=0 or (p.serial_tracking_required and qty<>trunc(qty)) then raise exception 'Invalid quantity'; end if;
   if nullif(entry->>'variation_id','') is not null then select * into v from public.product_variations where id=(entry->>'variation_id')::uuid and product_id=p.id and status='active'; if v.id is null then raise exception 'Invalid variation'; end if; else v:=null; end if;
   unit:=coalesce((entry->>'unit_price')::numeric,v.sale_price,v.regular_price,p.sale_price,p.regular_price,0); if unit<0 then raise exception 'Invalid unit price'; end if;
   line_discount:=greatest(coalesce((entry->>'line_discount')::numeric,0),0); line_tax:=greatest(coalesce((entry->>'line_tax')::numeric,0),0); line_subtotal:=round(qty*unit,4); line_total:=greatest(line_subtotal-line_discount+line_tax,0);
   select b.name into brand_name from public.brands b where b.id=p.brand_id; select pm.storage_path into image_path from public.product_media pm where pm.product_id=p.id and pm.is_primary order by pm.sort_order limit 1;
   insert into public.sales_order_items(order_id,product_id,variation_id,fulfillment_warehouse_id,quantity,unit_price,line_subtotal,line_discount,line_tax,line_total,currency,serial_tracking_required_snapshot,product_name_snapshot,sku_snapshot,model_number_snapshot,brand_snapshot,variation_snapshot,product_image_path_snapshot) values(order_id,p.id,v.id,item_warehouse,qty,unit,line_subtotal,line_discount,line_tax,line_total,currency_code,p.serial_tracking_required,p.name,coalesce(v.sku,p.sku),p.model_number,brand_name,case when v.id is null then null else jsonb_build_object('id',v.id,'sku',v.sku,'combination_key',v.combination_key) end,image_path);
   subtotal_total:=subtotal_total+line_subtotal; total_total:=total_total+line_total;
 end loop;
 update public.sales_orders set subtotal=subtotal_total,total_amount=greatest(total_total-coalesce(requested_discount,0)+coalesce(requested_shipping,0)+coalesce(requested_tax,0),0) where id=order_id;
 insert into public.order_status_events(order_id,new_status,actor_profile_id,note) values(order_id,'draft',actor_profile_id,'Order created');
 return order_id;
end $$;


--
-- Name: crm_chatbot_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_chatbot_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at=now();
  return new;
end $$;


--
-- Name: crm_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at=now();
  return new;
end $$;


--
-- Name: current_user_has_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_has_permission(requested_permission_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists(select 1 from public.effective_permissions_for_profile(auth.uid()) where permission_key=requested_permission_key);
$$;


--
-- Name: customer_checkout_cart(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_checkout_cart(actor_profile_id uuid, requested_address_id uuid, requested_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  cart public.shopping_carts%rowtype;
  address_snapshot jsonb;
  order_id uuid := gen_random_uuid();
  entry record;
  product_row public.products%rowtype;
  selected_warehouse_id uuid;
  unit_price numeric;
  line_total numeric;
  order_total numeric := 0;
begin
  if actor_profile_id is distinct from auth.uid()
    and current_user <> 'service_role'
  then
    raise exception 'Permission denied';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id=actor_profile_id
      and status='active'
      and role in ('customer','admin')
  ) then
    raise exception 'Active customer account required';
  end if;

  select *
  into cart
  from public.shopping_carts
  where profile_id=actor_profile_id and status='active'
  for update;

  if cart.id is null
    or not exists (
      select 1
      from public.shopping_cart_items
      where cart_id=cart.id
    )
  then
    raise exception 'Cart is empty';
  end if;

  select jsonb_build_object(
    'recipient_name',recipient_name,
    'phone',phone,
    'alternate_phone',alternate_phone,
    'address_line_1',address_line_1,
    'address_line_2',address_line_2,
    'area',area,
    'city',city,
    'region',region,
    'postal_code',postal_code,
    'country_code',country_code,
    'delivery_instructions',delivery_instructions,
    'map_label',map_label
  )
  into address_snapshot
  from public.customer_addresses
  where id=requested_address_id and profile_id=actor_profile_id;

  if address_snapshot is null then
    raise exception 'Choose a saved shipping address';
  end if;

  select balance.warehouse_id
  into selected_warehouse_id
  from public.inventory_balances balance
  join public.shopping_cart_items cart_item
    on cart_item.product_id=balance.product_id
    and cart_item.cart_id=cart.id
  where balance.available >= cart_item.quantity
  order by balance.available desc
  limit 1;

  if selected_warehouse_id is null then
    select id
    into selected_warehouse_id
    from public.warehouses
    where is_active
    order by created_at
    limit 1;
  end if;

  if selected_warehouse_id is null then
    raise exception 'No fulfilment warehouse is available';
  end if;

  insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_id,
    shipping_address_snapshot,fulfillment_warehouse_id,currency,
    customer_notes,created_by,updated_by
  ) values (
    order_id,public.next_sales_order_number(),actor_profile_id,
    requested_address_id,address_snapshot,selected_warehouse_id,'BDT',
    nullif(left(requested_notes,4000),''),actor_profile_id,actor_profile_id
  );

  for entry in
    select cart_item.*,balance.available
    from public.shopping_cart_items cart_item
    left join public.inventory_balances balance
      on balance.product_id=cart_item.product_id
      and balance.variation_id is not distinct from cart_item.variation_id
      and balance.warehouse_id=selected_warehouse_id
      and balance.location_id is null
    where cart_item.cart_id=cart.id
  loop
    select *
    into product_row
    from public.products
    where id=entry.product_id
      and status='active'
      and public_catalogue_visible;

    if product_row.id is null then
      raise exception 'A cart product is no longer available';
    end if;
    if coalesce(entry.available,0) < entry.quantity
      and not product_row.allow_backorders
    then
      raise exception 'Insufficient stock for %',product_row.name;
    end if;

    unit_price := coalesce(
      product_row.sale_price,
      product_row.regular_price,
      0
    );
    line_total := round(unit_price*entry.quantity,4);
    order_total := order_total+line_total;

    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,
      quantity,unit_price,line_subtotal,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,
      sku_snapshot,model_number_snapshot
    ) values (
      order_id,product_row.id,entry.variation_id,selected_warehouse_id,
      entry.quantity,unit_price,line_total,line_total,'BDT',
      product_row.serial_tracking_required,product_row.name,
      product_row.sku,product_row.model_number
    );
  end loop;

  update public.sales_orders
  set subtotal=order_total,total_amount=order_total
  where id=order_id;

  insert into public.order_status_events(
    order_id,new_status,actor_profile_id,note
  ) values (
    order_id,'draft',actor_profile_id,'Customer placed order from cart'
  );

  update public.shopping_carts
  set status='converted',converted_order_id=order_id,updated_at=now()
  where id=cart.id;

  return order_id;
end $$;


--
-- Name: customer_checkout_cart_cod(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_checkout_cart_cod(actor_profile_id uuid, requested_address_id uuid, requested_notes text, requested_email text, requested_phone text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  cart public.shopping_carts%rowtype;
  address_snapshot jsonb;
  billing_snapshot jsonb;
  order_id uuid := gen_random_uuid();
  entry record;
  product_row public.products%rowtype;
  variation_row public.product_variations%rowtype;
  selected_warehouse_id uuid;
  unit_price numeric;
  line_total numeric;
  order_total numeric := 0;
  available_quantity numeric;
  cod_gateway_id uuid;
  normalized_phone text;
begin
  if actor_profile_id is distinct from auth.uid() and current_user <> 'service_role' then
    raise exception 'Permission denied';
  end if;
  if not exists (
    select 1 from public.profiles
    where id=actor_profile_id and status='active' and role in ('customer','admin')
  ) then
    raise exception 'Active customer account required';
  end if;
  if requested_email is null
    or requested_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  then
    raise exception 'Enter a valid billing email';
  end if;
  normalized_phone := regexp_replace(coalesce(requested_phone,''),'[().[:space:]-]','','g');
  if normalized_phone !~ '^\+8801[3-9][0-9]{8}$'
    and normalized_phone !~ '^01[3-9][0-9]{8}$'
    and normalized_phone !~ '^\+[1-9][0-9]{6,14}$'
  then
    raise exception 'Enter a valid contact phone number';
  end if;

  select * into cart
  from public.shopping_carts
  where profile_id=actor_profile_id and status='active'
  for update;
  if cart.id is null
    or not exists (select 1 from public.shopping_cart_items where cart_id=cart.id)
  then
    raise exception 'Cart is empty';
  end if;

  select jsonb_build_object(
    'recipient_name',recipient_name,
    'phone',phone,
    'alternate_phone',alternate_phone,
    'address_line_1',address_line_1,
    'address_line_2',address_line_2,
    'area',area,
    'city',city,
    'region',region,
    'postal_code',postal_code,
    'country_code',country_code,
    'delivery_instructions',delivery_instructions,
    'map_label',map_label
  ) into address_snapshot
  from public.customer_addresses
  where id=requested_address_id and profile_id=actor_profile_id;
  if address_snapshot is null then
    raise exception 'Choose a saved shipping address';
  end if;
  billing_snapshot := address_snapshot || jsonb_build_object(
    'email',lower(trim(requested_email)),
    'contact_phone',trim(requested_phone),
    'payment_method','cash_on_delivery'
  );

  select warehouse.id into selected_warehouse_id
  from public.warehouses warehouse
  where warehouse.is_active
    and not exists (
      select 1
      from public.shopping_cart_items item
      join public.products product on product.id=item.product_id
      left join public.product_variations variation
        on variation.id=item.variation_id
        and variation.product_id=item.product_id
        and variation.status='active'
      where item.cart_id=cart.id
        and (
          product.status <> 'active'
          or not product.public_catalogue_visible
          or (product.product_type='variable' and variation.id is null)
          or (product.product_type<>'variable' and item.variation_id is not null)
          or (
            not coalesce(variation.allow_backorders,product.allow_backorders)
            and coalesce((
              select sum(balance.available)
              from public.inventory_balances balance
              where balance.warehouse_id=warehouse.id
                and balance.product_id=item.product_id
                and balance.variation_id is not distinct from item.variation_id
            ),0) < item.quantity
          )
        )
    )
  order by warehouse.created_at
  limit 1;
  if selected_warehouse_id is null then
    raise exception 'No fulfilment warehouse has sufficient stock for this cart';
  end if;

  insert into public.sales_orders(
    id,order_number,customer_profile_id,
    shipping_address_id,shipping_address_snapshot,
    billing_address_id,billing_address_snapshot,
    fulfillment_warehouse_id,currency,customer_notes,sales_source,
    payment_status,created_by,updated_by
  ) values (
    order_id,public.next_sales_order_number(),actor_profile_id,
    requested_address_id,address_snapshot,
    requested_address_id,billing_snapshot,
    selected_warehouse_id,'BDT',nullif(left(requested_notes,4000),''),
    'website','unpaid',actor_profile_id,actor_profile_id
  );

  for entry in
    select * from public.shopping_cart_items
    where cart_id=cart.id
    order by created_at
  loop
    select * into product_row
    from public.products
    where id=entry.product_id and status='active' and public_catalogue_visible;
    if product_row.id is null then
      raise exception 'A cart product is no longer available';
    end if;

    variation_row := null;
    if product_row.product_type='variable' then
      if entry.variation_id is null then
        raise exception 'Select a configuration for %',product_row.name;
      end if;
      select * into variation_row
      from public.product_variations
      where id=entry.variation_id
        and product_id=product_row.id
        and status='active';
      if variation_row.id is null then
        raise exception 'A selected product configuration is no longer available';
      end if;
      product_row.allow_backorders := variation_row.allow_backorders;
      product_row.sale_price := variation_row.sale_price;
      product_row.regular_price := variation_row.regular_price;
      product_row.sku := variation_row.sku;
      product_row.name := product_row.name || ' (' || variation_row.combination_key || ')';
    elsif entry.variation_id is not null then
      raise exception 'The cart contains an invalid product configuration';
    end if;

    select coalesce(sum(balance.available),0) into available_quantity
    from public.inventory_balances balance
    where balance.warehouse_id=selected_warehouse_id
      and balance.product_id=entry.product_id
      and balance.variation_id is not distinct from entry.variation_id;
    if available_quantity < entry.quantity and not product_row.allow_backorders then
      raise exception 'Insufficient stock for %',product_row.name;
    end if;

    unit_price := coalesce(product_row.sale_price,product_row.regular_price,0);
    line_total := round(unit_price*entry.quantity,4);
    order_total := order_total+line_total;
    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,
      quantity,unit_price,line_subtotal,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,
      sku_snapshot,model_number_snapshot,variation_snapshot
    ) values (
      order_id,product_row.id,entry.variation_id,selected_warehouse_id,
      entry.quantity,unit_price,line_total,line_total,'BDT',
      product_row.serial_tracking_required,product_row.name,
      product_row.sku,product_row.model_number,
      case when variation_row.id is null then null else
        jsonb_build_object(
          'id',variation_row.id,
          'sku',variation_row.sku,
          'combination_key',variation_row.combination_key
        )
      end
    );
  end loop;

  if order_total <= 0 then
    raise exception 'Cart total must be greater than zero';
  end if;
  update public.sales_orders
  set subtotal=order_total,total_amount=order_total
  where id=order_id;

  select id into cod_gateway_id
  from public.payment_gateways
  where code='cash_on_delivery' and enabled
  limit 1;
  if cod_gateway_id is null then
    raise exception 'Cash on delivery is not currently available';
  end if;
  insert into public.payment_transactions(
    order_id,profile_id,gateway_id,status,amount,currency,safe_response
  ) values (
    order_id,actor_profile_id,cod_gateway_id,'pending',order_total,'BDT',
    jsonb_build_object('method','cash_on_delivery','customer_confirmed',true)
  );
  insert into public.order_status_events(order_id,new_status,actor_profile_id,note)
  values(order_id,'draft',actor_profile_id,'Customer confirmed a cash-on-delivery order');
  update public.shopping_carts
  set status='converted',converted_order_id=order_id,updated_at=now()
  where id=cart.id;
  return order_id;
end
$_$;


--
-- Name: derive_sales_order_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_sales_order_status(requested_order_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o public.sales_orders%rowtype; total_qty numeric; allocated_qty numeric; packed_qty numeric; shipped_qty numeric; delivered_qty numeric; derived text; begin
 select * into o from public.sales_orders where id=requested_order_id for update; if o.id is null then raise exception 'Order not found'; end if;
 if o.status='cancelled' then return 'cancelled'; end if;
 select coalesce(sum(quantity),0),coalesce(sum(allocated_quantity),0),coalesce(sum(packed_quantity),0),coalesce(sum(shipped_quantity),0),coalesce(sum(delivered_quantity),0) into total_qty,allocated_qty,packed_qty,shipped_qty,delivered_qty from public.sales_order_items where order_id=requested_order_id;
 derived:=case when total_qty>0 and delivered_qty>=total_qty then 'delivered' when shipped_qty>=total_qty then 'shipped' when shipped_qty>0 then 'partially_shipped' when packed_qty>0 then 'packing' when allocated_qty>=total_qty then 'allocated' when allocated_qty>0 then 'partially_allocated' when o.confirmed_at is not null then 'confirmed' else 'draft' end;
 update public.sales_orders set status=derived,delivered_at=case when derived='delivered' then coalesce(delivered_at,now()) else delivered_at end,updated_at=now() where id=requested_order_id;
 return derived;
end $$;


--
-- Name: dispatch_order_shipment(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_order_shipment(actor_profile_id uuid, requested_shipment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare s public.shipments%rowtype; si public.shipment_items%rowtype; oi public.sales_order_items%rowtype; a public.order_serial_allocations%rowtype; serial_count integer; status_id uuid; begin
 perform public.assert_actor_permission(actor_profile_id,'shipments.confirm_dispatch'); select * into s from public.shipments where id=requested_shipment_id for update; if s.status not in('confirmed','ready') then raise exception 'Shipment is not ready for dispatch'; end if;
 for si in select * from public.shipment_items where shipment_id=s.id for update loop select * into oi from public.sales_order_items where id=si.order_item_id for update; if oi.shipped_quantity+si.quantity>oi.quantity then raise exception 'Shipment exceeds remaining order quantity'; end if; if oi.serial_tracking_required_snapshot then select count(*) into serial_count from public.shipment_serials ss join public.order_serial_allocations osa on osa.id=ss.allocation_id where ss.shipment_item_id=si.id and osa.status='packed'; if serial_count<>si.quantity::integer then raise exception 'Assigned and packed serial count must equal shipment quantity'; end if; for a in select osa.* from public.shipment_serials ss join public.order_serial_allocations osa on osa.id=ss.allocation_id where ss.shipment_item_id=si.id for update of osa loop update public.order_serial_allocations set status='shipped',shipped_at=now() where id=a.id; update public.serial_numbers set status='shipped',updated_at=now() where id=a.serial_number_id; end loop; end if; update public.sales_order_items set shipped_quantity=shipped_quantity+si.quantity,updated_at=now() where id=oi.id; update public.inventory_balances set on_hand=on_hand-si.quantity,reserved=greatest(reserved-si.quantity,0),updated_at=now() where warehouse_id=oi.fulfillment_warehouse_id and product_id=oi.product_id and variation_id is not distinct from oi.variation_id and location_id is null; update public.inventory_reservations set status='consumed',updated_at=now() where order_item_id=oi.id and status='active'; end loop;
 select id into status_id from public.tracking_status_definitions where key=case when s.transport_mode='air' then 'departed_china_by_air' when s.transport_mode='sea' then 'departed_china_by_sea' else 'in_transit_to_customer' end and is_active limit 1;
 update public.shipments set status='dispatched',actual_departure_at=now(),dispatched_at=now(),latest_tracking_status_id=status_id,latest_location_snapshot=origin_snapshot,updated_by=actor_profile_id,updated_at=now() where id=s.id;
 if status_id is not null then insert into public.shipment_tracking_events(shipment_id,order_id,tracking_status_id,actor_profile_id,location_snapshot,latitude,longitude,location_source,transport_mode_snapshot,customer_visible_title,customer_visible_message,event_visibility,occurred_at) values(s.id,s.order_id,status_id,actor_profile_id,s.origin_snapshot,(s.origin_snapshot->>'latitude')::numeric,(s.origin_snapshot->>'longitude')::numeric,'system',s.transport_mode,'Shipment dispatched','Your shipment has departed the origin location.','both',now()); end if; perform public.derive_sales_order_status(s.order_id);
end $$;


--
-- Name: effective_permissions_for_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.effective_permissions_for_profile(requested_profile_id uuid) RETURNS TABLE(permission_key text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with target as (select role,status from public.profiles where id=requested_profile_id and (auth.uid()=requested_profile_id or public.is_current_user_admin() or auth.role()='service_role'))
  select p.key from public.permissions p,target t where t.status='active' and t.role='admin' and p.is_active
  union
  select p.key
  from public.permissions p
  cross join target t
  left join public.profile_permission_overrides o on o.profile_id=requested_profile_id and o.permission_id=p.id and o.is_active
  where t.status='active' and t.role='employee' and p.is_active and o.effect is distinct from 'deny'::public.permission_effect
    and (o.effect='allow'::public.permission_effect or (o.effect is null and exists(
      select 1 from public.profile_permission_templates a
      join public.permission_templates pt on pt.id=a.template_id and pt.is_active
      join public.permission_template_items i on i.template_id=pt.id and i.permission_id=p.id
      where a.profile_id=requested_profile_id and a.is_active
    )));
$$;


--
-- Name: FUNCTION effective_permissions_for_profile(requested_profile_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.effective_permissions_for_profile(requested_profile_id uuid) IS 'Inactive denied; active admin all; employee deny override, allow override, template, then denied.';


--
-- Name: enforce_global_product_sku(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_global_product_sku() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.sku:=btrim(new.sku);
  if new.sku='' then raise exception 'SKU is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.sku,0));
  if tg_table_name='products' and exists(select 1 from public.product_variations v where v.sku=new.sku) then raise exception 'SKU already exists on a product variation'; end if;
  if tg_table_name='product_variations' and exists(select 1 from public.products p where p.sku=new.sku) then raise exception 'SKU already exists on a product'; end if;
  return new;
end $$;


--
-- Name: generate_sale_document(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_sale_document(actor_profile_id uuid, requested_order_id uuid, requested_type text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  document_id uuid:=gen_random_uuid();
  o public.sales_orders%rowtype;
  permission_key text;
  number text;
  document_snapshot jsonb;
  next_revision integer;
begin
  permission_key:=case
    when requested_type='invoice' then 'sales.create_invoice'
    when requested_type='delivery_challan' then 'sales.create_delivery_challan'
    else null end;
  if permission_key is null then raise exception 'Invalid document type'; end if;
  perform public.assert_actor_permission(actor_profile_id,permission_key);
  select * into o from public.sales_orders where id=requested_order_id;
  if o.id is null or o.status='cancelled' then
    raise exception 'Sale is not eligible for document generation';
  end if;
  select coalesce(max(revision_number),0)+1 into next_revision
  from public.sale_documents
  where order_id=o.id and document_type=requested_type;
  update public.sale_documents set
    status='superseded',superseded_at=now(),superseded_by=actor_profile_id,
    superseded_reason='Replaced by revision '||next_revision
  where order_id=o.id and document_type=requested_type and status='generated';

  number:=case when requested_type='invoice' then 'SEN-INV-' else 'SEN-DC-' end
    ||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6);
  select jsonb_build_object(
    'order',to_jsonb(o),
    'customer',(select to_jsonb(p)-'password' from public.profiles p where p.id=o.customer_profile_id),
    'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)
      from public.sales_order_items i where i.order_id=o.id),
    'serials',(select coalesce(jsonb_agg(jsonb_build_object(
      'sen_serial',s.sen_serial,'manufacturer_serial',s.manufacturer_serial,'product_id',s.product_id
    )),'[]'::jsonb) from public.order_serial_allocations a
      join public.serial_numbers s on s.id=a.serial_number_id
      where a.order_id=o.id and a.status not in('released','cancelled')),
    'generated_at',now(),'revision_number',next_revision
  ) into document_snapshot;
  insert into public.sale_documents(
    id,order_id,document_number,document_type,status,snapshot,
    generated_by,revision_number
  ) values (
    document_id,o.id,number,requested_type,'generated',document_snapshot,
    actor_profile_id,next_revision
  );
  return document_id;
end $$;


--
-- Name: generate_serial_batch(uuid, uuid, uuid, uuid, integer, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_serial_batch(actor_profile_id uuid, requested_product_id uuid, requested_variation_id uuid, requested_warehouse_id uuid, requested_quantity integer, requested_condition text DEFAULT 'new'::text, requested_notes text DEFAULT NULL::text, requested_manufacturer_serials text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare batch_id uuid:=gen_random_uuid(); actor_role public.account_role; i integer; serial_id uuid; generated text; manufacturer text; normalized text;
begin
  if requested_quantity<1 or requested_quantity>500 then raise exception 'Quantity must be between 1 and 500'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='serials.generate') then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.products where id=requested_product_id and serial_tracking_required and status<>'archived') then raise exception 'An active serial-tracked product is required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if coalesce(array_length(requested_manufacturer_serials,1),0)>requested_quantity then raise exception 'Too many manufacturer serials'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  if actor_role='employee' and not exists(select 1 from public.profile_work_locations pw join public.work_locations wl on wl.id=pw.work_location_id where pw.profile_id=actor_profile_id and pw.is_primary and pw.is_active and wl.is_active) then raise exception 'A verified primary workplace is required'; end if;
  insert into public.serial_generation_batches(id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,generated_by) values(batch_id,requested_product_id,requested_variation_id,requested_warehouse_id,requested_quantity,left(requested_condition,80),left(requested_notes,1000),actor_profile_id);
  for i in 1..requested_quantity loop
    manufacturer:=nullif(trim(coalesce(requested_manufacturer_serials[i],'')),''); normalized:=public.normalize_manufacturer_serial(manufacturer);
    if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized) then raise exception 'Manufacturer serial already exists: %',manufacturer; end if;
    generated:=public.next_sen_serial(requested_product_id); serial_id:=gen_random_uuid();
    insert into public.serial_numbers(id,manufacturer_serial,manufacturer_serial_normalized,sen_serial,barcode_value,product_id,variation_id,warehouse_id,status,condition,notes,generation_batch_id,generated_at,generated_by)
    values(serial_id,manufacturer,normalized,generated,generated,requested_product_id,requested_variation_id,requested_warehouse_id,'expected',left(requested_condition,80),left(requested_notes,1000),batch_id,now(),actor_profile_id);
    insert into public.serial_number_history(serial_number_id,event_type,new_sen_serial,new_manufacturer_serial,new_status,new_warehouse_id,reason,actor_id) values(serial_id,'generated',generated,manufacturer,'expected',requested_warehouse_id,'Batch generation',actor_profile_id);
    perform public.capture_serial_event(serial_id,null,null,'serial.generated',actor_profile_id,requested_notes);
  end loop;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'serial.batch_generated','serials','serial_generation_batch',batch_id::text,'SEN serial batch generated.',jsonb_build_object('product_id',requested_product_id,'quantity',requested_quantity,'warehouse_id',requested_warehouse_id));
  return batch_id;
end $$;


--
-- Name: generate_supplier_code(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_supplier_code(requested_category_id uuid, requested_preview text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  category_prefix text;
  candidate text;
  attempt integer := 0;
begin
  if requested_category_id is null then
    raise exception 'A supplier category is required.';
  end if;

  with recursive category_path as (
    select id, parent_id, code_segment, 0 as distance
    from public.supplier_categories
    where id = requested_category_id
    union all
    select parent.id, parent.parent_id, parent.code_segment, path.distance + 1
    from public.supplier_categories parent
    join category_path path on path.parent_id = parent.id
  )
  select string_agg(code_segment, '-' order by distance desc)
    into category_prefix
  from category_path;

  if category_prefix is null or category_prefix = '' then
    raise exception 'The selected supplier category does not exist.';
  end if;

  if requested_preview ~ ('^' || category_prefix || '-[0-9]{5}$')
     and not exists (select 1 from public.suppliers where code = requested_preview) then
    return requested_preview;
  end if;

  loop
    attempt := attempt + 1;
    candidate := category_prefix || '-' || lpad(floor(random() * 100000)::integer::text, 5, '0');
    exit when not exists (select 1 from public.suppliers where code = candidate);
    if attempt >= 100 then
      raise exception 'Unable to generate a unique supplier code.';
    end if;
  end loop;
  return candidate;
end;
$_$;


--
-- Name: hr_apply_device_attendance_event(uuid, text, timestamp with time zone, text, time without time zone, time without time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_apply_device_attendance_event(requested_employee_id uuid, requested_event_type text, requested_occurred_at timestamp with time zone, requested_timezone text, requested_start_time time without time zone, requested_end_time time without time zone, requested_late_grace integer DEFAULT 0) RETURNS TABLE(attendance_id uuid, applied_work_date date, applied_timezone text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_attendance public.hr_attendance%rowtype;
  candidate_work_date date;
  resolved_work_date date;
  resolved_timezone text := nullif(trim(requested_timezone), '');
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  resulting_check_in timestamptz;
  resulting_check_out timestamptz;
  check_in_difference integer;
  check_out_difference integer;
  resulting_status text;
  result_id uuid;
begin
  if requested_event_type not in ('check_in', 'check_out') then
    raise exception 'Device attendance event is invalid';
  end if;
  if requested_occurred_at is null then
    raise exception 'Device attendance timestamp is required';
  end if;
  if resolved_timezone is null
     or not exists (
       select 1 from pg_timezone_names where name = resolved_timezone
     ) then
    raise exception 'Device attendance timezone is invalid';
  end if;
  if not exists (
    select 1 from public.hr_employee_records employee
    where employee.id = requested_employee_id
      and employee.archived_at is null
  ) then
    raise exception 'Device employee record was not found';
  end if;

  resolved_work_date :=
    (requested_occurred_at at time zone resolved_timezone)::date;

  if requested_event_type = 'check_out' then
    select attendance.work_date
    into candidate_work_date
    from public.hr_attendance attendance
    where attendance.employee_record_id = requested_employee_id
      and attendance.check_in is not null
      and attendance.check_out is null
      and attendance.work_date between resolved_work_date - 1 and resolved_work_date
    order by attendance.work_date desc
    limit 1;
    resolved_work_date := coalesce(candidate_work_date, resolved_work_date);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      requested_employee_id::text || ':' || resolved_work_date::text,
      0
    )
  );

  select *
  into current_attendance
  from public.hr_attendance attendance
  where attendance.employee_record_id = requested_employee_id
    and attendance.work_date = resolved_work_date
  for update;

  if current_attendance.id is not null then
    resolved_timezone := current_attendance.timezone;
  end if;
  v_scheduled_start_at := coalesce(
    current_attendance.scheduled_start_at,
    (resolved_work_date + requested_start_time) at time zone resolved_timezone
  );
  v_scheduled_end_at := coalesce(
    current_attendance.scheduled_end_at,
    (
      resolved_work_date
      + case when requested_end_time <= requested_start_time then 1 else 0 end
      + requested_end_time
    ) at time zone resolved_timezone
  );

  resulting_check_in := current_attendance.check_in;
  resulting_check_out := current_attendance.check_out;
  if requested_event_type = 'check_in' then
    resulting_check_in := case
      when resulting_check_in is null
        or requested_occurred_at < resulting_check_in
      then requested_occurred_at
      else resulting_check_in
    end;
  else
    resulting_check_out := case
      when resulting_check_out is null
        or requested_occurred_at > resulting_check_out
      then requested_occurred_at
      else resulting_check_out
    end;
  end if;

  if resulting_check_in is not null
     and resulting_check_out is not null
     and resulting_check_out < resulting_check_in then
    raise exception 'Device check-out cannot be before check-in';
  end if;

  check_in_difference := case
    when resulting_check_in is null then null
    else round(
      extract(epoch from (resulting_check_in - v_scheduled_start_at)) / 60
    )::integer
  end;
  check_out_difference := case
    when resulting_check_out is null then null
    else round(
      extract(epoch from (resulting_check_out - v_scheduled_end_at)) / 60
    )::integer
  end;
  resulting_status := case
    when current_attendance.status in ('overtime', 'holiday_overtime')
      then current_attendance.status
    when coalesce(check_in_difference, 0)
      > greatest(coalesce(requested_late_grace, 0), 0)
      then 'late'
    else 'present'
  end;

  insert into public.hr_attendance (
    employee_record_id, work_date, status, check_in, check_out, source,
    timezone, scheduled_start_at, scheduled_end_at,
    check_in_variance_minutes, check_out_variance_minutes, minutes_late
  ) values (
    requested_employee_id, resolved_work_date, resulting_status,
    resulting_check_in, resulting_check_out, 'device', resolved_timezone,
    v_scheduled_start_at, v_scheduled_end_at, check_in_difference,
    check_out_difference, greatest(coalesce(check_in_difference, 0), 0)
  )
  on conflict (employee_record_id, work_date) do update set
    status = excluded.status,
    check_in = excluded.check_in,
    check_out = excluded.check_out,
    source = excluded.source,
    timezone = excluded.timezone,
    scheduled_start_at = excluded.scheduled_start_at,
    scheduled_end_at = excluded.scheduled_end_at,
    check_in_variance_minutes = excluded.check_in_variance_minutes,
    check_out_variance_minutes = excluded.check_out_variance_minutes,
    minutes_late = excluded.minutes_late,
    updated_at = clock_timestamp()
  returning id into result_id;

  return query select result_id, resolved_work_date, resolved_timezone;
end $$;


--
-- Name: hr_archive_employee(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_archive_employee(actor_profile_id uuid, requested_employee_id uuid, requested_restore boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: hr_record_attendance(uuid, uuid, date, text, timestamp with time zone, timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_record_attendance(actor_profile_id uuid, requested_employee_id uuid, requested_work_date date, requested_status text, requested_check_in timestamp with time zone, requested_check_out timestamp with time zone, requested_notes text, requested_source text DEFAULT 'manual'::text, requested_timezone text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result_id uuid;
  attendance_timezone text;
  schedule_start time;
  schedule_end time;
  schedule_start_at timestamptz;
  schedule_end_at timestamptz;
  check_in_difference integer;
  check_out_difference integer;
begin
  perform public.assert_hr_admin(actor_profile_id);

  if requested_status not in (
    'present','absent','late','half_day','leave','holiday','remote',
    'overtime','holiday_overtime'
  ) then
    raise exception 'Attendance status is invalid';
  end if;

  if requested_check_in is not null
     and requested_check_out is not null
     and requested_check_out < requested_check_in then
    raise exception 'Check-out cannot be before check-in';
  end if;

  select
    coalesce(
      nullif(trim(requested_timezone),''),
      schedule.timezone,
      location.timezone,
      'Asia/Dhaka'
    ),
    coalesce(schedule.workday_start, settings.workday_start),
    coalesce(schedule.workday_end, settings.workday_end)
  into attendance_timezone, schedule_start, schedule_end
  from public.hr_employee_records employee
  cross join public.hr_settings settings
  left join public.hr_employee_work_schedules schedule
    on schedule.employee_record_id = employee.id
   and schedule.weekday = extract(dow from requested_work_date)::integer
  left join public.work_locations location
    on location.id = employee.work_location_id
  where employee.id = requested_employee_id
    and employee.archived_at is null;

  if attendance_timezone is null then
    raise exception 'Employee record was not found';
  end if;

  if not exists (
    select 1 from pg_timezone_names where name = attendance_timezone
  ) then
    raise exception 'Attendance timezone is invalid';
  end if;

  schedule_start_at :=
    (requested_work_date + schedule_start) at time zone attendance_timezone;
  schedule_end_at :=
    (
      requested_work_date
      + case when schedule_end <= schedule_start then 1 else 0 end
      + schedule_end
    ) at time zone attendance_timezone;

  check_in_difference := case
    when requested_check_in is null then null
    else round(extract(epoch from (requested_check_in - schedule_start_at)) / 60)::integer
  end;
  check_out_difference := case
    when requested_check_out is null then null
    else round(extract(epoch from (requested_check_out - schedule_end_at)) / 60)::integer
  end;

  insert into public.hr_attendance(
    employee_record_id, work_date, status, check_in, check_out, notes, source,
    recorded_by, timezone, scheduled_start_at, scheduled_end_at,
    check_in_variance_minutes, check_out_variance_minutes, minutes_late
  ) values (
    requested_employee_id, requested_work_date, requested_status,
    requested_check_in, requested_check_out, nullif(trim(requested_notes),''),
    requested_source, actor_profile_id, attendance_timezone, schedule_start_at,
    schedule_end_at, check_in_difference, check_out_difference,
    greatest(coalesce(check_in_difference, 0), 0)
  )
  on conflict(employee_record_id, work_date) do update set
    status = excluded.status,
    check_in = excluded.check_in,
    check_out = excluded.check_out,
    notes = excluded.notes,
    source = excluded.source,
    recorded_by = excluded.recorded_by,
    timezone = excluded.timezone,
    scheduled_start_at = excluded.scheduled_start_at,
    scheduled_end_at = excluded.scheduled_end_at,
    check_in_variance_minutes = excluded.check_in_variance_minutes,
    check_out_variance_minutes = excluded.check_out_variance_minutes,
    minutes_late = excluded.minutes_late,
    updated_at = now()
  returning id into result_id;

  return result_id;
end $$;


--
-- Name: hr_record_self_attendance(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_record_self_attendance(actor_profile_id uuid, requested_event text, requested_timezone text DEFAULT NULL::text) RETURNS TABLE(attendance_id uuid, event_at timestamp with time zone, event_timezone text, event_type text, work_date date)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  employee public.hr_employee_records%rowtype;
  current_attendance public.hr_attendance%rowtype;
  location_timezone text;
  schedule_timezone text;
  schedule_is_working boolean;
  v_schedule_start time;
  v_schedule_end time;
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  check_in_difference integer;
  check_out_difference integer;
  recorded_at timestamptz := clock_timestamp();
  resolved_timezone text;
  resolved_work_date date;
  candidate_work_date date;
  result_id uuid;
begin
  if requested_event not in ('check_in', 'check_out') then
    raise exception 'Attendance event must be check in or check out';
  end if;

  if nullif(trim(requested_timezone), '') is not null
     and not exists (
       select 1 from pg_timezone_names
       where name = trim(requested_timezone)
     ) then
    raise exception 'The automatically detected timezone is invalid';
  end if;

  select employee_row.*
  into employee
  from public.hr_employee_records employee_row
  join public.profiles profile on profile.id = employee_row.profile_id
  where employee_row.profile_id = actor_profile_id
    and employee_row.archived_at is null
    and employee_row.employment_status in ('active', 'probation')
    and profile.role = 'employee'
    and profile.status = 'active'
    and profile.archived_at is null;

  if employee.id is null then
    raise exception 'An active employee HR record is required to record attendance';
  end if;

  select location.timezone into location_timezone
  from public.work_locations location
  where location.id = employee.work_location_id;

  resolved_timezone := coalesce(
    nullif(trim(location_timezone), ''),
    'Asia/Dhaka'
  );
  if not exists (
    select 1 from pg_timezone_names where name = resolved_timezone
  ) then
    raise exception 'The employee work-location timezone is invalid';
  end if;

  resolved_work_date := (recorded_at at time zone resolved_timezone)::date;

  select
    schedule.timezone, schedule.is_working,
    schedule.workday_start, schedule.workday_end
  into
    schedule_timezone, schedule_is_working,
    v_schedule_start, v_schedule_end
  from public.hr_employee_work_schedules schedule
  where schedule.employee_record_id = employee.id
    and schedule.weekday =
      extract(dow from resolved_work_date)::integer;

  if schedule_timezone is not null then
    resolved_timezone := schedule_timezone;
    resolved_work_date := (recorded_at at time zone resolved_timezone)::date;
  end if;

  select
    schedule.is_working,
    coalesce(schedule.workday_start, settings.workday_start),
    coalesce(schedule.workday_end, settings.workday_end)
  into schedule_is_working, v_schedule_start, v_schedule_end
  from public.hr_settings settings
  left join public.hr_employee_work_schedules schedule
    on schedule.employee_record_id = employee.id
   and schedule.weekday = extract(dow from resolved_work_date)::integer
  limit 1;

  v_scheduled_start_at :=
    (resolved_work_date + v_schedule_start) at time zone resolved_timezone;
  v_scheduled_end_at :=
    (
      resolved_work_date
      + case when v_schedule_end <= v_schedule_start then 1 else 0 end
      + v_schedule_end
    ) at time zone resolved_timezone;

  if requested_event = 'check_in' and schedule_is_working is false then
    raise exception 'Today is configured as a non-working day';
  end if;

  if requested_event = 'check_out' then
    select attendance.work_date
    into candidate_work_date
    from public.hr_attendance attendance
    where attendance.employee_record_id = employee.id
      and attendance.check_in is not null
      and attendance.check_out is null
      and attendance.work_date between resolved_work_date - 1 and resolved_work_date
    order by attendance.work_date desc
    limit 1;
    resolved_work_date := coalesce(candidate_work_date, resolved_work_date);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(employee.id::text || ':' || resolved_work_date::text, 0)
  );

  select *
  into current_attendance
  from public.hr_attendance
  where employee_record_id = employee.id
    and hr_attendance.work_date = resolved_work_date
  for update;

  if current_attendance.id is not null then
    resolved_timezone := current_attendance.timezone;
    v_scheduled_start_at := coalesce(
      current_attendance.scheduled_start_at,
      v_scheduled_start_at
    );
    v_scheduled_end_at := coalesce(
      current_attendance.scheduled_end_at,
      v_scheduled_end_at
    );
  end if;

  if requested_event = 'check_in' then
    if current_attendance.check_in is not null then
      raise exception 'You have already checked in today';
    end if;
    if current_attendance.id is not null
       and current_attendance.status not in (
         'present','late','half_day','remote','overtime','holiday_overtime'
       ) then
      raise exception 'Today''s attendance status does not allow check in';
    end if;

    check_in_difference :=
      round(extract(epoch from (recorded_at - v_scheduled_start_at)) / 60)::integer;

    if current_attendance.id is null then
      insert into public.hr_attendance (
        employee_record_id, work_date, status, check_in, source, recorded_by,
        timezone, scheduled_start_at, scheduled_end_at,
        check_in_variance_minutes, minutes_late
      ) values (
        employee.id, resolved_work_date, 'present', recorded_at,
        'self_service', actor_profile_id, resolved_timezone,
        v_scheduled_start_at, v_scheduled_end_at, check_in_difference,
        greatest(check_in_difference, 0)
      )
      returning id into result_id;
    else
      update public.hr_attendance
      set
        check_in = recorded_at,
        source = 'self_service',
        recorded_by = actor_profile_id,
        timezone = resolved_timezone,
        scheduled_start_at = v_scheduled_start_at,
        scheduled_end_at = v_scheduled_end_at,
        check_in_variance_minutes = check_in_difference,
        minutes_late = greatest(check_in_difference, 0),
        updated_at = recorded_at
      where id = current_attendance.id
      returning id into result_id;
    end if;
  else
    if current_attendance.id is null
       or current_attendance.check_in is null then
      raise exception 'Check in before checking out';
    end if;
    if current_attendance.check_out is not null then
      raise exception 'You have already checked out today';
    end if;

    check_out_difference :=
      round(extract(epoch from (recorded_at - v_scheduled_end_at)) / 60)::integer;

    update public.hr_attendance
    set
      check_out = recorded_at,
      source = 'self_service',
      recorded_by = actor_profile_id,
      timezone = resolved_timezone,
      scheduled_start_at = v_scheduled_start_at,
      scheduled_end_at = v_scheduled_end_at,
      check_out_variance_minutes = check_out_difference,
      updated_at = recorded_at
    where id = current_attendance.id
    returning id into result_id;
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, module, entity_type, entity_id,
    description, new_values
  ) values (
    actor_profile_id, 'employee',
    'hr.attendance.self_' || requested_event, 'hr', 'attendance',
    result_id::text,
    case when requested_event = 'check_in'
      then 'Employee checked in.'
      else 'Employee checked out.'
    end,
    jsonb_build_object(
      'event', requested_event,
      'eventAt', recorded_at,
      'timezone', resolved_timezone,
      'browserTimezone', nullif(trim(requested_timezone), ''),
      'workDate', resolved_work_date,
      'source', 'self_service'
    )
  );

  return query select
    result_id, recorded_at, resolved_timezone, requested_event,
    resolved_work_date;
end $$;


--
-- Name: hr_replace_employee_schedule(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_replace_employee_schedule(actor_profile_id uuid, requested_employee_id uuid, requested_schedule jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  actor_role public.account_role;
begin
  perform public.assert_hr_admin(actor_profile_id);

  if not exists (
    select 1
    from public.hr_employee_records
    where id = requested_employee_id and archived_at is null
  ) then
    raise exception 'Employee record was not found';
  end if;

  if jsonb_typeof(requested_schedule) <> 'array'
     or jsonb_array_length(requested_schedule) <> 7 then
    raise exception 'Provide one schedule row for every weekday';
  end if;

  if (
    select count(distinct (item->>'weekday')::integer)
    from jsonb_array_elements(requested_schedule) item
  ) <> 7 then
    raise exception 'Schedule weekdays must be unique';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(requested_schedule) item
    where (item->>'weekday')::integer not between 0 and 6
      or coalesce(item->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(item->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or not exists (
        select 1
        from pg_timezone_names tz
        where tz.name = item->>'timezone'
      )
  ) then
    raise exception 'Schedule row is invalid';
  end if;

  delete from public.hr_employee_work_schedules
  where employee_record_id = requested_employee_id;

  insert into public.hr_employee_work_schedules(
    employee_record_id, weekday, is_working, workday_start, workday_end,
    timezone, created_by, updated_by
  )
  select
    requested_employee_id,
    (item->>'weekday')::smallint,
    coalesce((item->>'isWorking')::boolean, false),
    (item->>'startTime')::time,
    (item->>'endTime')::time,
    item->>'timezone',
    actor_profile_id,
    actor_profile_id
  from jsonb_array_elements(requested_schedule) item;

  select role into actor_role from public.profiles where id = actor_profile_id;
  insert into public.audit_logs(
    actor_id, actor_role, action, module, entity_type, entity_id, description,
    new_values
  ) values (
    actor_profile_id, actor_role, 'hr.employee_schedule_saved', 'hr',
    'employee_record', requested_employee_id::text,
    'Employee weekday work schedule saved.',
    jsonb_build_object('schedule', requested_schedule)
  );
end $_$;


--
-- Name: hr_review_attendance_correction(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_review_attendance_correction(actor_profile_id uuid, requested_correction_id uuid, requested_decision text, requested_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare correction public.hr_attendance_correction_requests%rowtype; target_profile uuid;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_decision not in('approved','rejected') then raise exception 'Invalid correction decision'; end if;
  select * into correction from public.hr_attendance_correction_requests where id=requested_correction_id for update;
  if correction.id is null or correction.status<>'pending' then raise exception 'Only pending corrections can be reviewed'; end if;
  if requested_decision='approved' then
    perform public.hr_record_attendance(actor_profile_id,correction.employee_record_id,correction.work_date,
      correction.requested_status,correction.requested_check_in,correction.requested_check_out,
      'Approved attendance correction','correction');
  end if;
  update public.hr_attendance_correction_requests set status=requested_decision,reviewed_by=actor_profile_id,
    reviewed_at=now(),review_note=nullif(trim(requested_note),''),updated_at=now() where id=correction.id;
  select profile_id into target_profile from public.hr_employee_records where id=correction.employee_record_id;
  insert into public.customer_notifications(profile_id,notification_type,title,message,entity_type,entity_id)
  values(target_profile,'system','Attendance correction '||requested_decision,
    'Your attendance correction request was '||requested_decision||'.','hr_attendance_correction',correction.id);
end $$;


--
-- Name: hr_review_leave(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_review_leave(actor_profile_id uuid, requested_leave_id uuid, requested_decision text, requested_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare leave_row public.hr_leave_requests%rowtype; target_profile uuid; leave_days numeric(6,2);
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_decision not in('approved','rejected') then raise exception 'Invalid leave decision'; end if;
  select * into leave_row from public.hr_leave_requests where id=requested_leave_id for update;
  if leave_row.id is null or leave_row.status<>'pending' then raise exception 'Only pending leave can be reviewed'; end if;
  leave_days:=coalesce(leave_row.requested_days,(leave_row.end_date-leave_row.start_date+1)::numeric);
  if requested_decision='approved' and leave_row.leave_type_id is not null then
    update public.hr_leave_balances set used_days=used_days+leave_days,updated_by=actor_profile_id,updated_at=now()
    where employee_record_id=leave_row.employee_record_id and leave_type_id=leave_row.leave_type_id
      and leave_year=extract(year from leave_row.start_date)::integer
      and used_days+leave_days<=allocated_days+adjusted_days;
    if not found then raise exception 'Insufficient configured leave balance'; end if;
  end if;
  update public.hr_leave_requests set status=requested_decision,reviewed_by=actor_profile_id,reviewed_at=now(),
    review_note=nullif(trim(requested_note),''),updated_at=now() where id=leave_row.id;
  select profile_id into target_profile from public.hr_employee_records where id=leave_row.employee_record_id;
  insert into public.customer_notifications(profile_id,notification_type,title,message,entity_type,entity_id)
  values(target_profile,'system','Leave request '||requested_decision,
    'Your leave request was '||requested_decision||'.','hr_leave_request',leave_row.id);
end $$;


--
-- Name: hr_upsert_employee(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, date, uuid, uuid, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_upsert_employee(actor_profile_id uuid, requested_employee_id uuid, requested_profile_id uuid, requested_department_id uuid, requested_team_id uuid, requested_designation_id uuid, requested_job_title text, requested_employment_type text, requested_status text, requested_hire_date date, requested_work_location_id uuid, requested_manager_profile_id uuid, requested_base_salary numeric, requested_currency text, requested_emergency_name text, requested_emergency_phone text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  result_id uuid;
  actor_record public.profiles%rowtype;
  target_record public.profiles%rowtype;
  employee_record public.hr_employee_records%rowtype;
  target_profile_id uuid;
  can_manage_salary boolean;
begin
  select * into actor_record from public.profiles where id=actor_profile_id for update;
  perform public.assert_actor_permission(actor_profile_id,'hr.manage_employees');
  can_manage_salary:=actor_record.role='admin' or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id)
    where permission_key='hr.manage_payroll'
  );
  if trim(coalesce(requested_job_title,''))='' then raise exception 'Job title is required'; end if;
  if requested_employee_id is null then
    select * into target_record from public.profiles
    where id=requested_profile_id and role='employee' and status='active' and archived_at is null
    for update;
    if target_record.id is null then raise exception 'Active employee profile required'; end if;
    target_profile_id:=target_record.id;
    insert into public.hr_employee_records(
      profile_id,employee_number,department_id,team_id,designation_id,job_title,
      employment_type,employment_status,hire_date,work_location_id,manager_profile_id,
      base_salary,salary_currency,emergency_contact_name,emergency_contact_phone,created_by,updated_by
    ) values (
      target_profile_id,public.next_employee_number(),requested_department_id,requested_team_id,
      requested_designation_id,left(trim(requested_job_title),120),requested_employment_type,
      requested_status,requested_hire_date,requested_work_location_id,requested_manager_profile_id,
      case when can_manage_salary then requested_base_salary else null end,
      case when can_manage_salary then upper(coalesce(requested_currency,'BDT')) else 'BDT' end,
      nullif(trim(requested_emergency_name),''),nullif(trim(requested_emergency_phone),''),
      actor_profile_id,actor_profile_id
    ) returning id into result_id;
  else
    select * into employee_record from public.hr_employee_records
    where id=requested_employee_id and archived_at is null
    for update;
    if employee_record.id is null then raise exception 'Employee record was not found'; end if;
    if requested_profile_id is distinct from employee_record.profile_id then
      raise exception 'Employee profile cannot be changed';
    end if;
    target_profile_id:=employee_record.profile_id;
    update public.hr_employee_records set
      department_id=requested_department_id,team_id=requested_team_id,designation_id=requested_designation_id,
      job_title=left(trim(requested_job_title),120),employment_type=requested_employment_type,
      employment_status=requested_status,hire_date=requested_hire_date,work_location_id=requested_work_location_id,
      manager_profile_id=requested_manager_profile_id,
      base_salary=case when can_manage_salary then requested_base_salary else base_salary end,
      salary_currency=case when can_manage_salary then upper(coalesce(requested_currency,'BDT')) else salary_currency end,
      emergency_contact_name=nullif(trim(requested_emergency_name),''),
      emergency_contact_phone=nullif(trim(requested_emergency_phone),''),
      updated_by=actor_profile_id,updated_at=now()
    where id=employee_record.id returning id into result_id;
  end if;
  if result_id is null then raise exception 'Employee record was not found'; end if;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description)
  values(actor_profile_id,actor_record.role,target_profile_id,'hr.employee_saved','hr','employee_record',result_id::text,'Employee HR record saved.');
  return result_id;
end $$;


--
-- Name: inventory_dashboard_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_dashboard_summary(actor_profile_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ declare result jsonb; begin
 if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='inventory.view') then raise exception 'Permission denied'; end if;
 with product_stock as(select p.id,p.low_stock_threshold,p.allow_backorders,coalesce(sum(b.available),0) available from public.products p left join public.inventory_balances b on b.product_id=p.id where p.status='active' group by p.id), warehouse_stock as(select w.id,w.code,w.name,coalesce(sum(b.on_hand),0) on_hand,coalesce(sum(b.available),0) available from public.warehouses w left join public.inventory_balances b on b.warehouse_id=w.id where w.is_active group by w.id)
 select jsonb_build_object('active_products',(select count(*) from public.products where status='active'),'simple_products',(select count(*) from public.products where status='active' and product_type='simple'),'variable_products',(select count(*) from public.products where status='active' and product_type='variable'),'variations',(select count(*) from public.product_variations where status='active'),'on_hand',coalesce((select sum(on_hand) from public.inventory_balances),0),'available',coalesce((select sum(available) from public.inventory_balances),0),'reserved',coalesce((select sum(reserved) from public.inventory_balances),0),'low_stock',(select count(*) from product_stock where available>0 and available<=low_stock_threshold),'out_of_stock',(select count(*) from product_stock where available<=0),'serialized_units',(select count(*) from public.serial_numbers where status not in('removed','sold')),'warehouses',coalesce((select jsonb_agg(to_jsonb(warehouse_stock) order by name) from warehouse_stock),'[]'::jsonb)) into result; return result;
end $$;


--
-- Name: is_current_user_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_current_user_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active');
$$;


--
-- Name: is_hr_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_hr_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and role='admin' and status='active' and archived_at is null
  )
$$;


--
-- Name: lock_cashbook_timeline(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_cashbook_timeline() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform pg_advisory_xact_lock(20260731,11);
end $$;


--
-- Name: mark_shipment_delivered(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_shipment_delivered(actor_profile_id uuid, requested_shipment_id uuid, requested_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare s public.shipments%rowtype; si public.shipment_items%rowtype; status_id uuid; begin perform public.assert_actor_permission(actor_profile_id,'shipments.confirm_receipt'); select * into s from public.shipments where id=requested_shipment_id for update; if s.status not in('dispatched','in_transit','arrived','out_for_delivery') then raise exception 'Shipment is not eligible for delivery'; end if; for si in select * from public.shipment_items where shipment_id=s.id for update loop update public.shipment_items set delivered_quantity=quantity where id=si.id; update public.sales_order_items set delivered_quantity=least(quantity,delivered_quantity+si.quantity),updated_at=now() where id=si.order_item_id; update public.order_serial_allocations set status='delivered',delivered_at=now() where id in(select allocation_id from public.shipment_serials where shipment_item_id=si.id); update public.serial_numbers set status='delivered',updated_at=now() where id in(select serial_number_id from public.shipment_serials where shipment_item_id=si.id); end loop; select id into status_id from public.tracking_status_definitions where key='delivered' and is_active limit 1; update public.shipments set status='delivered',actual_arrival_at=now(),delivered_at=now(),latest_tracking_status_id=status_id,updated_by=actor_profile_id,updated_at=now() where id=s.id; if status_id is not null then insert into public.shipment_tracking_events(shipment_id,order_id,tracking_status_id,actor_profile_id,location_snapshot,location_source,transport_mode_snapshot,customer_visible_title,customer_visible_message,event_visibility,occurred_at) values(s.id,s.order_id,status_id,actor_profile_id,s.destination_snapshot,'system',s.transport_mode,'Delivered',coalesce(nullif(left(requested_note,1000),''),'Your shipment was delivered.'),'both',now()); end if; perform public.derive_sales_order_status(s.order_id); end $$;


--
-- Name: next_crm_chatbot_inquiry_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_crm_chatbot_inquiry_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select 'CHAT-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.crm_chatbot_inquiry_number_seq')::text,6,'0');
$$;


--
-- Name: next_crm_lead_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_crm_lead_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select 'LEAD-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.crm_lead_number_seq')::text,5,'0');
$$;


--
-- Name: next_employee_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_employee_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select 'SEN-'||lpad(nextval('public.employee_number_seq')::text,6,'0') $$;


--
-- Name: next_journal_entry_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_journal_entry_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select 'JE-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.journal_entry_number_seq')::text,6,'0') $$;


--
-- Name: next_purchase_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_purchase_order_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select 'PO-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.purchase_order_number_seq')::text,5,'0');
$$;


--
-- Name: next_purchase_receipt_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_purchase_receipt_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select 'PR-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.purchase_receipt_number_seq')::text,5,'0');
$$;


--
-- Name: next_sales_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_sales_order_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare candidate text; attempts integer:=0; begin loop attempts:=attempts+1; candidate:='SEN-ORD-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6); exit when not exists(select 1 from public.sales_orders where order_number=candidate); if attempts>=20 then raise exception 'Unable to generate order number'; end if; end loop; return candidate; end $$;


--
-- Name: next_sen_serial(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_sen_serial(requested_product_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare brand_name text; model text; candidate text; attempts integer:=0;
begin
  select b.name,p.model_number into brand_name,model from public.products p join public.brands b on b.id=p.brand_id and b.is_active where p.id=requested_product_id and p.status<>'archived';
  if brand_name is null then raise exception 'An active brand is required before generating SEN serials'; end if;
  if nullif(trim(model),'') is null then raise exception 'Model number is required before generating SEN serials'; end if;
  loop
    attempts:=attempts+1;
    candidate:='SEN-'||public.normalize_serial_component(brand_name)||'-'||public.normalize_serial_component(model)||'-'||to_char(timezone('Asia/Dhaka',now()),'DD-MM-YYYY')||'-'||public.secure_random_digits(10);
    exit when not exists(select 1 from public.serial_numbers where sen_serial=candidate) and not exists(select 1 from public.serial_number_history where previous_sen_serial=candidate or new_sen_serial=candidate);
    if attempts>=20 then raise exception 'Unable to generate a unique SEN serial'; end if;
  end loop;
  return candidate;
end $$;


--
-- Name: next_shipment_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_shipment_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare candidate text; attempts integer:=0; begin loop attempts:=attempts+1; candidate:='SEN-SHP-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6); exit when not exists(select 1 from public.shipments where shipment_number=candidate); if attempts>=20 then raise exception 'Unable to generate shipment number'; end if; end loop; return candidate; end $$;


--
-- Name: normalize_manufacturer_serial(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_manufacturer_serial(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select nullif(upper(regexp_replace(trim(value),'[^A-Za-z0-9]','','g')),'');
$$;


--
-- Name: normalize_serial_component(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_serial_component(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select trim(both '-' from regexp_replace(regexp_replace(upper(trim(value)),'[^A-Z0-9]+','-','g'),'-+','-','g'));
$$;


--
-- Name: notify_customer_support_reply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_customer_support_reply() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  conversation public.support_conversations%rowtype;
  sender_role text;
begin
  select * into conversation
  from public.support_conversations
  where id=new.conversation_id;
  select role into sender_role from public.profiles where id=new.sender_profile_id;

  if sender_role in ('admin','employee') then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      conversation.profile_id,
      'support_reply',
      'New message from SEN',
      left(new.body,240),
      '/account/messages/'||conversation.id::text,
      'support_conversation',
      conversation.id
    );
  end if;
  return new;
end $$;


--
-- Name: notify_quotation_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_quotation_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  notification_title text;
  notification_message text;
  notification_kind text;
  staff_profile record;
begin
  if tg_op='INSERT' then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.profile_id,'quotation_submitted','Quotation request submitted',
      'Your request '||new.reference||' was submitted successfully.',
      '/account/quotations','quotation_request',new.id
    );
    for staff_profile in
      select id from public.profiles
      where role='admin' and status='active' and id<>new.profile_id
    loop
      insert into public.customer_notifications(
        profile_id,notification_type,title,message,href,entity_type,entity_id
      ) values (
        staff_profile.id,'quotation_staff_new','New quotation request',
        'Quotation request '||new.reference||' requires review.',
        '/admin/quotations/'||new.id,'quotation_request',new.id
      );
    end loop;
    return new;
  end if;

  if old.assigned_to is distinct from new.assigned_to and new.assigned_to is not null then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.assigned_to,'quotation_assigned','Quotation assigned',
      'Quotation '||new.reference||' has been assigned to you.',
      '/admin/quotations/'||new.id,'quotation_request',new.id
    );
  end if;

  if old.status is distinct from new.status then
    notification_kind:='quotation_'||new.status;
    notification_title:=case new.status
      when 'additional_info_required' then 'More quotation information required'
      when 'approved' then 'Quotation approved'
      when 'rejected' then 'Quotation rejected'
      when 'quoted' then 'Quotation updated'
      when 'converted_to_invoice' then 'Quotation converted to invoice'
      else 'Quotation status updated'
    end;
    notification_message:=case new.status
      when 'additional_info_required' then 'SEN needs additional information for '||new.reference||'.'
      when 'approved' then 'Quotation '||new.reference||' has been approved.'
      when 'rejected' then 'Quotation '||new.reference||' has been rejected.'
      when 'converted_to_invoice' then 'Quotation '||new.reference||' has been converted into a sales invoice.'
      else 'Quotation '||new.reference||' is now '||replace(new.status,'_',' ')||'.'
    end;
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.profile_id,notification_kind,notification_title,notification_message,
      '/account/quotations','quotation_request',new.id
    );
  elsif old.updated_at is distinct from new.updated_at then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.profile_id,'quotation_updated','Quotation updated',
      'Quotation '||new.reference||' has been updated.',
      '/account/quotations','quotation_request',new.id
    );
  end if;
  return new;
end $$;


--
-- Name: on_auth_user_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_auth_user_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$ begin insert into public.profiles (id,email,full_name,phone,country,customer_type,company_name) values (new.id,new.email,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',coalesce(new.raw_user_meta_data->>'country','Bangladesh'),coalesce((new.raw_user_meta_data->>'customer_type')::public.customer_type,'individual'),new.raw_user_meta_data->>'company_name') on conflict (id) do nothing; return new; end; $$;


--
-- Name: phase3_manage_location_session(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase3_manage_location_session(actor_profile_id uuid, requested_shipment_id uuid, requested_action text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare session_row public.delivery_location_sessions%rowtype; actor_role public.account_role; shipment_status text;
begin
  select role into actor_role from public.profiles where id=actor_profile_id and status='active';
  if actor_role is null or (actor_role<>'admin' and not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='shipments.share_location')) then raise exception 'Permission denied'; end if;
  select status into shipment_status from public.shipments where id=requested_shipment_id;
  if shipment_status is null or shipment_status in('delivered','cancelled') then raise exception 'Shipment is not eligible for location sharing'; end if;
  select * into session_row from public.delivery_location_sessions where shipment_id=requested_shipment_id and status in('active','paused') order by created_at desc limit 1 for update;
  if requested_action='start' then
    if session_row.id is null then insert into public.delivery_location_sessions(shipment_id,actor_profile_id) values(requested_shipment_id,actor_profile_id) returning * into session_row;
    else update public.delivery_location_sessions set status='active',paused_at=null,updated_at=now() where id=session_row.id returning * into session_row; end if;
  elsif requested_action='pause' and session_row.id is not null then update public.delivery_location_sessions set status='paused',paused_at=now(),updated_at=now() where id=session_row.id returning * into session_row;
  elsif requested_action='stop' and session_row.id is not null then update public.delivery_location_sessions set status='stopped',ended_at=now(),updated_at=now() where id=session_row.id returning * into session_row;
  else raise exception 'Invalid location session action'; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
    values(actor_profile_id,actor_role,'delivery.location_session_'||requested_action,'shipments','delivery_location_session',session_row.id::text,'Delivery location session updated.',jsonb_build_object('shipment_id',requested_shipment_id,'status',session_row.status));
  return session_row.id;
end $$;


--
-- Name: phase3_normalize_identifier(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase3_normalize_identifier(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select nullif(trim(both '-' from regexp_replace(regexp_replace(upper(trim(coalesce(value,''))),'[^A-Z0-9]+','-','g'),'-+','-','g')),'');
$$;


--
-- Name: phase3_product_identity_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase3_product_identity_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare brand_name text;
begin
  if new.brand_id is not null then select name into brand_name from public.brands where id=new.brand_id; end if;
  new.normalized_brand_key := public.phase3_normalize_identifier(brand_name);
  new.normalized_model_number := public.phase3_normalize_identifier(new.model_number);
  if new.status <> 'archived' and new.normalized_brand_key is not null and new.normalized_model_number is not null
     and exists(select 1 from public.products p where p.id <> new.id and p.status <> 'archived'
       and p.normalized_brand_key=new.normalized_brand_key and p.normalized_model_number=new.normalized_model_number) then
    raise exception 'This active brand and model already exists';
  end if;
  return new;
end $$;


--
-- Name: phase3_receive_serialized_stock(uuid, uuid, uuid, uuid, integer, text, uuid, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase3_receive_serialized_stock(actor_profile_id uuid, requested_product_id uuid, requested_variation_id uuid, requested_warehouse_id uuid, requested_quantity integer, requested_condition text, requested_reason_id uuid, requested_notes text, requested_manufacturer_serials text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare batch_id uuid; movement_id uuid:=gen_random_uuid(); actor_role public.account_role;
  balance_row public.inventory_balances%rowtype; serial_row record; manufacturer text; normalized text; i integer;
begin
  if requested_quantity < 1 or requested_quantity > 200 then raise exception 'Quantity must be between 1 and 200'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key in('inventory.receive','inventory.adjust_stock','serials.generate')) then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.products where id=requested_product_id and serial_tracking_required and status<>'archived') then raise exception 'An active serial-tracked product is required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if coalesce(array_length(requested_manufacturer_serials,1),0)>requested_quantity then raise exception 'Manufacturer serial count exceeds quantity'; end if;
  for i in 1..requested_quantity loop
    manufacturer:=nullif(trim(coalesce(requested_manufacturer_serials[i],'')),''); normalized:=public.normalize_manufacturer_serial(manufacturer);
    if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized) then raise exception 'Manufacturer serial already exists: %',manufacturer; end if;
  end loop;
  batch_id:=public.generate_serial_batch(actor_profile_id,requested_product_id,requested_variation_id,requested_warehouse_id,requested_quantity,requested_condition,requested_notes,requested_manufacturer_serials);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(requested_warehouse_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select * into balance_row from public.inventory_balances where warehouse_id=requested_warehouse_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null for update;
  insert into public.inventory_movements(id,reference,movement_type,status,destination_warehouse_id,reason_id,notes,initiated_by,confirmed_at)
    values(movement_id,'RCV-'||upper(substr(replace(movement_id::text,'-',''),1,12)),'purchase_receipt','confirmed',requested_warehouse_id,requested_reason_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=on_hand+requested_quantity,updated_at=now() where id=balance_row.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after)
    values(movement_id,requested_product_id,requested_variation_id,requested_warehouse_id,requested_quantity,balance_row.on_hand+requested_quantity);
  for serial_row in select * from public.serial_numbers where generation_batch_id=batch_id for update loop
    update public.serial_numbers set status='available',received_at=now(),received_by=actor_profile_id,last_movement_id=movement_id,updated_at=now() where id=serial_row.id;
    insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,new_warehouse_id,movement_id,reason,actor_id)
      values(serial_row.id,'received','expected','available',requested_warehouse_id,movement_id,left(requested_notes,1000),actor_profile_id);
    perform public.capture_serial_event(serial_row.id,movement_id,null,'serial.received',actor_profile_id,requested_notes);
  end loop;
  update public.serial_generation_batches set status='received' where id=batch_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
    values(actor_profile_id,actor_role,'inventory.serialized_stock_added','inventory','serial_generation_batch',batch_id::text,'Serialized stock received atomically.',jsonb_build_object('product_id',requested_product_id,'warehouse_id',requested_warehouse_id,'quantity',requested_quantity,'movement_id',movement_id));
  return batch_id;
end $$;


--
-- Name: phase3_record_location(uuid, uuid, numeric, numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase3_record_location(actor_profile_id uuid, requested_session_id uuid, requested_latitude numeric, requested_longitude numeric, requested_accuracy numeric, requested_heading numeric, requested_speed numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  session_row public.delivery_location_sessions%rowtype;
  update_id uuid:=gen_random_uuid();
begin
  select location_session.* into session_row
    from public.delivery_location_sessions location_session
    where location_session.id=requested_session_id
      and location_session.actor_profile_id=phase3_record_location.actor_profile_id
      and location_session.status='active'
    for update;
  if session_row.id is null then raise exception 'Active location session required'; end if;
  if exists(
    select 1 from public.delivery_location_updates
    where session_id=requested_session_id and recorded_at > now()-interval '55 seconds'
  ) then return null; end if;
  insert into public.delivery_location_updates(
    id,session_id,shipment_id,actor_profile_id,latitude,longitude,
    accuracy,heading,speed
  ) values(
    update_id,session_row.id,session_row.shipment_id,actor_profile_id,
    requested_latitude,requested_longitude,requested_accuracy,
    requested_heading,requested_speed
  );
  update public.delivery_location_sessions
    set last_update_at=now(),updated_at=now() where id=session_row.id;
  update public.shipments
    set latest_location_snapshot=jsonb_build_object(
      'latitude',requested_latitude,
      'longitude',requested_longitude,
      'accuracy',requested_accuracy,
      'recorded_at',now(),
      'source','employee_shared_location'
    ),updated_at=now()
    where id=session_row.shipment_id;
  return update_id;
end $$;


--
-- Name: post_journal_entry(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_journal_entry(actor_profile_id uuid, requested_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare entry_row public.journal_entries%rowtype; actor_role public.account_role; debit_total numeric; credit_total numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.approve_entry');
  select * into entry_row from public.journal_entries where id=requested_entry_id for update;
  if entry_row.id is null or entry_row.status<>'draft' then raise exception 'Only a draft journal can be posted'; end if;
  select coalesce(sum(debit),0),coalesce(sum(credit),0) into debit_total,credit_total from public.journal_lines where journal_entry_id=requested_entry_id;
  if debit_total<=0 or debit_total<>credit_total then raise exception 'Journal is not balanced'; end if;
  update public.journal_entries set status='posted',posted_by=actor_profile_id,posted_at=now(),updated_at=now() where id=requested_entry_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.journal_posted','accounting','journal_entry',requested_entry_id::text,'Journal entry posted.',jsonb_build_object('total',debit_total));
end $$;


--
-- Name: post_received_purchase_order(uuid, uuid, date, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_received_purchase_order(actor_profile_id uuid, requested_order_id uuid, requested_receipt_date date, requested_delivery_reference text, requested_invoice_reference text, requested_notes text, requested_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  original_status text;
  resulting_status text;
  receipt_id uuid;
begin
  select status into original_status
  from public.purchase_orders
  where id=requested_order_id
  for update;

  if original_status not in('received','partially_received') then
    raise exception 'Purchase order must be physically received before stock can be posted';
  end if;

  -- The existing atomic stock-posting routine accepts ordered/partial orders.
  -- This temporary state exists only inside this transaction and is never externally visible.
  if original_status='received' then
    update public.purchase_orders set status='ordered' where id=requested_order_id;
  end if;

  receipt_id:=public.receive_purchase_order(
    actor_profile_id,
    requested_order_id,
    requested_receipt_date,
    requested_delivery_reference,
    requested_invoice_reference,
    requested_notes,
    requested_items
  );

  select status into resulting_status
  from public.purchase_orders
  where id=requested_order_id;

  if resulting_status='received' then
    resulting_status:='stock_received';
    update public.purchase_orders
    set status=resulting_status,completed_at=now(),updated_by=actor_profile_id
    where id=requested_order_id;

    update public.purchase_inbound_shipments
    set status='stock_received',stock_received_at=now(),updated_by=actor_profile_id
    where purchase_order_id=requested_order_id;
  end if;

  update public.purchase_order_status_events
  set previous_status=original_status,
      new_status=resulting_status,
      note='Stock posted to warehouse inventory for receipt ' || (
        select receipt_number from public.purchase_receipts where id=receipt_id
      )
  where id=(
    select id
    from public.purchase_order_status_events
    where purchase_order_id=requested_order_id
    order by created_at desc,id desc
    limit 1
  );

  return receipt_id;
end $$;


--
-- Name: prevent_claimed_trash_deletion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_claimed_trash_deletion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: protect_profile_access_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_access_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if auth.role() is distinct from 'service_role' and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Role and status may only be changed through authorized account administration';
  end if;
  return new;
end;
$$;


--
-- Name: purchase_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at=now();
  return new;
end $$;


--
-- Name: queue_quotation_expiry_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.queue_quotation_expiry_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare inserted_count integer;
begin
  insert into public.customer_notifications(
    profile_id,notification_type,title,message,href,entity_type,entity_id
  )
  select q.profile_id,'quotation_expiring','Quotation expiring soon',
         'Quotation '||q.reference||' will expire on '||to_char(q.expiration_date,'DD Mon YYYY')||'.',
         '/account/quotations','quotation_request',q.id
  from public.quotation_requests q
  where q.status in('quoted','approved','accepted')
    and q.expiration_date between current_date and current_date+3
    and not exists(
      select 1 from public.customer_notifications n
      where n.profile_id=q.profile_id
        and n.notification_type='quotation_expiring'
        and n.entity_type='quotation_request'
        and n.entity_id=q.id
    );
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;


--
-- Name: quotation_address_snapshot(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.quotation_address_snapshot(requested_address_id uuid, requested_profile_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'recipient_name',a.recipient_name,
    'phone',a.phone,
    'alternate_phone',a.alternate_phone,
    'address_line_1',a.address_line_1,
    'address_line_2',a.address_line_2,
    'area',a.area,
    'city',a.city,
    'region',a.region,
    'postal_code',a.postal_code,
    'country_code',a.country_code,
    'delivery_instructions',a.delivery_instructions,
    'map_label',a.map_label
  )
  from public.customer_addresses a
  where a.id=requested_address_id and a.profile_id=requested_profile_id;
$$;


--
-- Name: reactivate_cancelled_sales_order(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_cancelled_sales_order(actor_profile_id uuid, requested_order_id uuid, requested_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_status text;
begin
  perform public.assert_actor_permission(actor_profile_id,'orders.confirm');
  select status into current_status from public.sales_orders where id=requested_order_id for update;
  if current_status is null then raise exception 'Order not found.'; end if;
  if current_status<>'cancelled' then raise exception 'Only a cancelled order can be reactivated.'; end if;
  update public.sales_orders set status='draft',cancelled_at=null,updated_by=actor_profile_id,updated_at=now() where id=requested_order_id;
  insert into public.order_status_events(order_id,old_status,new_status,actor_profile_id,note)
  values(requested_order_id,'cancelled','draft',actor_profile_id,coalesce(nullif(trim(requested_note),''),'Cancelled order reactivated for review'));
  return requested_order_id;
end $$;


--
-- Name: receive_purchase_order(uuid, uuid, date, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receive_purchase_order(actor_profile_id uuid, requested_order_id uuid, requested_receipt_date date, requested_delivery_reference text, requested_invoice_reference text, requested_notes text, requested_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  order_row public.purchase_orders%rowtype;
  order_item public.purchase_order_items%rowtype;
  product_row public.products%rowtype;
  expected_serial public.serial_numbers%rowtype;
  item jsonb;
  quantity numeric;
  manufacturer_serials jsonb;
  movement_id uuid:=gen_random_uuid();
  receipt_id uuid:=gen_random_uuid();
  receipt_number text;
  balance_row public.inventory_balances%rowtype;
  batch_id uuid;
  fallback_batch_id uuid;
  i integer;
  generated text;
  manufacturer text;
  normalized text;
  serial_id uuid;
  actor_role public.account_role;
  previous_status text;
  all_received boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'inventory.receive_new_stock');
  perform public.assert_actor_permission(actor_profile_id,'inventory.receive');

  select * into order_row
  from public.purchase_orders
  where id=requested_order_id
  for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if order_row.status not in('ordered','partially_received') then
    raise exception 'Only ordered purchase orders can be received';
  end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then
    raise exception 'At least one received item is required';
  end if;

  select role into actor_role
  from public.profiles
  where id=actor_profile_id and status='active';
  receipt_number:=public.next_purchase_receipt_number();

  insert into public.inventory_movements(
    id,reference,movement_type,status,destination_warehouse_id,notes,initiated_by,confirmed_at
  ) values(
    movement_id,receipt_number,'purchase_receipt','confirmed',order_row.destination_warehouse_id,
    nullif(left(trim(requested_notes),1000),''),actor_profile_id,now()
  );
  insert into public.purchase_receipts(
    id,receipt_number,purchase_order_id,warehouse_id,inventory_movement_id,receipt_date,
    supplier_delivery_reference,supplier_invoice_reference,notes,received_by
  ) values(
    receipt_id,receipt_number,order_row.id,order_row.destination_warehouse_id,movement_id,
    coalesce(requested_receipt_date,current_date),nullif(left(trim(requested_delivery_reference),200),''),
    nullif(left(trim(requested_invoice_reference),200),''),nullif(left(trim(requested_notes),1000),''),actor_profile_id
  );

  for item in select value from jsonb_array_elements(requested_items) loop
    select * into order_item
    from public.purchase_order_items
    where id=(item->>'purchase_order_item_id')::uuid
      and purchase_order_id=order_row.id
    for update;
    if order_item.id is null then raise exception 'Purchase order item not found'; end if;

    quantity:=(item->>'quantity')::numeric;
    if quantity<=0 or quantity>order_item.quantity_ordered-order_item.quantity_received-order_item.quantity_rejected then
      raise exception 'Received quantity exceeds the remaining order quantity';
    end if;
    select * into product_row from public.products where id=order_item.product_id;
    manufacturer_serials:=coalesce(item->'manufacturer_serials','[]'::jsonb);
    if product_row.serial_tracking_required then
      if quantity<>trunc(quantity) then raise exception 'Serialized receipt quantity must be a whole number'; end if;
      if jsonb_typeof(manufacturer_serials)<>'array' then raise exception 'Manufacturer serials must be an array'; end if;
      if jsonb_array_length(manufacturer_serials)>quantity then raise exception 'Manufacturer serial count exceeds received quantity'; end if;
    elsif jsonb_array_length(manufacturer_serials)>0 then
      raise exception 'Serials cannot be supplied for a non-serialized product';
    end if;

    insert into public.inventory_balances(warehouse_id,product_id,variation_id)
    values(order_row.destination_warehouse_id,order_item.product_id,order_item.variation_id)
    on conflict do nothing;
    select * into balance_row
    from public.inventory_balances
    where warehouse_id=order_row.destination_warehouse_id
      and product_id=order_item.product_id
      and variation_id is not distinct from order_item.variation_id
      and location_id is null
    for update;
    update public.inventory_balances
    set on_hand=on_hand+quantity,incoming=greatest(incoming-quantity,0),updated_at=now()
    where id=balance_row.id;
    insert into public.inventory_movement_items(
      movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after
    ) values(
      movement_id,order_item.product_id,order_item.variation_id,
      order_row.destination_warehouse_id,quantity,balance_row.on_hand+quantity
    );

    batch_id:=null;
    fallback_batch_id:=null;
    if product_row.serial_tracking_required then
      for i in 1..quantity::integer loop
        manufacturer:=nullif(trim(coalesce(manufacturer_serials->>(i-1),'')),'');
        normalized:=public.normalize_manufacturer_serial(manufacturer);
        if normalized is not null and exists(
          select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized
        ) then
          raise exception 'Manufacturer serial already exists: %',manufacturer;
        end if;

        select sn.* into expected_serial
        from public.serial_numbers sn
        where sn.purchase_order_item_id=order_item.id and sn.status='expected'
        order by sn.generated_at,sn.id
        limit 1
        for update;

        if expected_serial.id is not null then
          serial_id:=expected_serial.id;
          generated:=expected_serial.sen_serial;
          batch_id:=coalesce(batch_id,expected_serial.generation_batch_id);
          update public.serial_numbers
          set manufacturer_serial=manufacturer,
              manufacturer_serial_normalized=normalized,
              warehouse_id=order_row.destination_warehouse_id,
              status='available',
              condition=coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),
              acquisition_reference=order_row.order_number,
              notes='Received on '||receipt_number,
              received_at=now(),
              received_by=actor_profile_id,
              last_movement_id=movement_id,
              updated_at=now()
          where id=serial_id;
        else
          if fallback_batch_id is null then
            fallback_batch_id:=gen_random_uuid();
            insert into public.serial_generation_batches(
              id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,status,generated_by,generated_at
            ) values(
              fallback_batch_id,order_item.product_id,order_item.variation_id,
              order_row.destination_warehouse_id,(quantity::integer-i)+1,
              coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),
              'Received against '||order_row.order_number,'received',actor_profile_id,now()
            );
          end if;
          generated:=public.next_sen_serial(order_item.product_id);
          serial_id:=gen_random_uuid();
          insert into public.serial_numbers(
            id,manufacturer_serial,manufacturer_serial_normalized,sen_serial,barcode_value,
            product_id,variation_id,warehouse_id,status,condition,acquisition_reference,notes,
            generation_batch_id,generated_at,generated_by,received_at,received_by,last_movement_id,
            purchase_order_item_id
          ) values(
            serial_id,manufacturer,normalized,generated,generated,order_item.product_id,order_item.variation_id,
            order_row.destination_warehouse_id,'available',
            coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),order_row.order_number,
            'Received on '||receipt_number,fallback_batch_id,now(),actor_profile_id,now(),actor_profile_id,
            movement_id,order_item.id
          );
        end if;

        insert into public.serial_number_history(
          serial_number_id,event_type,previous_status,new_sen_serial,new_manufacturer_serial,
          new_status,new_warehouse_id,movement_id,reason,actor_id
        ) values(
          serial_id,'received',case when expected_serial.id is not null then 'expected' else null end,
          generated,manufacturer,'available',order_row.destination_warehouse_id,movement_id,
          'Purchase receipt '||receipt_number,actor_profile_id
        );
        perform public.capture_serial_event(
          serial_id,movement_id,null,'serial.received',actor_profile_id,'Purchase receipt '||receipt_number
        );
      end loop;

      update public.serial_generation_batches batches
      set status=case
        when exists(
          select 1 from public.serial_numbers serials
          where serials.generation_batch_id=batches.id and serials.status='expected'
        ) then 'partially_received'
        else 'received'
      end
      where batches.id in(
        select distinct serials.generation_batch_id
        from public.serial_numbers serials
        where serials.purchase_order_item_id=order_item.id
          and serials.generation_batch_id is not null
      );
      batch_id:=coalesce(batch_id,fallback_batch_id);
    end if;

    insert into public.purchase_receipt_items(
      purchase_receipt_id,purchase_order_item_id,product_id,variation_id,quantity_received,serial_generation_batch_id
    ) values(
      receipt_id,order_item.id,order_item.product_id,order_item.variation_id,quantity,batch_id
    );
    update public.purchase_order_items
    set quantity_received=quantity_received+quantity,updated_at=now()
    where id=order_item.id;
  end loop;

  select bool_and(quantity_received+quantity_rejected>=quantity_ordered)
  into all_received
  from public.purchase_order_items
  where purchase_order_id=order_row.id;
  previous_status:=order_row.status;
  update public.purchase_orders
  set status=case when all_received then 'received' else 'partially_received' end,
      completed_at=case when all_received then now() else completed_at end,
      updated_by=actor_profile_id
  where id=order_row.id;
  insert into public.purchase_order_status_events(
    purchase_order_id,previous_status,new_status,note,actor_profile_id
  ) values(
    order_row.id,previous_status,
    case when all_received then 'received' else 'partially_received' end,
    'Receipt '||receipt_number,actor_profile_id
  );
  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values
  ) values(
    actor_profile_id,actor_role,'purchasing.received','purchasing','purchase_receipt',receipt_id::text,
    'Purchase order stock received.',
    jsonb_build_object('purchase_order_id',order_row.id,'receipt_number',receipt_number,'movement_id',movement_id)
  );
  return receipt_id;
end $$;


--
-- Name: record_sale_payment(uuid, uuid, numeric, date, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_sale_payment(actor_profile_id uuid, requested_order_id uuid, requested_amount numeric, requested_date date, requested_method text, requested_reference text, requested_note text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare payment_id uuid:=gen_random_uuid(); o public.sales_orders%rowtype;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.record_payment');
  select * into o from public.sales_orders where id=requested_order_id for update;
  if o.id is null or o.status='cancelled' then raise exception 'Sale is not eligible for payment'; end if;
  if requested_amount<=0 then raise exception 'Payment amount must be positive'; end if;
  if requested_method not in ('cash','bank_transfer','cheque','mobile_banking','card','credit_sale','advance_payment','cash_on_delivery','other') then raise exception 'Invalid payment method'; end if;
  insert into public.sale_payments(id,order_id,amount,payment_date,method,reference_number,internal_note,received_by)
  values(payment_id,o.id,round(requested_amount,4),coalesce(requested_date,current_date),requested_method,nullif(left(requested_reference,200),''),nullif(left(requested_note,1000),''),actor_profile_id);
  perform public.refresh_sale_payment_totals(o.id);
  return payment_id;
end $$;


--
-- Name: refresh_allocation_warranty_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_allocation_warranty_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare order_id uuid;
begin
  if new.status='delivered' and old.status is distinct from new.status then
    select i.order_id into order_id from public.sales_order_items i where i.id=new.order_item_id;
    if order_id is not null then perform public.refresh_warranty_coverages(order_id); end if;
  end if;
  return new;
end $$;


--
-- Name: refresh_item_warranty_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_item_warranty_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin perform public.refresh_warranty_coverages(new.order_id); return new; end $$;


--
-- Name: refresh_order_warranty_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_order_warranty_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin perform public.refresh_warranty_coverages(new.id); return new; end $$;


--
-- Name: refresh_purchase_order_totals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_purchase_order_totals(requested_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare item_subtotal numeric;
begin
  select coalesce(sum(line_total),0) into item_subtotal
  from public.purchase_order_items where purchase_order_id=requested_order_id;
  update public.purchase_orders
  set subtotal=item_subtotal,
      total_amount=greatest(item_subtotal-discount_amount+shipping_amount+tax_amount+other_amount,0),
      updated_at=now()
  where id=requested_order_id;
end $$;


--
-- Name: refresh_quotation_totals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_quotation_totals(requested_quotation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  calculated_subtotal numeric(18,2);
  calculated_item_total numeric(18,2);
begin
  update public.quotation_request_items
  set unit_price=round(coalesce(unit_price,target_price,0),2),
      target_price=round(coalesce(unit_price,target_price,0),2),
      line_subtotal=round(quantity*coalesce(unit_price,target_price,0),2),
      line_total=round(greatest(
        quantity*coalesce(unit_price,target_price,0)
        - coalesce(discount_amount,0)
        + coalesce(tax_amount,0),0),2)
  where quotation_id=requested_quotation_id;

  select round(coalesce(sum(line_subtotal),0),2),
         round(coalesce(sum(line_total),0),2)
  into calculated_subtotal,calculated_item_total
  from public.quotation_request_items
  where quotation_id=requested_quotation_id;

  update public.quotation_requests
  set subtotal=calculated_subtotal,
      total_amount=round(greatest(
        calculated_item_total-coalesce(discount_amount,0)+coalesce(tax_amount,0),0),2),
      updated_at=now()
  where id=requested_quotation_id;
end $$;


--
-- Name: refresh_sale_payment_totals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_sale_payment_totals(requested_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare total numeric; paid numeric; refunded numeric; next_status text;
begin
  select total_amount into total from public.sales_orders where id=requested_order_id for update;
  if total is null then raise exception 'Sale not found'; end if;
  select coalesce(sum(amount) filter(where status='received'),0),coalesce(sum(amount) filter(where status='refunded'),0)
    into paid,refunded from public.sale_payments where order_id=requested_order_id;
  paid:=greatest(paid-refunded,0);
  next_status:=case when refunded>0 and paid=0 then 'refunded' when paid=0 then 'unpaid' when paid<total then 'partially_paid' when paid=total then 'paid' else 'overpaid' end;
  update public.sales_orders set paid_amount=paid,refunded_amount=refunded,payment_status=next_status,updated_at=now() where id=requested_order_id;
end $$;


--
-- Name: refresh_warranty_coverages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_warranty_coverages(requested_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o record; i record; a record; start_date date;
begin
  select id,customer_profile_id,coalesce(delivered_at,updated_at,now())::date as delivered_date into o
  from public.sales_orders where id=requested_order_id;
  if o.id is null then return; end if;
  start_date := o.delivered_date;
  for i in select * from public.sales_order_items where order_id=requested_order_id and warranty_enabled_snapshot=true and delivered_quantity>0 loop
    if i.serial_tracking_required_snapshot then
      for a in select osa.serial_number_id from public.order_serial_allocations osa
               where osa.order_item_id=i.id and osa.status='delivered' loop
        insert into public.warranty_coverages(sales_order_id,sales_order_item_id,customer_profile_id,product_id,variation_id,serial_number_id,covered_quantity,warranty_duration_months,warranty_terms,warranty_exclusions,starts_at,ends_at)
        values (o.id,i.id,o.customer_profile_id,i.product_id,i.variation_id,a.serial_number_id,1,i.warranty_duration_months_snapshot,i.warranty_terms_snapshot,i.warranty_exclusions_snapshot,start_date,(start_date+make_interval(months=>i.warranty_duration_months_snapshot))::date)
        on conflict (sales_order_item_id,serial_number_id) do nothing;
      end loop;
    else
      insert into public.warranty_coverages(sales_order_id,sales_order_item_id,customer_profile_id,product_id,variation_id,covered_quantity,warranty_duration_months,warranty_terms,warranty_exclusions,starts_at,ends_at)
      values (o.id,i.id,o.customer_profile_id,i.product_id,i.variation_id,greatest(1,floor(i.delivered_quantity)::integer),i.warranty_duration_months_snapshot,i.warranty_terms_snapshot,i.warranty_exclusions_snapshot,start_date,(start_date+make_interval(months=>i.warranty_duration_months_snapshot))::date)
      on conflict (sales_order_item_id) where serial_number_id is null do update set covered_quantity=greatest(public.warranty_coverages.covered_quantity,excluded.covered_quantity), ends_at=excluded.ends_at, updated_at=now();
    end if;
  end loop;
end $$;


--
-- Name: regenerate_sen_serial(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regenerate_sen_serial(actor_profile_id uuid, requested_serial_id uuid, requested_reason text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare unit public.serial_numbers%rowtype; replacement text; actor_role public.account_role;
begin
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='serials.regenerate') then raise exception 'Permission denied'; end if;
  select * into unit from public.serial_numbers where id=requested_serial_id for update; if unit.id is null then raise exception 'Serial not found'; end if;
  if unit.status<>'expected' then raise exception 'Only expected serials can be regenerated'; end if;
  if nullif(trim(requested_reason),'') is null then raise exception 'Regeneration reason required'; end if;
  replacement:=public.next_sen_serial(unit.product_id); select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.serial_number_history(serial_number_id,event_type,previous_sen_serial,new_sen_serial,previous_status,new_status,previous_warehouse_id,new_warehouse_id,reason,actor_id) values(unit.id,'regenerated',unit.sen_serial,replacement,unit.status,unit.status,unit.warehouse_id,unit.warehouse_id,left(requested_reason,1000),actor_profile_id);
  update public.serial_numbers set sen_serial=replacement,barcode_value=replacement,updated_at=now() where id=unit.id;
  perform public.capture_serial_event(unit.id,null,null,'serial.regenerated',actor_profile_id,requested_reason);
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values) values(actor_profile_id,actor_role,'serial.regenerated','serials','serial_number',unit.id::text,'Expected SEN serial regenerated.',jsonb_build_object('sen_serial',unit.sen_serial),jsonb_build_object('sen_serial',replacement,'reason',left(requested_reason,1000)));
  return replacement;
end $$;


--
-- Name: release_order_serial_allocation(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_order_serial_allocation(actor_profile_id uuid, requested_allocation_id uuid, requested_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.order_serial_allocations%rowtype; begin perform public.assert_actor_permission(actor_profile_id,'orders.allocate'); select * into a from public.order_serial_allocations where id=requested_allocation_id for update; if a.status<>'active' then raise exception 'Only active allocations can be released'; end if; update public.order_serial_allocations set status='released',released_by=actor_profile_id,released_at=now(),release_reason=left(requested_reason,500) where id=a.id; update public.serial_numbers set status='available',updated_at=now() where id=a.serial_number_id and status='allocated'; update public.sales_order_items set allocated_quantity=greatest(allocated_quantity-1,0),updated_at=now() where id=a.order_item_id; perform public.derive_sales_order_status(a.order_id); end $$;


--
-- Name: reuse_expected_purchase_serial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reuse_expected_purchase_serial() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare expected_row public.serial_numbers%rowtype;
begin
  if new.status='available' and new.acquisition_reference is not null then
    select sn.* into expected_row
    from public.serial_numbers sn
    join public.purchase_order_items poi on poi.id=sn.purchase_order_item_id
    join public.purchase_orders po on po.id=poi.purchase_order_id
    where po.order_number=new.acquisition_reference
      and sn.product_id=new.product_id
      and sn.variation_id is not distinct from new.variation_id
      and sn.status='expected'
    order by sn.generated_at,sn.id limit 1 for update of sn;
    if expected_row.id is not null then
      delete from public.serial_numbers where id=expected_row.id;
      new.sen_serial:=expected_row.sen_serial;
      new.barcode_value:=expected_row.barcode_value;
      new.generation_batch_id:=expected_row.generation_batch_id;
      new.purchase_order_item_id:=expected_row.purchase_order_item_id;
    end if;
  end if;
  return new;
end $$;


--
-- Name: review_leave_request(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_leave_request(actor_profile_id uuid, requested_leave_id uuid, requested_decision text, requested_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare leave_row public.hr_leave_requests%rowtype; actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'hr.manage_leave');
  if requested_decision not in('approved','rejected') then raise exception 'Invalid leave decision'; end if;
  select * into leave_row from public.hr_leave_requests where id=requested_leave_id for update;
  if leave_row.id is null or leave_row.status<>'pending' then raise exception 'Only pending leave can be reviewed'; end if;
  update public.hr_leave_requests set status=requested_decision,reviewed_by=actor_profile_id,reviewed_at=now(),review_note=nullif(left(trim(requested_note),1000),''),updated_at=now() where id=requested_leave_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'hr.leave_'||requested_decision,'hr','leave_request',requested_leave_id::text,'Leave request reviewed.',jsonb_build_object('decision',requested_decision));
end $$;


--
-- Name: save_order_packing(uuid, uuid, text, uuid[], jsonb, boolean, numeric, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_order_packing(actor_profile_id uuid, requested_order_id uuid, requested_package_reference text, requested_allocation_ids uuid[], requested_nonserialized jsonb, requested_complete boolean, requested_weight numeric, requested_dimensions jsonb, requested_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare created_package_id uuid; selected_allocation_id uuid; a public.order_serial_allocations%rowtype; entry jsonb; item public.sales_order_items%rowtype; qty numeric; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.pack'); if not exists(select 1 from public.sales_orders where id=requested_order_id and status not in('draft','cancelled','shipped','delivered')) then raise exception 'Order is not eligible for packing'; end if;
 insert into public.order_packages(order_id,package_reference,status,weight,length,width,height,notes,created_by) values(requested_order_id,left(requested_package_reference,100),case when requested_complete then 'complete' else 'packing' end,requested_weight,(requested_dimensions->>'length')::numeric,(requested_dimensions->>'width')::numeric,(requested_dimensions->>'height')::numeric,left(requested_notes,1000),actor_profile_id) on conflict(order_id,package_reference) do update set status=excluded.status,weight=excluded.weight,length=excluded.length,width=excluded.width,height=excluded.height,notes=excluded.notes,completed_at=case when excluded.status='complete' then now() else null end,updated_at=now() returning id into created_package_id;
 foreach selected_allocation_id in array coalesce(requested_allocation_ids,'{}') loop select * into a from public.order_serial_allocations where id=selected_allocation_id and order_id=requested_order_id for update; if a.id is null or a.status<>'active' then raise exception 'Only assigned active serials can be packed'; end if; insert into public.order_packed_items(package_id,order_item_id,quantity,allocation_id,packed_by) values(created_package_id,a.order_item_id,1,a.id,actor_profile_id) on conflict(package_id,allocation_id) do nothing; update public.order_serial_allocations set status='packed',packed_at=coalesce(packed_at,now()) where id=a.id; update public.serial_numbers set status='packed',updated_at=now() where id=a.serial_number_id; end loop;
 for entry in select * from jsonb_array_elements(coalesce(requested_nonserialized,'[]'::jsonb)) loop select * into item from public.sales_order_items where id=(entry->>'order_item_id')::uuid and order_id=requested_order_id for update; qty:=(entry->>'quantity')::numeric; if item.id is null or item.serial_tracking_required_snapshot or qty<=0 or item.packed_quantity+qty>item.quantity then raise exception 'Invalid non-serialized packed quantity'; end if; insert into public.order_packed_items(package_id,order_item_id,quantity,packed_by) values(created_package_id,item.id,qty,actor_profile_id); end loop;
 update public.sales_order_items i set packed_quantity=least(i.quantity,(select coalesce(sum(pi.quantity),0) from public.order_packed_items pi join public.order_packages p on p.id=pi.package_id where pi.order_item_id=i.id and p.status<>'cancelled')),updated_at=now() where i.order_id=requested_order_id;
 if requested_complete and exists(select 1 from public.sales_order_items where order_id=requested_order_id and packed_quantity<allocated_quantity and serial_tracking_required_snapshot) then raise exception 'Every assigned serialized unit must be packed'; end if; perform public.derive_sales_order_status(requested_order_id); return created_package_id;
end $$;


--
-- Name: secure_random_digits(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.secure_random_digits(digit_count integer DEFAULT 10) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare bytes bytea; result text:=''; i integer;
begin
  if digit_count<1 or digit_count>32 then raise exception 'Invalid digit count'; end if;
  bytes:=extensions.gen_random_bytes(digit_count);
  for i in 0..digit_count-1 loop result:=result||(get_byte(bytes,i)%10)::text; end loop;
  return result;
end $$;


--
-- Name: set_cashbook_opening_balance(uuid, date, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_cashbook_opening_balance(actor_profile_id uuid, requested_business_date date, requested_opening_balance numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  day_row public.cashbook_days%rowtype;
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_business_date is null then
    raise exception 'Business date is required';
  end if;
  if requested_opening_balance is null or requested_opening_balance<0 then
    raise exception 'Opening cash must be zero or greater';
  end if;

  perform public.lock_cashbook_timeline();
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(requested_business_date,round(requested_opening_balance,2),actor_profile_id)
  on conflict(business_date) do nothing;

  select * into day_row from public.cashbook_days
  where business_date=requested_business_date for update;
  if day_row.is_closed then
    raise exception 'This cashbook day is closed';
  end if;

  update public.cashbook_days
  set opening_balance=round(requested_opening_balance,2),updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_opening_balance_set',
    'accounting',
    'cashbook_day',
    requested_business_date::text,
    'Cashbook opening balance saved.',
    jsonb_build_object('opening_balance',round(requested_opening_balance,2))
  );
end $$;


--
-- Name: set_customer_order_status(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_customer_order_status(actor_profile_id uuid, requested_order_id uuid, requested_status text, requested_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  target public.sales_orders%rowtype;
  previous_status text;
  status_title text;
  status_message text;
begin
  if requested_status not in (
    'confirmed','preparing_delivery','on_the_way','delivered','received'
  ) then
    raise exception 'Invalid customer order status';
  end if;

  perform public.assert_actor_permission(actor_profile_id,'orders.confirm');
  select * into target
  from public.sales_orders
  where id=requested_order_id
  for update;

  if target.id is null then raise exception 'Order not found'; end if;
  if target.status='cancelled' then raise exception 'Cancelled orders cannot be progressed'; end if;

  previous_status := target.customer_status;
  if previous_status = requested_status then return; end if;

  update public.sales_orders
  set customer_status=requested_status,
      updated_by=actor_profile_id,
      updated_at=now()
  where id=target.id;

  status_title := case requested_status
    when 'confirmed' then 'Order confirmed'
    when 'preparing_delivery' then 'Preparing your order'
    when 'on_the_way' then 'Your order is on the way'
    when 'delivered' then 'Order delivered'
    when 'received' then 'Delivery completed'
  end;
  status_message := case requested_status
    when 'confirmed' then 'SEN confirmed your order and is preparing the next steps.'
    when 'preparing_delivery' then 'Your order is being prepared for delivery.'
    when 'on_the_way' then 'Your order has left SEN and is on the way to you.'
    when 'delivered' then 'SEN marked your order as delivered.'
    when 'received' then 'Your receipt of the order has been confirmed successfully.'
  end;

  insert into public.customer_notifications(
    profile_id,notification_type,title,message,href,entity_type,entity_id
  ) values (
    target.customer_profile_id,
    'order_status',
    status_title,
    coalesce(nullif(left(requested_note,500),''),status_message),
    '/account/orders/'||target.id::text,
    'sales_order',
    target.id
  );

  insert into public.order_status_events(
    order_id,old_status,new_status,actor_profile_id,note
  ) values (
    target.id,
    target.status,
    target.status,
    actor_profile_id,
    'Customer status: '||previous_status||' -> '||requested_status
  );
end $$;


--
-- Name: snapshot_sales_item_warranty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_sales_item_warranty() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare p record;
begin
  select warranty_enabled,warranty_duration_months,warranty_terms,warranty_exclusions
  into p from public.products where id=new.product_id;
  if tg_op='INSERT' or new.warranty_duration_months_snapshot is null then
    new.warranty_enabled_snapshot := coalesce(p.warranty_enabled,false);
    new.warranty_duration_months_snapshot := case when coalesce(p.warranty_enabled,false) then coalesce(p.warranty_duration_months,0) else 0 end;
    new.warranty_terms_snapshot := p.warranty_terms;
    new.warranty_exclusions_snapshot := p.warranty_exclusions;
  end if;
  return new;
end $$;


--
-- Name: submit_rma_claim(uuid, uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_rma_claim(actor_profile_id uuid, requested_coverage_id uuid, requested_claim_type text, requested_quantity integer, requested_description text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c record; actor record; claim_id uuid;
begin
  select id,role,status into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.status<>'active' then raise exception 'Active profile required'; end if;
  select * into c from public.warranty_coverages where id=requested_coverage_id for update;
  if c.id is null then raise exception 'Warranty coverage not found'; end if;
  if actor.role='customer' and c.customer_profile_id<>actor.id then raise exception 'Warranty coverage access denied'; end if;
  if actor.role not in ('customer','admin') then perform public.assert_actor_permission(actor.id,'rma.create'); end if;
  if requested_claim_type not in ('warranty','damaged','defective','return') then raise exception 'Invalid claim type'; end if;
  if requested_quantity<1 or c.claimed_quantity+requested_quantity>c.covered_quantity then raise exception 'Claim quantity exceeds eligible coverage'; end if;
  if length(trim(coalesce(requested_description,'')))<10 then raise exception 'Claim description must be at least 10 characters'; end if;
  if c.status<>'active' or c.ends_at<current_date then raise exception 'Warranty coverage is not active'; end if;
  insert into public.rma_claims(customer_profile_id,warranty_coverage_id,sales_order_id,sales_order_item_id,product_id,variation_id,serial_number_id,claim_type,quantity,description)
  values(c.customer_profile_id,c.id,c.sales_order_id,c.sales_order_item_id,c.product_id,c.variation_id,c.serial_number_id,requested_claim_type,requested_quantity,trim(requested_description)) returning id into claim_id;
  update public.warranty_coverages set claimed_quantity=claimed_quantity+requested_quantity,updated_at=now() where id=c.id;
  if c.serial_number_id is not null then update public.serial_numbers set service_status='claim_open',active_rma_claim_id=claim_id,updated_at=now() where id=c.serial_number_id; end if;
  insert into public.rma_events(rma_claim_id,actor_profile_id,event_type,new_status,note) values(claim_id,actor.id,'claim_submitted','submitted','Warranty claim submitted.');
  insert into public.customer_notifications(profile_id,notification_type,title,message,href,entity_type,entity_id)
  values(c.customer_profile_id,'rma_status','Warranty claim submitted','Your RMA claim has been submitted and is waiting for review.','/account/rma/'||claim_id,'rma_claim',claim_id);
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,metadata,new_values)
  values(actor.id,actor.role,c.customer_profile_id,'rma.claim_submitted','rma','rma_claim',claim_id::text,'Warranty claim submitted.',jsonb_build_object('rma_claim_id',claim_id),jsonb_build_object('status','submitted','claim_type',requested_claim_type,'quantity',requested_quantity));
  return claim_id;
end $$;


--
-- Name: supplier_category_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supplier_category_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  parent_level integer;
  normalized_segment text;
begin
  normalized_segment := upper(left(regexp_replace(new.name, '[^[:alnum:]]', '', 'g'), 4));
  if normalized_segment = '' then
    raise exception 'Category name must contain at least one letter or number.';
  end if;
  new.code_segment := normalized_segment;
  new.updated_at := now();

  if new.parent_id is null then
    new.category_level := 1;
    return new;
  end if;

  if new.id is not null and new.parent_id = new.id then
    raise exception 'A supplier category cannot be its own parent.';
  end if;

  select category_level into parent_level
  from public.supplier_categories
  where id = new.parent_id;
  if parent_level is null then
    raise exception 'The selected parent category does not exist.';
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      with recursive descendants as (
        select id from public.supplier_categories where parent_id = new.id
        union all
        select child.id
        from public.supplier_categories child
        join descendants tree on child.parent_id = tree.id
      )
      select 1 from descendants where id = new.parent_id
    ) then
      raise exception 'Supplier category cycle detected.';
    end if;
  end if;

  new.category_level := parent_level + 1;
  return new;
end;
$$;


--
-- Name: supplier_category_relevel_descendants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supplier_category_relevel_descendants() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  with recursive descendants as (
    select id, new.category_level + 1 as expected_level
    from public.supplier_categories
    where parent_id = new.id
    union all
    select child.id, tree.expected_level + 1
    from public.supplier_categories child
    join descendants tree on child.parent_id = tree.id
  )
  update public.supplier_categories category
  set category_level = tree.expected_level,
      updated_at = now()
  from descendants tree
  where category.id = tree.id
    and category.category_level is distinct from tree.expected_level;
  return null;
end;
$$;


--
-- Name: sync_business_category_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_business_category_name() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  resolved_id uuid;
  resolved_name text;
begin
  resolved_id := new.business_category_id;
  if resolved_id is null then
    select c.id
      into resolved_id
      from public.business_categories c
     where c.archived_at is null
       and lower(c.name) = lower(coalesce(new.sen_business_category, 'Others'))
     order by c.is_active desc, c.sort_order, c.name
     limit 1;
  end if;

  select c.name
    into resolved_name
    from public.business_categories c
   where c.id = resolved_id
     and c.archived_at is null;

  if resolved_name is null then
    raise exception 'A valid business category is required';
  end if;

  new.business_category_id := resolved_id;
  new.sen_business_category := resolved_name;
  return new;
end
$$;


--
-- Name: sync_new_sale_item_discount_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_new_sale_item_discount_metadata() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.line_discount > 0 and coalesce(new.discount_value,0) = 0 then
    new.discount_type := 'fixed';
    new.discount_value := new.line_discount;
  end if;
  return new;
end $$;


--
-- Name: transition_purchase_inbound_shipment(uuid, uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_purchase_inbound_shipment(actor_profile_id uuid, requested_order_id uuid, requested_action text, requested_transport_mode text DEFAULT NULL::text, requested_carrier_name text DEFAULT NULL::text, requested_tracking_number text DEFAULT NULL::text, requested_expected_departure_at timestamp with time zone DEFAULT NULL::timestamp with time zone, requested_expected_arrival_at timestamp with time zone DEFAULT NULL::timestamp with time zone, requested_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  order_row public.purchase_orders%rowtype;
  shipment_row public.purchase_inbound_shipments%rowtype;
  next_status text;
  required_permission text;
begin
  select * into order_row
  from public.purchase_orders
  where id=requested_order_id
  for update;

  if order_row.id is null then raise exception 'Purchase order not found'; end if;

  if requested_action='prepare' and order_row.status='ordered' then
    next_status:='ready_for_shipment';
    required_permission:='shipments.create';
    if requested_transport_mode not in('air','sea','road','courier','other') then
      raise exception 'Select a valid supplier shipment channel';
    end if;
    perform public.assert_actor_permission(actor_profile_id,'purchasing.edit');
  elsif requested_action='ship' and order_row.status='ready_for_shipment' then
    next_status:='shipped';
    required_permission:='shipments.confirm_dispatch';
  elsif requested_action='receive' and order_row.status='shipped' then
    next_status:='received';
    required_permission:='shipments.confirm_receipt';
    perform public.assert_actor_permission(actor_profile_id,'purchasing.receive');
  else
    raise exception 'Supplier shipment cannot perform this action from its current status';
  end if;

  perform public.assert_actor_permission(actor_profile_id,required_permission);

  if requested_action='prepare' then
    insert into public.purchase_inbound_shipments(
      purchase_order_id,status,transport_mode,carrier_name,tracking_number,
      expected_departure_at,expected_arrival_at,notes,created_by,updated_by
    ) values (
      order_row.id,next_status,requested_transport_mode,
      nullif(left(trim(requested_carrier_name),200),''),
      nullif(left(trim(requested_tracking_number),200),''),
      requested_expected_departure_at,requested_expected_arrival_at,
      nullif(left(trim(requested_note),1000),''),
      actor_profile_id,actor_profile_id
    )
    on conflict (purchase_order_id) do update set
      status=excluded.status,
      transport_mode=excluded.transport_mode,
      carrier_name=excluded.carrier_name,
      tracking_number=excluded.tracking_number,
      expected_departure_at=excluded.expected_departure_at,
      expected_arrival_at=excluded.expected_arrival_at,
      notes=excluded.notes,
      updated_by=actor_profile_id
    returning * into shipment_row;
  else
    select * into shipment_row
    from public.purchase_inbound_shipments
    where purchase_order_id=order_row.id
    for update;
    if shipment_row.id is null then raise exception 'Supplier inbound shipment not found'; end if;

    update public.purchase_inbound_shipments set
      status=next_status,
      shipped_at=case when requested_action='ship' then now() else shipped_at end,
      received_at=case when requested_action='receive' then now() else received_at end,
      notes=coalesce(nullif(left(trim(requested_note),1000),''),notes),
      updated_by=actor_profile_id
    where id=shipment_row.id
    returning * into shipment_row;
  end if;

  update public.purchase_orders
  set status=next_status,updated_by=actor_profile_id
  where id=order_row.id;

  insert into public.purchase_order_status_events(
    purchase_order_id,previous_status,new_status,note,actor_profile_id
  ) values (
    order_row.id,order_row.status,next_status,
    coalesce(
      nullif(left(trim(requested_note),1000),''),
      case requested_action
        when 'prepare' then 'Supplier shipment prepared.'
        when 'ship' then 'Supplier shipment dispatched.'
        else 'Supplier shipment physically received.'
      end
    ),
    actor_profile_id
  );

  return shipment_row.id;
end $$;


--
-- Name: transition_purchase_order(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_purchase_order(actor_profile_id uuid, requested_order_id uuid, requested_action text, requested_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare order_row public.purchase_orders%rowtype; next_status text; required_permission text;
  item record; balance_row public.inventory_balances%rowtype; remaining numeric;
begin
  select * into order_row from public.purchase_orders where id=requested_order_id for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if requested_action='submit' and order_row.status='draft' then next_status:='pending_approval'; required_permission:='purchasing.edit';
  elsif requested_action='approve' and order_row.status='pending_approval' then next_status:='approved'; required_permission:='purchasing.approve';
  elsif requested_action='order' and order_row.status='approved' then next_status:='ordered'; required_permission:='purchasing.approve';
  elsif requested_action='close' and order_row.status='received' then next_status:='closed'; required_permission:='purchasing.edit';
  elsif requested_action='cancel' and order_row.status in('draft','pending_approval','approved','ordered','partially_received') then next_status:='cancelled'; required_permission:='purchasing.cancel';
  else raise exception 'Purchase order cannot perform this action from its current status';
  end if;
  perform public.assert_actor_permission(actor_profile_id,required_permission);
  if requested_action='order' then
    for item in select * from public.purchase_order_items where purchase_order_id=order_row.id loop
      insert into public.inventory_balances(warehouse_id,product_id,variation_id)
      values(order_row.destination_warehouse_id,item.product_id,item.variation_id) on conflict do nothing;
      select * into balance_row from public.inventory_balances
      where warehouse_id=order_row.destination_warehouse_id and product_id=item.product_id
        and variation_id is not distinct from item.variation_id and location_id is null for update;
      update public.inventory_balances set incoming=incoming+(item.quantity_ordered-item.quantity_received),updated_at=now()
      where id=balance_row.id;
    end loop;
  elsif requested_action='cancel' and order_row.status in('ordered','partially_received') then
    for item in select * from public.purchase_order_items where purchase_order_id=order_row.id loop
      remaining:=item.quantity_ordered-item.quantity_received-item.quantity_rejected;
      update public.inventory_balances set incoming=greatest(incoming-remaining,0),updated_at=now()
      where warehouse_id=order_row.destination_warehouse_id and product_id=item.product_id
        and variation_id is not distinct from item.variation_id and location_id is null;
    end loop;
  end if;
  update public.purchase_orders set status=next_status,updated_by=actor_profile_id,
    submitted_at=case when requested_action='submit' then now() else submitted_at end,
    submitted_by=case when requested_action='submit' then actor_profile_id else submitted_by end,
    approved_at=case when requested_action='approve' then now() else approved_at end,
    approved_by=case when requested_action='approve' then actor_profile_id else approved_by end,
    ordered_at=case when requested_action='order' then now() else ordered_at end,
    ordered_by=case when requested_action='order' then actor_profile_id else ordered_by end,
    cancelled_at=case when requested_action='cancel' then now() else cancelled_at end,
    cancelled_by=case when requested_action='cancel' then actor_profile_id else cancelled_by end,
    cancellation_reason=case when requested_action='cancel' then nullif(left(trim(requested_note),1000),'') else cancellation_reason end,
    completed_at=case when requested_action='close' then now() else completed_at end
  where id=requested_order_id;
  insert into public.purchase_order_status_events(purchase_order_id,previous_status,new_status,note,actor_profile_id)
  values(requested_order_id,order_row.status,next_status,nullif(left(trim(requested_note),1000),''),actor_profile_id);
end $$;


--
-- Name: transition_rma_claim(uuid, uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_rma_claim(actor_profile_id uuid, requested_claim_id uuid, requested_status text, requested_resolution text DEFAULT NULL::text, requested_note text DEFAULT NULL::text, requested_assigned_to uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c record; actor record; allowed boolean:=false;
begin
  select id,role,status into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.status<>'active' then raise exception 'Active profile required'; end if;
  if actor.role<>'admin' then perform public.assert_actor_permission(actor.id,case when requested_status='closed' then 'rma.close' when requested_status='product_received' then 'rma.receive' when requested_status='resolution_in_progress' then 'rma.resolve' else 'rma.review' end); end if;
  select * into c from public.rma_claims where id=requested_claim_id for update;
  if c.id is null then raise exception 'RMA claim not found'; end if;
  allowed := (c.status='submitted' and requested_status='under_review') or
             (c.status='under_review' and requested_status in ('return_requested','resolution_in_progress','closed')) or
             (c.status='return_requested' and requested_status in ('product_received','closed')) or
             (c.status='product_received' and requested_status in ('resolution_in_progress','closed')) or
             (c.status='resolution_in_progress' and requested_status='closed');
  if not allowed then raise exception 'Invalid RMA status transition'; end if;
  if requested_status='closed' and requested_resolution is null then raise exception 'Resolution is required before closing'; end if;
  update public.rma_claims set status=requested_status,resolution=coalesce(requested_resolution,resolution),assigned_to=coalesce(requested_assigned_to,assigned_to),received_at=case when requested_status='product_received' then now() else received_at end,resolved_at=case when requested_status in ('resolution_in_progress','closed') then now() else resolved_at end,closed_at=case when requested_status='closed' then now() else closed_at end,updated_at=now() where id=c.id;
  if c.serial_number_id is not null then
    update public.serial_numbers set service_status=case requested_status when 'return_requested' then 'return_requested' when 'product_received' then 'received_for_service' when 'resolution_in_progress' then 'under_service' when 'closed' then case requested_resolution when 'repaired' then 'repaired' when 'replaced' then 'replaced' when 'damaged_beyond_repair_retired' then 'retired' else 'normal' end else service_status end,active_rma_claim_id=case when requested_status='closed' then null else c.id end,updated_at=now() where id=c.serial_number_id;
  end if;
  insert into public.rma_events(rma_claim_id,actor_profile_id,event_type,previous_status,new_status,note) values(c.id,actor.id,'status_changed',c.status,requested_status,nullif(trim(coalesce(requested_note,'')),''));
  insert into public.customer_notifications(profile_id,notification_type,title,message,href,entity_type,entity_id)
  values(c.customer_profile_id,'rma_status','Warranty claim updated','Your RMA claim is now '||replace(requested_status,'_',' ')||'.','/account/rma/'||c.id,'rma_claim',c.id);
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,metadata,old_values,new_values)
  values(actor.id,actor.role,c.customer_profile_id,'rma.status_changed','rma','rma_claim',c.id::text,'Warranty claim status changed.',jsonb_build_object('rma_claim_id',c.id),jsonb_build_object('status',c.status),jsonb_build_object('status',requested_status,'resolution',requested_resolution,'assigned_to',requested_assigned_to));
  return c.id;
end $$;


--
-- Name: update_crm_lead_status(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_lead_status(actor_profile_id uuid, requested_lead_id uuid, requested_status text, requested_lost_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lead_row public.crm_leads%rowtype; actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.edit');
  if requested_status not in('new','contacted','qualified','proposal','won','lost') then raise exception 'Invalid lead status'; end if;
  select * into lead_row from public.crm_leads where id=requested_lead_id for update;
  if lead_row.id is null then raise exception 'CRM lead not found'; end if;
  if requested_status='lost' and nullif(trim(coalesce(requested_lost_reason,'')),'') is null then raise exception 'Lost reason is required'; end if;
  update public.crm_leads set
    status=requested_status,lost_reason=case when requested_status='lost' then left(trim(requested_lost_reason),1000) else null end,
    won_at=case when requested_status='won' then coalesce(won_at,now()) else null end,
    lost_at=case when requested_status='lost' then coalesce(lost_at,now()) else null end,
    updated_by=actor_profile_id
  where id=requested_lead_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,lead_row.assigned_to,'crm.lead_status_changed','crm','crm_lead',requested_lead_id::text,
    'CRM lead status changed.',jsonb_build_object('status',lead_row.status),jsonb_build_object('status',requested_status));
end $$;


--
-- Name: update_manufacturer_serial(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_manufacturer_serial(actor_profile_id uuid, requested_serial_id uuid, requested_value text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare unit public.serial_numbers%rowtype; display_value text:=nullif(trim(requested_value),''); normalized text:=public.normalize_manufacturer_serial(requested_value); actor_role public.account_role;
begin
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='serials.correct') then raise exception 'Permission denied'; end if;
  select * into unit from public.serial_numbers where id=requested_serial_id for update; if unit.id is null then raise exception 'Serial not found'; end if;
  if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized and id<>requested_serial_id) then raise exception 'Manufacturer serial already exists'; end if;
  update public.serial_numbers set manufacturer_serial=display_value,manufacturer_serial_normalized=normalized,updated_at=now() where id=unit.id;
  insert into public.serial_number_history(serial_number_id,event_type,previous_manufacturer_serial,new_manufacturer_serial,previous_status,new_status,previous_warehouse_id,new_warehouse_id,reason,actor_id) values(unit.id,'manufacturer_serial_changed',unit.manufacturer_serial,display_value,unit.status,unit.status,unit.warehouse_id,unit.warehouse_id,'Manufacturer serial correction',actor_profile_id);
  perform public.capture_serial_event(unit.id,null,null,'serial.manufacturer_serial_changed',actor_profile_id,null);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values) values(actor_profile_id,actor_role,case when unit.manufacturer_serial is null then 'serial.manufacturer_serial_added' else 'serial.manufacturer_serial_changed' end,'serials','serial_number',unit.id::text,'Manufacturer serial updated.',jsonb_build_object('manufacturer_serial',unit.manufacturer_serial),jsonb_build_object('manufacturer_serial',display_value));
end $$;


--
-- Name: update_purchase_order(uuid, uuid, uuid, uuid, text, date, date, text, integer, numeric, numeric, numeric, numeric, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_purchase_order(actor_profile_id uuid, requested_order_id uuid, requested_supplier_id uuid, requested_warehouse_id uuid, requested_currency text, requested_order_date date, requested_expected_date date, requested_supplier_reference text, requested_payment_terms integer, requested_discount numeric, requested_shipping numeric, requested_tax numeric, requested_other numeric, requested_internal_notes text, requested_supplier_notes text, requested_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare order_row public.purchase_orders%rowtype; item jsonb; product_row public.products%rowtype;
  variation_row public.product_variations%rowtype; quantity numeric; unit_cost numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.edit');
  select * into order_row from public.purchase_orders where id=requested_order_id for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if order_row.status<>'draft' then raise exception 'Only draft purchase orders can be edited'; end if;
  if not exists(select 1 from public.suppliers where id=requested_supplier_id and status='active') then raise exception 'Active supplier required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active destination warehouse required'; end if;
  if requested_expected_date is not null and requested_expected_date<coalesce(requested_order_date,current_date) then raise exception 'Expected delivery cannot be before order date'; end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then raise exception 'At least one purchase item is required'; end if;
  if coalesce(requested_discount,0)<0 or coalesce(requested_shipping,0)<0 or coalesce(requested_tax,0)<0 or coalesce(requested_other,0)<0 then raise exception 'Order amounts cannot be negative'; end if;
  update public.purchase_orders set
    supplier_id=requested_supplier_id,destination_warehouse_id=requested_warehouse_id,
    currency=upper(left(coalesce(nullif(trim(requested_currency),''),'BDT'),3)),
    order_date=coalesce(requested_order_date,current_date),expected_delivery_date=requested_expected_date,
    supplier_reference=nullif(left(trim(requested_supplier_reference),200),''),
    payment_terms_days=greatest(0,least(coalesce(requested_payment_terms,0),365)),
    discount_amount=coalesce(requested_discount,0),shipping_amount=coalesce(requested_shipping,0),
    tax_amount=coalesce(requested_tax,0),other_amount=coalesce(requested_other,0),
    internal_notes=nullif(left(trim(requested_internal_notes),2000),''),
    supplier_notes=nullif(left(trim(requested_supplier_notes),2000),''),
    updated_by=actor_profile_id
  where id=requested_order_id;
  delete from public.purchase_order_items where purchase_order_id=requested_order_id;
  for item in select value from jsonb_array_elements(requested_items) loop
    select * into product_row from public.products where id=(item->>'product_id')::uuid and status<>'archived';
    if product_row.id is null then raise exception 'Active product required'; end if;
    variation_row:=null;
    if nullif(item->>'variation_id','') is not null then
      select * into variation_row from public.product_variations where id=(item->>'variation_id')::uuid and product_id=product_row.id and status='active';
      if variation_row.id is null then raise exception 'Invalid product variation'; end if;
    end if;
    quantity:=(item->>'quantity')::numeric; unit_cost:=(item->>'unit_cost')::numeric;
    if quantity<=0 or unit_cost<0 then raise exception 'Item quantity and unit cost are invalid'; end if;
    if product_row.serial_tracking_required and quantity<>trunc(quantity) then raise exception 'Serialized product quantities must be whole numbers'; end if;
    insert into public.purchase_order_items(
      purchase_order_id,product_id,variation_id,product_name_snapshot,sku_snapshot,description,
      quantity_ordered,unit_cost,discount_amount,tax_amount
    ) values (
      requested_order_id,product_row.id,variation_row.id,product_row.name,coalesce(variation_row.sku,product_row.sku),
      nullif(left(trim(item->>'description'),500),''),quantity,unit_cost,
      greatest(coalesce((item->>'discount_amount')::numeric,0),0),
      greatest(coalesce((item->>'tax_amount')::numeric,0),0)
    );
  end loop;
  perform public.refresh_purchase_order_totals(requested_order_id);
end $$;


--
-- Name: update_sale_lines(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_sale_lines(actor_profile_id uuid, requested_order_id uuid, requested_reason text, requested_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  sale public.sales_orders%rowtype;
  current_item public.sales_order_items%rowtype;
  balance public.inventory_balances%rowtype;
  reservation public.inventory_reservations%rowtype;
  entry jsonb;
  item_count integer;
  request_count integer;
  distinct_request_count integer;
  new_quantity numeric;
  new_unit_price numeric;
  new_discount_type text;
  new_discount_value numeric;
  new_subtotal numeric;
  new_discount numeric;
  new_total numeric;
  remaining_quantity numeric;
  quantity_delta numeric;
  revised_subtotal numeric;
  revised_line_total numeric;
  revised_total numeric;
  reason text;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.edit');
  reason := nullif(left(trim(coalesce(requested_reason,'')),500),'');
  if reason is null then raise exception 'Edit reason is required'; end if;
  if jsonb_typeof(requested_items) <> 'array' then raise exception 'Sale items are invalid'; end if;

  select * into sale from public.sales_orders
  where id=requested_order_id for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  if sale.status in ('delivered','cancelled') then
    raise exception 'A delivered or cancelled sale cannot be edited';
  end if;

  select count(*) into item_count from public.sales_order_items where order_id=sale.id;
  select count(*), count(distinct value->>'id')
    into request_count, distinct_request_count
  from jsonb_array_elements(requested_items);
  if request_count <> item_count or distinct_request_count <> item_count then
    raise exception 'Every sale item must be submitted exactly once';
  end if;

  for entry in select value from jsonb_array_elements(requested_items) loop
    select * into current_item from public.sales_order_items
    where id=(entry->>'id')::uuid and order_id=sale.id for update;
    if current_item.id is null then raise exception 'Sale item not found'; end if;

    new_quantity := (entry->>'quantity')::numeric;
    new_unit_price := round((entry->>'unit_price')::numeric,2);
    new_discount_type := entry->>'discount_type';
    new_discount_value := round((entry->>'discount_value')::numeric,2);

    if new_quantity < 1 or new_quantity <> trunc(new_quantity) then
      raise exception 'Quantity must be a whole number of at least 1';
    end if;
    if new_quantity < greatest(
      current_item.allocated_quantity,current_item.packed_quantity,
      current_item.shipped_quantity,current_item.delivered_quantity
    ) then raise exception 'Quantity cannot be reduced below fulfilled units'; end if;
    if new_unit_price < 0 then raise exception 'Unit price cannot be negative'; end if;
    if new_discount_type not in ('percentage','fixed') or new_discount_value < 0
      or (new_discount_type='percentage' and new_discount_value>100)
    then raise exception 'Discount is invalid'; end if;

    new_subtotal := round(new_quantity*new_unit_price,2);
    new_discount := case when new_discount_type='percentage'
      then round(new_subtotal*new_discount_value/100,2)
      else new_discount_value end;
    if new_discount > new_subtotal then
      raise exception 'Fixed discount cannot exceed the line subtotal';
    end if;
    new_total := round(new_subtotal-new_discount+current_item.line_tax,2);

    if new_unit_price <> current_item.unit_price then
      perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values (
        sale.id,current_item.id,'manual_unit_price',
        current_item.unit_price,new_unit_price,reason,actor_profile_id
      );
    end if;
    if new_discount <> current_item.line_discount
      or new_discount_type <> current_item.discount_type
      or new_discount_value <> current_item.discount_value
    then
      perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values (
        sale.id,current_item.id,
        case when new_discount_type='percentage' then 'percentage_discount' else 'fixed_line_discount' end,
        current_item.line_discount,
        case when new_discount_type='percentage' then new_discount_value else new_discount end,
        reason,actor_profile_id
      );
    end if;

    quantity_delta := new_quantity-current_item.quantity;
    if quantity_delta <> 0 then
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values (
        sale.id,current_item.id,'quantity_change',
        current_item.quantity,new_quantity,reason,actor_profile_id
      );

      if sale.status <> 'draft' then
        select * into balance from public.inventory_balances
        where warehouse_id=current_item.fulfillment_warehouse_id
          and product_id=current_item.product_id
          and variation_id is not distinct from current_item.variation_id
          and location_id is null
        for update;
        if balance.id is null then raise exception 'Inventory balance not found'; end if;
        if quantity_delta > 0 and balance.available < quantity_delta then
          raise exception 'Insufficient available stock for quantity increase';
        end if;
        if quantity_delta < 0 and balance.reserved < abs(quantity_delta) then
          raise exception 'Reserved stock does not match the requested reduction';
        end if;
        update public.inventory_balances
        set reserved=reserved+quantity_delta,updated_at=now()
        where id=balance.id;

        remaining_quantity := new_quantity-current_item.shipped_quantity;
        select * into reservation from public.inventory_reservations
        where order_item_id=current_item.id and status='active'
        for update;
        if remaining_quantity = 0 and reservation.id is not null then
          update public.inventory_reservations
          set status='released',released_at=now(),updated_at=now()
          where id=reservation.id;
        elsif remaining_quantity > 0 and reservation.id is not null then
          update public.inventory_reservations
          set quantity=remaining_quantity,updated_at=now()
          where id=reservation.id;
        elsif remaining_quantity > 0 then
          insert into public.inventory_reservations(
            product_id,variation_id,warehouse_id,quantity,status,reference,
            created_by,order_id,order_item_id
          ) values (
            current_item.product_id,current_item.variation_id,
            current_item.fulfillment_warehouse_id,remaining_quantity,'active',
            sale.order_number,actor_profile_id,sale.id,current_item.id
          );
        end if;
      end if;
    end if;

    update public.sales_order_items set
      quantity=new_quantity,
      unit_price=new_unit_price,
      line_subtotal=new_subtotal,
      line_discount=new_discount,
      line_total=new_total,
      discount_type=new_discount_type,
      discount_value=new_discount_value,
      updated_at=now()
    where id=current_item.id;
  end loop;

  select coalesce(sum(line_subtotal),0),coalesce(sum(line_total),0)
    into revised_subtotal,revised_line_total
  from public.sales_order_items where order_id=sale.id;
  revised_total := round(
    revised_line_total-sale.discount_amount+sale.shipping_amount+
    sale.service_amount+sale.tax_amount,2
  );
  if revised_total < 0 then raise exception 'Sale total cannot be negative'; end if;
  if revised_total < sale.paid_amount then
    raise exception 'Sale total cannot be lower than the amount already paid';
  end if;

  update public.sales_orders set
    subtotal=revised_subtotal,total_amount=revised_total,
    payment_status=case
      when paid_amount=0 then 'unpaid'
      when paid_amount<revised_total then 'partially_paid'
      when paid_amount=revised_total then 'paid'
      else 'overpaid'
    end,
    updated_by=actor_profile_id,updated_at=now()
  where id=sale.id;

  update public.sale_documents set
    status='superseded',superseded_at=now(),superseded_by=actor_profile_id,
    superseded_reason=reason
  where order_id=sale.id and status='generated';

  perform public.derive_sales_order_status(sale.id);
end $$;


--
-- Name: validate_product_category_business_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_product_category_business_match() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  product_business_category_id uuid;
  classification_business_category_id uuid;
begin
  select business_category_id into product_business_category_id
  from public.products where id = new.product_id;
  select business_category_id into classification_business_category_id
  from public.product_categories where id = new.category_id;
  if product_business_category_id is distinct from classification_business_category_id then
    raise exception 'Product classification must use the selected business category';
  end if;
  return new;
end
$$;


--
-- Name: validate_product_stock_model(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_product_stock_model() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  perform pg_advisory_xact_lock(hashtextextended('product-stock:'||new.id::text,0));
  if new.product_type='simple' and exists(select 1 from public.product_variations v where v.product_id=new.id) then raise exception 'A product with variations cannot be changed to a simple product'; end if;
  if new.product_type='variable' and new.manage_stock and exists(select 1 from public.product_variations v where v.product_id=new.id and v.status='active' and v.manage_stock) then raise exception 'Stock cannot be managed by both the variable parent and its variations'; end if;
  return new;
end $$;


--
-- Name: validate_product_variation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_product_variation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare parent public.products%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('product-stock:'||new.product_id::text,0));
  select * into parent from public.products where id=new.product_id;
  if parent.id is null then raise exception 'Variation parent product was not found'; end if;
  if parent.product_type<>'variable' then raise exception 'Variations require a variable parent product'; end if;
  if new.status='active' and parent.manage_stock and new.manage_stock then raise exception 'Stock cannot be managed by both the variable parent and its variations'; end if;
  return new;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounting_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    account_type text NOT NULL,
    parent_id uuid,
    currency text DEFAULT 'BDT'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounting_accounts_account_type_check CHECK ((account_type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'revenue'::text, 'expense'::text]))),
    CONSTRAINT accounting_accounts_code_check CHECK ((code ~ '^[0-9A-Z.-]{2,20}$'::text)),
    CONSTRAINT accounting_accounts_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT accounting_accounts_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 160)))
);


--
-- Name: app_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    icon_key text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_implemented boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_modules_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text))
);


--
-- Name: archive_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archive_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    display_name text NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    archived_by uuid,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    purge_token uuid,
    purge_started_by uuid,
    purge_started_at timestamp with time zone,
    CONSTRAINT archive_entries_display_name_length CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 200))),
    CONSTRAINT archive_entries_entity_type_check CHECK ((entity_type = ANY (ARRAY['product'::text, 'user'::text, 'brand'::text, 'attribute'::text, 'business_category'::text, 'employee'::text]))),
    CONSTRAINT archive_entries_reason_length CHECK (((reason IS NULL) OR (char_length(reason) <= 500)))
);


--
-- Name: attribute_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attribute_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attribute_id uuid NOT NULL,
    value text NOT NULL,
    slug text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scope text DEFAULT 'universal'::text NOT NULL,
    owner_product_id uuid,
    CONSTRAINT attributes_scope_check CHECK ((((scope = 'universal'::text) AND (owner_product_id IS NULL)) OR ((scope = 'product'::text) AND (owner_product_id IS NOT NULL))))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_id uuid,
    target_profile_id uuid,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    actor_role public.account_role,
    module text,
    entity_type text,
    entity_id text,
    description text,
    old_values jsonb,
    new_values jsonb
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    website_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    tagline text,
    theme_color text DEFAULT '#0D6EFD'::text NOT NULL,
    icon text,
    image_path text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    archived_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_categories_theme_color_check CHECK ((theme_color ~ '^#[0-9A-F]{6}$'::text))
);


--
-- Name: business_category_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_category_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_category_id uuid NOT NULL,
    field_key text NOT NULL,
    label text NOT NULL,
    field_type text NOT NULL,
    placeholder text,
    help_text text,
    unit text,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    is_filterable boolean DEFAULT false NOT NULL,
    use_for_variations boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_category_fields_field_key_check CHECK ((field_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'::text)),
    CONSTRAINT business_category_fields_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'textarea'::text, 'number'::text, 'select'::text, 'boolean'::text]))),
    CONSTRAINT business_category_fields_options_check CHECK ((jsonb_typeof(options) = 'array'::text))
);


--
-- Name: cashbook_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashbook_days (
    business_date date NOT NULL,
    opening_balance numeric(18,2) DEFAULT 0 NOT NULL,
    closing_balance numeric(18,2),
    is_closed boolean DEFAULT false NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cashbook_days_check CHECK ((((is_closed = false) AND (closing_balance IS NULL) AND (closed_at IS NULL) AND (closed_by IS NULL)) OR ((is_closed = true) AND (closing_balance IS NOT NULL) AND (closed_at IS NOT NULL) AND (closed_by IS NOT NULL)))),
    CONSTRAINT cashbook_days_opening_balance_check CHECK ((opening_balance >= (0)::numeric))
);


--
-- Name: cashbook_descriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashbook_descriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    transaction_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cashbook_descriptions_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 160))),
    CONSTRAINT cashbook_descriptions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: cashbook_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashbook_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    description_id uuid NOT NULL,
    transaction_type text NOT NULL,
    amount numeric(18,2) NOT NULL,
    payment_method text NOT NULL,
    transaction_at timestamp with time zone NOT NULL,
    business_date date NOT NULL,
    journal_entry_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    remark text DEFAULT ''::text NOT NULL,
    CONSTRAINT cashbook_entries_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cashbook_entries_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank'::text, 'mfs'::text]))),
    CONSTRAINT cashbook_entries_remark_check CHECK ((char_length(remark) <= 240)),
    CONSTRAINT cashbook_entries_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    company_id uuid,
    contact_id uuid,
    activity_type text NOT NULL,
    subject text NOT NULL,
    details text,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    actor_profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_activities_activity_type_check CHECK ((activity_type = ANY (ARRAY['note'::text, 'call'::text, 'email'::text, 'meeting'::text, 'follow_up'::text]))),
    CONSTRAINT crm_activities_check CHECK (((lead_id IS NOT NULL) OR (company_id IS NOT NULL) OR (contact_id IS NOT NULL))),
    CONSTRAINT crm_activities_subject_check CHECK (((char_length(subject) >= 2) AND (char_length(subject) <= 200)))
);


--
-- Name: crm_chatbot_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_chatbot_inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inquiry_number text NOT NULL,
    session_id uuid NOT NULL,
    submission_key uuid NOT NULL,
    status text DEFAULT 'collecting_contact'::text NOT NULL,
    product_query text NOT NULL,
    phone_number text,
    whatsapp text,
    source_page text DEFAULT '/'::text NOT NULL,
    language text DEFAULT 'bn-en'::text NOT NULL,
    consent_to_contact boolean DEFAULT false NOT NULL,
    update_token_hash text NOT NULL,
    ip_hash text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    search_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    selected_products jsonb DEFAULT '[]'::jsonb NOT NULL,
    read_at timestamp with time zone,
    read_by uuid,
    CONSTRAINT crm_chatbot_inquiries_product_query_check CHECK (((char_length(product_query) >= 2) AND (char_length(product_query) <= 500))),
    CONSTRAINT crm_chatbot_inquiries_search_history_check CHECK ((jsonb_typeof(search_history) = 'array'::text)),
    CONSTRAINT crm_chatbot_inquiries_selected_products_check CHECK ((jsonb_typeof(selected_products) = 'array'::text)),
    CONSTRAINT crm_chatbot_inquiries_status_check CHECK ((status = ANY (ARRAY['collecting_contact'::text, 'new'::text, 'contacted'::text, 'qualified'::text, 'converted'::text, 'closed'::text, 'cancelled'::text, 'spam'::text]))),
    CONSTRAINT crm_chatbot_inquiries_update_token_hash_check CHECK ((char_length(update_token_hash) = 64))
);


--
-- Name: crm_chatbot_inquiry_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_chatbot_inquiry_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    legal_name text,
    customer_profile_id uuid,
    industry text,
    website_url text,
    email text,
    phone text,
    country_code text,
    country_name text,
    address text,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tax_identification_number text,
    CONSTRAINT crm_companies_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 180))),
    CONSTRAINT crm_companies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'prospect'::text])))
);


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    profile_id uuid,
    full_name text NOT NULL,
    job_title text,
    email text,
    phone text,
    preferred_contact_method text DEFAULT 'email'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_contacts_check CHECK (((email IS NOT NULL) OR (phone IS NOT NULL) OR (profile_id IS NOT NULL))),
    CONSTRAINT crm_contacts_full_name_check CHECK (((char_length(full_name) >= 2) AND (char_length(full_name) <= 160))),
    CONSTRAINT crm_contacts_preferred_contact_method_check CHECK ((preferred_contact_method = ANY (ARRAY['email'::text, 'phone'::text, 'whatsapp'::text, 'other'::text]))),
    CONSTRAINT crm_contacts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: crm_lead_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_lead_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_number text NOT NULL,
    title text NOT NULL,
    company_id uuid,
    contact_id uuid,
    description text,
    source text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    estimated_value numeric(18,2) DEFAULT 0 NOT NULL,
    currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    expected_close_date date,
    assigned_to uuid,
    lost_reason text,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_leads_estimated_value_check CHECK ((estimated_value >= (0)::numeric)),
    CONSTRAINT crm_leads_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT crm_leads_source_check CHECK ((source = ANY (ARRAY['website'::text, 'referral'::text, 'phone'::text, 'email'::text, 'social'::text, 'event'::text, 'existing_customer'::text, 'other'::text]))),
    CONSTRAINT crm_leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'proposal'::text, 'won'::text, 'lost'::text]))),
    CONSTRAINT crm_leads_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 200)))
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    recipient_name text NOT NULL,
    phone text NOT NULL,
    alternate_phone text,
    address_line_1 text NOT NULL,
    address_line_2 text,
    area text,
    city text NOT NULL,
    region text,
    postal_code text,
    country_code text NOT NULL,
    delivery_instructions text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    map_label text,
    is_default_shipping boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_addresses_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT customer_addresses_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))
);


--
-- Name: customer_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    notification_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    href text,
    entity_type text,
    entity_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['order_status'::text, 'support_reply'::text, 'support_new'::text, 'system'::text, 'quotation_status'::text, 'quotation_expiry'::text, 'quotation_submitted'::text, 'quotation_staff_new'::text, 'quotation_assigned'::text, 'quotation_additional_info_required'::text, 'quotation_information_required'::text, 'quotation_approved'::text, 'quotation_rejected'::text, 'quotation_expired'::text, 'quotation_converted_to_invoice'::text, 'quotation_converted'::text, 'quotation_updated'::text, 'quotation_expiring'::text, 'rma_status'::text, 'rma_new'::text])))
);


--
-- Name: delivery_location_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_location_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid NOT NULL,
    actor_profile_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    paused_at timestamp with time zone,
    ended_at timestamp with time zone,
    last_update_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_location_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'stopped'::text, 'completed'::text])))
);


--
-- Name: delivery_location_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_location_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    shipment_id uuid NOT NULL,
    actor_profile_id uuid NOT NULL,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    accuracy numeric(12,3),
    heading numeric(8,3),
    speed numeric(12,3),
    source text DEFAULT 'browser_geolocation'::text NOT NULL,
    work_location_id uuid,
    customer_visible boolean DEFAULT true NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_location_updates_accuracy_check CHECK (((accuracy IS NULL) OR (accuracy >= (0)::numeric))),
    CONSTRAINT delivery_location_updates_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT delivery_location_updates_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
    CONSTRAINT delivery_location_updates_source_check CHECK ((source = ANY (ARRAY['browser_geolocation'::text, 'manual_verified'::text])))
);


--
-- Name: employee_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hr_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    work_date date NOT NULL,
    check_in timestamp with time zone,
    check_out timestamp with time zone,
    status text DEFAULT 'present'::text NOT NULL,
    notes text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    minutes_late integer DEFAULT 0 NOT NULL,
    timezone text DEFAULT 'Asia/Dhaka'::text NOT NULL,
    scheduled_start_at timestamp with time zone,
    scheduled_end_at timestamp with time zone,
    check_in_variance_minutes integer,
    check_out_variance_minutes integer,
    CONSTRAINT hr_attendance_check CHECK (((check_out IS NULL) OR (check_in IS NULL) OR (check_out >= check_in))),
    CONSTRAINT hr_attendance_minutes_late_check CHECK ((minutes_late >= 0)),
    CONSTRAINT hr_attendance_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'csv'::text, 'device'::text, 'correction'::text, 'system'::text, 'self_service'::text]))),
    CONSTRAINT hr_attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'half_day'::text, 'leave'::text, 'holiday'::text, 'remote'::text, 'overtime'::text, 'holiday_overtime'::text]))),
    CONSTRAINT hr_attendance_timezone_length_check CHECK (((char_length(timezone) >= 1) AND (char_length(timezone) <= 80)))
);


--
-- Name: hr_attendance_correction_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_attendance_correction_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    attendance_id uuid,
    work_date date NOT NULL,
    requested_status text NOT NULL,
    requested_check_in timestamp with time zone,
    requested_check_out timestamp with time zone,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_attendance_correction_requested_status_check CHECK ((requested_status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'half_day'::text, 'leave'::text, 'holiday'::text, 'remote'::text, 'overtime'::text, 'holiday_overtime'::text]))),
    CONSTRAINT hr_attendance_correction_requests_check CHECK (((requested_check_out IS NULL) OR (requested_check_in IS NULL) OR (requested_check_out >= requested_check_in))),
    CONSTRAINT hr_attendance_correction_requests_reason_check CHECK (((char_length(TRIM(BOTH FROM reason)) >= 3) AND (char_length(TRIM(BOTH FROM reason)) <= 1000))),
    CONSTRAINT hr_attendance_correction_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: hr_attendance_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_attendance_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    device_type text NOT NULL,
    vendor text,
    model text,
    serial_number text,
    work_location_id uuid,
    api_key_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_seen_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_attendance_devices_code_check CHECK ((code ~ '^[A-Z0-9-]{2,40}$'::text)),
    CONSTRAINT hr_attendance_devices_device_type_check CHECK ((device_type = ANY (ARRAY['fingerprint'::text, 'camera'::text, 'hybrid'::text, 'gateway'::text, 'other'::text]))),
    CONSTRAINT hr_attendance_devices_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);


--
-- Name: hr_attendance_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_attendance_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id uuid NOT NULL,
    employee_record_id uuid NOT NULL,
    event_uid text NOT NULL,
    event_type text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    processing_error text,
    CONSTRAINT hr_attendance_events_event_type_check CHECK ((event_type = ANY (ARRAY['check_in'::text, 'check_out'::text]))),
    CONSTRAINT hr_attendance_events_event_uid_check CHECK (((char_length(event_uid) >= 1) AND (char_length(event_uid) <= 160)))
);


--
-- Name: hr_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    manager_profile_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_departments_code_check CHECK ((code ~ '^[A-Z0-9-]{2,20}$'::text)),
    CONSTRAINT hr_departments_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);


--
-- Name: hr_designations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_designations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_designations_code_check CHECK ((code ~ '^[A-Z0-9-]{2,20}$'::text)),
    CONSTRAINT hr_designations_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);


--
-- Name: hr_device_employee_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_device_employee_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id uuid NOT NULL,
    employee_record_id uuid NOT NULL,
    external_employee_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_device_employee_mappings_external_employee_id_check CHECK (((char_length(external_employee_id) >= 1) AND (char_length(external_employee_id) <= 120)))
);


--
-- Name: hr_employee_document_deletion_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employee_document_deletion_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_profile_id uuid NOT NULL,
    employee_record_id uuid NOT NULL,
    document_ids uuid[] NOT NULL,
    storage_paths text[] NOT NULL,
    document_snapshot jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT hr_employee_document_deletion_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'failed'::text, 'completed'::text])))
);


--
-- Name: hr_employee_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employee_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    document_type text NOT NULL,
    title text NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    expires_on date,
    uploaded_by uuid NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_employee_documents_document_type_check CHECK (((char_length(document_type) >= 2) AND (char_length(document_type) <= 80))),
    CONSTRAINT hr_employee_documents_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760))),
    CONSTRAINT hr_employee_documents_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 160)))
);


--
-- Name: hr_employee_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employee_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    preferred_name text,
    date_of_birth date,
    gender text,
    nationality text,
    national_id text,
    passport_number text,
    personal_email text,
    personal_phone text,
    present_address text,
    permanent_address text,
    blood_group text,
    marital_status text,
    bank_name text,
    bank_account_name text,
    bank_account_number text,
    bank_routing_number text,
    tax_identifier text,
    notes text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_employee_profiles_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['female'::text, 'male'::text, 'non_binary'::text, 'prefer_not_to_say'::text]))))
);


--
-- Name: hr_employee_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employee_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    employee_number text NOT NULL,
    department_id uuid,
    job_title text NOT NULL,
    employment_type text DEFAULT 'full_time'::text NOT NULL,
    employment_status text DEFAULT 'active'::text NOT NULL,
    hire_date date NOT NULL,
    termination_date date,
    work_location_id uuid,
    manager_profile_id uuid,
    base_salary numeric(18,2),
    salary_currency text DEFAULT 'BDT'::text NOT NULL,
    emergency_contact_name text,
    emergency_contact_phone text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    team_id uuid,
    designation_id uuid,
    probation_end_date date,
    archived_at timestamp with time zone,
    archived_by uuid,
    CONSTRAINT hr_employee_records_base_salary_check CHECK (((base_salary IS NULL) OR (base_salary >= (0)::numeric))),
    CONSTRAINT hr_employee_records_check CHECK (((termination_date IS NULL) OR (termination_date >= hire_date))),
    CONSTRAINT hr_employee_records_employment_status_check CHECK ((employment_status = ANY (ARRAY['active'::text, 'probation'::text, 'on_leave'::text, 'terminated'::text]))),
    CONSTRAINT hr_employee_records_employment_type_check CHECK ((employment_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'contract'::text, 'intern'::text]))),
    CONSTRAINT hr_employee_records_job_title_check CHECK (((char_length(job_title) >= 2) AND (char_length(job_title) <= 120))),
    CONSTRAINT hr_employee_records_salary_currency_check CHECK ((salary_currency ~ '^[A-Z]{3}$'::text))
);


--
-- Name: hr_employee_work_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employee_work_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    weekday smallint NOT NULL,
    is_working boolean DEFAULT true NOT NULL,
    workday_start time without time zone NOT NULL,
    workday_end time without time zone NOT NULL,
    timezone text NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_employee_work_schedules_timezone_check CHECK (((char_length(timezone) >= 1) AND (char_length(timezone) <= 80))),
    CONSTRAINT hr_employee_work_schedules_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


--
-- Name: hr_leave_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    leave_type_id uuid NOT NULL,
    leave_year integer NOT NULL,
    allocated_days numeric(6,2) DEFAULT 0 NOT NULL,
    used_days numeric(6,2) DEFAULT 0 NOT NULL,
    adjusted_days numeric(6,2) DEFAULT 0 NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_leave_balances_allocated_days_check CHECK ((allocated_days >= (0)::numeric)),
    CONSTRAINT hr_leave_balances_check CHECK ((used_days <= (allocated_days + adjusted_days))),
    CONSTRAINT hr_leave_balances_leave_year_check CHECK (((leave_year >= 2000) AND (leave_year <= 2200))),
    CONSTRAINT hr_leave_balances_used_days_check CHECK ((used_days >= (0)::numeric))
);


--
-- Name: hr_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    leave_type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    leave_type_id uuid,
    requested_days numeric(6,2),
    submitted_by uuid,
    CONSTRAINT hr_leave_requests_check CHECK ((end_date >= start_date)),
    CONSTRAINT hr_leave_requests_leave_type_check CHECK ((leave_type = ANY (ARRAY['annual'::text, 'sick'::text, 'unpaid'::text, 'parental'::text, 'other'::text]))),
    CONSTRAINT hr_leave_requests_requested_days_check CHECK (((requested_days IS NULL) OR (requested_days > (0)::numeric))),
    CONSTRAINT hr_leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: hr_leave_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    default_days numeric(6,2) DEFAULT 0 NOT NULL,
    is_paid boolean DEFAULT true NOT NULL,
    requires_document boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_leave_types_code_check CHECK ((code ~ '^[A-Z0-9-]{2,20}$'::text)),
    CONSTRAINT hr_leave_types_default_days_check CHECK ((default_days >= (0)::numeric)),
    CONSTRAINT hr_leave_types_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);


--
-- Name: hr_payroll_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_payroll_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_record_id uuid NOT NULL,
    component_type text NOT NULL,
    name text NOT NULL,
    amount numeric(18,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_payroll_components_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT hr_payroll_components_component_type_check CHECK ((component_type = ANY (ARRAY['earning'::text, 'deduction'::text]))),
    CONSTRAINT hr_payroll_components_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);


--
-- Name: hr_payroll_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_payroll_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    base_salary numeric(18,2) DEFAULT 0 NOT NULL,
    gross_pay numeric(18,2) DEFAULT 0 NOT NULL,
    deductions numeric(18,2) DEFAULT 0 NOT NULL,
    net_pay numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'BDT'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    paid_at timestamp with time zone,
    notes text,
    created_by uuid NOT NULL,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_payroll_records_base_salary_check CHECK ((base_salary >= (0)::numeric)),
    CONSTRAINT hr_payroll_records_check CHECK ((period_end >= period_start)),
    CONSTRAINT hr_payroll_records_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT hr_payroll_records_deductions_check CHECK ((deductions >= (0)::numeric)),
    CONSTRAINT hr_payroll_records_gross_pay_check CHECK ((gross_pay >= (0)::numeric)),
    CONSTRAINT hr_payroll_records_net_pay_check CHECK ((net_pay >= (0)::numeric)),
    CONSTRAINT hr_payroll_records_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: hr_performance_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_performance_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    target_date date,
    status text DEFAULT 'not_started'::text NOT NULL,
    progress_percent integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_performance_goals_progress_percent_check CHECK (((progress_percent >= 0) AND (progress_percent <= 100))),
    CONSTRAINT hr_performance_goals_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT hr_performance_goals_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 160)))
);


--
-- Name: hr_performance_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_performance_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_record_id uuid NOT NULL,
    review_period_start date NOT NULL,
    review_period_end date NOT NULL,
    rating numeric(3,2) NOT NULL,
    strengths text,
    improvements text,
    summary text,
    status text DEFAULT 'draft'::text NOT NULL,
    reviewer_profile_id uuid NOT NULL,
    finalized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_performance_reviews_check CHECK ((review_period_end >= review_period_start)),
    CONSTRAINT hr_performance_reviews_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT hr_performance_reviews_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text])))
);


--
-- Name: hr_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_settings (
    id boolean DEFAULT true NOT NULL,
    workday_start time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    workday_end time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    late_grace_minutes integer DEFAULT 15 NOT NULL,
    leave_year_start_month integer DEFAULT 1 NOT NULL,
    device_ingestion_enabled boolean DEFAULT false NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_settings_id_check CHECK (id),
    CONSTRAINT hr_settings_late_grace_minutes_check CHECK (((late_grace_minutes >= 0) AND (late_grace_minutes <= 240))),
    CONSTRAINT hr_settings_leave_year_start_month_check CHECK (((leave_year_start_month >= 1) AND (leave_year_start_month <= 12)))
);


--
-- Name: hr_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    manager_profile_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_teams_code_check CHECK ((code ~ '^[A-Z0-9-]{2,20}$'::text)),
    CONSTRAINT hr_teams_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);


--
-- Name: inventory_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    location_id uuid,
    product_id uuid NOT NULL,
    variation_id uuid,
    on_hand numeric(18,4) DEFAULT 0 NOT NULL,
    reserved numeric(18,4) DEFAULT 0 NOT NULL,
    incoming numeric(18,4) DEFAULT 0 NOT NULL,
    damaged numeric(18,4) DEFAULT 0 NOT NULL,
    unavailable numeric(18,4) DEFAULT 0 NOT NULL,
    available numeric(18,4) GENERATED ALWAYS AS ((((on_hand - reserved) - damaged) - unavailable)) STORED,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_balances_check CHECK ((((reserved + damaged) + unavailable) <= on_hand)),
    CONSTRAINT inventory_balances_damaged_check CHECK ((damaged >= (0)::numeric)),
    CONSTRAINT inventory_balances_incoming_check CHECK ((incoming >= (0)::numeric)),
    CONSTRAINT inventory_balances_on_hand_check CHECK ((on_hand >= (0)::numeric)),
    CONSTRAINT inventory_balances_reserved_check CHECK ((reserved >= (0)::numeric)),
    CONSTRAINT inventory_balances_unavailable_check CHECK ((unavailable >= (0)::numeric))
);


--
-- Name: inventory_movement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movement_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    movement_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    warehouse_id uuid NOT NULL,
    quantity_delta numeric(18,4) NOT NULL,
    balance_after numeric(18,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_movement_items_balance_after_check CHECK ((balance_after >= (0)::numeric)),
    CONSTRAINT inventory_movement_items_quantity_delta_check CHECK ((quantity_delta <> (0)::numeric))
);


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    movement_type text NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    source_warehouse_id uuid,
    destination_warehouse_id uuid,
    reason_id uuid,
    notes text,
    initiated_by uuid NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_movements_check CHECK (((source_warehouse_id IS DISTINCT FROM destination_warehouse_id) OR (source_warehouse_id IS NULL))),
    CONSTRAINT inventory_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['opening_balance'::text, 'purchase_receipt'::text, 'manual_adjustment'::text, 'warehouse_transfer'::text, 'reservation'::text, 'reservation_release'::text, 'sale_allocation'::text, 'customer_return'::text, 'supplier_return'::text, 'damage'::text, 'correction'::text]))),
    CONSTRAINT inventory_movements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'cancelled'::text])))
);


--
-- Name: inventory_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    warehouse_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    reference text,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid,
    order_item_id uuid,
    released_at timestamp with time zone,
    CONSTRAINT inventory_reservations_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT inventory_reservations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'released'::text, 'consumed'::text, 'cancelled'::text])))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number text NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    description text NOT NULL,
    reference_type text,
    reference_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    currency text DEFAULT 'BDT'::text NOT NULL,
    created_by uuid NOT NULL,
    posted_by uuid,
    posted_at timestamp with time zone,
    reversal_of uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_entries_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT journal_entries_description_check CHECK (((char_length(description) >= 2) AND (char_length(description) <= 500))),
    CONSTRAINT journal_entries_reference_type_check CHECK ((reference_type = ANY (ARRAY['manual'::text, 'sale'::text, 'purchase'::text, 'payment'::text, 'payroll'::text, 'adjustment'::text]))),
    CONSTRAINT journal_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'reversed'::text])))
);


--
-- Name: journal_entry_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_entry_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    description text,
    debit numeric(18,2) DEFAULT 0 NOT NULL,
    credit numeric(18,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_lines_check CHECK ((((debit > (0)::numeric) AND (credit = (0)::numeric)) OR ((credit > (0)::numeric) AND (debit = (0)::numeric)))),
    CONSTRAINT journal_lines_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT journal_lines_debit_check CHECK ((debit >= (0)::numeric))
);


--
-- Name: local_user_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_user_credentials (
    profile_id uuid NOT NULL,
    password_hash text,
    password_reset_required boolean DEFAULT false NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    source_provider text DEFAULT 'local'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT local_user_credentials_failed_attempts_check CHECK ((failed_attempts >= 0))
);


--
-- Name: TABLE local_user_credentials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.local_user_credentials IS 'Native SEN credentials. Password hashes are never selected by UI data loaders or audit pages.';


--
-- Name: local_user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent_hash text,
    ip_address inet,
    CONSTRAINT local_user_sessions_token_hash_check CHECK ((char_length(token_hash) = 64))
);


--
-- Name: TABLE local_user_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.local_user_sessions IS 'Hash-only native browser sessions for Windows/LAN operation.';


--
-- Name: order_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    package_reference text NOT NULL,
    status text DEFAULT 'packing'::text NOT NULL,
    weight numeric(18,4),
    length numeric(18,4),
    width numeric(18,4),
    height numeric(18,4),
    notes text,
    created_by uuid NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_packages_height_check CHECK ((height >= (0)::numeric)),
    CONSTRAINT order_packages_length_check CHECK ((length >= (0)::numeric)),
    CONSTRAINT order_packages_status_check CHECK ((status = ANY (ARRAY['packing'::text, 'complete'::text, 'assigned'::text, 'dispatched'::text, 'cancelled'::text]))),
    CONSTRAINT order_packages_weight_check CHECK ((weight >= (0)::numeric)),
    CONSTRAINT order_packages_width_check CHECK ((width >= (0)::numeric))
);


--
-- Name: order_packed_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_packed_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL,
    allocation_id uuid,
    packed_by uuid NOT NULL,
    packed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_packed_items_check CHECK (((allocation_id IS NOT NULL) OR (quantity > (0)::numeric))),
    CONSTRAINT order_packed_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: order_serial_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_serial_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    serial_number_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    allocation_method text DEFAULT 'manual'::text NOT NULL,
    allocated_by uuid NOT NULL,
    allocated_at timestamp with time zone DEFAULT now() NOT NULL,
    released_by uuid,
    released_at timestamp with time zone,
    release_reason text,
    replaced_allocation_id uuid,
    packed_at timestamp with time zone,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_serial_allocations_allocation_method_check CHECK ((allocation_method = ANY (ARRAY['manual'::text, 'scan'::text, 'auto'::text, 'replacement'::text]))),
    CONSTRAINT order_serial_allocations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'released'::text, 'packed'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: order_status_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    old_status text,
    new_status text NOT NULL,
    actor_profile_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_gateways; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_gateways (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    adapter text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    test_mode boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    public_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    secret_env_prefix text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_gateways_adapter_check CHECK ((adapter = ANY (ARRAY['uddoktapay'::text, 'eps'::text, 'manual'::text])))
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    gateway_id uuid NOT NULL,
    gateway_transaction_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    amount numeric(18,4) NOT NULL,
    currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    checkout_url text,
    safe_response jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text])))
);


--
-- Name: permission_template_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_template_items (
    template_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permission_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    is_default boolean DEFAULT false NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permission_templates_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    action text NOT NULL,
    is_sensitive boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permissions_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'::text))
);


--
-- Name: product_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_attributes (
    product_id uuid NOT NULL,
    attribute_id uuid NOT NULL,
    is_variation boolean DEFAULT false NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    sen_business_category text DEFAULT 'Others'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_category_id uuid NOT NULL
);


--
-- Name: product_category_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_category_assignments (
    product_id uuid NOT NULL,
    category_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_identifier_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_identifier_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    previous_sku text,
    new_sku text NOT NULL,
    reason text NOT NULL,
    actor_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    media_type text DEFAULT 'image'::text NOT NULL,
    storage_path text NOT NULL,
    alt_text text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    mime_type text,
    file_size bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    serial_number_id uuid,
    original_file_name text,
    media_purpose text DEFAULT 'gallery_image'::text NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    uploaded_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_media_file_size_check CHECK (((file_size >= 0) AND (file_size <= 10485760))),
    CONSTRAINT product_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'document'::text]))),
    CONSTRAINT product_media_purpose_check CHECK ((media_purpose = ANY (ARRAY['main_product_image'::text, 'gallery_image'::text, 'warranty_document'::text, 'purchase_invoice'::text, 'supplier_invoice'::text, 'packing_list'::text, 'customs_document'::text, 'internal_product_document'::text]))),
    CONSTRAINT product_media_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'customer_order_restricted'::text, 'internal'::text])))
);


--
-- Name: product_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    revision_number bigint NOT NULL,
    snapshot jsonb NOT NULL,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_revisions_revision_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_revisions ALTER COLUMN revision_number ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_revisions_revision_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_tag_assignments (
    product_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    sku text NOT NULL,
    barcode text,
    status text DEFAULT 'active'::text NOT NULL,
    purchase_cost numeric(18,4),
    regular_price numeric(18,4),
    sale_price numeric(18,4),
    manage_stock boolean DEFAULT true NOT NULL,
    stock_status text DEFAULT 'in_stock'::text NOT NULL,
    low_stock_threshold numeric(18,4) DEFAULT 0 NOT NULL,
    allow_backorders boolean DEFAULT false NOT NULL,
    image_url text,
    weight numeric(18,4),
    length numeric(18,4),
    width numeric(18,4),
    height numeric(18,4),
    combination_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_variations_check CHECK (((sale_price >= (0)::numeric) AND ((regular_price IS NULL) OR (sale_price <= regular_price)))),
    CONSTRAINT product_variations_height_check CHECK ((height >= (0)::numeric)),
    CONSTRAINT product_variations_length_check CHECK ((length >= (0)::numeric)),
    CONSTRAINT product_variations_low_stock_threshold_check CHECK ((low_stock_threshold >= (0)::numeric)),
    CONSTRAINT product_variations_purchase_cost_check CHECK ((purchase_cost >= (0)::numeric)),
    CONSTRAINT product_variations_regular_price_check CHECK ((regular_price >= (0)::numeric)),
    CONSTRAINT product_variations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))),
    CONSTRAINT product_variations_stock_status_check CHECK ((stock_status = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'on_backorder'::text]))),
    CONSTRAINT product_variations_weight_check CHECK ((weight >= (0)::numeric)),
    CONSTRAINT product_variations_width_check CHECK ((width >= (0)::numeric))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sku text NOT NULL,
    barcode text,
    manufacturer_part_number text,
    product_type text DEFAULT 'simple'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    sen_business_category text DEFAULT 'Others'::text NOT NULL,
    brand_id uuid,
    short_description text,
    description text,
    specifications jsonb DEFAULT '{}'::jsonb NOT NULL,
    internal_notes text,
    warranty_information text,
    datasheet_url text,
    purchase_cost numeric(18,4),
    regular_price numeric(18,4),
    sale_price numeric(18,4),
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    tax_status text DEFAULT 'taxable'::text NOT NULL,
    tax_class text,
    weight numeric(18,4),
    length numeric(18,4),
    width numeric(18,4),
    height numeric(18,4),
    shipping_class text,
    country_of_origin text,
    manage_stock boolean DEFAULT true NOT NULL,
    stock_status text DEFAULT 'in_stock'::text NOT NULL,
    low_stock_threshold numeric(18,4) DEFAULT 0 NOT NULL,
    allow_backorders boolean DEFAULT false NOT NULL,
    sold_individually boolean DEFAULT false NOT NULL,
    serial_tracking_required boolean DEFAULT false NOT NULL,
    batch_tracking_enabled boolean DEFAULT false NOT NULL,
    default_warehouse_id uuid,
    public_catalogue_visible boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    model_number text,
    normalized_brand_key text,
    normalized_model_number text,
    sku_generation_mode text DEFAULT 'legacy'::text NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    archive_reason text,
    business_category_id uuid NOT NULL,
    warranty_enabled boolean DEFAULT false NOT NULL,
    warranty_duration_months integer DEFAULT 12 NOT NULL,
    warranty_terms text,
    warranty_exclusions text,
    CONSTRAINT products_check CHECK (((sale_price >= (0)::numeric) AND ((regular_price IS NULL) OR (sale_price <= regular_price)))),
    CONSTRAINT products_height_check CHECK ((height >= (0)::numeric)),
    CONSTRAINT products_length_check CHECK ((length >= (0)::numeric)),
    CONSTRAINT products_low_stock_threshold_check CHECK ((low_stock_threshold >= (0)::numeric)),
    CONSTRAINT products_product_type_check CHECK ((product_type = ANY (ARRAY['simple'::text, 'variable'::text]))),
    CONSTRAINT products_purchase_cost_check CHECK ((purchase_cost >= (0)::numeric)),
    CONSTRAINT products_regular_price_check CHECK ((regular_price >= (0)::numeric)),
    CONSTRAINT products_sku_generation_mode_check CHECK ((sku_generation_mode = ANY (ARRAY['legacy'::text, 'automatic'::text, 'custom'::text]))),
    CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))),
    CONSTRAINT products_stock_status_check CHECK ((stock_status = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'on_backorder'::text]))),
    CONSTRAINT products_warranty_duration_months_check CHECK (((warranty_duration_months >= 0) AND (warranty_duration_months <= 240))),
    CONSTRAINT products_weight_check CHECK ((weight >= (0)::numeric)),
    CONSTRAINT products_width_check CHECK ((width >= (0)::numeric))
);


--
-- Name: profile_permission_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_permission_overrides (
    profile_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    effect public.permission_effect NOT NULL,
    reason text,
    assigned_by uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_permission_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_permission_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    template_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: profile_warehouse_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_warehouse_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    is_primary boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_work_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_work_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    work_location_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    phone text,
    country text DEFAULT 'Bangladesh'::text NOT NULL,
    customer_type public.customer_type DEFAULT 'individual'::public.customer_type,
    company_name text,
    role public.account_role DEFAULT 'customer'::public.account_role,
    status public.account_status DEFAULT 'active'::public.account_status,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    avatar_kind text DEFAULT 'emoji'::text NOT NULL,
    avatar_emoji text DEFAULT '🙂'::text NOT NULL,
    avatar_path text,
    archived_at timestamp with time zone,
    archived_by uuid,
    archive_reason text,
    cover_path text,
    bio text,
    date_of_birth date,
    gender text,
    pronouns text,
    alternate_phone text,
    address_line text,
    city text,
    region text,
    postal_code text,
    job_title text,
    department text,
    professional_summary text,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    emergency_contact_name text,
    emergency_contact_relationship text,
    emergency_contact_phone text,
    CONSTRAINT profiles_avatar_kind_check CHECK ((avatar_kind = ANY (ARRAY['emoji'::text, 'upload'::text]))),
    CONSTRAINT profiles_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['female'::text, 'male'::text, 'non_binary'::text, 'prefer_not_to_say'::text])))),
    CONSTRAINT profiles_profile_field_lengths_check CHECK (((char_length(COALESCE(bio, ''::text)) <= 500) AND (char_length(COALESCE(pronouns, ''::text)) <= 60) AND (char_length(COALESCE(alternate_phone, ''::text)) <= 60) AND (char_length(COALESCE(address_line, ''::text)) <= 300) AND (char_length(COALESCE(city, ''::text)) <= 120) AND (char_length(COALESCE(region, ''::text)) <= 120) AND (char_length(COALESCE(postal_code, ''::text)) <= 30) AND (char_length(COALESCE(job_title, ''::text)) <= 160) AND (char_length(COALESCE(department, ''::text)) <= 160) AND (char_length(COALESCE(professional_summary, ''::text)) <= 1000) AND (char_length(COALESCE(emergency_contact_name, ''::text)) <= 160) AND (char_length(COALESCE(emergency_contact_relationship, ''::text)) <= 100) AND (char_length(COALESCE(emergency_contact_phone, ''::text)) <= 60))),
    CONSTRAINT profiles_social_links_object_check CHECK ((jsonb_typeof(social_links) = 'object'::text))
);


--
-- Name: COLUMN profiles.country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.country IS 'Canonical display country retained alongside legacy country_code/country_name columns when present.';


--
-- Name: purchase_carriers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_carriers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_carriers_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 200))),
    CONSTRAINT purchase_carriers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: purchase_inbound_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_inbound_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    status text NOT NULL,
    transport_mode text NOT NULL,
    carrier_name text,
    tracking_number text,
    expected_departure_at timestamp with time zone,
    expected_arrival_at timestamp with time zone,
    shipped_at timestamp with time zone,
    received_at timestamp with time zone,
    stock_received_at timestamp with time zone,
    notes text,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_inbound_shipments_check CHECK (((expected_arrival_at IS NULL) OR (expected_departure_at IS NULL) OR (expected_arrival_at >= expected_departure_at))),
    CONSTRAINT purchase_inbound_shipments_status_check CHECK ((status = ANY (ARRAY['ready_for_shipment'::text, 'shipped'::text, 'received'::text, 'stock_received'::text, 'cancelled'::text]))),
    CONSTRAINT purchase_inbound_shipments_transport_mode_check CHECK ((transport_mode = ANY (ARRAY['air'::text, 'sea'::text, 'road'::text, 'courier'::text, 'other'::text])))
);


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    product_name_snapshot text NOT NULL,
    sku_snapshot text NOT NULL,
    description text,
    quantity_ordered numeric(18,4) NOT NULL,
    quantity_received numeric(18,4) DEFAULT 0 NOT NULL,
    quantity_rejected numeric(18,4) DEFAULT 0 NOT NULL,
    unit_cost numeric(18,4) NOT NULL,
    discount_amount numeric(18,4) DEFAULT 0 NOT NULL,
    tax_amount numeric(18,4) DEFAULT 0 NOT NULL,
    line_total numeric(18,4) GENERATED ALWAYS AS (GREATEST((((quantity_ordered * unit_cost) - discount_amount) + tax_amount), (0)::numeric)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_order_items_check CHECK (((quantity_received + quantity_rejected) <= quantity_ordered)),
    CONSTRAINT purchase_order_items_discount_amount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT purchase_order_items_quantity_ordered_check CHECK ((quantity_ordered > (0)::numeric)),
    CONSTRAINT purchase_order_items_quantity_received_check CHECK ((quantity_received >= (0)::numeric)),
    CONSTRAINT purchase_order_items_quantity_rejected_check CHECK ((quantity_rejected >= (0)::numeric)),
    CONSTRAINT purchase_order_items_tax_amount_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT purchase_order_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_order_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_order_status_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_status_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    note text,
    actor_profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    supplier_id uuid NOT NULL,
    destination_warehouse_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_delivery_date date,
    supplier_reference text,
    payment_terms_days integer DEFAULT 0 NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    subtotal numeric(18,4) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,4) DEFAULT 0 NOT NULL,
    shipping_amount numeric(18,4) DEFAULT 0 NOT NULL,
    tax_amount numeric(18,4) DEFAULT 0 NOT NULL,
    other_amount numeric(18,4) DEFAULT 0 NOT NULL,
    total_amount numeric(18,4) DEFAULT 0 NOT NULL,
    internal_notes text,
    supplier_notes text,
    submitted_at timestamp with time zone,
    submitted_by uuid,
    approved_at timestamp with time zone,
    approved_by uuid,
    ordered_at timestamp with time zone,
    ordered_by uuid,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancellation_reason text,
    completed_at timestamp with time zone,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_orders_check CHECK (((expected_delivery_date IS NULL) OR (expected_delivery_date >= order_date))),
    CONSTRAINT purchase_orders_check1 CHECK ((total_amount = GREATEST(((((subtotal - discount_amount) + shipping_amount) + tax_amount) + other_amount), (0)::numeric))),
    CONSTRAINT purchase_orders_discount_amount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT purchase_orders_other_amount_check CHECK ((other_amount >= (0)::numeric)),
    CONSTRAINT purchase_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'not_applicable'::text]))),
    CONSTRAINT purchase_orders_payment_terms_days_check CHECK (((payment_terms_days >= 0) AND (payment_terms_days <= 365))),
    CONSTRAINT purchase_orders_shipping_amount_check CHECK ((shipping_amount >= (0)::numeric)),
    CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'ordered'::text, 'ready_for_shipment'::text, 'shipped'::text, 'received'::text, 'partially_received'::text, 'stock_received'::text, 'cancelled'::text, 'closed'::text]))),
    CONSTRAINT purchase_orders_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT purchase_orders_tax_amount_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT purchase_orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: purchase_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_receipt_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_receipt_id uuid NOT NULL,
    purchase_order_item_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    quantity_received numeric(18,4) NOT NULL,
    serial_generation_batch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_receipt_items_quantity_received_check CHECK ((quantity_received > (0)::numeric))
);


--
-- Name: purchase_receipt_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_receipt_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_number text NOT NULL,
    purchase_order_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    inventory_movement_id uuid NOT NULL,
    receipt_date date DEFAULT CURRENT_DATE NOT NULL,
    supplier_delivery_reference text,
    supplier_invoice_reference text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    notes text,
    received_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_receipts_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'reversed'::text])))
);


--
-- Name: quotation_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_request_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    product_id uuid,
    variation_id uuid,
    product_name_snapshot text NOT NULL,
    sku_snapshot text,
    quantity numeric(18,4) DEFAULT 1 NOT NULL,
    target_price numeric(18,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description_snapshot text,
    unit_price numeric(18,2),
    discount_amount numeric(18,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(18,2) DEFAULT 0 NOT NULL,
    line_subtotal numeric(18,2) DEFAULT 0 NOT NULL,
    line_total numeric(18,2) DEFAULT 0 NOT NULL,
    currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    CONSTRAINT quotation_request_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT quotation_request_items_target_price_check CHECK (((target_price IS NULL) OR (target_price >= (0)::numeric)))
);


--
-- Name: quotation_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    profile_id uuid NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    subject text NOT NULL,
    message text,
    company_name text,
    required_by date,
    assigned_to uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    billing_address_id uuid,
    shipping_address_id uuid,
    billing_address_snapshot jsonb,
    shipping_address_snapshot jsonb,
    subtotal numeric(18,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(18,2) DEFAULT 0 NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    terms_and_conditions text,
    payment_terms text,
    delivery_information text,
    internal_notes text,
    customer_notes text,
    expiration_date date,
    approved_at timestamp with time zone,
    approved_by uuid,
    rejected_at timestamp with time zone,
    rejected_by uuid,
    converted_at timestamp with time zone,
    converted_by uuid,
    converted_order_id uuid,
    converted_invoice_id uuid,
    customer_tax_identification_number text,
    updated_by uuid,
    CONSTRAINT quotation_requests_amounts_check CHECK (((subtotal >= (0)::numeric) AND (discount_amount >= (0)::numeric) AND (tax_amount >= (0)::numeric) AND (total_amount >= (0)::numeric))),
    CONSTRAINT quotation_requests_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'reviewing'::text, 'additional_info_required'::text, 'quoted'::text, 'approved'::text, 'rejected'::text, 'accepted'::text, 'declined'::text, 'closed'::text, 'expired'::text, 'converted_to_invoice'::text])))
);


--
-- Name: rma_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rma_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rma_claim_id uuid NOT NULL,
    storage_path text NOT NULL,
    original_file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rma_attachments_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760)))
);


--
-- Name: rma_claim_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rma_claim_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rma_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rma_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rma_number text DEFAULT ((('RMA-'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY'::text)) || '-'::text) || lpad((nextval('public.rma_claim_number_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    customer_profile_id uuid NOT NULL,
    warranty_coverage_id uuid NOT NULL,
    sales_order_id uuid NOT NULL,
    sales_order_item_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    serial_number_id uuid,
    claim_type text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    resolution text,
    assigned_to uuid,
    internal_notes text,
    customer_notes text,
    replacement_serial_number_id uuid,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    received_at timestamp with time zone,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rma_claims_claim_type_check CHECK ((claim_type = ANY (ARRAY['warranty'::text, 'damaged'::text, 'defective'::text, 'return'::text]))),
    CONSTRAINT rma_claims_description_check CHECK (((length(TRIM(BOTH FROM description)) >= 10) AND (length(TRIM(BOTH FROM description)) <= 4000))),
    CONSTRAINT rma_claims_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT rma_claims_resolution_check CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['repaired'::text, 'replaced'::text, 'refund_approved'::text, 'credit_issued'::text, 'claim_rejected'::text, 'no_fault_found'::text, 'damaged_beyond_repair_retired'::text])))),
    CONSTRAINT rma_claims_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'return_requested'::text, 'product_received'::text, 'resolution_in_progress'::text, 'closed'::text])))
);


--
-- Name: rma_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rma_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rma_claim_id uuid NOT NULL,
    actor_profile_id uuid,
    event_type text NOT NULL,
    previous_status text,
    new_status text,
    note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    customer_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sale_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    document_number text NOT NULL,
    document_type text NOT NULL,
    status text DEFAULT 'generated'::text NOT NULL,
    snapshot jsonb NOT NULL,
    generated_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    superseded_at timestamp with time zone,
    superseded_by uuid,
    superseded_reason text,
    CONSTRAINT sale_documents_document_type_check CHECK ((document_type = ANY (ARRAY['invoice'::text, 'delivery_challan'::text]))),
    CONSTRAINT sale_documents_revision_number_check CHECK ((revision_number >= 1)),
    CONSTRAINT sale_documents_status_check CHECK ((status = ANY (ARRAY['generated'::text, 'superseded'::text, 'voided'::text])))
);


--
-- Name: sale_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    amount numeric(18,4) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    method text NOT NULL,
    reference_number text,
    proof_storage_path text,
    internal_note text,
    status text DEFAULT 'received'::text NOT NULL,
    received_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT sale_payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'cheque'::text, 'mobile_banking'::text, 'card'::text, 'credit_sale'::text, 'advance_payment'::text, 'cash_on_delivery'::text, 'other'::text]))),
    CONSTRAINT sale_payments_status_check CHECK ((status = ANY (ARRAY['received'::text, 'refunded'::text, 'voided'::text])))
);


--
-- Name: sale_price_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_price_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    order_item_id uuid,
    adjustment_type text NOT NULL,
    previous_value numeric(18,4),
    new_value numeric(18,4) NOT NULL,
    reason text NOT NULL,
    actor_profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_price_adjustments_adjustment_type_check CHECK ((adjustment_type = ANY (ARRAY['manual_unit_price'::text, 'percentage_discount'::text, 'fixed_line_discount'::text, 'order_discount'::text, 'shipping_charge'::text, 'service_charge'::text, 'tax'::text, 'quantity_change'::text])))
);


--
-- Name: sales_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    fulfillment_warehouse_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL,
    allocated_quantity numeric(18,4) DEFAULT 0 NOT NULL,
    packed_quantity numeric(18,4) DEFAULT 0 NOT NULL,
    shipped_quantity numeric(18,4) DEFAULT 0 NOT NULL,
    delivered_quantity numeric(18,4) DEFAULT 0 NOT NULL,
    unit_price numeric(18,4) NOT NULL,
    line_subtotal numeric(18,4) NOT NULL,
    line_discount numeric(18,4) DEFAULT 0 NOT NULL,
    line_tax numeric(18,4) DEFAULT 0 NOT NULL,
    line_total numeric(18,4) NOT NULL,
    currency character(3) NOT NULL,
    serial_tracking_required_snapshot boolean NOT NULL,
    product_name_snapshot text NOT NULL,
    sku_snapshot text NOT NULL,
    model_number_snapshot text,
    brand_snapshot text,
    variation_snapshot jsonb,
    product_image_path_snapshot text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discount_type text DEFAULT 'fixed'::text NOT NULL,
    discount_value numeric(18,4) DEFAULT 0 NOT NULL,
    warranty_enabled_snapshot boolean DEFAULT false NOT NULL,
    warranty_duration_months_snapshot integer DEFAULT 0 NOT NULL,
    warranty_terms_snapshot text,
    warranty_exclusions_snapshot text,
    CONSTRAINT sales_order_items_allocated_quantity_check CHECK ((allocated_quantity >= (0)::numeric)),
    CONSTRAINT sales_order_items_check CHECK (((allocated_quantity <= quantity) AND (packed_quantity <= quantity) AND (shipped_quantity <= quantity) AND (delivered_quantity <= quantity))),
    CONSTRAINT sales_order_items_check1 CHECK (((NOT serial_tracking_required_snapshot) OR (quantity = trunc(quantity)))),
    CONSTRAINT sales_order_items_delivered_quantity_check CHECK ((delivered_quantity >= (0)::numeric)),
    CONSTRAINT sales_order_items_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text]))),
    CONSTRAINT sales_order_items_discount_value_check CHECK (((discount_value >= (0)::numeric) AND ((discount_type <> 'percentage'::text) OR (discount_value <= (100)::numeric)))),
    CONSTRAINT sales_order_items_line_discount_check CHECK ((line_discount >= (0)::numeric)),
    CONSTRAINT sales_order_items_line_subtotal_check CHECK ((line_subtotal >= (0)::numeric)),
    CONSTRAINT sales_order_items_line_tax_check CHECK ((line_tax >= (0)::numeric)),
    CONSTRAINT sales_order_items_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT sales_order_items_packed_quantity_check CHECK ((packed_quantity >= (0)::numeric)),
    CONSTRAINT sales_order_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT sales_order_items_shipped_quantity_check CHECK ((shipped_quantity >= (0)::numeric)),
    CONSTRAINT sales_order_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    customer_profile_id uuid NOT NULL,
    shipping_address_id uuid,
    shipping_address_snapshot jsonb NOT NULL,
    fulfillment_warehouse_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    subtotal numeric(18,4) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,4) DEFAULT 0 NOT NULL,
    shipping_amount numeric(18,4) DEFAULT 0 NOT NULL,
    tax_amount numeric(18,4) DEFAULT 0 NOT NULL,
    total_amount numeric(18,4) DEFAULT 0 NOT NULL,
    internal_notes text,
    customer_notes text,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_by uuid NOT NULL,
    updated_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_address_id uuid,
    billing_address_snapshot jsonb,
    sales_source text DEFAULT 'direct_office'::text NOT NULL,
    expected_delivery_date date,
    service_amount numeric(18,4) DEFAULT 0 NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    paid_amount numeric(18,4) DEFAULT 0 NOT NULL,
    refunded_amount numeric(18,4) DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    customer_status text DEFAULT 'awaiting_confirmation'::text NOT NULL,
    CONSTRAINT sales_orders_customer_status_check CHECK ((customer_status = ANY (ARRAY['awaiting_confirmation'::text, 'confirmed'::text, 'preparing_delivery'::text, 'on_the_way'::text, 'delivered'::text, 'received'::text]))),
    CONSTRAINT sales_orders_discount_amount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT sales_orders_paid_amount_check CHECK ((paid_amount >= (0)::numeric)),
    CONSTRAINT sales_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'overpaid'::text, 'refunded'::text]))),
    CONSTRAINT sales_orders_refunded_amount_check CHECK ((refunded_amount >= (0)::numeric)),
    CONSTRAINT sales_orders_sales_source_check CHECK ((sales_source = ANY (ARRAY['website'::text, 'facebook'::text, 'whatsapp'::text, 'phone'::text, 'email'::text, 'direct_office'::text, 'existing_customer'::text, 'sales_representative'::text, 'referral'::text, 'other'::text]))),
    CONSTRAINT sales_orders_service_amount_check CHECK ((service_amount >= (0)::numeric)),
    CONSTRAINT sales_orders_shipping_amount_check CHECK ((shipping_amount >= (0)::numeric)),
    CONSTRAINT sales_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'processing'::text, 'partially_allocated'::text, 'allocated'::text, 'packing'::text, 'partially_shipped'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text]))),
    CONSTRAINT sales_orders_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT sales_orders_tax_amount_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT sales_orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: serial_generation_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serial_generation_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    expected_warehouse_id uuid,
    quantity integer NOT NULL,
    condition text DEFAULT 'new'::text NOT NULL,
    notes text,
    status text DEFAULT 'generated'::text NOT NULL,
    generated_by uuid NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT serial_generation_batches_quantity_check CHECK (((quantity >= 1) AND (quantity <= 500))),
    CONSTRAINT serial_generation_batches_status_check CHECK ((status = ANY (ARRAY['generated'::text, 'partially_received'::text, 'received'::text, 'cleared'::text])))
);


--
-- Name: serial_label_sizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serial_label_sizes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    width_mm numeric(6,2) NOT NULL,
    height_mm numeric(6,2) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT serial_label_sizes_height_mm_check CHECK (((height_mm >= (10)::numeric) AND (height_mm <= (300)::numeric))),
    CONSTRAINT serial_label_sizes_name_check CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT serial_label_sizes_width_mm_check CHECK (((width_mm >= (10)::numeric) AND (width_mm <= (300)::numeric)))
);


--
-- Name: serial_number_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serial_number_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    serial_number_id uuid NOT NULL,
    event_type text NOT NULL,
    previous_sen_serial text,
    new_sen_serial text,
    previous_manufacturer_serial text,
    new_manufacturer_serial text,
    previous_status text,
    new_status text,
    previous_warehouse_id uuid,
    new_warehouse_id uuid,
    movement_id uuid,
    reason text,
    actor_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: serial_numbers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serial_numbers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    manufacturer_serial text,
    sen_serial text,
    barcode_value text,
    product_id uuid NOT NULL,
    variation_id uuid,
    warehouse_id uuid,
    location_id uuid,
    status text DEFAULT 'available'::text NOT NULL,
    condition text DEFAULT 'new'::text NOT NULL,
    acquisition_reference text,
    warranty_start date,
    warranty_end date,
    notes text,
    last_movement_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manufacturer_serial_normalized text,
    generated_at timestamp with time zone,
    generated_by uuid,
    received_at timestamp with time zone,
    received_by uuid,
    generation_batch_id uuid,
    purchase_order_item_id uuid,
    service_status text DEFAULT 'normal'::text NOT NULL,
    active_rma_claim_id uuid,
    replacement_for_serial_id uuid,
    CONSTRAINT serial_numbers_check CHECK (((warranty_end IS NULL) OR (warranty_start IS NULL) OR (warranty_end >= warranty_start))),
    CONSTRAINT serial_numbers_service_status_check CHECK ((service_status = ANY (ARRAY['normal'::text, 'claim_open'::text, 'return_requested'::text, 'received_for_service'::text, 'under_service'::text, 'repaired'::text, 'replaced'::text, 'retired'::text]))),
    CONSTRAINT serial_numbers_status_check CHECK ((status = ANY (ARRAY['expected'::text, 'in_transit'::text, 'received'::text, 'available'::text, 'reserved'::text, 'allocated'::text, 'packed'::text, 'shipped'::text, 'delivered'::text, 'returned'::text, 'quarantined'::text, 'damaged'::text, 'lost'::text, 'transferred'::text, 'disposed'::text, 'voided'::text, 'sold'::text, 'unavailable'::text, 'removed'::text])))
);


--
-- Name: serial_tracking_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serial_tracking_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    serial_number_id uuid,
    movement_id uuid,
    tracking_status_id uuid,
    event_type text NOT NULL,
    actor_profile_id uuid NOT NULL,
    workplace_id uuid,
    workplace_name_snapshot text,
    address_snapshot text,
    city_snapshot text,
    country_snapshot text,
    latitude_snapshot numeric(10,7),
    longitude_snapshot numeric(10,7),
    location_source text NOT NULL,
    event_status text DEFAULT 'recorded'::text NOT NULL,
    note text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT serial_tracking_events_location_source_check CHECK ((location_source = ANY (ARRAY['profile_work_location'::text, 'browser_geolocation'::text, 'admin_override'::text, 'warehouse'::text, 'manual_verified'::text])))
);


--
-- Name: shipment_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid,
    order_id uuid NOT NULL,
    order_item_id uuid,
    serial_number_id uuid,
    product_media_id uuid,
    storage_bucket text DEFAULT 'product-media'::text NOT NULL,
    storage_path text NOT NULL,
    original_file_name text,
    document_type text NOT NULL,
    visibility text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipment_documents_document_type_check CHECK ((document_type = ANY (ARRAY['warranty_document'::text, 'purchase_invoice'::text, 'packing_list'::text, 'customs_document'::text, 'freight_document'::text, 'internal_shipment_document'::text]))),
    CONSTRAINT shipment_documents_visibility_check CHECK ((visibility = ANY (ARRAY['customer_order_restricted'::text, 'internal'::text])))
);


--
-- Name: shipment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL,
    delivered_quantity numeric(18,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipment_items_check CHECK (((delivered_quantity >= (0)::numeric) AND (delivered_quantity <= quantity))),
    CONSTRAINT shipment_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: shipment_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_packages (
    shipment_id uuid NOT NULL,
    package_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shipment_route_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_route_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    point_order integer NOT NULL,
    label text NOT NULL,
    point_type text NOT NULL,
    latitude numeric(9,6) NOT NULL,
    longitude numeric(9,6) NOT NULL,
    is_estimated boolean DEFAULT true NOT NULL,
    customer_visible boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipment_route_points_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT shipment_route_points_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
    CONSTRAINT shipment_route_points_point_order_check CHECK ((point_order >= 0)),
    CONSTRAINT shipment_route_points_point_type_check CHECK ((point_type = ANY (ARRAY['origin'::text, 'supplier'::text, 'warehouse'::text, 'airport'::text, 'seaport'::text, 'customs'::text, 'hub'::text, 'destination'::text, 'recorded'::text, 'estimated'::text]))),
    CONSTRAINT shipment_route_points_version_check CHECK ((version > 0))
);


--
-- Name: TABLE shipment_route_points; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shipment_route_points IS 'Versioned recorded or estimated points. Estimated points never represent exact live GPS.';


--
-- Name: shipment_serials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_serials (
    shipment_item_id uuid NOT NULL,
    allocation_id uuid NOT NULL,
    serial_number_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shipment_tracking_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_tracking_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid NOT NULL,
    order_id uuid NOT NULL,
    tracking_status_id uuid NOT NULL,
    actor_profile_id uuid,
    workplace_id uuid,
    location_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    location_source text DEFAULT 'manual'::text NOT NULL,
    transport_mode_snapshot text,
    internal_note text,
    customer_visible_title text,
    customer_visible_message text,
    event_visibility text DEFAULT 'both'::text NOT NULL,
    correction_reason text,
    supersedes_event_id uuid,
    occurred_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipment_tracking_events_event_visibility_check CHECK ((event_visibility = ANY (ARRAY['internal'::text, 'customer'::text, 'both'::text]))),
    CONSTRAINT shipment_tracking_events_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT shipment_tracking_events_location_source_check CHECK ((location_source = ANY (ARRAY['workplace'::text, 'warehouse'::text, 'manual'::text, 'browser_once'::text, 'system'::text, 'estimated'::text]))),
    CONSTRAINT shipment_tracking_events_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))
);


--
-- Name: shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_number text NOT NULL,
    order_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    transport_mode text NOT NULL,
    origin_work_location_id uuid,
    destination_work_location_id uuid,
    origin_snapshot jsonb NOT NULL,
    destination_snapshot jsonb NOT NULL,
    estimated_departure_at timestamp with time zone,
    actual_departure_at timestamp with time zone,
    estimated_arrival_at timestamp with time zone,
    actual_arrival_at timestamp with time zone,
    latest_tracking_status_id uuid,
    latest_location_snapshot jsonb,
    package_count integer DEFAULT 1 NOT NULL,
    gross_weight numeric(18,4),
    dimensions text,
    external_reference text,
    internal_notes text,
    customer_visible_note text,
    customer_visible boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    updated_by uuid NOT NULL,
    confirmed_at timestamp with time zone,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipments_gross_weight_check CHECK ((gross_weight >= (0)::numeric)),
    CONSTRAINT shipments_package_count_check CHECK ((package_count > 0)),
    CONSTRAINT shipments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'packing'::text, 'ready'::text, 'dispatched'::text, 'in_transit'::text, 'arrived'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text]))),
    CONSTRAINT shipments_transport_mode_check CHECK ((transport_mode = ANY (ARRAY['air'::text, 'sea'::text, 'road'::text, 'local_delivery'::text, 'customer_pickup'::text, 'other'::text])))
);


--
-- Name: COLUMN shipments.latest_location_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shipments.latest_location_snapshot IS 'Latest recorded location snapshot, not continuous GPS.';


--
-- Name: shopping_cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shopping_cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    quantity numeric(18,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shopping_cart_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: shopping_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shopping_carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    converted_order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shopping_carts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'converted'::text, 'abandoned'::text])))
);


--
-- Name: stock_adjustment_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_adjustment_reasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    direction text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_adjustment_reasons_direction_check CHECK ((direction = ANY (ARRAY['increase'::text, 'decrease'::text, 'both'::text])))
);


--
-- Name: supplier_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category_type text DEFAULT 'normal'::text NOT NULL,
    parent_id uuid,
    category_level integer DEFAULT 1 NOT NULL,
    code_segment text NOT NULL,
    description text,
    image_url text,
    icon text,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_categories_category_level_check CHECK ((category_level >= 1)),
    CONSTRAINT supplier_categories_category_type_check CHECK ((category_type = 'normal'::text)),
    CONSTRAINT supplier_categories_display_order_check CHECK ((display_order >= 0)),
    CONSTRAINT supplier_categories_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 160)))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    supplier_type text DEFAULT 'distributor'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    contact_person text,
    email text,
    phone text,
    website_url text,
    country_code text NOT NULL,
    country_name text NOT NULL,
    address text,
    tax_registration text,
    payment_terms_days integer DEFAULT 0 NOT NULL,
    default_currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    lead_time_days integer DEFAULT 0 NOT NULL,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supplier_category_id uuid,
    brand_id uuid,
    CONSTRAINT suppliers_lead_time_days_check CHECK (((lead_time_days >= 0) AND (lead_time_days <= 3650))),
    CONSTRAINT suppliers_payment_terms_days_check CHECK (((payment_terms_days >= 0) AND (payment_terms_days <= 365))),
    CONSTRAINT suppliers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_hold'::text, 'archived'::text]))),
    CONSTRAINT suppliers_supplier_type_check CHECK ((supplier_type = ANY (ARRAY['manufacturer'::text, 'distributor'::text, 'reseller'::text, 'service_provider'::text, 'logistics'::text, 'other'::text])))
);


--
-- Name: support_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    storage_path text NOT NULL,
    original_file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_attachments_file_size_check CHECK (((file_size >= 1) AND (file_size <= 10485760)))
);


--
-- Name: support_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    profile_id uuid NOT NULL,
    product_id uuid,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assigned_to uuid,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'waiting_customer'::text, 'waiting_sen'::text, 'closed'::text])))
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_profile_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 10000)))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_settings_key_length CHECK (((char_length(key) >= 1) AND (char_length(key) <= 100)))
);


--
-- Name: tracking_status_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracking_status_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    stage text DEFAULT 'inventory'::text NOT NULL,
    country_scope text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    customer_visible_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: variation_attribute_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variation_attribute_values (
    variation_id uuid NOT NULL,
    attribute_value_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    country_code text NOT NULL,
    country_name text NOT NULL,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warranty_coverage_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_coverage_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_coverages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_coverages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coverage_number text DEFAULT ((('WAR-'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY'::text)) || '-'::text) || lpad((nextval('public.warranty_coverage_number_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    sales_order_id uuid NOT NULL,
    sales_order_item_id uuid NOT NULL,
    customer_profile_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid,
    serial_number_id uuid,
    covered_quantity integer DEFAULT 1 NOT NULL,
    claimed_quantity integer DEFAULT 0 NOT NULL,
    warranty_duration_months integer NOT NULL,
    warranty_terms text,
    warranty_exclusions text,
    starts_at date NOT NULL,
    ends_at date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT warranty_coverages_check CHECK (((claimed_quantity >= 0) AND (claimed_quantity <= covered_quantity))),
    CONSTRAINT warranty_coverages_check1 CHECK ((ends_at >= starts_at)),
    CONSTRAINT warranty_coverages_covered_quantity_check CHECK ((covered_quantity > 0)),
    CONSTRAINT warranty_coverages_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'void'::text]))),
    CONSTRAINT warranty_coverages_warranty_duration_months_check CHECK ((warranty_duration_months >= 0))
);


--
-- Name: work_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    location_type text NOT NULL,
    address_line text,
    city text,
    state_or_region text,
    postal_code text,
    country_code text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    timezone text DEFAULT 'Asia/Dhaka'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_locations_latitude_check CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT work_locations_location_type_check CHECK ((location_type = ANY (ARRAY['office'::text, 'warehouse'::text, 'supplier'::text, 'freight_forwarder'::text, 'airport'::text, 'seaport'::text, 'customs'::text, 'temporary_site'::text, 'other'::text]))),
    CONSTRAINT work_locations_longitude_check CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))
);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: accounting_accounts accounting_accounts_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_accounts
    ADD CONSTRAINT accounting_accounts_code_key UNIQUE (code);


--
-- Name: accounting_accounts accounting_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_accounts
    ADD CONSTRAINT accounting_accounts_pkey PRIMARY KEY (id);


--
-- Name: app_modules app_modules_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_modules
    ADD CONSTRAINT app_modules_key_key UNIQUE (key);


--
-- Name: app_modules app_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_modules
    ADD CONSTRAINT app_modules_pkey PRIMARY KEY (id);


--
-- Name: archive_entries archive_entries_entity_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_entries
    ADD CONSTRAINT archive_entries_entity_type_entity_id_key UNIQUE (entity_type, entity_id);


--
-- Name: archive_entries archive_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_entries
    ADD CONSTRAINT archive_entries_pkey PRIMARY KEY (id);


--
-- Name: attribute_values attribute_values_attribute_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribute_values
    ADD CONSTRAINT attribute_values_attribute_id_slug_key UNIQUE (attribute_id, slug);


--
-- Name: attribute_values attribute_values_attribute_id_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribute_values
    ADD CONSTRAINT attribute_values_attribute_id_value_key UNIQUE (attribute_id, value);


--
-- Name: attribute_values attribute_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribute_values
    ADD CONSTRAINT attribute_values_pkey PRIMARY KEY (id);


--
-- Name: attributes attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attributes
    ADD CONSTRAINT attributes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: brands brands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_name_key UNIQUE (name);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: brands brands_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_slug_key UNIQUE (slug);


--
-- Name: business_categories business_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_categories
    ADD CONSTRAINT business_categories_pkey PRIMARY KEY (id);


--
-- Name: business_categories business_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_categories
    ADD CONSTRAINT business_categories_slug_key UNIQUE (slug);


--
-- Name: business_category_fields business_category_fields_business_category_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_category_fields
    ADD CONSTRAINT business_category_fields_business_category_id_field_key_key UNIQUE (business_category_id, field_key);


--
-- Name: business_category_fields business_category_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_category_fields
    ADD CONSTRAINT business_category_fields_pkey PRIMARY KEY (id);


--
-- Name: cashbook_days cashbook_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_days
    ADD CONSTRAINT cashbook_days_pkey PRIMARY KEY (business_date);


--
-- Name: cashbook_descriptions cashbook_descriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_descriptions
    ADD CONSTRAINT cashbook_descriptions_pkey PRIMARY KEY (id);


--
-- Name: cashbook_entries cashbook_entries_journal_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT cashbook_entries_journal_entry_id_key UNIQUE (journal_entry_id);


--
-- Name: cashbook_entries cashbook_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT cashbook_entries_pkey PRIMARY KEY (id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_chatbot_inquiries crm_chatbot_inquiries_inquiry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatbot_inquiries
    ADD CONSTRAINT crm_chatbot_inquiries_inquiry_number_key UNIQUE (inquiry_number);


--
-- Name: crm_chatbot_inquiries crm_chatbot_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatbot_inquiries
    ADD CONSTRAINT crm_chatbot_inquiries_pkey PRIMARY KEY (id);


--
-- Name: crm_chatbot_inquiries crm_chatbot_inquiries_session_id_submission_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatbot_inquiries
    ADD CONSTRAINT crm_chatbot_inquiries_session_id_submission_key_key UNIQUE (session_id, submission_key);


--
-- Name: crm_companies crm_companies_customer_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_customer_profile_id_key UNIQUE (customer_profile_id);


--
-- Name: crm_companies crm_companies_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_name_key UNIQUE (name);


--
-- Name: crm_companies crm_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_profile_id_key UNIQUE (profile_id);


--
-- Name: crm_leads crm_leads_lead_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_lead_number_key UNIQUE (lead_number);


--
-- Name: crm_leads crm_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_pkey PRIMARY KEY (id);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: customer_notifications customer_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_pkey PRIMARY KEY (id);


--
-- Name: delivery_location_sessions delivery_location_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_sessions
    ADD CONSTRAINT delivery_location_sessions_pkey PRIMARY KEY (id);


--
-- Name: delivery_location_updates delivery_location_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_updates
    ADD CONSTRAINT delivery_location_updates_pkey PRIMARY KEY (id);


--
-- Name: hr_attendance_correction_requests hr_attendance_correction_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_correction_requests
    ADD CONSTRAINT hr_attendance_correction_requests_pkey PRIMARY KEY (id);


--
-- Name: hr_attendance_devices hr_attendance_devices_api_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_devices
    ADD CONSTRAINT hr_attendance_devices_api_key_hash_key UNIQUE (api_key_hash);


--
-- Name: hr_attendance_devices hr_attendance_devices_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_devices
    ADD CONSTRAINT hr_attendance_devices_code_key UNIQUE (code);


--
-- Name: hr_attendance_devices hr_attendance_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_devices
    ADD CONSTRAINT hr_attendance_devices_pkey PRIMARY KEY (id);


--
-- Name: hr_attendance_devices hr_attendance_devices_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_devices
    ADD CONSTRAINT hr_attendance_devices_serial_number_key UNIQUE (serial_number);


--
-- Name: hr_attendance hr_attendance_employee_record_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_employee_record_id_work_date_key UNIQUE (employee_record_id, work_date);


--
-- Name: hr_attendance_events hr_attendance_events_device_id_event_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_events
    ADD CONSTRAINT hr_attendance_events_device_id_event_uid_key UNIQUE (device_id, event_uid);


--
-- Name: hr_attendance_events hr_attendance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_events
    ADD CONSTRAINT hr_attendance_events_pkey PRIMARY KEY (id);


--
-- Name: hr_attendance hr_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_pkey PRIMARY KEY (id);


--
-- Name: hr_departments hr_departments_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_departments
    ADD CONSTRAINT hr_departments_code_key UNIQUE (code);


--
-- Name: hr_departments hr_departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_departments
    ADD CONSTRAINT hr_departments_name_key UNIQUE (name);


--
-- Name: hr_departments hr_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_departments
    ADD CONSTRAINT hr_departments_pkey PRIMARY KEY (id);


--
-- Name: hr_designations hr_designations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_designations
    ADD CONSTRAINT hr_designations_code_key UNIQUE (code);


--
-- Name: hr_designations hr_designations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_designations
    ADD CONSTRAINT hr_designations_pkey PRIMARY KEY (id);


--
-- Name: hr_device_employee_mappings hr_device_employee_mappings_device_id_employee_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_device_employee_mappings
    ADD CONSTRAINT hr_device_employee_mappings_device_id_employee_record_id_key UNIQUE (device_id, employee_record_id);


--
-- Name: hr_device_employee_mappings hr_device_employee_mappings_device_id_external_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_device_employee_mappings
    ADD CONSTRAINT hr_device_employee_mappings_device_id_external_employee_id_key UNIQUE (device_id, external_employee_id);


--
-- Name: hr_device_employee_mappings hr_device_employee_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_device_employee_mappings
    ADD CONSTRAINT hr_device_employee_mappings_pkey PRIMARY KEY (id);


--
-- Name: hr_employee_document_deletion_jobs hr_employee_document_deletion_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_document_deletion_jobs
    ADD CONSTRAINT hr_employee_document_deletion_jobs_pkey PRIMARY KEY (id);


--
-- Name: hr_employee_documents hr_employee_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_documents
    ADD CONSTRAINT hr_employee_documents_pkey PRIMARY KEY (id);


--
-- Name: hr_employee_documents hr_employee_documents_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_documents
    ADD CONSTRAINT hr_employee_documents_storage_path_key UNIQUE (storage_path);


--
-- Name: hr_employee_profiles hr_employee_profiles_employee_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_profiles
    ADD CONSTRAINT hr_employee_profiles_employee_record_id_key UNIQUE (employee_record_id);


--
-- Name: hr_employee_profiles hr_employee_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_profiles
    ADD CONSTRAINT hr_employee_profiles_pkey PRIMARY KEY (id);


--
-- Name: hr_employee_records hr_employee_records_employee_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_employee_number_key UNIQUE (employee_number);


--
-- Name: hr_employee_records hr_employee_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_pkey PRIMARY KEY (id);


--
-- Name: hr_employee_records hr_employee_records_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_profile_id_key UNIQUE (profile_id);


--
-- Name: hr_employee_work_schedules hr_employee_work_schedules_employee_record_id_weekday_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_work_schedules
    ADD CONSTRAINT hr_employee_work_schedules_employee_record_id_weekday_key UNIQUE (employee_record_id, weekday);


--
-- Name: hr_employee_work_schedules hr_employee_work_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_work_schedules
    ADD CONSTRAINT hr_employee_work_schedules_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_balances hr_leave_balances_employee_record_id_leave_type_id_leave_ye_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT hr_leave_balances_employee_record_id_leave_type_id_leave_ye_key UNIQUE (employee_record_id, leave_type_id, leave_year);


--
-- Name: hr_leave_balances hr_leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT hr_leave_balances_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_requests hr_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT hr_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_types hr_leave_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT hr_leave_types_code_key UNIQUE (code);


--
-- Name: hr_leave_types hr_leave_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT hr_leave_types_name_key UNIQUE (name);


--
-- Name: hr_leave_types hr_leave_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT hr_leave_types_pkey PRIMARY KEY (id);


--
-- Name: hr_payroll_components hr_payroll_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_components
    ADD CONSTRAINT hr_payroll_components_pkey PRIMARY KEY (id);


--
-- Name: hr_payroll_records hr_payroll_records_employee_record_id_period_start_period_e_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_records
    ADD CONSTRAINT hr_payroll_records_employee_record_id_period_start_period_e_key UNIQUE (employee_record_id, period_start, period_end);


--
-- Name: hr_payroll_records hr_payroll_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_records
    ADD CONSTRAINT hr_payroll_records_pkey PRIMARY KEY (id);


--
-- Name: hr_performance_goals hr_performance_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_performance_goals
    ADD CONSTRAINT hr_performance_goals_pkey PRIMARY KEY (id);


--
-- Name: hr_performance_reviews hr_performance_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_performance_reviews
    ADD CONSTRAINT hr_performance_reviews_pkey PRIMARY KEY (id);


--
-- Name: hr_settings hr_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_settings
    ADD CONSTRAINT hr_settings_pkey PRIMARY KEY (id);


--
-- Name: hr_teams hr_teams_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_teams
    ADD CONSTRAINT hr_teams_code_key UNIQUE (code);


--
-- Name: hr_teams hr_teams_department_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_teams
    ADD CONSTRAINT hr_teams_department_id_name_key UNIQUE (department_id, name);


--
-- Name: hr_teams hr_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_teams
    ADD CONSTRAINT hr_teams_pkey PRIMARY KEY (id);


--
-- Name: inventory_balances inventory_balances_damaged_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.inventory_balances
    ADD CONSTRAINT inventory_balances_damaged_whole CHECK ((damaged = trunc(damaged))) NOT VALID;


--
-- Name: inventory_balances inventory_balances_incoming_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.inventory_balances
    ADD CONSTRAINT inventory_balances_incoming_whole CHECK ((incoming = trunc(incoming))) NOT VALID;


--
-- Name: inventory_balances inventory_balances_on_hand_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.inventory_balances
    ADD CONSTRAINT inventory_balances_on_hand_whole CHECK ((on_hand = trunc(on_hand))) NOT VALID;


--
-- Name: inventory_balances inventory_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_pkey PRIMARY KEY (id);


--
-- Name: inventory_balances inventory_balances_reserved_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.inventory_balances
    ADD CONSTRAINT inventory_balances_reserved_whole CHECK ((reserved = trunc(reserved))) NOT VALID;


--
-- Name: inventory_movement_items inventory_movement_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement_items
    ADD CONSTRAINT inventory_movement_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_reference_key UNIQUE (reference);


--
-- Name: inventory_reservations inventory_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);


--
-- Name: inventory_reservations inventory_reservations_quantity_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_quantity_whole CHECK ((quantity = trunc(quantity))) NOT VALID;


--
-- Name: journal_entries journal_entries_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_entry_number_key UNIQUE (entry_number);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: local_user_credentials local_user_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_user_credentials
    ADD CONSTRAINT local_user_credentials_pkey PRIMARY KEY (profile_id);


--
-- Name: local_user_sessions local_user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_user_sessions
    ADD CONSTRAINT local_user_sessions_pkey PRIMARY KEY (id);


--
-- Name: local_user_sessions local_user_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_user_sessions
    ADD CONSTRAINT local_user_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: order_packages order_packages_order_id_package_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packages
    ADD CONSTRAINT order_packages_order_id_package_reference_key UNIQUE (order_id, package_reference);


--
-- Name: order_packages order_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packages
    ADD CONSTRAINT order_packages_pkey PRIMARY KEY (id);


--
-- Name: order_packed_items order_packed_items_package_id_allocation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packed_items
    ADD CONSTRAINT order_packed_items_package_id_allocation_id_key UNIQUE (package_id, allocation_id);


--
-- Name: order_packed_items order_packed_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packed_items
    ADD CONSTRAINT order_packed_items_pkey PRIMARY KEY (id);


--
-- Name: order_serial_allocations order_serial_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_pkey PRIMARY KEY (id);


--
-- Name: order_status_events order_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_events
    ADD CONSTRAINT order_status_events_pkey PRIMARY KEY (id);


--
-- Name: payment_gateways payment_gateways_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateways
    ADD CONSTRAINT payment_gateways_code_key UNIQUE (code);


--
-- Name: payment_gateways payment_gateways_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateways
    ADD CONSTRAINT payment_gateways_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: permission_template_items permission_template_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_template_items
    ADD CONSTRAINT permission_template_items_pkey PRIMARY KEY (template_id, permission_id);


--
-- Name: permission_templates permission_templates_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_templates
    ADD CONSTRAINT permission_templates_key_key UNIQUE (key);


--
-- Name: permission_templates permission_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_templates
    ADD CONSTRAINT permission_templates_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_key_key UNIQUE (key);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: product_attributes product_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes
    ADD CONSTRAINT product_attributes_pkey PRIMARY KEY (product_id, attribute_id);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_slug_key UNIQUE (slug);


--
-- Name: product_category_assignments product_category_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_assignments
    ADD CONSTRAINT product_category_assignments_pkey PRIMARY KEY (product_id, category_id);


--
-- Name: product_identifier_history product_identifier_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_identifier_history
    ADD CONSTRAINT product_identifier_history_pkey PRIMARY KEY (id);


--
-- Name: product_media product_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);


--
-- Name: product_media product_media_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_storage_path_key UNIQUE (storage_path);


--
-- Name: product_revisions product_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_revisions
    ADD CONSTRAINT product_revisions_pkey PRIMARY KEY (id);


--
-- Name: product_tag_assignments product_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tag_assignments
    ADD CONSTRAINT product_tag_assignments_pkey PRIMARY KEY (product_id, tag_id);


--
-- Name: product_tags product_tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tags
    ADD CONSTRAINT product_tags_name_key UNIQUE (name);


--
-- Name: product_tags product_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tags
    ADD CONSTRAINT product_tags_pkey PRIMARY KEY (id);


--
-- Name: product_tags product_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tags
    ADD CONSTRAINT product_tags_slug_key UNIQUE (slug);


--
-- Name: product_variations product_variations_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_barcode_key UNIQUE (barcode);


--
-- Name: product_variations product_variations_id_product_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_id_product_key UNIQUE (id, product_id);


--
-- Name: product_variations product_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_pkey PRIMARY KEY (id);


--
-- Name: product_variations product_variations_product_id_combination_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_product_id_combination_key_key UNIQUE (product_id, combination_key);


--
-- Name: product_variations product_variations_purchase_cost_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.product_variations
    ADD CONSTRAINT product_variations_purchase_cost_2dp CHECK ((purchase_cost = round(purchase_cost, 2))) NOT VALID;


--
-- Name: product_variations product_variations_regular_price_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.product_variations
    ADD CONSTRAINT product_variations_regular_price_2dp CHECK ((regular_price = round(regular_price, 2))) NOT VALID;


--
-- Name: product_variations product_variations_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_sku_key UNIQUE (sku);


--
-- Name: products products_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_barcode_key UNIQUE (barcode);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_purchase_cost_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.products
    ADD CONSTRAINT products_purchase_cost_2dp CHECK ((purchase_cost = round(purchase_cost, 2))) NOT VALID;


--
-- Name: products products_regular_price_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.products
    ADD CONSTRAINT products_regular_price_2dp CHECK ((regular_price = round(regular_price, 2))) NOT VALID;


--
-- Name: products products_sale_price_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.products
    ADD CONSTRAINT products_sale_price_2dp CHECK ((sale_price = round(sale_price, 2))) NOT VALID;


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: profile_permission_overrides profile_permission_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_overrides
    ADD CONSTRAINT profile_permission_overrides_pkey PRIMARY KEY (profile_id, permission_id);


--
-- Name: profile_permission_templates profile_permission_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_templates
    ADD CONSTRAINT profile_permission_templates_pkey PRIMARY KEY (id);


--
-- Name: profile_warehouse_assignments profile_warehouse_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_warehouse_assignments
    ADD CONSTRAINT profile_warehouse_assignments_pkey PRIMARY KEY (id);


--
-- Name: profile_work_locations profile_work_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_work_locations
    ADD CONSTRAINT profile_work_locations_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_carriers purchase_carriers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_carriers
    ADD CONSTRAINT purchase_carriers_pkey PRIMARY KEY (id);


--
-- Name: purchase_inbound_shipments purchase_inbound_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_inbound_shipments
    ADD CONSTRAINT purchase_inbound_shipments_pkey PRIMARY KEY (id);


--
-- Name: purchase_inbound_shipments purchase_inbound_shipments_purchase_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_inbound_shipments
    ADD CONSTRAINT purchase_inbound_shipments_purchase_order_id_key UNIQUE (purchase_order_id);


--
-- Name: purchase_order_items purchase_order_items_discount_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_discount_2dp CHECK ((discount_amount = round(discount_amount, 2))) NOT VALID;


--
-- Name: purchase_order_items purchase_order_items_ordered_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_ordered_whole CHECK ((quantity_ordered = trunc(quantity_ordered))) NOT VALID;


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_received_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_received_whole CHECK ((quantity_received = trunc(quantity_received))) NOT VALID;


--
-- Name: purchase_order_items purchase_order_items_rejected_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_rejected_whole CHECK ((quantity_rejected = trunc(quantity_rejected))) NOT VALID;


--
-- Name: purchase_order_items purchase_order_items_tax_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_tax_2dp CHECK ((tax_amount = round(tax_amount, 2))) NOT VALID;


--
-- Name: purchase_order_items purchase_order_items_unit_cost_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_unit_cost_2dp CHECK ((unit_cost = round(unit_cost, 2))) NOT VALID;


--
-- Name: purchase_order_status_events purchase_order_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_status_events
    ADD CONSTRAINT purchase_order_status_events_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_order_number_key UNIQUE (order_number);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_receipt_items purchase_receipt_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_receipt_items purchase_receipt_items_quantity_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_quantity_whole CHECK ((quantity_received = trunc(quantity_received))) NOT VALID;


--
-- Name: purchase_receipts purchase_receipts_inventory_movement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_inventory_movement_id_key UNIQUE (inventory_movement_id);


--
-- Name: purchase_receipts purchase_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_pkey PRIMARY KEY (id);


--
-- Name: purchase_receipts purchase_receipts_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_receipt_number_key UNIQUE (receipt_number);


--
-- Name: quotation_request_items quotation_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_request_items
    ADD CONSTRAINT quotation_request_items_pkey PRIMARY KEY (id);


--
-- Name: quotation_request_items quotation_request_items_quantity_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.quotation_request_items
    ADD CONSTRAINT quotation_request_items_quantity_whole CHECK ((quantity = trunc(quantity))) NOT VALID;


--
-- Name: quotation_request_items quotation_request_items_target_price_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.quotation_request_items
    ADD CONSTRAINT quotation_request_items_target_price_2dp CHECK ((target_price = round(target_price, 2))) NOT VALID;


--
-- Name: quotation_requests quotation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_pkey PRIMARY KEY (id);


--
-- Name: quotation_requests quotation_requests_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_reference_key UNIQUE (reference);


--
-- Name: rma_attachments rma_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_attachments
    ADD CONSTRAINT rma_attachments_pkey PRIMARY KEY (id);


--
-- Name: rma_attachments rma_attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_attachments
    ADD CONSTRAINT rma_attachments_storage_path_key UNIQUE (storage_path);


--
-- Name: rma_claims rma_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_pkey PRIMARY KEY (id);


--
-- Name: rma_claims rma_claims_rma_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_rma_number_key UNIQUE (rma_number);


--
-- Name: rma_events rma_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_events
    ADD CONSTRAINT rma_events_pkey PRIMARY KEY (id);


--
-- Name: sale_documents sale_documents_document_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_documents
    ADD CONSTRAINT sale_documents_document_number_key UNIQUE (document_number);


--
-- Name: sale_documents sale_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_documents
    ADD CONSTRAINT sale_documents_pkey PRIMARY KEY (id);


--
-- Name: sale_payments sale_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_pkey PRIMARY KEY (id);


--
-- Name: sale_price_adjustments sale_price_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_price_adjustments
    ADD CONSTRAINT sale_price_adjustments_pkey PRIMARY KEY (id);


--
-- Name: sales_order_items sales_order_items_allocated_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_allocated_whole CHECK ((allocated_quantity = trunc(allocated_quantity))) NOT VALID;


--
-- Name: sales_order_items sales_order_items_delivered_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_delivered_whole CHECK ((delivered_quantity = trunc(delivered_quantity))) NOT VALID;


--
-- Name: sales_order_items sales_order_items_packed_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_packed_whole CHECK ((packed_quantity = trunc(packed_quantity))) NOT VALID;


--
-- Name: sales_order_items sales_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_pkey PRIMARY KEY (id);


--
-- Name: sales_order_items sales_order_items_quantity_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_quantity_whole CHECK ((quantity = trunc(quantity))) NOT VALID;


--
-- Name: sales_order_items sales_order_items_shipped_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_shipped_whole CHECK ((shipped_quantity = trunc(shipped_quantity))) NOT VALID;


--
-- Name: sales_order_items sales_order_items_unit_price_2dp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_unit_price_2dp CHECK ((unit_price = round(unit_price, 2))) NOT VALID;


--
-- Name: sales_orders sales_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_order_number_key UNIQUE (order_number);


--
-- Name: sales_orders sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);


--
-- Name: serial_generation_batches serial_generation_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_generation_batches
    ADD CONSTRAINT serial_generation_batches_pkey PRIMARY KEY (id);


--
-- Name: serial_label_sizes serial_label_sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_label_sizes
    ADD CONSTRAINT serial_label_sizes_pkey PRIMARY KEY (id);


--
-- Name: serial_number_history serial_number_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_number_history
    ADD CONSTRAINT serial_number_history_pkey PRIMARY KEY (id);


--
-- Name: serial_numbers serial_numbers_barcode_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_barcode_value_key UNIQUE (barcode_value);


--
-- Name: serial_numbers serial_numbers_manufacturer_serial_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_manufacturer_serial_key UNIQUE (manufacturer_serial);


--
-- Name: serial_numbers serial_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_pkey PRIMARY KEY (id);


--
-- Name: serial_numbers serial_numbers_sen_serial_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_sen_serial_key UNIQUE (sen_serial);


--
-- Name: serial_tracking_events serial_tracking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_tracking_events
    ADD CONSTRAINT serial_tracking_events_pkey PRIMARY KEY (id);


--
-- Name: shipment_documents shipment_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_documents
    ADD CONSTRAINT shipment_documents_pkey PRIMARY KEY (id);


--
-- Name: shipment_items shipment_items_delivered_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.shipment_items
    ADD CONSTRAINT shipment_items_delivered_whole CHECK ((delivered_quantity = trunc(delivered_quantity))) NOT VALID;


--
-- Name: shipment_items shipment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_items
    ADD CONSTRAINT shipment_items_pkey PRIMARY KEY (id);


--
-- Name: shipment_items shipment_items_quantity_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.shipment_items
    ADD CONSTRAINT shipment_items_quantity_whole CHECK ((quantity = trunc(quantity))) NOT VALID;


--
-- Name: shipment_items shipment_items_shipment_id_order_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_items
    ADD CONSTRAINT shipment_items_shipment_id_order_item_id_key UNIQUE (shipment_id, order_item_id);


--
-- Name: shipment_packages shipment_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_packages
    ADD CONSTRAINT shipment_packages_pkey PRIMARY KEY (shipment_id, package_id);


--
-- Name: shipment_route_points shipment_route_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_route_points
    ADD CONSTRAINT shipment_route_points_pkey PRIMARY KEY (id);


--
-- Name: shipment_route_points shipment_route_points_shipment_id_version_point_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_route_points
    ADD CONSTRAINT shipment_route_points_shipment_id_version_point_order_key UNIQUE (shipment_id, version, point_order);


--
-- Name: shipment_serials shipment_serials_allocation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_serials
    ADD CONSTRAINT shipment_serials_allocation_id_key UNIQUE (allocation_id);


--
-- Name: shipment_serials shipment_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_serials
    ADD CONSTRAINT shipment_serials_pkey PRIMARY KEY (shipment_item_id, allocation_id);


--
-- Name: shipment_tracking_events shipment_tracking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_shipment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_shipment_number_key UNIQUE (shipment_number);


--
-- Name: shopping_cart_items shopping_cart_items_cart_id_product_id_variation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart_items
    ADD CONSTRAINT shopping_cart_items_cart_id_product_id_variation_id_key UNIQUE (cart_id, product_id, variation_id);


--
-- Name: shopping_cart_items shopping_cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart_items
    ADD CONSTRAINT shopping_cart_items_pkey PRIMARY KEY (id);


--
-- Name: shopping_cart_items shopping_cart_items_quantity_whole; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.shopping_cart_items
    ADD CONSTRAINT shopping_cart_items_quantity_whole CHECK ((quantity = trunc(quantity))) NOT VALID;


--
-- Name: shopping_carts shopping_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_carts
    ADD CONSTRAINT shopping_carts_pkey PRIMARY KEY (id);


--
-- Name: stock_adjustment_reasons stock_adjustment_reasons_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_reasons
    ADD CONSTRAINT stock_adjustment_reasons_key_key UNIQUE (key);


--
-- Name: stock_adjustment_reasons stock_adjustment_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_reasons
    ADD CONSTRAINT stock_adjustment_reasons_pkey PRIMARY KEY (id);


--
-- Name: supplier_categories supplier_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_code_key UNIQUE (code);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: support_attachments support_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_pkey PRIMARY KEY (id);


--
-- Name: support_attachments support_attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_storage_path_key UNIQUE (storage_path);


--
-- Name: support_conversations support_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_pkey PRIMARY KEY (id);


--
-- Name: support_conversations support_conversations_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_reference_key UNIQUE (reference);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: tracking_status_definitions tracking_status_definitions_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_status_definitions
    ADD CONSTRAINT tracking_status_definitions_key_key UNIQUE (key);


--
-- Name: tracking_status_definitions tracking_status_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_status_definitions
    ADD CONSTRAINT tracking_status_definitions_pkey PRIMARY KEY (id);


--
-- Name: variation_attribute_values variation_attribute_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_attribute_values
    ADD CONSTRAINT variation_attribute_values_pkey PRIMARY KEY (variation_id, attribute_value_id);


--
-- Name: warehouse_locations warehouse_locations_id_warehouse_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_id_warehouse_key UNIQUE (id, warehouse_id);


--
-- Name: warehouse_locations warehouse_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_pkey PRIMARY KEY (id);


--
-- Name: warehouse_locations warehouse_locations_warehouse_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_warehouse_id_code_key UNIQUE (warehouse_id, code);


--
-- Name: warehouses warehouses_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_code_key UNIQUE (code);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: warranty_coverages warranty_coverages_coverage_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_coverage_number_key UNIQUE (coverage_number);


--
-- Name: warranty_coverages warranty_coverages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_pkey PRIMARY KEY (id);


--
-- Name: warranty_coverages warranty_coverages_sales_order_item_id_serial_number_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_sales_order_item_id_serial_number_id_key UNIQUE (sales_order_item_id, serial_number_id);


--
-- Name: work_locations work_locations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_locations
    ADD CONSTRAINT work_locations_code_key UNIQUE (code);


--
-- Name: work_locations work_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_locations
    ADD CONSTRAINT work_locations_pkey PRIMARY KEY (id);


--
-- Name: accounting_accounts_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounting_accounts_parent_idx ON public.accounting_accounts USING btree (parent_id);


--
-- Name: archive_entries_type_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archive_entries_type_time_idx ON public.archive_entries USING btree (entity_type, archived_at DESC);


--
-- Name: attributes_product_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attributes_product_name_unique ON public.attributes USING btree (owner_product_id, lower(name)) WHERE (scope = 'product'::text);


--
-- Name: attributes_product_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attributes_product_slug_unique ON public.attributes USING btree (owner_product_id, slug) WHERE (scope = 'product'::text);


--
-- Name: attributes_universal_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attributes_universal_name_unique ON public.attributes USING btree (lower(name)) WHERE (scope = 'universal'::text);


--
-- Name: attributes_universal_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attributes_universal_slug_unique ON public.attributes USING btree (slug) WHERE (scope = 'universal'::text);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs USING btree (actor_id);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);


--
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: audit_logs_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_module_idx ON public.audit_logs USING btree (module);


--
-- Name: business_categories_active_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX business_categories_active_name_unique ON public.business_categories USING btree (lower(name)) WHERE (archived_at IS NULL);


--
-- Name: business_categories_display_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_categories_display_order_idx ON public.business_categories USING btree (is_active DESC, sort_order, name);


--
-- Name: business_category_fields_display_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_category_fields_display_order_idx ON public.business_category_fields USING btree (business_category_id, is_active DESC, sort_order, label);


--
-- Name: cashbook_descriptions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cashbook_descriptions_active_idx ON public.cashbook_descriptions USING btree (transaction_type, is_active, name);


--
-- Name: cashbook_descriptions_name_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cashbook_descriptions_name_type_idx ON public.cashbook_descriptions USING btree (lower(name), transaction_type);


--
-- Name: cashbook_entries_business_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cashbook_entries_business_date_idx ON public.cashbook_entries USING btree (business_date DESC, transaction_at DESC);


--
-- Name: cashbook_entries_description_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cashbook_entries_description_idx ON public.cashbook_entries USING btree (description_id);


--
-- Name: crm_activities_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activities_company_idx ON public.crm_activities USING btree (company_id, created_at DESC);


--
-- Name: crm_activities_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activities_lead_idx ON public.crm_activities USING btree (lead_id, created_at DESC);


--
-- Name: crm_chatbot_inquiries_ip_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_chatbot_inquiries_ip_created_idx ON public.crm_chatbot_inquiries USING btree (ip_hash, created_at DESC) WHERE (ip_hash IS NOT NULL);


--
-- Name: crm_chatbot_inquiries_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_chatbot_inquiries_phone_idx ON public.crm_chatbot_inquiries USING btree (phone_number) WHERE (phone_number IS NOT NULL);


--
-- Name: crm_chatbot_inquiries_selected_products_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_chatbot_inquiries_selected_products_gin ON public.crm_chatbot_inquiries USING gin (selected_products);


--
-- Name: crm_chatbot_inquiries_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_chatbot_inquiries_session_idx ON public.crm_chatbot_inquiries USING btree (session_id, created_at DESC);


--
-- Name: crm_chatbot_inquiries_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_chatbot_inquiries_status_created_idx ON public.crm_chatbot_inquiries USING btree (status, created_at DESC);


--
-- Name: crm_chatbot_inquiries_unread_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_chatbot_inquiries_unread_created_idx ON public.crm_chatbot_inquiries USING btree (created_at DESC) WHERE (read_at IS NULL);


--
-- Name: crm_chatbot_inquiries_whatsapp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_chatbot_inquiries_whatsapp_idx ON public.crm_chatbot_inquiries USING btree (whatsapp) WHERE (whatsapp IS NOT NULL);


--
-- Name: crm_companies_status_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_companies_status_name_idx ON public.crm_companies USING btree (status, name);


--
-- Name: crm_companies_tax_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_companies_tax_id_idx ON public.crm_companies USING btree (lower(tax_identification_number)) WHERE (tax_identification_number IS NOT NULL);


--
-- Name: crm_contacts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_contacts_company_idx ON public.crm_contacts USING btree (company_id, full_name);


--
-- Name: crm_leads_assigned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_leads_assigned_idx ON public.crm_leads USING btree (assigned_to, status);


--
-- Name: crm_leads_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_leads_status_created_idx ON public.crm_leads USING btree (status, created_at DESC);


--
-- Name: customer_addresses_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_addresses_profile_idx ON public.customer_addresses USING btree (profile_id, updated_at DESC);


--
-- Name: customer_notifications_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_notifications_profile_idx ON public.customer_notifications USING btree (profile_id, read_at, created_at DESC);


--
-- Name: customer_one_default_shipping_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_one_default_shipping_idx ON public.customer_addresses USING btree (profile_id) WHERE is_default_shipping;


--
-- Name: delivery_location_one_active_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX delivery_location_one_active_session_idx ON public.delivery_location_sessions USING btree (shipment_id) WHERE (status = ANY (ARRAY['active'::text, 'paused'::text]));


--
-- Name: delivery_location_updates_shipment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delivery_location_updates_shipment_idx ON public.delivery_location_updates USING btree (shipment_id, recorded_at DESC);


--
-- Name: hr_attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_attendance_date_idx ON public.hr_attendance USING btree (work_date DESC);


--
-- Name: hr_attendance_employee_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_attendance_employee_date_idx ON public.hr_attendance USING btree (employee_record_id, work_date DESC);


--
-- Name: hr_corrections_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_corrections_status_idx ON public.hr_attendance_correction_requests USING btree (status, created_at DESC);


--
-- Name: hr_employee_department_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_employee_department_idx ON public.hr_employee_records USING btree (department_id);


--
-- Name: hr_employee_document_deletion_jobs_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_employee_document_deletion_jobs_pending_idx ON public.hr_employee_document_deletion_jobs USING btree (actor_profile_id, employee_record_id, created_at DESC) WHERE (status = 'pending'::text);


--
-- Name: hr_employee_records_directory_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_employee_records_directory_idx ON public.hr_employee_records USING btree (employment_status, department_id, hire_date DESC) WHERE (archived_at IS NULL);


--
-- Name: hr_employee_work_schedules_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_employee_work_schedules_employee_idx ON public.hr_employee_work_schedules USING btree (employee_record_id, weekday);


--
-- Name: hr_events_employee_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_events_employee_time_idx ON public.hr_attendance_events USING btree (employee_record_id, occurred_at DESC);


--
-- Name: hr_leave_employee_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_leave_employee_dates_idx ON public.hr_leave_requests USING btree (employee_record_id, start_date, end_date);


--
-- Name: hr_leave_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_leave_status_idx ON public.hr_leave_requests USING btree (status, created_at DESC);


--
-- Name: hr_payroll_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_payroll_period_idx ON public.hr_payroll_records USING btree (period_start DESC, period_end DESC);


--
-- Name: inventory_active_order_item_reservation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_active_order_item_reservation_idx ON public.inventory_reservations USING btree (order_item_id) WHERE (status = 'active'::text);


--
-- Name: inventory_balance_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_balance_product_idx ON public.inventory_balances USING btree (warehouse_id, product_id) WHERE ((variation_id IS NULL) AND (location_id IS NULL));


--
-- Name: inventory_balance_variation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_balance_variation_idx ON public.inventory_balances USING btree (warehouse_id, variation_id) WHERE ((variation_id IS NOT NULL) AND (location_id IS NULL));


--
-- Name: inventory_balances_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_balances_warehouse_idx ON public.inventory_balances USING btree (warehouse_id);


--
-- Name: inventory_movements_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_movements_created_idx ON public.inventory_movements USING btree (created_at DESC);


--
-- Name: inventory_movements_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_movements_type_idx ON public.inventory_movements USING btree (movement_type);


--
-- Name: inventory_reservations_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_reservations_order_idx ON public.inventory_reservations USING btree (order_id, status);


--
-- Name: inventory_reservations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_reservations_status_idx ON public.inventory_reservations USING btree (status);


--
-- Name: journal_entries_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_date_idx ON public.journal_entries USING btree (entry_date DESC);


--
-- Name: journal_entries_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_reference_idx ON public.journal_entries USING btree (reference_type, reference_id);


--
-- Name: journal_lines_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_account_idx ON public.journal_lines USING btree (account_id);


--
-- Name: journal_lines_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_entry_idx ON public.journal_lines USING btree (journal_entry_id);


--
-- Name: local_user_sessions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX local_user_sessions_active_idx ON public.local_user_sessions USING btree (token_hash) WHERE (revoked_at IS NULL);


--
-- Name: local_user_sessions_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX local_user_sessions_profile_idx ON public.local_user_sessions USING btree (profile_id, expires_at DESC);


--
-- Name: order_serial_allocations_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_serial_allocations_item_idx ON public.order_serial_allocations USING btree (order_item_id, status);


--
-- Name: order_serial_allocations_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_serial_allocations_order_idx ON public.order_serial_allocations USING btree (order_id, status);


--
-- Name: order_serial_one_active_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX order_serial_one_active_assignment_idx ON public.order_serial_allocations USING btree (serial_number_id) WHERE (status = ANY (ARRAY['active'::text, 'packed'::text, 'shipped'::text]));


--
-- Name: order_status_events_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_status_events_order_idx ON public.order_status_events USING btree (order_id, created_at DESC);


--
-- Name: packed_active_allocation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX packed_active_allocation_idx ON public.order_packed_items USING btree (allocation_id) WHERE (allocation_id IS NOT NULL);


--
-- Name: payment_transactions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_order_idx ON public.payment_transactions USING btree (order_id, created_at DESC);


--
-- Name: permission_template_items_permission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permission_template_items_permission_idx ON public.permission_template_items USING btree (permission_id);


--
-- Name: permission_templates_one_active_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permission_templates_one_active_default_idx ON public.permission_templates USING btree (is_default) WHERE (is_default AND is_active);


--
-- Name: product_categories_business_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_categories_business_category_id_idx ON public.product_categories USING btree (business_category_id);


--
-- Name: product_category_assignments_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_category_assignments_category_idx ON public.product_category_assignments USING btree (category_id);


--
-- Name: product_identifier_history_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_identifier_history_product_idx ON public.product_identifier_history USING btree (product_id, occurred_at DESC);


--
-- Name: product_one_primary_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_one_primary_category_idx ON public.product_category_assignments USING btree (product_id) WHERE is_primary;


--
-- Name: product_primary_media_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_primary_media_idx ON public.product_media USING btree (product_id) WHERE (is_primary AND (variation_id IS NULL));


--
-- Name: product_revisions_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_revisions_product_idx ON public.product_revisions USING btree (product_id, created_at DESC);


--
-- Name: products_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_brand_idx ON public.products USING btree (brand_id);


--
-- Name: products_business_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_business_category_id_idx ON public.products USING btree (business_category_id);


--
-- Name: products_normalized_model_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_normalized_model_identity_idx ON public.products USING btree (normalized_brand_key, normalized_model_number) WHERE ((status <> 'archived'::text) AND (normalized_brand_key IS NOT NULL) AND (normalized_model_number IS NOT NULL));


--
-- Name: products_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_status_idx ON public.products USING btree (status);


--
-- Name: products_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_type_idx ON public.products USING btree (product_type);


--
-- Name: profile_permission_overrides_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_permission_overrides_profile_idx ON public.profile_permission_overrides USING btree (profile_id) WHERE is_active;


--
-- Name: profile_permission_templates_one_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profile_permission_templates_one_active_idx ON public.profile_permission_templates USING btree (profile_id) WHERE is_active;


--
-- Name: profile_warehouse_assignments_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_warehouse_assignments_warehouse_idx ON public.profile_warehouse_assignments USING btree (warehouse_id) WHERE is_active;


--
-- Name: profile_warehouse_one_active_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profile_warehouse_one_active_primary ON public.profile_warehouse_assignments USING btree (profile_id) WHERE (is_active AND is_primary);


--
-- Name: profile_work_locations_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profile_work_locations_primary_idx ON public.profile_work_locations USING btree (profile_id) WHERE (is_primary AND is_active);


--
-- Name: purchase_carriers_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchase_carriers_name_unique ON public.purchase_carriers USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: purchase_inbound_shipments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_inbound_shipments_status_idx ON public.purchase_inbound_shipments USING btree (status, updated_at DESC);


--
-- Name: purchase_order_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_order_items_order_idx ON public.purchase_order_items USING btree (purchase_order_id);


--
-- Name: purchase_orders_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_orders_status_created_idx ON public.purchase_orders USING btree (status, created_at DESC);


--
-- Name: purchase_orders_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_orders_supplier_idx ON public.purchase_orders USING btree (supplier_id, created_at DESC);


--
-- Name: purchase_receipts_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_receipts_order_idx ON public.purchase_receipts USING btree (purchase_order_id, created_at DESC);


--
-- Name: purchase_status_events_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_status_events_order_idx ON public.purchase_order_status_events USING btree (purchase_order_id, created_at DESC);


--
-- Name: quotation_requests_assigned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotation_requests_assigned_idx ON public.quotation_requests USING btree (assigned_to, status, updated_at DESC);


--
-- Name: quotation_requests_converted_invoice_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX quotation_requests_converted_invoice_unique ON public.quotation_requests USING btree (converted_invoice_id) WHERE (converted_invoice_id IS NOT NULL);


--
-- Name: quotation_requests_converted_order_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX quotation_requests_converted_order_unique ON public.quotation_requests USING btree (converted_order_id) WHERE (converted_order_id IS NOT NULL);


--
-- Name: quotation_requests_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotation_requests_profile_idx ON public.quotation_requests USING btree (profile_id, created_at DESC);


--
-- Name: quotation_requests_status_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotation_requests_status_expiry_idx ON public.quotation_requests USING btree (status, expiration_date, updated_at DESC);


--
-- Name: rma_claims_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rma_claims_customer_idx ON public.rma_claims USING btree (customer_profile_id, created_at DESC);


--
-- Name: rma_claims_staff_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rma_claims_staff_queue_idx ON public.rma_claims USING btree (status, assigned_to, created_at DESC);


--
-- Name: rma_events_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rma_events_claim_idx ON public.rma_events USING btree (rma_claim_id, created_at);


--
-- Name: sale_documents_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_documents_order_idx ON public.sale_documents USING btree (order_id, created_at DESC);


--
-- Name: sale_payments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_payments_order_idx ON public.sale_payments USING btree (order_id, created_at DESC);


--
-- Name: sale_price_adjustments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_price_adjustments_order_idx ON public.sale_price_adjustments USING btree (order_id, created_at DESC);


--
-- Name: sales_order_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_order_items_order_idx ON public.sales_order_items USING btree (order_id);


--
-- Name: sales_order_items_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_order_items_product_idx ON public.sales_order_items USING btree (product_id, variation_id);


--
-- Name: sales_orders_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_created_by_idx ON public.sales_orders USING btree (created_by, created_at DESC);


--
-- Name: sales_orders_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_customer_idx ON public.sales_orders USING btree (customer_profile_id, created_at DESC);


--
-- Name: sales_orders_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_number_idx ON public.sales_orders USING btree (order_number);


--
-- Name: sales_orders_payment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_payment_status_idx ON public.sales_orders USING btree (payment_status, updated_at DESC);


--
-- Name: sales_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_status_idx ON public.sales_orders USING btree (status, updated_at DESC);


--
-- Name: serial_label_sizes_dimensions_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX serial_label_sizes_dimensions_unique ON public.serial_label_sizes USING btree (width_mm, height_mm);


--
-- Name: serial_label_sizes_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX serial_label_sizes_name_unique ON public.serial_label_sizes USING btree (lower(btrim(name)));


--
-- Name: serial_number_history_serial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX serial_number_history_serial_idx ON public.serial_number_history USING btree (serial_number_id, occurred_at DESC);


--
-- Name: serial_number_history_voided_sen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX serial_number_history_voided_sen_idx ON public.serial_number_history USING btree (previous_sen_serial) WHERE ((previous_sen_serial IS NOT NULL) AND (event_type = 'regenerated'::text));


--
-- Name: serial_numbers_manufacturer_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX serial_numbers_manufacturer_normalized_idx ON public.serial_numbers USING btree (manufacturer_serial_normalized) WHERE (manufacturer_serial_normalized IS NOT NULL);


--
-- Name: serial_numbers_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX serial_numbers_product_idx ON public.serial_numbers USING btree (product_id);


--
-- Name: serial_numbers_purchase_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX serial_numbers_purchase_item_idx ON public.serial_numbers USING btree (purchase_order_item_id, status);


--
-- Name: serial_numbers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX serial_numbers_status_idx ON public.serial_numbers USING btree (status);


--
-- Name: serial_numbers_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX serial_numbers_warehouse_idx ON public.serial_numbers USING btree (warehouse_id);


--
-- Name: serial_tracking_events_serial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX serial_tracking_events_serial_idx ON public.serial_tracking_events USING btree (serial_number_id, occurred_at DESC);


--
-- Name: shipment_documents_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_documents_order_idx ON public.shipment_documents USING btree (order_id, visibility);


--
-- Name: shipment_tracking_timeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_tracking_timeline_idx ON public.shipment_tracking_events USING btree (shipment_id, occurred_at DESC, recorded_at DESC);


--
-- Name: shipments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_order_idx ON public.shipments USING btree (order_id, created_at DESC);


--
-- Name: shipments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_status_idx ON public.shipments USING btree (status, updated_at DESC);


--
-- Name: shipments_transport_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_transport_idx ON public.shipments USING btree (transport_mode, status);


--
-- Name: shopping_carts_one_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shopping_carts_one_active_idx ON public.shopping_carts USING btree (profile_id) WHERE (status = 'active'::text);


--
-- Name: supplier_categories_parent_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_categories_parent_name_unique ON public.supplier_categories USING btree (parent_id, lower(name)) WHERE (parent_id IS NOT NULL);


--
-- Name: supplier_categories_parent_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_categories_parent_order_idx ON public.supplier_categories USING btree (parent_id, display_order, name);


--
-- Name: supplier_categories_root_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_categories_root_name_unique ON public.supplier_categories USING btree (lower(name)) WHERE (parent_id IS NULL);


--
-- Name: suppliers_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_brand_idx ON public.suppliers USING btree (brand_id);


--
-- Name: suppliers_status_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_status_name_idx ON public.suppliers USING btree (status, name);


--
-- Name: suppliers_supplier_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_supplier_category_idx ON public.suppliers USING btree (supplier_category_id);


--
-- Name: support_conversations_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_conversations_profile_idx ON public.support_conversations USING btree (profile_id, last_message_at DESC);


--
-- Name: warranty_coverages_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_coverages_customer_idx ON public.warranty_coverages USING btree (customer_profile_id, status, ends_at);


--
-- Name: warranty_coverages_nonserial_item_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_coverages_nonserial_item_unique ON public.warranty_coverages USING btree (sales_order_item_id) WHERE (serial_number_id IS NULL);


--
-- Name: warranty_coverages_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_coverages_order_idx ON public.warranty_coverages USING btree (sales_order_id, sales_order_item_id);


--
-- Name: purchase_receipt_items activate_nonserialized_purchase_serials_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activate_nonserialized_purchase_serials_trigger AFTER INSERT ON public.purchase_receipt_items FOR EACH ROW EXECUTE FUNCTION public.activate_nonserialized_purchase_serials();


--
-- Name: products capture_product_revision; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER capture_product_revision AFTER INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.capture_product_revision();


--
-- Name: crm_chatbot_inquiries crm_chatbot_inquiries_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_chatbot_inquiries_touch_updated_at BEFORE UPDATE ON public.crm_chatbot_inquiries FOR EACH ROW EXECUTE FUNCTION public.crm_chatbot_touch_updated_at();


--
-- Name: crm_companies crm_companies_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_companies_touch_updated_at BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();


--
-- Name: crm_contacts crm_contacts_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_contacts_touch_updated_at BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();


--
-- Name: crm_leads crm_leads_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_leads_touch_updated_at BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();


--
-- Name: products enforce_global_product_sku; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_global_product_sku BEFORE INSERT OR UPDATE OF sku ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_global_product_sku();


--
-- Name: product_variations enforce_global_variation_sku; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_global_variation_sku BEFORE INSERT OR UPDATE OF sku ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.enforce_global_product_sku();


--
-- Name: support_messages notify_customer_support_reply_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_customer_support_reply_trigger AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.notify_customer_support_reply();


--
-- Name: products phase3_product_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER phase3_product_identity BEFORE INSERT OR UPDATE OF brand_id, model_number, status ON public.products FOR EACH ROW EXECUTE FUNCTION public.phase3_product_identity_trigger();


--
-- Name: archive_entries protect_claimed_trash_deletion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_claimed_trash_deletion BEFORE DELETE ON public.archive_entries FOR EACH ROW EXECUTE FUNCTION public.prevent_claimed_trash_deletion();


--
-- Name: profiles protect_profile_access_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_profile_access_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();


--
-- Name: purchase_inbound_shipments purchase_inbound_shipments_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER purchase_inbound_shipments_touch_updated_at BEFORE UPDATE ON public.purchase_inbound_shipments FOR EACH ROW EXECUTE FUNCTION public.purchase_touch_updated_at();


--
-- Name: purchase_order_items purchase_order_items_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER purchase_order_items_touch_updated_at BEFORE UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.purchase_touch_updated_at();


--
-- Name: purchase_orders purchase_orders_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER purchase_orders_touch_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.purchase_touch_updated_at();


--
-- Name: quotation_requests quotation_notification_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER quotation_notification_trigger AFTER INSERT OR UPDATE ON public.quotation_requests FOR EACH ROW EXECUTE FUNCTION public.notify_quotation_change();


--
-- Name: order_serial_allocations refresh_allocation_warranty_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_allocation_warranty_trigger AFTER UPDATE OF status ON public.order_serial_allocations FOR EACH ROW EXECUTE FUNCTION public.refresh_allocation_warranty_trigger();


--
-- Name: sales_order_items refresh_item_warranty_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_item_warranty_trigger AFTER UPDATE OF delivered_quantity ON public.sales_order_items FOR EACH ROW WHEN ((new.delivered_quantity > (0)::numeric)) EXECUTE FUNCTION public.refresh_item_warranty_trigger();


--
-- Name: sales_orders refresh_order_warranty_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_order_warranty_trigger AFTER UPDATE OF status, delivered_at ON public.sales_orders FOR EACH ROW WHEN ((new.status = 'delivered'::text)) EXECUTE FUNCTION public.refresh_order_warranty_trigger();


--
-- Name: serial_numbers reuse_expected_purchase_serial_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reuse_expected_purchase_serial_trigger BEFORE INSERT ON public.serial_numbers FOR EACH ROW EXECUTE FUNCTION public.reuse_expected_purchase_serial();


--
-- Name: sales_order_items snapshot_sales_item_warranty_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER snapshot_sales_item_warranty_trigger BEFORE INSERT ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.snapshot_sales_item_warranty();


--
-- Name: supplier_categories supplier_category_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supplier_category_guard BEFORE INSERT OR UPDATE OF name, parent_id ON public.supplier_categories FOR EACH ROW EXECUTE FUNCTION public.supplier_category_guard();


--
-- Name: supplier_categories supplier_category_relevel_descendants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supplier_category_relevel_descendants AFTER UPDATE OF parent_id, category_level ON public.supplier_categories FOR EACH ROW EXECUTE FUNCTION public.supplier_category_relevel_descendants();


--
-- Name: suppliers suppliers_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER suppliers_touch_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.purchase_touch_updated_at();


--
-- Name: sales_order_items sync_new_sale_item_discount_metadata; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_new_sale_item_discount_metadata BEFORE INSERT ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.sync_new_sale_item_discount_metadata();


--
-- Name: product_categories sync_product_categories_business_category_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_product_categories_business_category_name BEFORE INSERT OR UPDATE OF business_category_id, sen_business_category ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.sync_business_category_name();


--
-- Name: products sync_products_business_category_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_products_business_category_name BEFORE INSERT OR UPDATE OF business_category_id, sen_business_category ON public.products FOR EACH ROW EXECUTE FUNCTION public.sync_business_category_name();


--
-- Name: product_category_assignments validate_product_category_business_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_product_category_business_match BEFORE INSERT OR UPDATE ON public.product_category_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_product_category_business_match();


--
-- Name: products validate_product_stock_model; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_product_stock_model BEFORE INSERT OR UPDATE OF product_type, manage_stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_product_stock_model();


--
-- Name: product_variations validate_product_variation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_product_variation BEFORE INSERT OR UPDATE ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.validate_product_variation();


--
-- Name: accounting_accounts accounting_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_accounts
    ADD CONSTRAINT accounting_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: accounting_accounts accounting_accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_accounts
    ADD CONSTRAINT accounting_accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT;


--
-- Name: archive_entries archive_entries_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_entries
    ADD CONSTRAINT archive_entries_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: archive_entries archive_entries_purge_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_entries
    ADD CONSTRAINT archive_entries_purge_started_by_fkey FOREIGN KEY (purge_started_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: attribute_values attribute_values_attribute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribute_values
    ADD CONSTRAINT attribute_values_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES public.attributes(id) ON DELETE CASCADE;


--
-- Name: attributes attributes_owner_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attributes
    ADD CONSTRAINT attributes_owner_product_id_fkey FOREIGN KEY (owner_product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_target_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_target_profile_id_fkey FOREIGN KEY (target_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: business_categories business_categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_categories
    ADD CONSTRAINT business_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: business_categories business_categories_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_categories
    ADD CONSTRAINT business_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: business_category_fields business_category_fields_business_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_category_fields
    ADD CONSTRAINT business_category_fields_business_category_id_fkey FOREIGN KEY (business_category_id) REFERENCES public.business_categories(id) ON DELETE CASCADE;


--
-- Name: cashbook_days cashbook_days_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_days
    ADD CONSTRAINT cashbook_days_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: cashbook_days cashbook_days_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_days
    ADD CONSTRAINT cashbook_days_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cashbook_descriptions cashbook_descriptions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_descriptions
    ADD CONSTRAINT cashbook_descriptions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cashbook_entries cashbook_entries_business_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT cashbook_entries_business_date_fkey FOREIGN KEY (business_date) REFERENCES public.cashbook_days(business_date) ON DELETE RESTRICT;


--
-- Name: cashbook_entries cashbook_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT cashbook_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: cashbook_entries cashbook_entries_description_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT cashbook_entries_description_id_fkey FOREIGN KEY (description_id) REFERENCES public.cashbook_descriptions(id) ON DELETE RESTRICT;


--
-- Name: cashbook_entries cashbook_entries_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT cashbook_entries_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: crm_activities crm_activities_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: crm_activities crm_activities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.crm_companies(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_activities crm_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads(id) ON DELETE CASCADE;


--
-- Name: crm_chatbot_inquiries crm_chatbot_inquiries_read_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatbot_inquiries
    ADD CONSTRAINT crm_chatbot_inquiries_read_by_fkey FOREIGN KEY (read_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: crm_companies crm_companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: crm_companies crm_companies_customer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_customer_profile_id_fkey FOREIGN KEY (customer_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: crm_companies crm_companies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: crm_contacts crm_contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_contacts crm_contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: crm_contacts crm_contacts_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: crm_contacts crm_contacts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: crm_leads crm_leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: crm_leads crm_leads_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_leads crm_leads_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_leads crm_leads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: crm_leads crm_leads_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: customer_addresses customer_addresses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: customer_addresses customer_addresses_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: customer_addresses customer_addresses_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: customer_notifications customer_notifications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: delivery_location_sessions delivery_location_sessions_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_sessions
    ADD CONSTRAINT delivery_location_sessions_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: delivery_location_sessions delivery_location_sessions_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_sessions
    ADD CONSTRAINT delivery_location_sessions_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE RESTRICT;


--
-- Name: delivery_location_updates delivery_location_updates_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_updates
    ADD CONSTRAINT delivery_location_updates_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: delivery_location_updates delivery_location_updates_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_updates
    ADD CONSTRAINT delivery_location_updates_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.delivery_location_sessions(id) ON DELETE RESTRICT;


--
-- Name: delivery_location_updates delivery_location_updates_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_updates
    ADD CONSTRAINT delivery_location_updates_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE RESTRICT;


--
-- Name: delivery_location_updates delivery_location_updates_work_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_location_updates
    ADD CONSTRAINT delivery_location_updates_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;


--
-- Name: hr_attendance_correction_requests hr_attendance_correction_requests_attendance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_correction_requests
    ADD CONSTRAINT hr_attendance_correction_requests_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.hr_attendance(id) ON DELETE RESTRICT;


--
-- Name: hr_attendance_correction_requests hr_attendance_correction_requests_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_correction_requests
    ADD CONSTRAINT hr_attendance_correction_requests_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_attendance_correction_requests hr_attendance_correction_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_correction_requests
    ADD CONSTRAINT hr_attendance_correction_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_attendance_devices hr_attendance_devices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_devices
    ADD CONSTRAINT hr_attendance_devices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_attendance_devices hr_attendance_devices_work_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_devices
    ADD CONSTRAINT hr_attendance_devices_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;


--
-- Name: hr_attendance hr_attendance_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_attendance_events hr_attendance_events_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_events
    ADD CONSTRAINT hr_attendance_events_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.hr_attendance_devices(id) ON DELETE RESTRICT;


--
-- Name: hr_attendance_events hr_attendance_events_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_events
    ADD CONSTRAINT hr_attendance_events_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_attendance hr_attendance_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_departments hr_departments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_departments
    ADD CONSTRAINT hr_departments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_departments hr_departments_manager_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_departments
    ADD CONSTRAINT hr_departments_manager_profile_id_fkey FOREIGN KEY (manager_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_designations hr_designations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_designations
    ADD CONSTRAINT hr_designations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_designations hr_designations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_designations
    ADD CONSTRAINT hr_designations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.hr_departments(id) ON DELETE RESTRICT;


--
-- Name: hr_device_employee_mappings hr_device_employee_mappings_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_device_employee_mappings
    ADD CONSTRAINT hr_device_employee_mappings_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.hr_attendance_devices(id) ON DELETE CASCADE;


--
-- Name: hr_device_employee_mappings hr_device_employee_mappings_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_device_employee_mappings
    ADD CONSTRAINT hr_device_employee_mappings_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_employee_records hr_employee_designation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_designation_fk FOREIGN KEY (designation_id) REFERENCES public.hr_designations(id) ON DELETE SET NULL;


--
-- Name: hr_employee_document_deletion_jobs hr_employee_document_deletion_jobs_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_document_deletion_jobs
    ADD CONSTRAINT hr_employee_document_deletion_jobs_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: hr_employee_document_deletion_jobs hr_employee_document_deletion_jobs_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_document_deletion_jobs
    ADD CONSTRAINT hr_employee_document_deletion_jobs_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_employee_documents hr_employee_documents_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_documents
    ADD CONSTRAINT hr_employee_documents_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_employee_documents hr_employee_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_documents
    ADD CONSTRAINT hr_employee_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: hr_employee_profiles hr_employee_profiles_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_profiles
    ADD CONSTRAINT hr_employee_profiles_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_employee_profiles hr_employee_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_profiles
    ADD CONSTRAINT hr_employee_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_employee_records hr_employee_records_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_employee_records hr_employee_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_employee_records hr_employee_records_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.hr_departments(id) ON DELETE SET NULL;


--
-- Name: hr_employee_records hr_employee_records_manager_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_manager_profile_id_fkey FOREIGN KEY (manager_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_employee_records hr_employee_records_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: hr_employee_records hr_employee_records_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_employee_records hr_employee_records_work_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_records_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;


--
-- Name: hr_employee_records hr_employee_team_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_records
    ADD CONSTRAINT hr_employee_team_fk FOREIGN KEY (team_id) REFERENCES public.hr_teams(id) ON DELETE SET NULL;


--
-- Name: hr_employee_work_schedules hr_employee_work_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_work_schedules
    ADD CONSTRAINT hr_employee_work_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_employee_work_schedules hr_employee_work_schedules_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_work_schedules
    ADD CONSTRAINT hr_employee_work_schedules_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE CASCADE;


--
-- Name: hr_employee_work_schedules hr_employee_work_schedules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_work_schedules
    ADD CONSTRAINT hr_employee_work_schedules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_leave_balances hr_leave_balances_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT hr_leave_balances_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_leave_balances hr_leave_balances_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT hr_leave_balances_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id) ON DELETE RESTRICT;


--
-- Name: hr_leave_balances hr_leave_balances_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT hr_leave_balances_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_leave_requests hr_leave_requests_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT hr_leave_requests_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_leave_requests hr_leave_requests_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT hr_leave_requests_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id) ON DELETE RESTRICT;


--
-- Name: hr_leave_requests hr_leave_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT hr_leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_leave_requests hr_leave_requests_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT hr_leave_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_leave_types hr_leave_types_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT hr_leave_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_payroll_components hr_payroll_components_payroll_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_components
    ADD CONSTRAINT hr_payroll_components_payroll_record_id_fkey FOREIGN KEY (payroll_record_id) REFERENCES public.hr_payroll_records(id) ON DELETE CASCADE;


--
-- Name: hr_payroll_records hr_payroll_records_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_records
    ADD CONSTRAINT hr_payroll_records_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_payroll_records hr_payroll_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_records
    ADD CONSTRAINT hr_payroll_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: hr_payroll_records hr_payroll_records_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_records
    ADD CONSTRAINT hr_payroll_records_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_performance_goals hr_performance_goals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_performance_goals
    ADD CONSTRAINT hr_performance_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: hr_performance_goals hr_performance_goals_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_performance_goals
    ADD CONSTRAINT hr_performance_goals_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_performance_reviews hr_performance_reviews_employee_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_performance_reviews
    ADD CONSTRAINT hr_performance_reviews_employee_record_id_fkey FOREIGN KEY (employee_record_id) REFERENCES public.hr_employee_records(id) ON DELETE RESTRICT;


--
-- Name: hr_performance_reviews hr_performance_reviews_reviewer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_performance_reviews
    ADD CONSTRAINT hr_performance_reviews_reviewer_profile_id_fkey FOREIGN KEY (reviewer_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: hr_settings hr_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_settings
    ADD CONSTRAINT hr_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_teams hr_teams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_teams
    ADD CONSTRAINT hr_teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hr_teams hr_teams_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_teams
    ADD CONSTRAINT hr_teams_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.hr_departments(id) ON DELETE RESTRICT;


--
-- Name: hr_teams hr_teams_manager_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_teams
    ADD CONSTRAINT hr_teams_manager_profile_id_fkey FOREIGN KEY (manager_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inventory_balances inventory_balances_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT;


--
-- Name: inventory_balances inventory_balances_location_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_location_warehouse_fk FOREIGN KEY (location_id, warehouse_id) REFERENCES public.warehouse_locations(id, warehouse_id) ON DELETE RESTRICT;


--
-- Name: inventory_balances inventory_balances_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: inventory_balances inventory_balances_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: inventory_balances inventory_balances_variation_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_variation_product_fk FOREIGN KEY (variation_id, product_id) REFERENCES public.product_variations(id, product_id) ON DELETE RESTRICT;


--
-- Name: inventory_balances inventory_balances_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: inventory_movement_items inventory_movement_items_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement_items
    ADD CONSTRAINT inventory_movement_items_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.inventory_movements(id) ON DELETE RESTRICT;


--
-- Name: inventory_movement_items inventory_movement_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement_items
    ADD CONSTRAINT inventory_movement_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: inventory_movement_items inventory_movement_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement_items
    ADD CONSTRAINT inventory_movement_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: inventory_movement_items inventory_movement_items_variation_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement_items
    ADD CONSTRAINT inventory_movement_items_variation_product_fk FOREIGN KEY (variation_id, product_id) REFERENCES public.product_variations(id, product_id) ON DELETE RESTRICT;


--
-- Name: inventory_movement_items inventory_movement_items_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement_items
    ADD CONSTRAINT inventory_movement_items_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_destination_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_destination_warehouse_id_fkey FOREIGN KEY (destination_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_initiated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES public.stock_adjustment_reasons(id) ON DELETE SET NULL;


--
-- Name: inventory_movements inventory_movements_source_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_source_warehouse_id_fkey FOREIGN KEY (source_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inventory_reservations inventory_reservations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_variation_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_variation_product_fk FOREIGN KEY (variation_id, product_id) REFERENCES public.product_variations(id, product_id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_posted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_reversal_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reversal_of_fkey FOREIGN KEY (reversal_of) REFERENCES public.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: local_user_credentials local_user_credentials_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_user_credentials
    ADD CONSTRAINT local_user_credentials_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: local_user_sessions local_user_sessions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_user_sessions
    ADD CONSTRAINT local_user_sessions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: order_packages order_packages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packages
    ADD CONSTRAINT order_packages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: order_packages order_packages_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packages
    ADD CONSTRAINT order_packages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: order_packed_items order_packed_items_allocation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packed_items
    ADD CONSTRAINT order_packed_items_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES public.order_serial_allocations(id) ON DELETE RESTRICT;


--
-- Name: order_packed_items order_packed_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packed_items
    ADD CONSTRAINT order_packed_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: order_packed_items order_packed_items_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packed_items
    ADD CONSTRAINT order_packed_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.order_packages(id) ON DELETE RESTRICT;


--
-- Name: order_packed_items order_packed_items_packed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_packed_items
    ADD CONSTRAINT order_packed_items_packed_by_fkey FOREIGN KEY (packed_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: order_serial_allocations order_serial_allocations_allocated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_allocated_by_fkey FOREIGN KEY (allocated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: order_serial_allocations order_serial_allocations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: order_serial_allocations order_serial_allocations_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: order_serial_allocations order_serial_allocations_released_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_released_by_fkey FOREIGN KEY (released_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: order_serial_allocations order_serial_allocations_replaced_allocation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_replaced_allocation_id_fkey FOREIGN KEY (replaced_allocation_id) REFERENCES public.order_serial_allocations(id) ON DELETE SET NULL;


--
-- Name: order_serial_allocations order_serial_allocations_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: order_serial_allocations order_serial_allocations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_serial_allocations
    ADD CONSTRAINT order_serial_allocations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: order_status_events order_status_events_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_events
    ADD CONSTRAINT order_status_events_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: order_status_events order_status_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_events
    ADD CONSTRAINT order_status_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: payment_transactions payment_transactions_gateway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_gateway_id_fkey FOREIGN KEY (gateway_id) REFERENCES public.payment_gateways(id) ON DELETE RESTRICT;


--
-- Name: payment_transactions payment_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: payment_transactions payment_transactions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: permission_template_items permission_template_items_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_template_items
    ADD CONSTRAINT permission_template_items_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: permission_template_items permission_template_items_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_template_items
    ADD CONSTRAINT permission_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.permission_templates(id) ON DELETE CASCADE;


--
-- Name: permission_templates permission_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_templates
    ADD CONSTRAINT permission_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: permissions permissions_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.app_modules(id) ON DELETE RESTRICT;


--
-- Name: product_attributes product_attributes_attribute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes
    ADD CONSTRAINT product_attributes_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES public.attributes(id) ON DELETE RESTRICT;


--
-- Name: product_attributes product_attributes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes
    ADD CONSTRAINT product_attributes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_business_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_business_category_id_fkey FOREIGN KEY (business_category_id) REFERENCES public.business_categories(id) ON DELETE RESTRICT;


--
-- Name: product_categories product_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.product_categories(id) ON DELETE RESTRICT;


--
-- Name: product_category_assignments product_category_assignments_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_assignments
    ADD CONSTRAINT product_category_assignments_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE RESTRICT;


--
-- Name: product_category_assignments product_category_assignments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_assignments
    ADD CONSTRAINT product_category_assignments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_identifier_history product_identifier_history_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_identifier_history
    ADD CONSTRAINT product_identifier_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: product_identifier_history product_identifier_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_identifier_history
    ADD CONSTRAINT product_identifier_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: product_media product_media_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_media product_media_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: product_media product_media_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_media product_media_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE CASCADE;


--
-- Name: product_media product_media_variation_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_variation_product_fk FOREIGN KEY (variation_id, product_id) REFERENCES public.product_variations(id, product_id) ON DELETE CASCADE;


--
-- Name: product_revisions product_revisions_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_revisions
    ADD CONSTRAINT product_revisions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_revisions product_revisions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_revisions
    ADD CONSTRAINT product_revisions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: product_tag_assignments product_tag_assignments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tag_assignments
    ADD CONSTRAINT product_tag_assignments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_tag_assignments product_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tag_assignments
    ADD CONSTRAINT product_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.product_tags(id) ON DELETE CASCADE;


--
-- Name: product_variations product_variations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: products products_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: products products_business_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_business_category_id_fkey FOREIGN KEY (business_category_id) REFERENCES public.business_categories(id) ON DELETE RESTRICT;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: products products_default_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_default_warehouse_id_fkey FOREIGN KEY (default_warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;


--
-- Name: products products_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profile_permission_overrides profile_permission_overrides_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_overrides
    ADD CONSTRAINT profile_permission_overrides_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profile_permission_overrides profile_permission_overrides_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_overrides
    ADD CONSTRAINT profile_permission_overrides_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: profile_permission_overrides profile_permission_overrides_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_overrides
    ADD CONSTRAINT profile_permission_overrides_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_permission_templates profile_permission_templates_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_templates
    ADD CONSTRAINT profile_permission_templates_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profile_permission_templates profile_permission_templates_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_templates
    ADD CONSTRAINT profile_permission_templates_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_permission_templates profile_permission_templates_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_permission_templates
    ADD CONSTRAINT profile_permission_templates_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.permission_templates(id) ON DELETE RESTRICT;


--
-- Name: profile_warehouse_assignments profile_warehouse_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_warehouse_assignments
    ADD CONSTRAINT profile_warehouse_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profile_warehouse_assignments profile_warehouse_assignments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_warehouse_assignments
    ADD CONSTRAINT profile_warehouse_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_warehouse_assignments profile_warehouse_assignments_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_warehouse_assignments
    ADD CONSTRAINT profile_warehouse_assignments_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: profile_work_locations profile_work_locations_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_work_locations
    ADD CONSTRAINT profile_work_locations_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profile_work_locations profile_work_locations_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_work_locations
    ADD CONSTRAINT profile_work_locations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: profile_work_locations profile_work_locations_work_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_work_locations
    ADD CONSTRAINT profile_work_locations_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES public.work_locations(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_carriers purchase_carriers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_carriers
    ADD CONSTRAINT purchase_carriers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_inbound_shipments purchase_inbound_shipments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_inbound_shipments
    ADD CONSTRAINT purchase_inbound_shipments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: purchase_inbound_shipments purchase_inbound_shipments_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_inbound_shipments
    ADD CONSTRAINT purchase_inbound_shipments_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE RESTRICT;


--
-- Name: purchase_inbound_shipments purchase_inbound_shipments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_inbound_shipments
    ADD CONSTRAINT purchase_inbound_shipments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_order_items purchase_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_items purchase_order_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_status_events purchase_order_status_events_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_status_events
    ADD CONSTRAINT purchase_order_status_events_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_status_events purchase_order_status_events_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_status_events
    ADD CONSTRAINT purchase_order_status_events_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_destination_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_destination_warehouse_id_fkey FOREIGN KEY (destination_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_receipt_items purchase_receipt_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipt_items purchase_receipt_items_purchase_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_purchase_order_item_id_fkey FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipt_items purchase_receipt_items_purchase_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_purchase_receipt_id_fkey FOREIGN KEY (purchase_receipt_id) REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipt_items purchase_receipt_items_serial_generation_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_serial_generation_batch_id_fkey FOREIGN KEY (serial_generation_batch_id) REFERENCES public.serial_generation_batches(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipt_items purchase_receipt_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipts purchase_receipts_inventory_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_inventory_movement_id_fkey FOREIGN KEY (inventory_movement_id) REFERENCES public.inventory_movements(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipts purchase_receipts_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipts purchase_receipts_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipts purchase_receipts_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: quotation_request_items quotation_request_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_request_items
    ADD CONSTRAINT quotation_request_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: quotation_request_items quotation_request_items_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_request_items
    ADD CONSTRAINT quotation_request_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotation_requests(id) ON DELETE CASCADE;


--
-- Name: quotation_request_items quotation_request_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_request_items
    ADD CONSTRAINT quotation_request_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: quotation_requests quotation_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_billing_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_billing_address_id_fkey FOREIGN KEY (billing_address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_converted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_converted_by_fkey FOREIGN KEY (converted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_converted_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_converted_invoice_id_fkey FOREIGN KEY (converted_invoice_id) REFERENCES public.sale_documents(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_converted_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: quotation_requests quotation_requests_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_shipping_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_shipping_address_id_fkey FOREIGN KEY (shipping_address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL;


--
-- Name: quotation_requests quotation_requests_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_requests
    ADD CONSTRAINT quotation_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rma_attachments rma_attachments_rma_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_attachments
    ADD CONSTRAINT rma_attachments_rma_claim_id_fkey FOREIGN KEY (rma_claim_id) REFERENCES public.rma_claims(id) ON DELETE CASCADE;


--
-- Name: rma_attachments rma_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_attachments
    ADD CONSTRAINT rma_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: rma_claims rma_claims_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rma_claims rma_claims_customer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_customer_profile_id_fkey FOREIGN KEY (customer_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: rma_claims rma_claims_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: rma_claims rma_claims_replacement_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_replacement_serial_number_id_fkey FOREIGN KEY (replacement_serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE SET NULL;


--
-- Name: rma_claims rma_claims_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: rma_claims rma_claims_sales_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_sales_order_item_id_fkey FOREIGN KEY (sales_order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: rma_claims rma_claims_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: rma_claims rma_claims_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: rma_claims rma_claims_warranty_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_claims
    ADD CONSTRAINT rma_claims_warranty_coverage_id_fkey FOREIGN KEY (warranty_coverage_id) REFERENCES public.warranty_coverages(id) ON DELETE RESTRICT;


--
-- Name: rma_events rma_events_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_events
    ADD CONSTRAINT rma_events_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rma_events rma_events_rma_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rma_events
    ADD CONSTRAINT rma_events_rma_claim_id_fkey FOREIGN KEY (rma_claim_id) REFERENCES public.rma_claims(id) ON DELETE CASCADE;


--
-- Name: sale_documents sale_documents_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_documents
    ADD CONSTRAINT sale_documents_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: sale_documents sale_documents_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_documents
    ADD CONSTRAINT sale_documents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: sale_documents sale_documents_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_documents
    ADD CONSTRAINT sale_documents_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sale_payments sale_payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: sale_payments sale_payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: sale_price_adjustments sale_price_adjustments_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_price_adjustments
    ADD CONSTRAINT sale_price_adjustments_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: sale_price_adjustments sale_price_adjustments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_price_adjustments
    ADD CONSTRAINT sale_price_adjustments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: sale_price_adjustments sale_price_adjustments_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_price_adjustments
    ADD CONSTRAINT sale_price_adjustments_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: sales_order_items sales_order_items_fulfillment_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_fulfillment_warehouse_id_fkey FOREIGN KEY (fulfillment_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: sales_order_items sales_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: sales_order_items sales_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sales_order_items sales_order_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_billing_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_billing_address_id_fkey FOREIGN KEY (billing_address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL;


--
-- Name: sales_orders sales_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_customer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_customer_profile_id_fkey FOREIGN KEY (customer_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_fulfillment_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_fulfillment_warehouse_id_fkey FOREIGN KEY (fulfillment_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_shipping_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_shipping_address_id_fkey FOREIGN KEY (shipping_address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL;


--
-- Name: sales_orders sales_orders_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: serial_generation_batches serial_generation_batches_expected_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_generation_batches
    ADD CONSTRAINT serial_generation_batches_expected_warehouse_id_fkey FOREIGN KEY (expected_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: serial_generation_batches serial_generation_batches_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_generation_batches
    ADD CONSTRAINT serial_generation_batches_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: serial_generation_batches serial_generation_batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_generation_batches
    ADD CONSTRAINT serial_generation_batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: serial_generation_batches serial_generation_batches_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_generation_batches
    ADD CONSTRAINT serial_generation_batches_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: serial_label_sizes serial_label_sizes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_label_sizes
    ADD CONSTRAINT serial_label_sizes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: serial_number_history serial_number_history_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_number_history
    ADD CONSTRAINT serial_number_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: serial_number_history serial_number_history_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_number_history
    ADD CONSTRAINT serial_number_history_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.inventory_movements(id) ON DELETE SET NULL;


--
-- Name: serial_number_history serial_number_history_new_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_number_history
    ADD CONSTRAINT serial_number_history_new_warehouse_id_fkey FOREIGN KEY (new_warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;


--
-- Name: serial_number_history serial_number_history_previous_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_number_history
    ADD CONSTRAINT serial_number_history_previous_warehouse_id_fkey FOREIGN KEY (previous_warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;


--
-- Name: serial_number_history serial_number_history_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_number_history
    ADD CONSTRAINT serial_number_history_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: serial_numbers serial_numbers_active_rma_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_active_rma_claim_id_fkey FOREIGN KEY (active_rma_claim_id) REFERENCES public.rma_claims(id) ON DELETE SET NULL;


--
-- Name: serial_numbers serial_numbers_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: serial_numbers serial_numbers_generation_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_generation_batch_id_fkey FOREIGN KEY (generation_batch_id) REFERENCES public.serial_generation_batches(id) ON DELETE RESTRICT;


--
-- Name: serial_numbers serial_numbers_last_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_last_movement_id_fkey FOREIGN KEY (last_movement_id) REFERENCES public.inventory_movements(id) ON DELETE SET NULL;


--
-- Name: serial_numbers serial_numbers_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT;


--
-- Name: serial_numbers serial_numbers_location_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_location_warehouse_fk FOREIGN KEY (location_id, warehouse_id) REFERENCES public.warehouse_locations(id, warehouse_id) ON DELETE RESTRICT;


--
-- Name: serial_numbers serial_numbers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: serial_numbers serial_numbers_purchase_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_purchase_order_item_id_fkey FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(id) ON DELETE SET NULL;


--
-- Name: serial_numbers serial_numbers_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: serial_numbers serial_numbers_replacement_for_serial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_replacement_for_serial_id_fkey FOREIGN KEY (replacement_for_serial_id) REFERENCES public.serial_numbers(id) ON DELETE SET NULL;


--
-- Name: serial_numbers serial_numbers_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: serial_numbers serial_numbers_variation_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_variation_product_fk FOREIGN KEY (variation_id, product_id) REFERENCES public.product_variations(id, product_id) ON DELETE RESTRICT;


--
-- Name: serial_numbers serial_numbers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_numbers
    ADD CONSTRAINT serial_numbers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: serial_tracking_events serial_tracking_events_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_tracking_events
    ADD CONSTRAINT serial_tracking_events_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: serial_tracking_events serial_tracking_events_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_tracking_events
    ADD CONSTRAINT serial_tracking_events_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.inventory_movements(id) ON DELETE SET NULL;


--
-- Name: serial_tracking_events serial_tracking_events_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_tracking_events
    ADD CONSTRAINT serial_tracking_events_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: serial_tracking_events serial_tracking_events_tracking_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_tracking_events
    ADD CONSTRAINT serial_tracking_events_tracking_status_id_fkey FOREIGN KEY (tracking_status_id) REFERENCES public.tracking_status_definitions(id) ON DELETE RESTRICT;


--
-- Name: serial_tracking_events serial_tracking_events_workplace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serial_tracking_events
    ADD CONSTRAINT serial_tracking_events_workplace_id_fkey FOREIGN KEY (workplace_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;


--
-- Name: shipment_documents shipment_documents_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_documents
    ADD CONSTRAINT shipment_documents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: shipment_documents shipment_documents_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_documents
    ADD CONSTRAINT shipment_documents_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: shipment_documents shipment_documents_product_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_documents
    ADD CONSTRAINT shipment_documents_product_media_id_fkey FOREIGN KEY (product_media_id) REFERENCES public.product_media(id) ON DELETE RESTRICT;


--
-- Name: shipment_documents shipment_documents_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_documents
    ADD CONSTRAINT shipment_documents_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: shipment_documents shipment_documents_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_documents
    ADD CONSTRAINT shipment_documents_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE RESTRICT;


--
-- Name: shipment_documents shipment_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_documents
    ADD CONSTRAINT shipment_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: shipment_items shipment_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_items
    ADD CONSTRAINT shipment_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: shipment_items shipment_items_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_items
    ADD CONSTRAINT shipment_items_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE RESTRICT;


--
-- Name: shipment_packages shipment_packages_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_packages
    ADD CONSTRAINT shipment_packages_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.order_packages(id) ON DELETE RESTRICT;


--
-- Name: shipment_packages shipment_packages_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_packages
    ADD CONSTRAINT shipment_packages_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE RESTRICT;


--
-- Name: shipment_route_points shipment_route_points_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_route_points
    ADD CONSTRAINT shipment_route_points_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: shipment_route_points shipment_route_points_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_route_points
    ADD CONSTRAINT shipment_route_points_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE CASCADE;


--
-- Name: shipment_serials shipment_serials_allocation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_serials
    ADD CONSTRAINT shipment_serials_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES public.order_serial_allocations(id) ON DELETE RESTRICT;


--
-- Name: shipment_serials shipment_serials_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_serials
    ADD CONSTRAINT shipment_serials_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: shipment_serials shipment_serials_shipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_serials
    ADD CONSTRAINT shipment_serials_shipment_item_id_fkey FOREIGN KEY (shipment_item_id) REFERENCES public.shipment_items(id) ON DELETE RESTRICT;


--
-- Name: shipment_tracking_events shipment_tracking_events_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: shipment_tracking_events shipment_tracking_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: shipment_tracking_events shipment_tracking_events_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE RESTRICT;


--
-- Name: shipment_tracking_events shipment_tracking_events_supersedes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_supersedes_event_id_fkey FOREIGN KEY (supersedes_event_id) REFERENCES public.shipment_tracking_events(id) ON DELETE SET NULL;


--
-- Name: shipment_tracking_events shipment_tracking_events_tracking_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_tracking_status_id_fkey FOREIGN KEY (tracking_status_id) REFERENCES public.tracking_status_definitions(id) ON DELETE RESTRICT;


--
-- Name: shipment_tracking_events shipment_tracking_events_workplace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_workplace_id_fkey FOREIGN KEY (workplace_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;


--
-- Name: shipments shipments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: shipments shipments_destination_work_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_destination_work_location_id_fkey FOREIGN KEY (destination_work_location_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;


--
-- Name: shipments shipments_latest_tracking_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_latest_tracking_status_id_fkey FOREIGN KEY (latest_tracking_status_id) REFERENCES public.tracking_status_definitions(id) ON DELETE SET NULL;


--
-- Name: shipments shipments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: shipments shipments_origin_work_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_origin_work_location_id_fkey FOREIGN KEY (origin_work_location_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;


--
-- Name: shipments shipments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: shopping_cart_items shopping_cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart_items
    ADD CONSTRAINT shopping_cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.shopping_carts(id) ON DELETE CASCADE;


--
-- Name: shopping_cart_items shopping_cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart_items
    ADD CONSTRAINT shopping_cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: shopping_cart_items shopping_cart_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart_items
    ADD CONSTRAINT shopping_cart_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: shopping_carts shopping_carts_converted_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_carts
    ADD CONSTRAINT shopping_carts_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;


--
-- Name: shopping_carts shopping_carts_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_carts
    ADD CONSTRAINT shopping_carts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: supplier_categories supplier_categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_categories supplier_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.supplier_categories(id) ON DELETE RESTRICT;


--
-- Name: supplier_categories supplier_categories_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: suppliers suppliers_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: suppliers suppliers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: suppliers suppliers_supplier_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_supplier_category_id_fkey FOREIGN KEY (supplier_category_id) REFERENCES public.supplier_categories(id) ON DELETE RESTRICT;


--
-- Name: suppliers suppliers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: support_attachments support_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.support_messages(id) ON DELETE CASCADE;


--
-- Name: support_conversations support_conversations_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: support_conversations support_conversations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: support_conversations support_conversations_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: support_messages support_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id) ON DELETE RESTRICT;


--
-- Name: support_messages support_messages_sender_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_sender_profile_id_fkey FOREIGN KEY (sender_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tracking_status_definitions tracking_status_definitions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_status_definitions
    ADD CONSTRAINT tracking_status_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: variation_attribute_values variation_attribute_values_attribute_value_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_attribute_values
    ADD CONSTRAINT variation_attribute_values_attribute_value_id_fkey FOREIGN KEY (attribute_value_id) REFERENCES public.attribute_values(id) ON DELETE RESTRICT;


--
-- Name: variation_attribute_values variation_attribute_values_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_attribute_values
    ADD CONSTRAINT variation_attribute_values_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: warehouse_locations warehouse_locations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: warranty_coverages warranty_coverages_customer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_customer_profile_id_fkey FOREIGN KEY (customer_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: warranty_coverages warranty_coverages_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: warranty_coverages warranty_coverages_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: warranty_coverages warranty_coverages_sales_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_sales_order_item_id_fkey FOREIGN KEY (sales_order_item_id) REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;


--
-- Name: warranty_coverages warranty_coverages_serial_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_serial_number_id_fkey FOREIGN KEY (serial_number_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;


--
-- Name: warranty_coverages warranty_coverages_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_coverages
    ADD CONSTRAINT warranty_coverages_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;


--
-- Name: work_locations work_locations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_locations
    ADD CONSTRAINT work_locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_categories Authorized staff can create supplier categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized staff can create supplier categories" ON public.supplier_categories FOR INSERT TO authenticated WITH CHECK (public.current_user_has_permission('suppliers.create'::text));


--
-- Name: supplier_categories Authorized staff can delete supplier categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized staff can delete supplier categories" ON public.supplier_categories FOR DELETE TO authenticated USING (public.current_user_has_permission('suppliers.edit'::text));


--
-- Name: supplier_categories Authorized staff can edit supplier categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized staff can edit supplier categories" ON public.supplier_categories FOR UPDATE TO authenticated USING (public.current_user_has_permission('suppliers.edit'::text)) WITH CHECK (public.current_user_has_permission('suppliers.edit'::text));


--
-- Name: supplier_categories Authorized staff can view supplier categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized staff can view supplier categories" ON public.supplier_categories FOR SELECT TO authenticated USING ((public.current_user_has_permission('suppliers.view'::text) OR public.current_user_has_permission('purchasing.view'::text)));


--
-- Name: accounting_accounts accounting staff read accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "accounting staff read accounts" ON public.accounting_accounts FOR SELECT TO authenticated USING (public.current_user_has_permission('accounting.view'::text));


--
-- Name: journal_entries accounting staff read journals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "accounting staff read journals" ON public.journal_entries FOR SELECT TO authenticated USING (public.current_user_has_permission('accounting.view'::text));


--
-- Name: journal_lines accounting staff read lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "accounting staff read lines" ON public.journal_lines FOR SELECT TO authenticated USING (public.current_user_has_permission('accounting.view'::text));


--
-- Name: accounting_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_permission_overrides admin or owner read permission overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin or owner read permission overrides" ON public.profile_permission_overrides FOR SELECT TO authenticated USING ((public.is_current_user_admin() OR (profile_id = auth.uid())));


--
-- Name: profile_permission_templates admin or owner read template assignment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin or owner read template assignment" ON public.profile_permission_templates FOR SELECT TO authenticated USING ((public.is_current_user_admin() OR (profile_id = auth.uid())));


--
-- Name: app_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: archive_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.archive_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: attribute_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attribute_values ENABLE ROW LEVEL SECURITY;

--
-- Name: attributes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit admin read" ON public.audit_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::public.account_role)))));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_gateways authenticated read enabled gateways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated read enabled gateways" ON public.payment_gateways FOR SELECT TO authenticated USING (enabled);


--
-- Name: business_categories authorized staff create business categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff create business categories" ON public.business_categories FOR INSERT TO authenticated WITH CHECK ((public.current_user_has_permission('products.create'::text) OR public.current_user_has_permission('products.edit'::text)));


--
-- Name: business_categories authorized staff delete business categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff delete business categories" ON public.business_categories FOR DELETE TO authenticated USING (public.current_user_has_permission('products.edit'::text));


--
-- Name: business_categories authorized staff edit business categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff edit business categories" ON public.business_categories FOR UPDATE TO authenticated USING (public.current_user_has_permission('products.edit'::text)) WITH CHECK (public.current_user_has_permission('products.edit'::text));


--
-- Name: business_category_fields authorized staff manage business category fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff manage business category fields" ON public.business_category_fields TO authenticated USING (public.current_user_has_permission('products.edit'::text)) WITH CHECK (public.current_user_has_permission('products.edit'::text));


--
-- Name: crm_activities authorized staff read CRM activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read CRM activities" ON public.crm_activities FOR SELECT TO authenticated USING (public.current_user_has_permission('crm.view'::text));


--
-- Name: crm_companies authorized staff read CRM companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read CRM companies" ON public.crm_companies FOR SELECT TO authenticated USING (public.current_user_has_permission('crm.view'::text));


--
-- Name: crm_contacts authorized staff read CRM contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read CRM contacts" ON public.crm_contacts FOR SELECT TO authenticated USING (public.current_user_has_permission('crm.view'::text));


--
-- Name: crm_leads authorized staff read CRM leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read CRM leads" ON public.crm_leads FOR SELECT TO authenticated USING (public.current_user_has_permission('crm.view'::text));


--
-- Name: stock_adjustment_reasons authorized staff read adjustment reasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read adjustment reasons" ON public.stock_adjustment_reasons FOR SELECT TO authenticated USING (public.current_user_has_permission('inventory.view'::text));


--
-- Name: attribute_values authorized staff read attribute values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read attribute values" ON public.attribute_values FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: attributes authorized staff read attributes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read attributes" ON public.attributes FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: inventory_balances authorized staff read balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read balances" ON public.inventory_balances FOR SELECT TO authenticated USING (public.current_user_has_permission('inventory.view'::text));


--
-- Name: brands authorized staff read brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read brands" ON public.brands FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: business_categories authorized staff read business categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read business categories" ON public.business_categories FOR SELECT TO authenticated USING ((public.current_user_has_permission('products.view'::text) OR public.current_user_has_permission('products.edit'::text)));


--
-- Name: business_category_fields authorized staff read business category fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read business category fields" ON public.business_category_fields FOR SELECT TO authenticated USING ((public.current_user_has_permission('products.view'::text) OR public.current_user_has_permission('products.edit'::text)));


--
-- Name: purchase_carriers authorized staff read carriers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read carriers" ON public.purchase_carriers FOR SELECT TO authenticated USING ((public.current_user_has_permission('purchasing.view'::text) OR public.current_user_has_permission('shipments.view'::text)));


--
-- Name: product_category_assignments authorized staff read category assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read category assignments" ON public.product_category_assignments FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: crm_chatbot_inquiries authorized staff read chatbot inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read chatbot inquiries" ON public.crm_chatbot_inquiries FOR SELECT TO authenticated USING (public.current_user_has_permission('crm.view'::text));


--
-- Name: product_identifier_history authorized staff read identifier history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read identifier history" ON public.product_identifier_history FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: inventory_movement_items authorized staff read movement items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read movement items" ON public.inventory_movement_items FOR SELECT TO authenticated USING (public.current_user_has_permission('inventory.view'::text));


--
-- Name: inventory_movements authorized staff read movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read movements" ON public.inventory_movements FOR SELECT TO authenticated USING (public.current_user_has_permission('inventory.view'::text));


--
-- Name: product_attributes authorized staff read product attributes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read product attributes" ON public.product_attributes FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: product_categories authorized staff read product categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read product categories" ON public.product_categories FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: product_media authorized staff read product media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read product media" ON public.product_media FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: product_revisions authorized staff read product revisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read product revisions" ON public.product_revisions FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: products authorized staff read products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read products" ON public.products FOR SELECT TO authenticated USING ((public.current_user_has_permission('products.view'::text) OR public.current_user_has_permission('inventory.view'::text)));


--
-- Name: purchase_order_status_events authorized staff read purchase order events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read purchase order events" ON public.purchase_order_status_events FOR SELECT TO authenticated USING (public.current_user_has_permission('purchasing.view'::text));


--
-- Name: purchase_order_items authorized staff read purchase order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read purchase order items" ON public.purchase_order_items FOR SELECT TO authenticated USING (public.current_user_has_permission('purchasing.view'::text));


--
-- Name: purchase_orders authorized staff read purchase orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read purchase orders" ON public.purchase_orders FOR SELECT TO authenticated USING (public.current_user_has_permission('purchasing.view'::text));


--
-- Name: purchase_receipt_items authorized staff read purchase receipt items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read purchase receipt items" ON public.purchase_receipt_items FOR SELECT TO authenticated USING ((public.current_user_has_permission('purchasing.view'::text) OR public.current_user_has_permission('inventory.view'::text)));


--
-- Name: purchase_receipts authorized staff read purchase receipts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read purchase receipts" ON public.purchase_receipts FOR SELECT TO authenticated USING ((public.current_user_has_permission('purchasing.view'::text) OR public.current_user_has_permission('inventory.view'::text)));


--
-- Name: inventory_reservations authorized staff read reservations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read reservations" ON public.inventory_reservations FOR SELECT TO authenticated USING (public.current_user_has_permission('inventory.view'::text));


--
-- Name: serial_generation_batches authorized staff read serial batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read serial batches" ON public.serial_generation_batches FOR SELECT TO authenticated USING (public.current_user_has_permission('serials.view'::text));


--
-- Name: serial_number_history authorized staff read serial history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read serial history" ON public.serial_number_history FOR SELECT TO authenticated USING (public.current_user_has_permission('serials.trace'::text));


--
-- Name: serial_label_sizes authorized staff read serial label sizes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read serial label sizes" ON public.serial_label_sizes FOR SELECT TO authenticated USING (public.current_user_has_permission('serials.print'::text));


--
-- Name: serial_tracking_events authorized staff read serial tracking events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read serial tracking events" ON public.serial_tracking_events FOR SELECT TO authenticated USING (public.current_user_has_permission('serials.trace'::text));


--
-- Name: serial_numbers authorized staff read serials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read serials" ON public.serial_numbers FOR SELECT TO authenticated USING ((public.current_user_has_permission('serials.view'::text) OR public.current_user_has_permission('inventory.view'::text)));


--
-- Name: purchase_inbound_shipments authorized staff read supplier inbound shipments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read supplier inbound shipments" ON public.purchase_inbound_shipments FOR SELECT TO authenticated USING ((public.current_user_has_permission('purchasing.view'::text) OR public.current_user_has_permission('shipments.view'::text)));


--
-- Name: suppliers authorized staff read suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read suppliers" ON public.suppliers FOR SELECT TO authenticated USING ((public.current_user_has_permission('suppliers.view'::text) OR public.current_user_has_permission('purchasing.view'::text)));


--
-- Name: product_tag_assignments authorized staff read tag assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read tag assignments" ON public.product_tag_assignments FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: product_tags authorized staff read tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read tags" ON public.product_tags FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: tracking_status_definitions authorized staff read tracking definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read tracking definitions" ON public.tracking_status_definitions FOR SELECT TO authenticated USING ((public.current_user_has_permission('tracking_statuses.view'::text) OR public.current_user_has_permission('serials.trace'::text)));


--
-- Name: variation_attribute_values authorized staff read variation values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read variation values" ON public.variation_attribute_values FOR SELECT TO authenticated USING (public.current_user_has_permission('products.view'::text));


--
-- Name: product_variations authorized staff read variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read variations" ON public.product_variations FOR SELECT TO authenticated USING ((public.current_user_has_permission('products.view'::text) OR public.current_user_has_permission('inventory.view'::text)));


--
-- Name: warehouse_locations authorized staff read warehouse locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read warehouse locations" ON public.warehouse_locations FOR SELECT TO authenticated USING ((public.current_user_has_permission('warehouses.view'::text) OR public.current_user_has_permission('inventory.view'::text)));


--
-- Name: warehouses authorized staff read warehouses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read warehouses" ON public.warehouses FOR SELECT TO authenticated USING ((public.current_user_has_permission('warehouses.view'::text) OR public.current_user_has_permission('inventory.view'::text)));


--
-- Name: work_locations authorized staff read work locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authorized staff read work locations" ON public.work_locations FOR SELECT TO authenticated USING ((public.current_user_has_permission('locations.view'::text) OR public.current_user_has_permission('locations.manage'::text)));


--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: business_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: business_category_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_category_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: cashbook_days cashbook days read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cashbook days read" ON public.cashbook_days FOR SELECT TO authenticated USING ((public.current_user_has_permission('accounting.view'::text) OR public.current_user_has_permission('accounting.manage_cashbook'::text)));


--
-- Name: cashbook_descriptions cashbook descriptions read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cashbook descriptions read" ON public.cashbook_descriptions FOR SELECT TO authenticated USING ((public.current_user_has_permission('accounting.view'::text) OR public.current_user_has_permission('accounting.manage_cashbook'::text)));


--
-- Name: cashbook_entries cashbook entries read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cashbook entries read" ON public.cashbook_entries FOR SELECT TO authenticated USING ((public.current_user_has_permission('accounting.view'::text) OR public.current_user_has_permission('accounting.manage_cashbook'::text)));


--
-- Name: cashbook_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashbook_days ENABLE ROW LEVEL SECURITY;

--
-- Name: cashbook_descriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashbook_descriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: cashbook_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_chatbot_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_chatbot_inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addresses customers manage own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers manage own addresses" ON public.customer_addresses TO authenticated USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));


--
-- Name: serial_numbers customers read assigned serials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read assigned serials" ON public.serial_numbers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.order_serial_allocations a
     JOIN public.sales_orders o ON ((o.id = a.order_id)))
  WHERE ((a.serial_number_id = serial_numbers.id) AND (a.status = ANY (ARRAY['packed'::text, 'shipped'::text, 'delivered'::text])) AND (o.customer_profile_id = auth.uid())))));


--
-- Name: shipment_documents customers read authorized documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read authorized documents" ON public.shipment_documents FOR SELECT TO authenticated USING (((visibility = 'customer_order_restricted'::text) AND (document_type = ANY (ARRAY['warranty_document'::text, 'purchase_invoice'::text])) AND (EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = shipment_documents.order_id) AND (o.customer_profile_id = auth.uid()))))));


--
-- Name: support_attachments customers read own attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own attachments" ON public.support_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.support_messages m
     JOIN public.support_conversations c ON ((c.id = m.conversation_id)))
  WHERE ((m.id = support_attachments.message_id) AND (c.profile_id = auth.uid())))));


--
-- Name: shopping_cart_items customers read own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own cart items" ON public.shopping_cart_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.shopping_carts c
  WHERE ((c.id = shopping_cart_items.cart_id) AND (c.profile_id = auth.uid())))));


--
-- Name: shopping_carts customers read own carts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own carts" ON public.shopping_carts FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: support_conversations customers read own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own conversations" ON public.support_conversations FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: support_messages customers read own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own messages" ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_conversations c
  WHERE ((c.id = support_messages.conversation_id) AND (c.profile_id = auth.uid())))));


--
-- Name: customer_notifications customers read own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own notifications" ON public.customer_notifications FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: sales_order_items customers read own order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own order items" ON public.sales_order_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = sales_order_items.order_id) AND (o.customer_profile_id = auth.uid())))));


--
-- Name: sales_orders customers read own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own orders" ON public.sales_orders FOR SELECT TO authenticated USING ((customer_profile_id = auth.uid()));


--
-- Name: payment_transactions customers read own payment transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own payment transactions" ON public.payment_transactions FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: quotation_request_items customers read own quotation items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own quotation items" ON public.quotation_request_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.quotation_requests q
  WHERE ((q.id = quotation_request_items.quotation_id) AND (q.profile_id = auth.uid())))));


--
-- Name: quotation_requests customers read own quotations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own quotations" ON public.quotation_requests FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: sale_documents customers read own sale documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own sale documents" ON public.sale_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = sale_documents.order_id) AND (o.customer_profile_id = auth.uid())))));


--
-- Name: sale_payments customers read own sale payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own sale payments" ON public.sale_payments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = sale_payments.order_id) AND (o.customer_profile_id = auth.uid())))));


--
-- Name: shipment_items customers read own shipment items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own shipment items" ON public.shipment_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.shipments s
     JOIN public.sales_orders o ON ((o.id = s.order_id)))
  WHERE ((s.id = shipment_items.shipment_id) AND s.customer_visible AND (o.customer_profile_id = auth.uid())))));


--
-- Name: shipment_packages customers read own shipment packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own shipment packages" ON public.shipment_packages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.shipments shipment
     JOIN public.sales_orders customer_order ON ((customer_order.id = shipment.order_id)))
  WHERE ((shipment.id = shipment_packages.shipment_id) AND shipment.customer_visible AND (customer_order.customer_profile_id = auth.uid())))));


--
-- Name: shipment_serials customers read own shipment serials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own shipment serials" ON public.shipment_serials FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.shipment_items si
     JOIN public.shipments s ON ((s.id = si.shipment_id)))
     JOIN public.sales_orders o ON ((o.id = s.order_id)))
  WHERE ((si.id = shipment_serials.shipment_item_id) AND s.customer_visible AND (o.customer_profile_id = auth.uid())))));


--
-- Name: delivery_location_updates customers read own visible location updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own visible location updates" ON public.delivery_location_updates FOR SELECT TO authenticated USING ((customer_visible AND (EXISTS ( SELECT 1
   FROM (public.shipments s
     JOIN public.sales_orders o ON ((o.id = s.order_id)))
  WHERE ((s.id = delivery_location_updates.shipment_id) AND (o.customer_profile_id = auth.uid()))))));


--
-- Name: shipments customers read own visible shipments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read own visible shipments" ON public.shipments FOR SELECT TO authenticated USING ((customer_visible AND (EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = shipments.order_id) AND (o.customer_profile_id = auth.uid()))))));


--
-- Name: order_serial_allocations customers read visible allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read visible allocations" ON public.order_serial_allocations FOR SELECT TO authenticated USING (((status = ANY (ARRAY['packed'::text, 'shipped'::text, 'delivered'::text])) AND (EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = order_serial_allocations.order_id) AND (o.customer_profile_id = auth.uid()))))));


--
-- Name: shipment_route_points customers read visible route points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read visible route points" ON public.shipment_route_points FOR SELECT TO authenticated USING ((customer_visible AND (EXISTS ( SELECT 1
   FROM (public.shipments s
     JOIN public.sales_orders o ON ((o.id = s.order_id)))
  WHERE ((s.id = shipment_route_points.shipment_id) AND s.customer_visible AND (o.customer_profile_id = auth.uid()))))));


--
-- Name: shipment_tracking_events customers read visible tracking events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customers read visible tracking events" ON public.shipment_tracking_events FOR SELECT TO authenticated USING (((event_visibility = ANY (ARRAY['customer'::text, 'both'::text])) AND (EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = shipment_tracking_events.order_id) AND (o.customer_profile_id = auth.uid()))))));


--
-- Name: delivery_location_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_location_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_location_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_location_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs employee read own audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employee read own audit" ON public.audit_logs FOR SELECT TO authenticated USING (((actor_id = auth.uid()) AND public.current_user_has_permission('activity.view_own'::text)));


--
-- Name: profile_work_locations employee read own workplace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employee read own workplace" ON public.profile_work_locations FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR public.current_user_has_permission('locations.manage'::text)));


--
-- Name: profile_warehouse_assignments employee reads own warehouse assignment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employee reads own warehouse assignment" ON public.profile_warehouse_assignments FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR public.current_user_has_permission('locations.manage'::text)));


--
-- Name: hr_attendance hr admin manages attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages attendance" ON public.hr_attendance TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_attendance_correction_requests hr admin manages corrections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages corrections" ON public.hr_attendance_correction_requests TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_designations hr admin manages designations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages designations" ON public.hr_designations TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_device_employee_mappings hr admin manages device mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages device mappings" ON public.hr_device_employee_mappings TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_attendance_devices hr admin manages devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages devices" ON public.hr_attendance_devices TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_employee_documents hr admin manages documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages documents" ON public.hr_employee_documents TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_employee_profiles hr admin manages employee profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages employee profiles" ON public.hr_employee_profiles TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_employee_work_schedules hr admin manages employee work schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages employee work schedules" ON public.hr_employee_work_schedules TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_leave_balances hr admin manages leave balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages leave balances" ON public.hr_leave_balances TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_leave_types hr admin manages leave types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages leave types" ON public.hr_leave_types TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_payroll_records hr admin manages payroll; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages payroll" ON public.hr_payroll_records TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_payroll_components hr admin manages payroll components; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages payroll components" ON public.hr_payroll_components TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_performance_goals hr admin manages performance goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages performance goals" ON public.hr_performance_goals TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_performance_reviews hr admin manages performance reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages performance reviews" ON public.hr_performance_reviews TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_settings hr admin manages settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages settings" ON public.hr_settings TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_teams hr admin manages teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin manages teams" ON public.hr_teams TO authenticated USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());


--
-- Name: hr_attendance hr admin or owner reads attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin or owner reads attendance" ON public.hr_attendance FOR SELECT TO authenticated USING ((public.is_hr_admin() OR (EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_attendance.employee_record_id) AND (e.profile_id = auth.uid()))))));


--
-- Name: hr_employee_records hr admin or owner reads employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin or owner reads employees" ON public.hr_employee_records FOR SELECT TO authenticated USING ((public.is_hr_admin() OR (profile_id = auth.uid())));


--
-- Name: hr_leave_requests hr admin or owner reads leave; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin or owner reads leave" ON public.hr_leave_requests FOR SELECT TO authenticated USING ((public.is_hr_admin() OR (EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_leave_requests.employee_record_id) AND (e.profile_id = auth.uid()))))));


--
-- Name: hr_attendance_events hr admin reads attendance events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin reads attendance events" ON public.hr_attendance_events FOR SELECT TO authenticated USING (public.is_hr_admin());


--
-- Name: hr_departments hr admin reads departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr admin reads departments" ON public.hr_departments FOR SELECT TO authenticated USING (public.is_hr_admin());


--
-- Name: hr_attendance_correction_requests hr employee manages own corrections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee manages own corrections" ON public.hr_attendance_correction_requests TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_attendance_correction_requests.employee_record_id) AND (e.profile_id = auth.uid()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_attendance_correction_requests.employee_record_id) AND (e.profile_id = auth.uid())))) AND (status = 'pending'::text)));


--
-- Name: hr_leave_types hr employee reads leave types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads leave types" ON public.hr_leave_types FOR SELECT TO authenticated USING (is_active);


--
-- Name: hr_attendance_events hr employee reads own attendance events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads own attendance events" ON public.hr_attendance_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_attendance_events.employee_record_id) AND (e.profile_id = auth.uid())))));


--
-- Name: hr_leave_balances hr employee reads own balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads own balances" ON public.hr_leave_balances FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_leave_balances.employee_record_id) AND (e.profile_id = auth.uid())))));


--
-- Name: hr_employee_documents hr employee reads own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads own documents" ON public.hr_employee_documents FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_employee_documents.employee_record_id) AND (e.profile_id = auth.uid())))) AND (archived_at IS NULL)));


--
-- Name: hr_performance_goals hr employee reads own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads own goals" ON public.hr_performance_goals FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_performance_goals.employee_record_id) AND (e.profile_id = auth.uid())))));


--
-- Name: hr_employee_profiles hr employee reads own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads own profile" ON public.hr_employee_profiles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_employee_records e
  WHERE ((e.id = hr_employee_profiles.employee_record_id) AND (e.profile_id = auth.uid())))));


--
-- Name: hr_employee_work_schedules hr employee reads own work schedule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads own work schedule" ON public.hr_employee_work_schedules FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_employee_records employee
  WHERE ((employee.id = hr_employee_work_schedules.employee_record_id) AND (employee.profile_id = auth.uid())))));


--
-- Name: hr_settings hr employee reads settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hr employee reads settings" ON public.hr_settings FOR SELECT TO authenticated USING (true);


--
-- Name: hr_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_attendance_correction_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_attendance_correction_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_attendance_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_attendance_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_attendance_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_attendance_events ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_designations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_designations ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_device_employee_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_device_employee_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_employee_document_deletion_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_employee_document_deletion_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_employee_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_employee_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_employee_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_employee_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_employee_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_employee_records ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_employee_work_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_employee_work_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_leave_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_leave_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_leave_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_payroll_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_payroll_components ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_payroll_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_payroll_records ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_performance_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_performance_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_performance_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_performance_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movement_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movement_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: order_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: order_packed_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_packed_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_serial_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_serial_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_gateways; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_template_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permission_template_items ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permission_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: product_attributes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;

--
-- Name: product_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: product_category_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_category_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: product_identifier_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_identifier_history ENABLE ROW LEVEL SECURITY;

--
-- Name: product_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

--
-- Name: product_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: product_tag_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_tag_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: product_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_permission_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_permission_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_permission_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_permission_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_warehouse_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_warehouse_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_work_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_work_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles read own" ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = id) OR public.is_current_user_admin()));


--
-- Name: profiles profiles update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (((auth.uid() = id) OR public.is_current_user_admin())) WITH CHECK (((auth.uid() = id) OR public.is_current_user_admin()));


--
-- Name: business_categories public read active business categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read active business categories" ON public.business_categories FOR SELECT TO anon USING ((is_active AND (archived_at IS NULL)));


--
-- Name: business_category_fields public read active business category fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read active business category fields" ON public.business_category_fields FOR SELECT TO anon USING ((is_active AND (EXISTS ( SELECT 1
   FROM public.business_categories category
  WHERE ((category.id = business_category_fields.business_category_id) AND category.is_active AND (category.archived_at IS NULL))))));


--
-- Name: purchase_carriers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_carriers ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_inbound_shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_inbound_shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_status_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_status_events ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_receipt_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: quotation_request_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotation_request_items ENABLE ROW LEVEL SECURITY;

--
-- Name: quotation_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: rma_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rma_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: rma_attachments rma_attachments_customer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rma_attachments_customer_read ON public.rma_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.rma_claims c
  WHERE ((c.id = rma_attachments.rma_claim_id) AND ((c.customer_profile_id = auth.uid()) OR public.current_user_has_permission('rma.view'::text))))));


--
-- Name: rma_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rma_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: rma_claims rma_claims_customer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rma_claims_customer_read ON public.rma_claims FOR SELECT TO authenticated USING (((customer_profile_id = auth.uid()) OR public.current_user_has_permission('rma.view'::text)));


--
-- Name: rma_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rma_events ENABLE ROW LEVEL SECURITY;

--
-- Name: rma_events rma_events_customer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rma_events_customer_read ON public.rma_events FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.rma_claims c
  WHERE ((c.id = rma_events.rma_claim_id) AND ((c.customer_profile_id = auth.uid()) OR public.current_user_has_permission('rma.view'::text))))) AND (customer_visible OR public.current_user_has_permission('rma.view'::text))));


--
-- Name: sale_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_price_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_price_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: serial_generation_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.serial_generation_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: serial_label_sizes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.serial_label_sizes ENABLE ROW LEVEL SECURITY;

--
-- Name: serial_number_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.serial_number_history ENABLE ROW LEVEL SECURITY;

--
-- Name: serial_numbers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;

--
-- Name: serial_tracking_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.serial_tracking_events ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_route_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_route_points ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_serials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_serials ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_tracking_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_tracking_events ENABLE ROW LEVEL SECURITY;

--
-- Name: shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: shopping_cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shopping_cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: shopping_carts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shopping_carts ENABLE ROW LEVEL SECURITY;

--
-- Name: order_serial_allocations staff read allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read allocations" ON public.order_serial_allocations FOR SELECT TO authenticated USING ((public.current_user_has_permission('orders.allocate'::text) OR public.current_user_has_permission('serials.view'::text)));


--
-- Name: customer_addresses staff read customer addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read customer addresses" ON public.customer_addresses FOR SELECT TO authenticated USING ((public.current_user_has_permission('orders.view'::text) OR public.current_user_has_permission('orders.create'::text)));


--
-- Name: delivery_location_sessions staff read delivery sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read delivery sessions" ON public.delivery_location_sessions FOR SELECT TO authenticated USING ((public.current_user_has_permission('shipments.view'::text) OR (actor_profile_id = auth.uid())));


--
-- Name: delivery_location_updates staff read location updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read location updates" ON public.delivery_location_updates FOR SELECT TO authenticated USING ((public.current_user_has_permission('shipments.view'::text) OR (actor_profile_id = auth.uid())));


--
-- Name: app_modules staff read modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read modules" ON public.app_modules FOR SELECT TO authenticated USING ((public.is_current_user_admin() OR public.current_user_has_permission('dashboard.view'::text)));


--
-- Name: order_status_events staff read order events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read order events" ON public.order_status_events FOR SELECT TO authenticated USING (public.current_user_has_permission('orders.view'::text));


--
-- Name: sales_order_items staff read order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read order items" ON public.sales_order_items FOR SELECT TO authenticated USING ((public.current_user_has_permission('orders.view'::text) OR public.current_user_has_permission('sales.view'::text)));


--
-- Name: sales_orders staff read orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read orders" ON public.sales_orders FOR SELECT TO authenticated USING ((public.current_user_has_permission('orders.view'::text) OR public.current_user_has_permission('sales.view'::text)));


--
-- Name: order_packages staff read packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read packages" ON public.order_packages FOR SELECT TO authenticated USING ((public.current_user_has_permission('orders.pack'::text) OR public.current_user_has_permission('shipments.view'::text)));


--
-- Name: order_packed_items staff read packed items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read packed items" ON public.order_packed_items FOR SELECT TO authenticated USING ((public.current_user_has_permission('orders.pack'::text) OR public.current_user_has_permission('shipments.view'::text)));


--
-- Name: permissions staff read permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read permissions" ON public.permissions FOR SELECT TO authenticated USING ((public.is_current_user_admin() OR public.current_user_has_permission('dashboard.view'::text)));


--
-- Name: shipment_route_points staff read route points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read route points" ON public.shipment_route_points FOR SELECT TO authenticated USING (public.current_user_has_permission('shipments.view'::text));


--
-- Name: sale_documents staff read sale documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read sale documents" ON public.sale_documents FOR SELECT TO authenticated USING ((public.current_user_has_permission('sales.view'::text) OR public.current_user_has_permission('sales.view_all'::text) OR (EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = sale_documents.order_id) AND (o.created_by = auth.uid()) AND public.current_user_has_permission('sales.view_own'::text))))));


--
-- Name: sale_payments staff read sale payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read sale payments" ON public.sale_payments FOR SELECT TO authenticated USING ((public.current_user_has_permission('sales.view'::text) OR public.current_user_has_permission('sales.view_all'::text) OR (EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = sale_payments.order_id) AND (o.created_by = auth.uid()) AND public.current_user_has_permission('sales.view_own'::text))))));


--
-- Name: sale_price_adjustments staff read sale price adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read sale price adjustments" ON public.sale_price_adjustments FOR SELECT TO authenticated USING ((public.current_user_has_permission('sales.view'::text) OR public.current_user_has_permission('sales.view_all'::text) OR (EXISTS ( SELECT 1
   FROM public.sales_orders o
  WHERE ((o.id = sale_price_adjustments.order_id) AND (o.created_by = auth.uid()) AND public.current_user_has_permission('sales.view_own'::text))))));


--
-- Name: shipment_documents staff read shipment documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read shipment documents" ON public.shipment_documents FOR SELECT TO authenticated USING ((public.current_user_has_permission('shipments.manage_documents'::text) OR public.current_user_has_permission('shipments.view'::text)));


--
-- Name: shipment_items staff read shipment items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read shipment items" ON public.shipment_items FOR SELECT TO authenticated USING (public.current_user_has_permission('shipments.view'::text));


--
-- Name: shipment_packages staff read shipment packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read shipment packages" ON public.shipment_packages FOR SELECT TO authenticated USING (public.current_user_has_permission('shipments.view'::text));


--
-- Name: shipment_serials staff read shipment serials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read shipment serials" ON public.shipment_serials FOR SELECT TO authenticated USING (public.current_user_has_permission('shipments.view'::text));


--
-- Name: shipments staff read shipments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read shipments" ON public.shipments FOR SELECT TO authenticated USING (public.current_user_has_permission('shipments.view'::text));


--
-- Name: permission_template_items staff read template items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read template items" ON public.permission_template_items FOR SELECT TO authenticated USING ((public.is_current_user_admin() OR public.current_user_has_permission('dashboard.view'::text)));


--
-- Name: permission_templates staff read templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read templates" ON public.permission_templates FOR SELECT TO authenticated USING ((public.is_current_user_admin() OR public.current_user_has_permission('dashboard.view'::text)));


--
-- Name: shipment_tracking_events staff read tracking events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read tracking events" ON public.shipment_tracking_events FOR SELECT TO authenticated USING (public.current_user_has_permission('shipments.view'::text));


--
-- Name: stock_adjustment_reasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustment_reasons ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: support_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: support_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tracking_status_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tracking_status_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: variation_attribute_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variation_attribute_values ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: warranty_coverages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warranty_coverages ENABLE ROW LEVEL SECURITY;

--
-- Name: warranty_coverages warranty_coverages_customer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warranty_coverages_customer_read ON public.warranty_coverages FOR SELECT TO authenticated USING (((customer_profile_id = auth.uid()) OR public.current_user_has_permission('rma.view'::text)));


--
-- Name: work_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_locations ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 8xw5WTNkNeDsEs7imcTvQK6SStc1ZEzi7dTUJzAhE1MPOAJkK3Dtdkgbnbu8Mby

begin;

-- Extend the existing carrier master without changing historical shipment text.
alter table public.purchase_carriers
  add column if not exists phone_number text,
  add column if not exists address text,
  add column if not exists description text,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.purchase_inbound_shipments
  add column if not exists carrier_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='purchase_inbound_shipments_carrier_id_fkey'
  ) then
    alter table public.purchase_inbound_shipments
      add constraint purchase_inbound_shipments_carrier_id_fkey
      foreign key (carrier_id) references public.purchase_carriers(id) on delete restrict;
  end if;
end $$;

create index if not exists purchase_inbound_shipments_carrier_id_idx
  on public.purchase_inbound_shipments(carrier_id) where carrier_id is not null;

-- Preserve unmatched legacy names as inactive master records, then link every
-- historical shipment that can be linked. carrier_name remains as its snapshot.
insert into public.purchase_carriers(name,status)
select distinct trim(shipment.carrier_name),'inactive'
from public.purchase_inbound_shipments shipment
where nullif(trim(shipment.carrier_name),'') is not null
  and not exists (
    select 1 from public.purchase_carriers carrier
    where lower(trim(carrier.name))=lower(trim(shipment.carrier_name))
  )
on conflict do nothing;

update public.purchase_inbound_shipments shipment
set carrier_id=carrier.id
from public.purchase_carriers carrier
where shipment.carrier_id is null
  and nullif(trim(shipment.carrier_name),'') is not null
  and lower(trim(carrier.name))=lower(trim(shipment.carrier_name));

-- New application calls use a carrier ID. The established transition remains
-- available for old history/clients while this wrapper snapshots the carrier name.
create or replace function public.transition_purchase_inbound_shipment_with_carrier(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_action text,
  requested_transport_mode text default null,
  requested_carrier_id uuid default null,
  requested_tracking_number text default null,
  requested_expected_departure_at timestamptz default null,
  requested_expected_arrival_at timestamptz default null,
  requested_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  resolved_carrier_id uuid;
  resolved_carrier_name text;
  shipment_id uuid;
begin
  if requested_action='prepare' then
    select id,name into resolved_carrier_id,resolved_carrier_name
    from public.purchase_carriers
    where id=requested_carrier_id and status='active';

    if resolved_carrier_id is null then
      raise exception 'Select an active carrier';
    end if;
  end if;

  shipment_id:=public.transition_purchase_inbound_shipment(
    actor_profile_id,
    requested_order_id,
    requested_action,
    requested_transport_mode,
    resolved_carrier_name,
    requested_tracking_number,
    requested_expected_departure_at,
    requested_expected_arrival_at,
    requested_note
  );

  if requested_action='prepare' then
    update public.purchase_inbound_shipments
    set carrier_id=resolved_carrier_id
    where id=shipment_id;
  end if;

  return shipment_id;
end $$;

revoke all on function public.transition_purchase_inbound_shipment_with_carrier(
  uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,text
) from public,anon,authenticated;
grant execute on function public.transition_purchase_inbound_shipment_with_carrier(
  uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,text
) to service_role;

commit;

-- Additive daily inventory closing/archive reporting. Existing inventory data is read-only input.

create table if not exists public.inventory_daily_closing_sheets(
  id uuid primary key default gen_random_uuid(),
  root_sheet_id uuid references public.inventory_daily_closing_sheets(id) on delete restrict,
  reference text not null unique,
  inventory_date date not null,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  include_all_products boolean not null default false,
  include_serial_details boolean not null default false,
  status text not null default 'draft' check(status in('draft','finalized','verified')),
  closing_status text not null default 'pending_review' check(closing_status in('verified','pending_review','discrepancy_found','reconciliation_required')),
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  checked_by uuid references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  finalized_at timestamptz,
  verified_at timestamptz,
  closing_time timestamptz,
  physical_count numeric(18,4),
  variance numeric(18,4),
  remarks text,
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_daily_closing_lines(
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.inventory_daily_closing_sheets(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  product_name text not null,
  sku text not null,
  model text,
  opening_qty numeric(18,4) not null default 0,
  stock_in numeric(18,4) not null default 0,
  stock_out numeric(18,4) not null default 0,
  closing_qty numeric(18,4) not null default 0,
  system_closing_qty numeric(18,4) not null default 0,
  unit text not null default 'Pcs',
  remarks text,
  reconciliation_needed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_daily_closing_movement_details(
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.inventory_daily_closing_sheets(id) on delete cascade,
  line_id uuid references public.inventory_daily_closing_lines(id) on delete set null,
  movement_id uuid references public.inventory_movements(id) on delete set null,
  movement_item_id uuid references public.inventory_movement_items(id) on delete set null,
  reference text,
  movement_type text,
  quantity_delta numeric(18,4) not null default 0,
  source_warehouse_id uuid references public.warehouses(id) on delete set null,
  destination_warehouse_id uuid references public.warehouses(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  transaction_at timestamptz,
  product_name text,
  sku text,
  serial_number_id uuid references public.serial_numbers(id) on delete set null,
  sen_serial text,
  manufacturer_serial text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_daily_closing_date_idx on public.inventory_daily_closing_sheets(inventory_date desc);
create index if not exists inventory_daily_closing_warehouse_idx on public.inventory_daily_closing_sheets(warehouse_id,inventory_date desc);
create index if not exists inventory_daily_closing_status_idx on public.inventory_daily_closing_sheets(status,closing_status);
create index if not exists inventory_daily_closing_lines_sheet_idx on public.inventory_daily_closing_lines(sheet_id,product_name);
create index if not exists inventory_daily_closing_movements_sheet_idx on public.inventory_daily_closing_movement_details(sheet_id,transaction_at);

alter table public.inventory_daily_closing_sheets enable row level security;
alter table public.inventory_daily_closing_lines enable row level security;
alter table public.inventory_daily_closing_movement_details enable row level security;

drop policy if exists "authorized staff read daily closing sheets" on public.inventory_daily_closing_sheets;
create policy "authorized staff read daily closing sheets" on public.inventory_daily_closing_sheets
for select to authenticated using(
  public.is_current_user_admin()
  or public.current_user_has_permission('inventory.daily_closing_view')
  or public.current_user_has_permission('inventory.daily_closing_generate')
  or public.current_user_has_permission('inventory.daily_closing_finalize')
  or public.current_user_has_permission('inventory.daily_closing_verify')
  or public.current_user_has_permission('inventory.daily_closing_print')
  or public.current_user_has_permission('inventory.daily_closing_view_history')
);
drop policy if exists "authorized staff read daily closing lines" on public.inventory_daily_closing_lines;
create policy "authorized staff read daily closing lines" on public.inventory_daily_closing_lines
for select to authenticated using(
  public.is_current_user_admin()
  or public.current_user_has_permission('inventory.daily_closing_view')
  or public.current_user_has_permission('inventory.daily_closing_generate')
  or public.current_user_has_permission('inventory.daily_closing_finalize')
  or public.current_user_has_permission('inventory.daily_closing_verify')
  or public.current_user_has_permission('inventory.daily_closing_print')
  or public.current_user_has_permission('inventory.daily_closing_view_history')
);
drop policy if exists "authorized staff read daily closing movement details" on public.inventory_daily_closing_movement_details;
create policy "authorized staff read daily closing movement details" on public.inventory_daily_closing_movement_details
for select to authenticated using(
  public.is_current_user_admin()
  or public.current_user_has_permission('inventory.daily_closing_view')
  or public.current_user_has_permission('inventory.daily_closing_generate')
  or public.current_user_has_permission('inventory.daily_closing_finalize')
  or public.current_user_has_permission('inventory.daily_closing_verify')
  or public.current_user_has_permission('inventory.daily_closing_print')
  or public.current_user_has_permission('inventory.daily_closing_view_history')
);

grant select on public.inventory_daily_closing_sheets,public.inventory_daily_closing_lines,public.inventory_daily_closing_movement_details to authenticated;
grant all on public.inventory_daily_closing_sheets,public.inventory_daily_closing_lines,public.inventory_daily_closing_movement_details to service_role;

with catalogue(module_key,permission_key,name,description,action,sensitive,position) as (values
  ('inventory','inventory.daily_closing_view','View daily inventory closing sheets','View daily inventory closing sheets','view',false,70),
  ('inventory','inventory.daily_closing_generate','Generate daily inventory closing sheets','Generate and save daily inventory closing drafts','generate',false,80),
  ('inventory','inventory.daily_closing_finalize','Finalize daily inventory closing sheets','Finalize daily inventory closing sheets','finalize',true,90),
  ('inventory','inventory.daily_closing_print','Print daily inventory closing sheets','Print daily inventory closing sheets','print',false,100),
  ('inventory','inventory.daily_closing_verify','Verify daily inventory closing sheets','Verify daily inventory closing sheets','verify',true,110),
  ('inventory','inventory.daily_closing_view_history','View daily inventory closing history','View historical daily inventory closing sheets','view_history',true,120),
  ('inventory','inventory.daily_closing_export_pdf','Export daily inventory closing sheets','Export daily inventory closing sheets to PDF','export_pdf',true,130)
)
insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,c.permission_key,c.name,c.description,c.action,c.sensitive,c.position
from catalogue c join public.app_modules m on m.key=c.module_key
on conflict (key) do update set module_id=excluded.module_id,name=excluded.name,description=excluded.description,action=excluded.action,is_sensitive=excluded.is_sensitive,sort_order=excluded.sort_order;

-- Employee Stock Out / Product Release.
-- This migration is additive: existing sales, inventory, serial, shipment, and
-- RMA history remains in place. Physical mutations are added as atomic RPCs in
-- the sections below and direct employee writes remain disabled.

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order
)
select
  module.id,
  'inventory.release_sales_stock',
  'Stock Out / Release Invoiced Products',
  'Release finalized Sales Invoice products from physical warehouse inventory.',
  'release_sales_stock',
  true,
  85
from public.app_modules module
where module.key='inventory'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

alter table public.sale_documents
  add column if not exists finalization_idempotency_key uuid;

create unique index if not exists sale_documents_finalization_idempotency_unique
  on public.sale_documents(finalization_idempotency_key)
  where finalization_idempotency_key is not null;

-- The existing check constraints are widened without rewriting any row.
alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check check (
    movement_type=any(array[
      'opening_balance','purchase_receipt','manual_adjustment','warehouse_transfer',
      'reservation','reservation_release','sale_allocation','stock_out',
      'customer_return','supplier_return','damage','correction'
    ]::text[])
  );

alter table public.serial_numbers
  drop constraint if exists serial_numbers_status_check;
alter table public.serial_numbers
  add constraint serial_numbers_status_check check (
    status=any(array[
      'expected','in_transit','received','available','reserved','allocated','packed',
      'warehouse_released','shipped','delivered','returned','quarantined','damaged',
      'lost','transferred','disposed','voided','sold','unavailable','removed'
    ]::text[])
  );

alter table public.order_serial_allocations
  drop constraint if exists order_serial_allocations_status_check;
alter table public.order_serial_allocations
  add constraint order_serial_allocations_status_check check (
    status=any(array[
      'active','released','packed','warehouse_released','shipped','delivered','returned','cancelled'
    ]::text[])
  );

-- A serial that has left the warehouse remains exclusively bound to its sale.
-- Replacing the original partial unique index is safe and preserves every row.
drop index if exists public.order_serial_one_active_assignment_idx;
create unique index order_serial_one_active_assignment_idx
  on public.order_serial_allocations(serial_number_id)
  where status in('active','packed','warehouse_released','shipped');

create table if not exists public.sales_stock_out_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  current_invoice_document_id uuid not null references public.sale_documents(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending_release',
  current_revision_number integer not null default 1,
  required_quantity numeric(18,4) not null default 0,
  released_quantity numeric(18,4) not null default 0,
  remaining_quantity numeric(18,4) generated always as (
    greatest(required_quantity-released_quantity,0::numeric)
  ) stored,
  invoice_revision_pending boolean not null default false,
  version bigint not null default 1,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancellation_reason text,
  constraint sales_stock_out_requests_number_unique unique(request_number),
  constraint sales_stock_out_requests_sales_order_unique unique(sales_order_id),
  constraint sales_stock_out_requests_status_check check (
    status=any(array['pending_release','partially_released','fully_released','cancelled']::text[])
  ),
  constraint sales_stock_out_requests_revision_check check(current_revision_number>=1),
  constraint sales_stock_out_requests_required_check check(required_quantity>=0),
  constraint sales_stock_out_requests_released_check check(released_quantity>=0),
  constraint sales_stock_out_requests_quantity_check check(required_quantity>=released_quantity),
  constraint sales_stock_out_requests_version_check check(version>=1),
  constraint sales_stock_out_requests_cancelled_check check(
    (status='cancelled' and cancelled_at is not null) or status<>'cancelled'
  )
);

create table if not exists public.sales_stock_out_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  sales_order_item_id uuid not null,
  line_key text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  serial_tracking_required boolean not null default false,
  required_quantity numeric(18,4) not null,
  released_quantity numeric(18,4) not null default 0,
  remaining_quantity numeric(18,4) generated always as (
    greatest(required_quantity-released_quantity,0::numeric)
  ) stored,
  packed_quantity_snapshot numeric(18,4) not null default 0,
  latest_revision_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_stock_out_request_items_order_item_unique unique(request_id,sales_order_item_id),
  constraint sales_stock_out_request_items_line_unique unique(request_id,line_key),
  constraint sales_stock_out_request_items_required_check check(required_quantity>=0),
  constraint sales_stock_out_request_items_released_check check(released_quantity>=0),
  constraint sales_stock_out_request_items_quantity_check check(required_quantity>=released_quantity),
  constraint sales_stock_out_request_items_packed_check check(packed_quantity_snapshot>=0),
  constraint sales_stock_out_request_items_revision_check check(latest_revision_number>=1)
);

create table if not exists public.sales_stock_out_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  sale_document_id uuid not null references public.sale_documents(id) on delete restrict,
  revision_number integer not null,
  operation_id uuid not null,
  invoice_number_snapshot text not null,
  invoice_snapshot jsonb not null,
  required_quantity numeric(18,4) not null,
  released_quantity_at_revision numeric(18,4) not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sales_stock_out_request_revisions_request_revision_unique unique(request_id,revision_number),
  constraint sales_stock_out_request_revisions_document_unique unique(sale_document_id),
  constraint sales_stock_out_request_revisions_operation_unique unique(operation_id),
  constraint sales_stock_out_request_revisions_required_check check(required_quantity>=0),
  constraint sales_stock_out_request_revisions_released_check check(released_quantity_at_revision>=0),
  constraint sales_stock_out_request_revisions_quantity_check check(required_quantity>=released_quantity_at_revision),
  constraint sales_stock_out_request_revisions_revision_check check(revision_number>=1)
);

create table if not exists public.sales_stock_out_request_revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.sales_stock_out_request_revisions(id) on delete restrict,
  request_item_id uuid not null references public.sales_stock_out_request_items(id) on delete restrict,
  sales_order_item_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  required_quantity numeric(18,4) not null,
  released_quantity numeric(18,4) not null,
  remaining_quantity numeric(18,4) generated always as (
    greatest(required_quantity-released_quantity,0::numeric)
  ) stored,
  preassigned_serial_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  constraint sales_stock_out_request_revision_items_unique unique(revision_id,request_item_id),
  constraint sales_stock_out_request_revision_items_required_check check(required_quantity>=0),
  constraint sales_stock_out_request_revision_items_released_check check(released_quantity>=0),
  constraint sales_stock_out_request_revision_items_quantity_check check(required_quantity>=released_quantity)
);

create table if not exists public.sales_stock_out_releases (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  request_revision_id uuid not null references public.sales_stock_out_request_revisions(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  sale_document_id uuid not null references public.sale_documents(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  invoice_number_snapshot text not null,
  quantity_released numeric(18,4) not null,
  status text not null default 'confirmed',
  released_by uuid not null references public.profiles(id) on delete restrict,
  released_by_name text not null,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_stock_out_releases_operation_unique unique(operation_id),
  constraint sales_stock_out_releases_movement_unique unique(movement_id),
  constraint sales_stock_out_releases_quantity_check check(quantity_released>0),
  constraint sales_stock_out_releases_status_check check(status='confirmed')
);

create table if not exists public.sales_stock_out_release_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.sales_stock_out_releases(id) on delete restrict,
  request_item_id uuid not null references public.sales_stock_out_request_items(id) on delete restrict,
  inventory_movement_item_id uuid not null references public.inventory_movement_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  quantity_released numeric(18,4) not null,
  previous_physical_quantity numeric(18,4) not null,
  new_physical_quantity numeric(18,4) not null,
  previous_reserved_quantity numeric(18,4) not null,
  new_reserved_quantity numeric(18,4) not null,
  created_at timestamptz not null default now(),
  constraint sales_stock_out_release_items_movement_item_unique unique(inventory_movement_item_id),
  constraint sales_stock_out_release_items_request_item_unique unique(release_id,request_item_id),
  constraint sales_stock_out_release_items_quantity_check check(quantity_released>0),
  constraint sales_stock_out_release_items_physical_check check(
    previous_physical_quantity>=0 and new_physical_quantity>=0 and
    previous_physical_quantity-new_physical_quantity=quantity_released
  ),
  constraint sales_stock_out_release_items_reserved_check check(
    previous_reserved_quantity>=0 and new_reserved_quantity>=0 and
    previous_reserved_quantity-new_reserved_quantity=quantity_released
  )
);

create table if not exists public.sales_stock_out_release_serials (
  id uuid primary key default gen_random_uuid(),
  release_item_id uuid not null references public.sales_stock_out_release_items(id) on delete restrict,
  serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  allocation_id uuid references public.order_serial_allocations(id) on delete restrict,
  sen_serial_snapshot text not null,
  manufacturer_serial_snapshot text,
  previous_status text not null,
  new_status text not null default 'warehouse_released',
  created_at timestamptz not null default now(),
  constraint sales_stock_out_release_serials_release_serial_unique unique(release_item_id,serial_number_id),
  constraint sales_stock_out_release_serials_status_check check(new_status='warehouse_released')
);

create table if not exists public.sales_stock_out_serial_changes (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references public.sales_stock_out_request_items(id) on delete restrict,
  operation_id uuid not null,
  previous_serial_number_id uuid references public.serial_numbers(id) on delete restrict,
  replacement_serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  reason text not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint sales_stock_out_serial_changes_operation_unique unique(operation_id),
  constraint sales_stock_out_serial_changes_different_check check(
    previous_serial_number_id is distinct from replacement_serial_number_id
  ),
  constraint sales_stock_out_serial_changes_reason_check check(length(btrim(reason))>=3)
);

create table if not exists public.rma_return_receipts (
  id uuid primary key default gen_random_uuid(),
  rma_claim_id uuid not null references public.rma_claims(id) on delete restrict,
  stock_out_request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  stock_out_release_id uuid not null references public.sales_stock_out_releases(id) on delete restrict,
  stock_out_release_item_id uuid not null references public.sales_stock_out_release_items(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  operation_id uuid not null,
  movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  quantity_received numeric(18,4) not null,
  status text not null default 'confirmed',
  received_by uuid not null references public.profiles(id) on delete restrict,
  received_by_name text not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rma_return_receipts_operation_unique unique(operation_id),
  constraint rma_return_receipts_movement_unique unique(movement_id),
  constraint rma_return_receipts_quantity_check check(quantity_received>0),
  constraint rma_return_receipts_status_check check(status='confirmed')
);

create table if not exists public.rma_return_receipt_serials (
  id uuid primary key default gen_random_uuid(),
  return_receipt_id uuid not null references public.rma_return_receipts(id) on delete restrict,
  original_release_serial_id uuid not null references public.sales_stock_out_release_serials(id) on delete restrict,
  serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now(),
  constraint rma_return_receipt_serials_receipt_unique unique(return_receipt_id,serial_number_id),
  constraint rma_return_receipt_serials_original_unique unique(original_release_serial_id)
);

-- A returned physical serial may later become eligible for a new sale after
-- the existing RMA/service workflow clears it. Serial row locks plus the active
-- allocation index and the unreturned-release checks below prevent double use.
alter table public.sales_stock_out_release_serials
  drop constraint if exists sales_stock_out_release_serials_serial_unique;

create index if not exists sales_stock_out_requests_queue_idx
  on public.sales_stock_out_requests(warehouse_id,status,updated_at desc);
create index if not exists sales_stock_out_request_items_request_idx
  on public.sales_stock_out_request_items(request_id,latest_revision_number);
create index if not exists sales_stock_out_request_revisions_request_idx
  on public.sales_stock_out_request_revisions(request_id,revision_number desc);
create index if not exists sales_stock_out_releases_request_idx
  on public.sales_stock_out_releases(request_id,released_at desc);
create index if not exists rma_return_receipts_release_item_idx
  on public.rma_return_receipts(stock_out_release_item_id,received_at desc);

create or replace function public.can_access_stock_out_warehouse(requested_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.is_current_user_admin() or (
    public.current_user_has_permission('inventory.release_sales_stock') and
    exists(
      select 1
      from public.profiles profile
      where profile.status='active'
        and profile.id=auth.uid()
        and profile.role='employee'
        and exists(
          select 1 from public.profile_warehouse_assignments assignment
          where assignment.profile_id=profile.id
            and assignment.warehouse_id=requested_warehouse_id
            and assignment.is_active
            and assignment.ended_at is null
        )
    )
  )
$$;

create or replace function public.can_receive_rma_at_warehouse(requested_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.is_current_user_admin() or (
    public.current_user_has_permission('rma.receive') and
    exists(
      select 1
      from public.profiles profile
      where profile.status='active'
        and profile.id=auth.uid()
        and profile.role='employee'
        and exists(
          select 1 from public.profile_warehouse_assignments assignment
          where assignment.profile_id=profile.id
            and assignment.warehouse_id=requested_warehouse_id
            and assignment.is_active
            and assignment.ended_at is null
        )
    )
  )
$$;

alter table public.sales_stock_out_requests enable row level security;
alter table public.sales_stock_out_request_items enable row level security;
alter table public.sales_stock_out_request_revisions enable row level security;
alter table public.sales_stock_out_request_revision_items enable row level security;
alter table public.sales_stock_out_releases enable row level security;
alter table public.sales_stock_out_release_items enable row level security;
alter table public.sales_stock_out_release_serials enable row level security;
alter table public.sales_stock_out_serial_changes enable row level security;
alter table public.rma_return_receipts enable row level security;
alter table public.rma_return_receipt_serials enable row level security;

drop policy if exists "authorized warehouse reads stock out requests" on public.sales_stock_out_requests;
create policy "authorized warehouse reads stock out requests"
  on public.sales_stock_out_requests for select to authenticated
  using(public.can_access_stock_out_warehouse(warehouse_id));

drop policy if exists "authorized warehouse reads stock out request items" on public.sales_stock_out_request_items;
create policy "authorized warehouse reads stock out request items"
  on public.sales_stock_out_request_items for select to authenticated
  using(exists(
    select 1 from public.sales_stock_out_requests request
    where request.id=request_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

drop policy if exists "authorized warehouse reads stock out revisions" on public.sales_stock_out_request_revisions;
create policy "authorized warehouse reads stock out revisions"
  on public.sales_stock_out_request_revisions for select to authenticated
  using(exists(
    select 1 from public.sales_stock_out_requests request
    where request.id=request_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

drop policy if exists "authorized warehouse reads stock out revision items" on public.sales_stock_out_request_revision_items;
create policy "authorized warehouse reads stock out revision items"
  on public.sales_stock_out_request_revision_items for select to authenticated
  using(exists(
    select 1
    from public.sales_stock_out_request_revisions revision
    join public.sales_stock_out_requests request on request.id=revision.request_id
    where revision.id=revision_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

drop policy if exists "authorized warehouse reads stock out releases" on public.sales_stock_out_releases;
create policy "authorized warehouse reads stock out releases"
  on public.sales_stock_out_releases for select to authenticated
  using(public.can_access_stock_out_warehouse(warehouse_id));

drop policy if exists "authorized warehouse reads stock out release items" on public.sales_stock_out_release_items;
create policy "authorized warehouse reads stock out release items"
  on public.sales_stock_out_release_items for select to authenticated
  using(exists(
    select 1 from public.sales_stock_out_releases release
    where release.id=release_id
      and public.can_access_stock_out_warehouse(release.warehouse_id)
  ));

drop policy if exists "authorized warehouse reads stock out release serials" on public.sales_stock_out_release_serials;
create policy "authorized warehouse reads stock out release serials"
  on public.sales_stock_out_release_serials for select to authenticated
  using(exists(
    select 1
    from public.sales_stock_out_release_items item
    join public.sales_stock_out_releases release on release.id=item.release_id
    where item.id=release_item_id
      and public.can_access_stock_out_warehouse(release.warehouse_id)
  ));

drop policy if exists "authorized warehouse reads stock out serial changes" on public.sales_stock_out_serial_changes;
create policy "authorized warehouse reads stock out serial changes"
  on public.sales_stock_out_serial_changes for select to authenticated
  using(exists(
    select 1
    from public.sales_stock_out_request_items item
    join public.sales_stock_out_requests request on request.id=item.request_id
    where item.id=request_item_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

drop policy if exists "authorized warehouse reads RMA return receipts" on public.rma_return_receipts;
create policy "authorized warehouse reads RMA return receipts"
  on public.rma_return_receipts for select to authenticated
  using(public.can_receive_rma_at_warehouse(warehouse_id));

drop policy if exists "authorized warehouse reads RMA return receipt serials" on public.rma_return_receipt_serials;
create policy "authorized warehouse reads RMA return receipt serials"
  on public.rma_return_receipt_serials for select to authenticated
  using(exists(
    select 1 from public.rma_return_receipts receipt
    where receipt.id=return_receipt_id
      and public.can_receive_rma_at_warehouse(receipt.warehouse_id)
  ));

revoke all on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
from authenticated;
revoke all on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
from anon;

grant select on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
to authenticated;

grant all on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
to service_role;

revoke all on function public.can_access_stock_out_warehouse(uuid) from public,anon;
revoke all on function public.can_receive_rma_at_warehouse(uuid) from public,anon;
grant execute on function public.can_access_stock_out_warehouse(uuid) to authenticated,service_role;
grant execute on function public.can_receive_rma_at_warehouse(uuid) to authenticated,service_role;

create or replace function public.mark_stock_out_invoice_revision_pending()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.document_type='invoice'
    and old.status='generated'
    and new.status='superseded'
  then
    update public.sales_stock_out_requests
    set invoice_revision_pending=true,updated_at=now(),version=version+1
    where sales_order_id=old.order_id and status<>'cancelled';
  end if;
  return new;
end $$;

drop trigger if exists sale_documents_mark_stock_out_revision_pending
  on public.sale_documents;
create trigger sale_documents_mark_stock_out_revision_pending
after update of status on public.sale_documents
for each row execute function public.mark_stock_out_invoice_revision_pending();

-- Saving a commercial revision never mutates inventory. Reservation and serial
-- allocation reconciliation happen only in finalize_sale_invoice below.
create or replace function public.update_sale_lines(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_reason text,
  requested_items jsonb
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  current_item public.sales_order_items%rowtype;
  entry jsonb;
  item_count integer;
  request_count integer;
  distinct_request_count integer;
  new_quantity numeric;
  new_unit_price numeric;
  new_discount_type text;
  new_discount_value numeric;
  new_subtotal numeric;
  new_discount numeric;
  new_total numeric;
  physically_released_quantity numeric;
  revised_subtotal numeric;
  revised_line_total numeric;
  revised_total numeric;
  reason text;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.edit');
  reason:=nullif(left(trim(coalesce(requested_reason,'')),500),'');
  if reason is null then raise exception 'Edit reason is required'; end if;
  if jsonb_typeof(requested_items)<>'array' then raise exception 'Sale items are invalid'; end if;

  select * into sale from public.sales_orders
  where id=requested_order_id for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  if sale.status in('delivered','cancelled') then
    raise exception 'A delivered or cancelled sale cannot be edited';
  end if;

  select count(*) into item_count from public.sales_order_items where order_id=sale.id;
  select count(*),count(distinct value->>'id')
  into request_count,distinct_request_count
  from jsonb_array_elements(requested_items);
  if request_count<>item_count or distinct_request_count<>item_count then
    raise exception 'Every sale item must be submitted exactly once';
  end if;

  for entry in select value from jsonb_array_elements(requested_items)
  loop
    select * into current_item from public.sales_order_items
    where id=(entry->>'id')::uuid and order_id=sale.id for update;
    if current_item.id is null then raise exception 'Sale item not found'; end if;

    select coalesce(stock_item.released_quantity,0)
    into physically_released_quantity
    from public.sales_stock_out_request_items stock_item
    join public.sales_stock_out_requests stock_request on stock_request.id=stock_item.request_id
    where stock_request.sales_order_id=sale.id
      and stock_item.sales_order_item_id=current_item.id
    for update of stock_item;
    physically_released_quantity:=coalesce(physically_released_quantity,0);

    new_quantity:=(entry->>'quantity')::numeric;
    new_unit_price:=round((entry->>'unit_price')::numeric,2);
    new_discount_type:=entry->>'discount_type';
    new_discount_value:=round((entry->>'discount_value')::numeric,2);
    if new_quantity<1 or new_quantity<>trunc(new_quantity) then
      raise exception 'Quantity must be a whole number of at least 1';
    end if;
    if new_quantity<greatest(
      current_item.shipped_quantity,current_item.delivered_quantity,
      physically_released_quantity
    ) then
      if new_quantity<physically_released_quantity then
        raise exception 'Invoice quantity cannot be lower than % unit(s) already physically released for %',
          physically_released_quantity,current_item.product_name_snapshot;
      end if;
      raise exception 'Quantity cannot be reduced below fulfilled units';
    end if;
    if new_unit_price<0 then raise exception 'Unit price cannot be negative'; end if;
    if new_discount_type not in('percentage','fixed') or new_discount_value<0
      or (new_discount_type='percentage' and new_discount_value>100)
    then raise exception 'Discount is invalid'; end if;

    new_subtotal:=round(new_quantity*new_unit_price,2);
    new_discount:=case when new_discount_type='percentage'
      then round(new_subtotal*new_discount_value/100,2) else new_discount_value end;
    if new_discount>new_subtotal then raise exception 'Fixed discount cannot exceed the line subtotal'; end if;
    new_total:=round(new_subtotal-new_discount+current_item.line_tax,2);

    if new_unit_price<>current_item.unit_price then
      perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values(
        sale.id,current_item.id,'manual_unit_price',current_item.unit_price,
        new_unit_price,reason,actor_profile_id
      );
    end if;
    if new_discount<>current_item.line_discount
      or new_discount_type<>current_item.discount_type
      or new_discount_value<>current_item.discount_value
    then
      perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values(
        sale.id,current_item.id,
        case when new_discount_type='percentage' then 'percentage_discount' else 'fixed_line_discount' end,
        current_item.line_discount,
        case when new_discount_type='percentage' then new_discount_value else new_discount end,
        reason,actor_profile_id
      );
    end if;

    if new_quantity<>current_item.quantity then
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values(
        sale.id,current_item.id,'quantity_change',current_item.quantity,
        new_quantity,reason,actor_profile_id
      );

    end if;

    update public.sales_order_items set
      quantity=new_quantity,unit_price=new_unit_price,line_subtotal=new_subtotal,
      line_discount=new_discount,line_total=new_total,discount_type=new_discount_type,
      discount_value=new_discount_value,updated_at=now()
    where id=current_item.id;
  end loop;

  select coalesce(sum(line_subtotal),0),coalesce(sum(line_total),0)
  into revised_subtotal,revised_line_total
  from public.sales_order_items where order_id=sale.id;
  revised_total:=round(
    revised_line_total-sale.discount_amount+sale.shipping_amount+
    sale.service_amount+sale.tax_amount,2
  );
  if revised_total<0 then raise exception 'Sale total cannot be negative'; end if;
  if revised_total<sale.paid_amount then
    raise exception 'Sale total cannot be lower than the amount already paid';
  end if;

  update public.sales_orders set subtotal=revised_subtotal,total_amount=revised_total,
    payment_status=case
      when paid_amount=0 then 'unpaid'
      when paid_amount<revised_total then 'partially_paid'
      when paid_amount=revised_total then 'paid'
      else 'overpaid' end,
    updated_by=actor_profile_id,updated_at=now()
  where id=sale.id;
  -- Preserve the last valid finalized invoice. The replacement invoice and its
  -- supersession happen together inside finalize_sale_invoice. Until then,
  -- block physical release because the saved commercial edit is not final.
  update public.sales_stock_out_requests
  set invoice_revision_pending=true,updated_at=now(),version=version+1
  where sales_order_id=sale.id and status<>'cancelled';
  perform public.derive_sales_order_status(sale.id);
end $$;

revoke all on function public.update_sale_lines(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.update_sale_lines(uuid,uuid,text,jsonb)
  to service_role;

-- Keep upstream allocation aligned with Stock Out eligibility. An ineligible
-- physical unit must never be assigned and deferred to a later release error.
create or replace function public.allocate_order_serials(
  actor_profile_id uuid,
  requested_order_item_id uuid,
  requested_serial_ids uuid[],
  requested_method text default 'manual'
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.sales_order_items%rowtype;
  sale public.sales_orders%rowtype;
  serial_id uuid;
  serial public.serial_numbers%rowtype;
  remaining integer;
  added integer:=0;
begin
  perform public.assert_actor_permission(actor_profile_id,'orders.allocate');
  select * into item from public.sales_order_items
  where id=requested_order_item_id for update;
  if item.id is null then raise exception 'Order item not found'; end if;
  select * into sale from public.sales_orders where id=item.order_id for update;
  if not item.serial_tracking_required_snapshot then
    raise exception 'Item does not require serial allocation';
  end if;
  if sale.status in('draft','cancelled','shipped','delivered') then
    raise exception 'Order is not eligible for allocation';
  end if;
  remaining:=(item.quantity-item.allocated_quantity)::integer;
  if coalesce(array_length(requested_serial_ids,1),0)=0
    or array_length(requested_serial_ids,1)>remaining
  then raise exception 'Select no more than the remaining serial quantity'; end if;

  foreach serial_id in array requested_serial_ids
  loop
    select * into serial from public.serial_numbers where id=serial_id for update;
    if serial.id is null
      or serial.product_id<>item.product_id
      or serial.variation_id is distinct from item.variation_id
      or serial.warehouse_id<>item.fulfillment_warehouse_id
      or serial.status<>'available'
      or lower(coalesce(serial.condition,'')) in(
        'damaged','unavailable','lost','disposed','quarantined'
      )
    then raise exception 'Serial is not eligible for this order item'; end if;
    insert into public.order_serial_allocations(
      order_id,order_item_id,serial_number_id,warehouse_id,
      allocation_method,allocated_by
    ) values(
      item.order_id,item.id,serial.id,serial.warehouse_id,
      requested_method,actor_profile_id
    );
    update public.serial_numbers set status='allocated',updated_at=now()
    where id=serial.id;
    added:=added+1;
  end loop;
  update public.sales_order_items
  set allocated_quantity=allocated_quantity+added,updated_at=now()
  where id=item.id;
  perform public.derive_sales_order_status(item.order_id);
  return added;
end $$;

create or replace function public.auto_allocate_order_serials(
  actor_profile_id uuid,
  requested_order_item_id uuid
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.sales_order_items%rowtype;
  ids uuid[];
  needed integer;
begin
  select * into item from public.sales_order_items
  where id=requested_order_item_id;
  if item.id is null then raise exception 'Order item not found'; end if;
  needed:=(item.quantity-item.allocated_quantity)::integer;
  if needed<=0 then return 0; end if;
  select array_agg(id order by coalesce(received_at,created_at),created_at)
  into ids
  from (
    select id,received_at,created_at
    from public.serial_numbers
    where product_id=item.product_id
      and variation_id is not distinct from item.variation_id
      and warehouse_id=item.fulfillment_warehouse_id
      and status='available'
      and lower(coalesce(condition,'')) not in(
        'damaged','unavailable','lost','disposed','quarantined'
      )
    order by coalesce(received_at,created_at),created_at
    limit needed
    for update skip locked
  ) eligible;
  if coalesce(array_length(ids,1),0)<>needed then
    raise exception 'Not enough eligible serials';
  end if;
  return public.allocate_order_serials(
    actor_profile_id,requested_order_item_id,ids,'auto'
  );
end $$;

drop function if exists public.finalize_sale_invoice(uuid,uuid,uuid);
create or replace function public.finalize_sale_invoice(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_operation_id uuid,
  requested_request_version bigint
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  sale_item public.sales_order_items%rowtype;
  balance public.inventory_balances%rowtype;
  reservation public.inventory_reservations%rowtype;
  allocation public.order_serial_allocations%rowtype;
  allocation_serial public.serial_numbers%rowtype;
  request_row public.sales_stock_out_requests%rowtype;
  request_item public.sales_stock_out_request_items%rowtype;
  removed_request_item public.sales_stock_out_request_items%rowtype;
  existing_document_id uuid;
  existing_document_order_id uuid;
  document_id uuid:=gen_random_uuid();
  stock_out_request_id uuid;
  request_revision_id uuid:=gen_random_uuid();
  invoice_number text;
  document_snapshot jsonb;
  next_revision integer;
  required_quantity numeric:=0;
  released_quantity numeric:=0;
  item_released_quantity numeric;
  desired_reservation numeric;
  current_reservation numeric;
  reservation_delta numeric;
  active_reservation_count integer;
  excess_allocations integer;
  cancelled_allocations integer;
  previous_serial_result_status text;
  preassigned_serial_ids uuid[];
  request_status text;
begin
  if requested_operation_id is null then
    raise exception 'A valid invoice finalization operation ID is required';
  end if;
  perform public.assert_actor_permission(actor_profile_id,'sales.create_invoice');

  select document.id,document.order_id
  into existing_document_id,existing_document_order_id
  from public.sale_documents document
  where document.finalization_idempotency_key=requested_operation_id;
  if existing_document_id is not null then
    if existing_document_order_id<>requested_order_id then
      raise exception 'The invoice finalization operation ID belongs to another sale';
    end if;
    return existing_document_id;
  end if;

  select * into sale
  from public.sales_orders
  where id=requested_order_id
  for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  if sale.confirmed_at is null or sale.status in('draft','cancelled') then
    raise exception 'Sale is not eligible for invoice finalization';
  end if;

  -- Recheck after the order lock so concurrent retries return the first commit.
  select document.id,document.order_id
  into existing_document_id,existing_document_order_id
  from public.sale_documents document
  where document.finalization_idempotency_key=requested_operation_id;
  if existing_document_id is not null then
    if existing_document_order_id<>requested_order_id then
      raise exception 'The invoice finalization operation ID belongs to another sale';
    end if;
    return existing_document_id;
  end if;

  select * into request_row
  from public.sales_stock_out_requests request
  where request.sales_order_id=sale.id
  for update;
  stock_out_request_id:=request_row.id;
  if request_row.id is null then
    if requested_request_version<>0 then
      raise exception 'This Sales Invoice was updated in another tab. Refresh before finalizing.';
    end if;
  elsif requested_request_version is distinct from request_row.version then
    raise exception 'This Sales Invoice or Stock Out request was updated in another tab. Refresh before finalizing.';
  end if;

  if not exists(select 1 from public.sales_order_items where order_id=sale.id) then
    raise exception 'A finalized invoice must contain at least one product';
  end if;
  if exists(
    select 1 from public.sales_order_items item
    where item.order_id=sale.id
      and item.fulfillment_warehouse_id is distinct from sale.fulfillment_warehouse_id
  ) then
    raise exception 'All finalized invoice products must use the sale warehouse';
  end if;

  select coalesce(max(revision_number),0)+1 into next_revision
  from public.sale_documents
  where order_id=sale.id and document_type='invoice';

  -- Lock, validate, and reconcile every reservation before creating a document.
  for sale_item in
    select * from public.sales_order_items
    where order_id=sale.id
    order by created_at,id
    for update
  loop
    select * into request_item
    from public.sales_stock_out_request_items item
    where item.request_id=stock_out_request_id
      and item.sales_order_item_id=sale_item.id
    for update;
    item_released_quantity:=coalesce(request_item.released_quantity,0);
    required_quantity:=required_quantity+sale_item.quantity;
    released_quantity:=released_quantity+item_released_quantity;

    if sale_item.quantity<request_item.released_quantity then
      raise exception 'Invoice quantity cannot be lower than % unit(s) already physically released for %',
        request_item.released_quantity,sale_item.product_name_snapshot;
    end if;

    desired_reservation:=sale_item.quantity-item_released_quantity;

    -- Reconcile prepared serial assignments in this same finalization
    -- transaction. Saving the commercial edit never changes physical state.
    if sale_item.serial_tracking_required_snapshot then
      select greatest(count(*)-desired_reservation,0)::integer
      into excess_allocations
      from public.order_serial_allocations assigned
      where assigned.order_item_id=sale_item.id
        and assigned.status in('active','packed');
      cancelled_allocations:=0;
      for allocation in
        select assigned.*
        from public.order_serial_allocations assigned
        where assigned.order_item_id=sale_item.id
          and assigned.status in('active','packed')
          and not exists(
            select 1 from public.shipment_serials prepared
            where prepared.allocation_id=assigned.id
          )
        order by assigned.allocated_at desc,assigned.id desc
        for update
      loop
        exit when cancelled_allocations>=excess_allocations;
        select * into allocation_serial from public.serial_numbers
        where id=allocation.serial_number_id for update;
        previous_serial_result_status:=case lower(coalesce(allocation_serial.condition,''))
          when 'damaged' then 'damaged'
          when 'unavailable' then 'unavailable'
          when 'quarantined' then 'quarantined'
          when 'lost' then 'lost'
          when 'disposed' then 'disposed'
          else case
            when allocation_serial.status in('reserved','allocated','packed') then 'available'
            else allocation_serial.status
          end
        end;
        update public.order_serial_allocations
        set status='cancelled',
          release_reason='Removed from finalized Sales Invoice revision '||next_revision,
          released_by=actor_profile_id,released_at=now()
        where id=allocation.id;
        update public.serial_numbers
        set status=previous_serial_result_status,updated_at=now()
        where id=allocation.serial_number_id;
        insert into public.serial_number_history(
          serial_number_id,event_type,previous_status,new_status,
          previous_warehouse_id,new_warehouse_id,reason,actor_id
        ) values(
          allocation.serial_number_id,'invoice_revision_unassigned',
          allocation_serial.status,previous_serial_result_status,
          sale_item.fulfillment_warehouse_id,sale_item.fulfillment_warehouse_id,
          'Removed from finalized Sales Invoice revision '||next_revision,actor_profile_id
        );
        cancelled_allocations:=cancelled_allocations+1;
      end loop;
      if cancelled_allocations<excess_allocations then
        raise exception 'Rebuild the prepared shipment before reducing this serialized invoice quantity';
      end if;
    end if;
    update public.sales_order_items
    set allocated_quantity=least(allocated_quantity,sale_item.quantity),
      packed_quantity=least(packed_quantity,sale_item.quantity),updated_at=now()
    where id=sale_item.id;

    select * into balance
    from public.inventory_balances
    where warehouse_id=sale_item.fulfillment_warehouse_id
      and product_id=sale_item.product_id
      and variation_id is not distinct from sale_item.variation_id
      and location_id is null
    for update;
    if balance.id is null then raise exception 'Inventory balance not found for %',sale_item.product_name_snapshot; end if;

    perform id from public.inventory_reservations
    where order_item_id=sale_item.id and status='active'
    for update;
    select count(*),coalesce(sum(quantity),0)
    into active_reservation_count,current_reservation
    from public.inventory_reservations
    where order_item_id=sale_item.id and status='active';
    if active_reservation_count>1 then
      raise exception 'Multiple active reservations exist for one sale product';
    end if;

    reservation_delta:=desired_reservation-current_reservation;
    if reservation_delta>0 and balance.available<reservation_delta then
      raise exception 'Insufficient eligible available stock to finalize %',sale_item.product_name_snapshot;
    end if;
    if reservation_delta<>0 then
      update public.inventory_balances
      set reserved=reserved+reservation_delta,updated_at=now()
      where id=balance.id;
    end if;

    select * into reservation
    from public.inventory_reservations
    where order_item_id=sale_item.id and status='active'
    limit 1;
    if desired_reservation=0 and reservation.id is not null then
      update public.inventory_reservations
      set status=case when item_released_quantity>0 then 'consumed' else 'released' end,
        released_at=case when item_released_quantity=0 then now() else released_at end,
        updated_at=now()
      where id=reservation.id;
    elsif desired_reservation>0 and reservation.id is not null then
      update public.inventory_reservations
      set quantity=desired_reservation,updated_at=now()
      where id=reservation.id;
    elsif desired_reservation>0 then
      insert into public.inventory_reservations(
        product_id,variation_id,warehouse_id,quantity,status,reference,
        created_by,order_id,order_item_id
      ) values(
        sale_item.product_id,sale_item.variation_id,sale_item.fulfillment_warehouse_id,
        desired_reservation,'active',sale.order_number,actor_profile_id,sale.id,sale_item.id
      );
    end if;
  end loop;

  -- If another approved editor removed a not-yet-released sale line, preserve
  -- that line in the immutable revision history at quantity zero and release
  -- only its reservation. A physically released line can never be removed.
  for removed_request_item in
    select stock_item.*
    from public.sales_stock_out_request_items stock_item
    where stock_item.request_id=stock_out_request_id
      and not exists(
        select 1 from public.sales_order_items current_line
        where current_line.order_id=sale.id
          and current_line.id=stock_item.sales_order_item_id
      )
    order by stock_item.id
    for update
  loop
    if removed_request_item.released_quantity>0 then
      raise exception 'Invoice product % cannot be removed because % unit(s) were already physically released',
        removed_request_item.product_name_snapshot,removed_request_item.released_quantity;
    end if;
    select * into balance from public.inventory_balances
    where warehouse_id=removed_request_item.warehouse_id
      and product_id=removed_request_item.product_id
      and variation_id is not distinct from removed_request_item.variation_id
      and location_id is null
    for update;
    select * into reservation from public.inventory_reservations
    where order_item_id=removed_request_item.sales_order_item_id and status='active'
    for update;
    if reservation.id is not null then
      if balance.id is null or balance.reserved<reservation.quantity then
        raise exception 'Removed invoice product reservation is inconsistent';
      end if;
      update public.inventory_balances
      set reserved=reserved-reservation.quantity,updated_at=now()
      where id=balance.id;
      update public.inventory_reservations
      set status='released',released_at=now(),updated_at=now()
      where id=reservation.id;
    end if;
    update public.sales_stock_out_request_items
    set required_quantity=0,packed_quantity_snapshot=0,
      latest_revision_number=next_revision,updated_at=now()
    where id=removed_request_item.id;
  end loop;
  invoice_number:='SEN-INV-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6);
  select jsonb_build_object(
    'order',to_jsonb(sale),
    'customer',(select to_jsonb(profile)-'password' from public.profiles profile where profile.id=sale.customer_profile_id),
    'items',(select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at),'[]'::jsonb)
      from public.sales_order_items item where item.order_id=sale.id),
    'serials',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',serial.id,'sen_serial',serial.sen_serial,
      'manufacturer_serial',serial.manufacturer_serial,'product_id',serial.product_id,
      'order_item_id',snapshot_allocation.order_item_id
    ) order by snapshot_allocation.allocated_at),'[]'::jsonb)
      from public.order_serial_allocations snapshot_allocation
      join public.serial_numbers serial on serial.id=snapshot_allocation.serial_number_id
      where snapshot_allocation.order_id=sale.id
        and snapshot_allocation.status not in('released','cancelled')),
    'generated_at',now(),'revision_number',next_revision
  ) into document_snapshot;

  update public.sale_documents
  set status='superseded',superseded_at=now(),superseded_by=actor_profile_id,
    superseded_reason='Replaced by finalized revision '||next_revision
  where order_id=sale.id and document_type='invoice' and status='generated';

  insert into public.sale_documents(
    id,order_id,document_number,document_type,status,snapshot,generated_by,
    revision_number,finalization_idempotency_key
  ) values(
    document_id,sale.id,invoice_number,'invoice','generated',document_snapshot,
    actor_profile_id,next_revision,requested_operation_id
  );

  request_status:=case
    when released_quantity=0 then 'pending_release'
    when released_quantity>=required_quantity then 'fully_released'
    else 'partially_released' end;
  if stock_out_request_id is null then stock_out_request_id:=gen_random_uuid(); end if;
  insert into public.sales_stock_out_requests(
    id,request_number,sales_order_id,current_invoice_document_id,warehouse_id,
    customer_profile_id,status,current_revision_number,required_quantity,
    released_quantity,invoice_revision_pending,created_by,finalized_at
  ) values(
    stock_out_request_id,'STO-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6),
    sale.id,document_id,sale.fulfillment_warehouse_id,sale.customer_profile_id,
    request_status,next_revision,required_quantity,released_quantity,false,
    actor_profile_id,now()
  ) on conflict(sales_order_id) do update set
    current_invoice_document_id=excluded.current_invoice_document_id,
    warehouse_id=excluded.warehouse_id,
    customer_profile_id=excluded.customer_profile_id,
    status=excluded.status,
    current_revision_number=excluded.current_revision_number,
    required_quantity=excluded.required_quantity,
    released_quantity=excluded.released_quantity,
    invoice_revision_pending=false,
    finalized_at=now(),updated_at=now(),version=public.sales_stock_out_requests.version+1
  returning id into stock_out_request_id;

  insert into public.sales_stock_out_request_revisions(
    id,request_id,sale_document_id,revision_number,operation_id,
    invoice_number_snapshot,invoice_snapshot,required_quantity,
    released_quantity_at_revision,created_by
  ) values(
    request_revision_id,stock_out_request_id,document_id,next_revision,requested_operation_id,
    invoice_number,document_snapshot,required_quantity,released_quantity,actor_profile_id
  );

  for sale_item in
    select * from public.sales_order_items
    where order_id=sale.id
    order by created_at,id
  loop
    insert into public.sales_stock_out_request_items(
      request_id,sales_order_item_id,line_key,product_id,variation_id,warehouse_id,
      product_name_snapshot,sku_snapshot,serial_tracking_required,required_quantity,
      released_quantity,packed_quantity_snapshot,latest_revision_number
    ) values(
      stock_out_request_id,sale_item.id,sale_item.id::text,sale_item.product_id,sale_item.variation_id,
      sale_item.fulfillment_warehouse_id,sale_item.product_name_snapshot,sale_item.sku_snapshot,
      sale_item.serial_tracking_required_snapshot,sale_item.quantity,0,
      sale_item.packed_quantity,next_revision
    ) on conflict(request_id,sales_order_item_id) do update set
      product_id=excluded.product_id,variation_id=excluded.variation_id,
      warehouse_id=excluded.warehouse_id,product_name_snapshot=excluded.product_name_snapshot,
      sku_snapshot=excluded.sku_snapshot,
      serial_tracking_required=excluded.serial_tracking_required,
      required_quantity=excluded.required_quantity,
      packed_quantity_snapshot=excluded.packed_quantity_snapshot,
      latest_revision_number=excluded.latest_revision_number,updated_at=now()
    returning * into request_item;

    select coalesce(array_agg(revision_allocation.serial_number_id order by revision_allocation.allocated_at),'{}'::uuid[])
    into preassigned_serial_ids
    from public.order_serial_allocations revision_allocation
    where revision_allocation.order_item_id=sale_item.id
      and revision_allocation.status not in('released','cancelled');

    insert into public.sales_stock_out_request_revision_items(
      revision_id,request_item_id,sales_order_item_id,product_id,variation_id,
      warehouse_id,required_quantity,released_quantity,preassigned_serial_ids
    ) values(
      request_revision_id,request_item.id,sale_item.id,sale_item.product_id,
      sale_item.variation_id,sale_item.fulfillment_warehouse_id,sale_item.quantity,
      request_item.released_quantity,preassigned_serial_ids
    );
  end loop;

  for removed_request_item in
    select stock_item.*
    from public.sales_stock_out_request_items stock_item
    where stock_item.request_id=stock_out_request_id
      and stock_item.latest_revision_number=next_revision
      and stock_item.required_quantity=0
    order by stock_item.id
  loop
    insert into public.sales_stock_out_request_revision_items(
      revision_id,request_item_id,sales_order_item_id,product_id,variation_id,
      warehouse_id,required_quantity,released_quantity,preassigned_serial_ids
    ) values(
      request_revision_id,removed_request_item.id,removed_request_item.sales_order_item_id,
      removed_request_item.product_id,removed_request_item.variation_id,
      removed_request_item.warehouse_id,0,0,'{}'::uuid[]
    );
  end loop;

  -- The trigger temporarily marks the old revision pending; this transaction has
  -- now installed its matching immutable request revision.
  update public.sales_stock_out_requests
  set invoice_revision_pending=false,updated_at=now()
  where id=stock_out_request_id;

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values
  ) values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'sale.invoice_finalized','sales','sales_stock_out_request',stock_out_request_id::text,
    'Sales Invoice finalized and Stock Out request synchronized.',
    jsonb_build_object('order_id',sale.id,'document_id',document_id,'request_id',stock_out_request_id,
      'revision_number',next_revision,'required_quantity',required_quantity,
      'released_quantity',released_quantity)
  );
  return document_id;
end $$;

revoke all on function public.mark_stock_out_invoice_revision_pending()
  from public,anon,authenticated;
revoke all on function public.finalize_sale_invoice(uuid,uuid,uuid,bigint)
  from public,anon,authenticated;
grant execute on function public.finalize_sale_invoice(uuid,uuid,uuid,bigint)
  to service_role;

-- Backward-compatible entry point for an already-open client from before this
-- additive migration. New clients send the displayed request version above.
create or replace function public.finalize_sale_invoice(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  request_version bigint;
begin
  select coalesce(request.version,0) into request_version
  from public.sales_stock_out_requests request
  where request.sales_order_id=requested_order_id;
  request_version:=coalesce(request_version,0);
  return public.finalize_sale_invoice(
    actor_profile_id,requested_order_id,requested_operation_id,request_version
  );
end $$;

revoke all on function public.finalize_sale_invoice(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.finalize_sale_invoice(uuid,uuid,uuid)
  to service_role;

create or replace function public.confirm_sales_stock_out(
  actor_profile_id uuid,
  requested_request_id uuid,
  requested_operation_id uuid,
  requested_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  request public.sales_stock_out_requests%rowtype;
  request_item public.sales_stock_out_request_items%rowtype;
  revision public.sales_stock_out_request_revisions%rowtype;
  sale_item public.sales_order_items%rowtype;
  balance public.inventory_balances%rowtype;
  reservation public.inventory_reservations%rowtype;
  serial public.serial_numbers%rowtype;
  allocation public.order_serial_allocations%rowtype;
  existing_release public.sales_stock_out_releases%rowtype;
  item_entry jsonb;
  request_version bigint;
  request_item_id uuid;
  quantity_to_release numeric;
  selected_serial_ids uuid[];
  selected_serial_id uuid;
  selected_serial_count integer;
  preassigned_serial_count integer;
  payload_item_count integer;
  release_id uuid:=gen_random_uuid();
  release_item_id uuid;
  movement_id uuid:=gen_random_uuid();
  movement_item_id uuid;
  total_quantity numeric:=0;
  packed_quantity numeric;
  previous_physical numeric;
  previous_reserved numeric;
  remaining_after numeric;
  release_status text;
begin
  if requested_operation_id is null then
    raise exception 'A valid Stock Out operation ID is required';
  end if;
  perform public.assert_actor_permission(actor_profile_id,'inventory.release_sales_stock');
  select * into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.role<>'employee' or actor.status<>'active' then
    raise exception 'An active employee account is required for Stock Out';
  end if;

  -- One operation token has one permanent result, even across browser retries.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_operation_id::text,0)
  );
  select * into existing_release
  from public.sales_stock_out_releases
  where operation_id=requested_operation_id;
  if existing_release.id is not null then
    if existing_release.request_id<>requested_request_id then
      raise exception 'This Stock Out operation belongs to another request';
    end if;
    return existing_release.id;
  end if;

  select * into request
  from public.sales_stock_out_requests
  where id=requested_request_id
  for update;
  if request.id is null then raise exception 'Stock Out request not found'; end if;
  if request.status not in('pending_release','partially_released') then
    raise exception 'This Stock Out request has already been updated or completed. Please refresh the request.';
  end if;
  if request.invoice_revision_pending then
    raise exception 'The latest Sales Invoice revision must be finalized before Stock Out';
  end if;
  if not exists(
    select 1 from public.profile_warehouse_assignments assignment
    join public.warehouses warehouse on warehouse.id=assignment.warehouse_id
    where assignment.profile_id=actor_profile_id
      and assignment.warehouse_id=request.warehouse_id
      and assignment.is_active and assignment.ended_at is null
      and warehouse.is_active
  ) then
    raise exception 'The employee is not actively assigned to this warehouse';
  end if;

  if jsonb_typeof(requested_items)<>'object'
    or jsonb_typeof(requested_items->'items')<>'array'
  then
    raise exception 'Stock Out release details are invalid';
  end if;
  begin
    request_version:=(requested_items->>'request_version')::bigint;
  exception when others then
    raise exception 'A valid Stock Out request version is required';
  end;
  if request_version is distinct from request.version then
    raise exception 'This Stock Out request has already been updated. Please refresh the request.';
  end if;

  select count(*) into payload_item_count
  from jsonb_array_elements(requested_items->'items');
  if payload_item_count=0 then raise exception 'At least one product must be released'; end if;
  if payload_item_count<>(
    select count(distinct value->>'request_item_id')
    from jsonb_array_elements(requested_items->'items')
  ) then
    raise exception 'A Stock Out product cannot be submitted more than once';
  end if;

  select * into revision
  from public.sales_stock_out_request_revisions
  where request_id=request.id and revision_number=request.current_revision_number
  for update;
  if revision.id is null then raise exception 'The current Stock Out revision is unavailable'; end if;

  -- Validate the basic shape before creating any authoritative rows.
  for item_entry in select value from jsonb_array_elements(requested_items->'items')
  loop
    begin
      request_item_id:=(item_entry->>'request_item_id')::uuid;
      quantity_to_release:=(item_entry->>'quantity')::numeric;
    exception when others then
      raise exception 'A Stock Out product quantity is invalid';
    end;
    if quantity_to_release<=0 or quantity_to_release<>trunc(quantity_to_release) then
      raise exception 'Stock Out quantity must be a positive whole number';
    end if;
    total_quantity:=total_quantity+quantity_to_release;
  end loop;

  insert into public.inventory_movements(
    movement_type,id,reference,status,source_warehouse_id,notes,
    initiated_by,confirmed_at
  ) values(
    'stock_out',movement_id,
    'STO-MV-'||upper(substr(replace(movement_id::text,'-',''),1,12)),
    'confirmed',request.warehouse_id,
    'Physical release for Sales Invoice '||revision.invoice_number_snapshot,
    actor_profile_id,now()
  );
  insert into public.sales_stock_out_releases(
    id,request_id,request_revision_id,sales_order_id,sale_document_id,
    warehouse_id,customer_profile_id,operation_id,movement_id,
    invoice_number_snapshot,quantity_released,released_by,released_by_name,released_at
  ) values(
    release_id,request.id,revision.id,request.sales_order_id,revision.sale_document_id,
    request.warehouse_id,request.customer_profile_id,requested_operation_id,movement_id,
    revision.invoice_number_snapshot,total_quantity,actor_profile_id,
    coalesce(nullif(actor.full_name,''),actor.email,'Employee'),now()
  );

  for item_entry in select value from jsonb_array_elements(requested_items->'items')
  loop
    request_item_id:=(item_entry->>'request_item_id')::uuid;
    quantity_to_release:=(item_entry->>'quantity')::numeric;
    selected_serial_ids:=array(
      select value::uuid
      from jsonb_array_elements_text(coalesce(item_entry->'serial_ids','[]'::jsonb))
      order by value
    );

    select * into request_item
    from public.sales_stock_out_request_items
    where id=request_item_id and request_id=request.id
    for update;
    if request_item.id is null then raise exception 'Stock Out request product not found'; end if;
    if quantity_to_release>request_item.remaining_quantity then
      raise exception 'Release quantity exceeds the remaining quantity for %',request_item.product_name_snapshot;
    end if;

    select * into sale_item
    from public.sales_order_items
    where id=request_item.sales_order_item_id and order_id=request.sales_order_id
    for update;
    if sale_item.id is null then raise exception 'The finalized invoice product is unavailable'; end if;
    packed_quantity:=sale_item.packed_quantity-request_item.released_quantity;
    if packed_quantity<quantity_to_release then
      raise exception '% has only % packed unit(s) eligible for release',request_item.product_name_snapshot,greatest(packed_quantity,0);
    end if;

    select * into balance
    from public.inventory_balances
    where warehouse_id=request.warehouse_id
      and product_id=request_item.product_id
      and variation_id is not distinct from request_item.variation_id
      and location_id is null
    for update;
    if balance.id is null then raise exception 'Physical inventory balance was not found'; end if;
    if balance.on_hand<quantity_to_release then
      raise exception 'Insufficient physical stock for %',request_item.product_name_snapshot;
    end if;
    if balance.reserved<quantity_to_release then
      raise exception 'Insufficient reserved stock for %',request_item.product_name_snapshot;
    end if;

    select * into reservation
    from public.inventory_reservations
    where order_item_id=request_item.sales_order_item_id and status='active'
    for update;
    if reservation.id is null or reservation.quantity<quantity_to_release then
      raise exception 'The active Sales reservation is insufficient for %',request_item.product_name_snapshot;
    end if;

    if request_item.serial_tracking_required then
      selected_serial_count:=coalesce(array_length(selected_serial_ids,1),0);
      if selected_serial_count<>quantity_to_release::integer
        or selected_serial_count<>(select count(distinct id) from unnest(selected_serial_ids) id)
      then
        raise exception 'Exactly % unique eligible SEN Serial Number(s) must be selected',quantity_to_release;
      end if;

      -- Lock serials in one stable order to avoid cross-employee deadlocks.
      perform id from public.serial_numbers
      where id=any(selected_serial_ids)
      order by id
      for update;
      if (select count(*) from public.serial_numbers where id=any(selected_serial_ids))<>selected_serial_count then
        raise exception 'One or more selected SEN Serial Numbers no longer exist';
      end if;

      foreach selected_serial_id in array selected_serial_ids
      loop
        select * into serial from public.serial_numbers where id=selected_serial_id;
        if serial.product_id is distinct from request_item.product_id then
          raise exception 'Selected SEN Serial does not belong to the invoice product';
        end if;
        if serial.variation_id is distinct from request_item.variation_id then
          raise exception 'Selected SEN Serial does not belong to the invoice variation';
        end if;
        if serial.warehouse_id is distinct from request.warehouse_id then
          raise exception 'Selected SEN Serial is not physically in the request warehouse';
        end if;
        if serial.status not in('available','reserved','allocated','packed')
          or lower(coalesce(serial.condition,'')) in('damaged','unavailable','quarantined','lost','disposed')
        then
          raise exception 'SEN Serial % is damaged, unavailable, quarantined, or otherwise ineligible',coalesce(serial.sen_serial,serial.id::text);
        end if;
        if exists(
          select 1
          from public.sales_stock_out_release_serials released
          where released.serial_number_id=serial.id
            and not exists(
              select 1 from public.rma_return_receipt_serials returned
              where returned.original_release_serial_id=released.id
            )
        ) then
          raise exception 'SEN Serial % has already been physically released',coalesce(serial.sen_serial,serial.id::text);
        end if;
        if exists(
          select 1 from public.order_serial_allocations conflict
          where conflict.serial_number_id=serial.id
            and conflict.order_item_id<>request_item.sales_order_item_id
            and conflict.status in('active','packed','warehouse_released','shipped')
        ) then
          raise exception 'SEN Serial % is assigned to another transaction',coalesce(serial.sen_serial,serial.id::text);
        end if;
      end loop;

      select count(*) into preassigned_serial_count
      from public.order_serial_allocations assigned
      where assigned.order_item_id=request_item.sales_order_item_id
        and assigned.status in('active','packed');
      if preassigned_serial_count>0 and (
        select count(*)
        from public.order_serial_allocations assigned
        where assigned.order_item_id=request_item.sales_order_item_id
          and assigned.status in('active','packed')
          and assigned.serial_number_id=any(selected_serial_ids)
      )<>selected_serial_count then
        raise exception 'Use only SEN Serials assigned to this finalized invoice. Use Change/Replace Serial for substitutions.';
      end if;
    elsif coalesce(array_length(selected_serial_ids,1),0)>0 then
      raise exception 'SEN Serial Numbers cannot be attached to a non-serialized product';
    end if;

    previous_physical:=balance.on_hand;
    previous_reserved:=balance.reserved;
    update public.inventory_balances
    set on_hand=on_hand-quantity_to_release,
      reserved=reserved-quantity_to_release,
      updated_at=now()
    where id=balance.id;

    if reservation.quantity=quantity_to_release then
      update public.inventory_reservations
      set status='consumed',updated_at=now()
      where id=reservation.id;
    else
      update public.inventory_reservations
      set quantity=quantity-quantity_to_release,updated_at=now()
      where id=reservation.id;
    end if;

    insert into public.inventory_movement_items(
      quantity_delta,movement_id,product_id,variation_id,warehouse_id,balance_after
    ) values(
      -quantity_to_release,movement_id,request_item.product_id,
      request_item.variation_id,request.warehouse_id,previous_physical-quantity_to_release
    ) returning id into movement_item_id;

    insert into public.sales_stock_out_release_items(
      release_id,request_item_id,inventory_movement_item_id,product_id,
      variation_id,warehouse_id,quantity_released,previous_physical_quantity,
      new_physical_quantity,previous_reserved_quantity,new_reserved_quantity
    ) values(
      release_id,request_item.id,movement_item_id,request_item.product_id,
      request_item.variation_id,request.warehouse_id,quantity_to_release,
      previous_physical,previous_physical-quantity_to_release,
      previous_reserved,previous_reserved-quantity_to_release
    ) returning id into release_item_id;

    if request_item.serial_tracking_required then
      foreach selected_serial_id in array selected_serial_ids
      loop
        select * into serial from public.serial_numbers where id=selected_serial_id for update;
        select * into allocation
        from public.order_serial_allocations
        where serial_number_id=serial.id
          and order_item_id=request_item.sales_order_item_id
          and status in('active','packed')
        for update;
        if allocation.id is null then
          insert into public.order_serial_allocations(
            order_id,order_item_id,serial_number_id,warehouse_id,status,
            allocation_method,allocated_by,released_by,released_at
          ) values(
            request.sales_order_id,request_item.sales_order_item_id,serial.id,
            request.warehouse_id,'warehouse_released','scan',actor_profile_id,
            actor_profile_id,now()
          ) returning * into allocation;
        else
          update public.order_serial_allocations
          set status='warehouse_released',released_by=actor_profile_id,released_at=now()
          where id=allocation.id;
        end if;

        update public.serial_numbers
        set status='warehouse_released',last_movement_id=movement_id,updated_at=now()
        where id=serial.id;
        insert into public.serial_number_history(
          serial_number_id,event_type,previous_status,new_status,
          previous_warehouse_id,new_warehouse_id,movement_id,reason,actor_id
        ) values(
          serial.id,'stock_out',serial.status,'warehouse_released',
          request.warehouse_id,request.warehouse_id,movement_id,
          'Released for Sales Invoice '||revision.invoice_number_snapshot,actor_profile_id
        );
        insert into public.sales_stock_out_release_serials(
          release_item_id,serial_number_id,allocation_id,sen_serial_snapshot,
          manufacturer_serial_snapshot,previous_status,new_status
        ) values(
          release_item_id,serial.id,allocation.id,coalesce(serial.sen_serial,serial.id::text),
          serial.manufacturer_serial,serial.status,'warehouse_released'
        );
      end loop;
    end if;

    update public.sales_stock_out_request_items
    set released_quantity=released_quantity+quantity_to_release,updated_at=now()
    where id=request_item.id;
  end loop;

  remaining_after:=request.required_quantity-(request.released_quantity+total_quantity);
  release_status:=case
    when remaining_after=0 then 'fully_released'
    when request.released_quantity+total_quantity>0 then 'partially_released'
    else 'pending_release'
  end;
  update public.sales_stock_out_requests
  set released_quantity=released_quantity+total_quantity,
    status=release_status,version=version+1,updated_at=now()
  where id=request.id;

  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,
    entity_id,description,new_values
  ) values(
    actor_profile_id,actor.role,request.customer_profile_id,
    'sale.stock_out_confirmed','inventory','sales_stock_out_release',release_id::text,
    'Sales Invoice products were physically released from the warehouse.',
    jsonb_build_object('request_id',request.id,'sales_order_id',request.sales_order_id,
      'warehouse_id',request.warehouse_id,'invoice_number',revision.invoice_number_snapshot,
      'quantity_released',total_quantity,'request_status',release_status)
  );
  return release_id;
end $$;

create or replace function public.replace_stock_out_serial(
  actor_profile_id uuid,
  requested_request_item_id uuid,
  requested_previous_serial_id uuid,
  requested_replacement_serial_id uuid,
  requested_reason text,
  requested_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  request_item public.sales_stock_out_request_items%rowtype;
  request public.sales_stock_out_requests%rowtype;
  previous_serial public.serial_numbers%rowtype;
  replacement_serial public.serial_numbers%rowtype;
  allocation public.order_serial_allocations%rowtype;
  existing_change_id uuid;
  change_id uuid:=gen_random_uuid();
  replacement_status text;
  previous_result_status text;
begin
  if requested_operation_id is null then raise exception 'A valid serial replacement operation ID is required'; end if;
  if requested_previous_serial_id=requested_replacement_serial_id then raise exception 'Choose a different replacement SEN Serial'; end if;
  if length(btrim(coalesce(requested_reason,'')))<3 then raise exception 'A replacement reason is required'; end if;
  perform public.assert_actor_permission(actor_profile_id,'inventory.release_sales_stock');
  select * into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.role<>'employee' or actor.status<>'active' then
    raise exception 'An active employee account is required for serial replacement';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_operation_id::text,0));
  select id into existing_change_id from public.sales_stock_out_serial_changes where operation_id=requested_operation_id;
  if existing_change_id is not null then return existing_change_id; end if;

  select * into request_item from public.sales_stock_out_request_items
  where id=requested_request_item_id for update;
  if request_item.id is null or not request_item.serial_tracking_required then
    raise exception 'Serialized Stock Out request product not found';
  end if;
  select * into request from public.sales_stock_out_requests
  where id=request_item.request_id for update;
  if request.status not in('pending_release','partially_released') or request.invoice_revision_pending then
    raise exception 'This Stock Out request cannot accept a serial replacement';
  end if;
  if not exists(
    select 1 from public.profile_warehouse_assignments assignment
    join public.warehouses warehouse on warehouse.id=assignment.warehouse_id
    where assignment.profile_id=actor_profile_id and assignment.warehouse_id=request.warehouse_id
      and assignment.is_active and assignment.ended_at is null and warehouse.is_active
  ) then raise exception 'The employee is not actively assigned to this warehouse'; end if;

  perform id from public.serial_numbers
  where id in(requested_previous_serial_id,requested_replacement_serial_id)
  order by id for update;
  select * into previous_serial from public.serial_numbers where id=requested_previous_serial_id;
  select * into replacement_serial from public.serial_numbers where id=requested_replacement_serial_id;
  if previous_serial.id is null or replacement_serial.id is null then raise exception 'SEN Serial not found'; end if;
  if exists(
    select 1 from public.sales_stock_out_release_serials released
    where released.serial_number_id=previous_serial.id
      and not exists(
        select 1 from public.rma_return_receipt_serials returned
        where returned.original_release_serial_id=released.id
      )
  ) then
    raise exception 'The assigned SEN Serial has already been physically released and cannot be replaced';
  end if;
  select * into allocation from public.order_serial_allocations
  where serial_number_id=previous_serial.id
    and order_item_id=request_item.sales_order_item_id
    and status in('active','packed')
  for update;
  if allocation.id is null then raise exception 'The previous SEN Serial is not actively assigned to this invoice'; end if;
  if replacement_serial.product_id is distinct from request_item.product_id
    or replacement_serial.variation_id is distinct from request_item.variation_id
    or replacement_serial.warehouse_id is distinct from request.warehouse_id
  then raise exception 'Replacement SEN Serial must match the product, variation, and warehouse'; end if;
  if replacement_serial.status not in('available','reserved','allocated','packed')
    or lower(coalesce(replacement_serial.condition,'')) in('damaged','unavailable','quarantined','lost','disposed')
  then raise exception 'Replacement SEN Serial is damaged, unavailable, quarantined, or otherwise ineligible'; end if;
  if exists(
    select 1 from public.sales_stock_out_release_serials released
    where released.serial_number_id=replacement_serial.id
      and not exists(
        select 1 from public.rma_return_receipt_serials returned
        where returned.original_release_serial_id=released.id
      )
  )
    or exists(
      select 1 from public.order_serial_allocations conflict
      where conflict.serial_number_id=replacement_serial.id
        and conflict.status in('active','packed','warehouse_released','shipped')
    )
  then raise exception 'Replacement SEN Serial is already assigned or physically released'; end if;

  replacement_status:=case when allocation.status='packed' then 'packed' else 'allocated' end;
  previous_result_status:=case lower(coalesce(previous_serial.condition,''))
    when 'damaged' then 'damaged'
    when 'unavailable' then 'unavailable'
    when 'quarantined' then 'quarantined'
    when 'lost' then 'lost'
    when 'disposed' then 'disposed'
    else case
      when previous_serial.status in('reserved','allocated','packed') then 'available'
      else previous_serial.status
    end
  end;
  update public.order_serial_allocations
  set serial_number_id=replacement_serial.id,allocation_method='replacement'
  where id=allocation.id;
  update public.shipment_serials shipment_serial
  set serial_number_id=replacement_serial.id
  from public.shipment_items shipment_item
  join public.shipments shipment on shipment.id=shipment_item.shipment_id
  where shipment_serial.shipment_item_id=shipment_item.id
    and shipment_serial.allocation_id=allocation.id
    and shipment_serial.serial_number_id=previous_serial.id
    and shipment.status in('draft','confirmed','packing','ready');
  update public.serial_numbers set status=previous_result_status,updated_at=now() where id=previous_serial.id;
  update public.serial_numbers set status=replacement_status,updated_at=now() where id=replacement_serial.id;
  insert into public.serial_number_history(
    serial_number_id,event_type,previous_status,new_status,previous_warehouse_id,
    new_warehouse_id,reason,actor_id
  ) values
    (previous_serial.id,'stock_out_serial_replaced',previous_serial.status,previous_result_status,
      request.warehouse_id,request.warehouse_id,left(requested_reason,1000),actor_profile_id),
    (replacement_serial.id,'stock_out_serial_selected',replacement_serial.status,replacement_status,
      request.warehouse_id,request.warehouse_id,left(requested_reason,1000),actor_profile_id);
  insert into public.sales_stock_out_serial_changes(
    id,request_item_id,operation_id,previous_serial_number_id,
    replacement_serial_number_id,reason,changed_by
  ) values(
    change_id,request_item.id,requested_operation_id,previous_serial.id,
    replacement_serial.id,left(btrim(requested_reason),1000),actor_profile_id
  );
  return change_id;
end $$;

revoke all on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated;
revoke all on function public.replace_stock_out_serial(uuid,uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  to service_role;
grant execute on function public.replace_stock_out_serial(uuid,uuid,uuid,uuid,text,uuid)
  to service_role;

-- Shipment dispatch is logistics-only. The physical quantity and reservation
-- were already consumed by confirm_sales_stock_out and must never move twice.
create or replace function public.dispatch_order_shipment(actor_profile_id uuid,requested_shipment_id uuid) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  shipment public.shipments%rowtype;
  sale public.sales_orders%rowtype;
  shipment_item public.shipment_items%rowtype;
  sale_item public.sales_order_items%rowtype;
  allocation public.order_serial_allocations%rowtype;
  serial_count integer;
  released_total numeric;
  returned_total numeric;
  status_id uuid;
begin
  perform public.assert_actor_permission(actor_profile_id,'shipments.confirm_dispatch');
  select * into shipment from public.shipments
  where id=requested_shipment_id for update;
  if shipment.id is null or shipment.status not in('confirmed','ready') then
    raise exception 'Shipment is not ready for dispatch';
  end if;
  select * into sale from public.sales_orders
  where id=shipment.order_id for update;
  if sale.id is null then raise exception 'Shipment sale was not found'; end if;
  if sale.status='cancelled' then
    raise exception 'A cancelled Sales Invoice cannot be dispatched';
  end if;

  for shipment_item in
    select * from public.shipment_items
    where shipment_id=shipment.id order by id for update
  loop
    select * into sale_item from public.sales_order_items
    where id=shipment_item.order_item_id and order_id=shipment.order_id
    for update;
    if sale_item.id is null or sale_item.shipped_quantity+shipment_item.quantity>sale_item.quantity then
      raise exception 'Shipment exceeds remaining order quantity';
    end if;
    select coalesce(sum(release_item.quantity_released),0)
    into released_total
    from public.sales_stock_out_release_items release_item
    join public.sales_stock_out_request_items request_item
      on request_item.id=release_item.request_item_id
    join public.sales_stock_out_releases release
      on release.id=release_item.release_id and release.status='confirmed'
    where request_item.sales_order_item_id=sale_item.id;
    select coalesce(sum(receipt.quantity_received),0)
    into returned_total
    from public.rma_return_receipts receipt
    join public.sales_stock_out_release_items returned_release_item
      on returned_release_item.id=receipt.stock_out_release_item_id
    join public.sales_stock_out_request_items returned_request_item
      on returned_request_item.id=returned_release_item.request_item_id
    where receipt.status='confirmed'
      and returned_request_item.sales_order_item_id=sale_item.id;
    if released_total-returned_total<sale_item.shipped_quantity+shipment_item.quantity then
      raise exception 'This product has not yet been released from inventory. Complete Stock Out before shipment dispatch.';
    end if;

    if sale_item.serial_tracking_required_snapshot then
      select count(*) into serial_count
      from public.shipment_serials shipment_serial
      join public.order_serial_allocations serial_allocation
        on serial_allocation.id=shipment_serial.allocation_id
      join public.sales_stock_out_release_serials released_serial
        on released_serial.serial_number_id=shipment_serial.serial_number_id
      join public.sales_stock_out_release_items released_item
        on released_item.id=released_serial.release_item_id
      join public.sales_stock_out_request_items requested_item
        on requested_item.id=released_item.request_item_id
      where shipment_serial.shipment_item_id=shipment_item.id
        and serial_allocation.status='warehouse_released'
        and requested_item.sales_order_item_id=sale_item.id;
      if serial_count<>shipment_item.quantity::integer then
        raise exception 'This product has not yet been released from inventory. Complete Stock Out before shipment dispatch.';
      end if;
      for allocation in
        select serial_allocation.*
        from public.shipment_serials shipment_serial
        join public.order_serial_allocations serial_allocation
          on serial_allocation.id=shipment_serial.allocation_id
        where shipment_serial.shipment_item_id=shipment_item.id
          and serial_allocation.status='warehouse_released'
        order by serial_allocation.id
        for update of serial_allocation
      loop
        update public.order_serial_allocations
        set status='shipped',shipped_at=now()
        where id=allocation.id and status='warehouse_released';
        if not found then
          raise exception 'A released SEN Serial was already processed. Refresh the shipment.';
        end if;
        update public.serial_numbers
        set status='shipped',updated_at=now()
        where id=allocation.serial_number_id and status='warehouse_released';
        if not found then
          raise exception 'A released SEN Serial is no longer eligible for dispatch';
        end if;
      end loop;
    end if;

    update public.sales_order_items
    set shipped_quantity=shipped_quantity+shipment_item.quantity,updated_at=now()
    where id=sale_item.id;
  end loop;

  select id into status_id from public.tracking_status_definitions
  where key=case
    when shipment.transport_mode='air' then 'departed_china_by_air'
    when shipment.transport_mode='sea' then 'departed_china_by_sea'
    else 'in_transit_to_customer'
  end and is_active limit 1;
  update public.shipments set status='dispatched',actual_departure_at=now(),
    dispatched_at=now(),latest_tracking_status_id=status_id,
    latest_location_snapshot=origin_snapshot,updated_by=actor_profile_id,updated_at=now()
  where id=shipment.id;
  if status_id is not null then
    insert into public.shipment_tracking_events(
      shipment_id,order_id,tracking_status_id,actor_profile_id,location_snapshot,
      latitude,longitude,location_source,transport_mode_snapshot,
      customer_visible_title,customer_visible_message,event_visibility,occurred_at
    ) values(
      shipment.id,shipment.order_id,status_id,actor_profile_id,shipment.origin_snapshot,
      (shipment.origin_snapshot->>'latitude')::numeric,
      (shipment.origin_snapshot->>'longitude')::numeric,'system',shipment.transport_mode,
      'Shipment dispatched','Your shipment has departed the origin location.','both',now()
    );
  end if;
  perform public.derive_sales_order_status(shipment.order_id);
end $$;

revoke all on function public.dispatch_order_shipment(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.dispatch_order_shipment(uuid,uuid)
  to service_role;

-- Cancellation reverses reservations only. A prior physical release must have
-- an equal confirmed physical return before the commercial record can close.
create or replace function public.cancel_sales_order(actor_profile_id uuid,requested_order_id uuid,requested_reason text) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  request public.sales_stock_out_requests%rowtype;
  reservation public.inventory_reservations%rowtype;
  allocation public.order_serial_allocations%rowtype;
  cancelled_serial public.serial_numbers%rowtype;
  cancelled_serial_result_status text;
  released_total numeric:=0;
  returned_total numeric:=0;
begin
  perform public.assert_actor_permission(actor_profile_id,'orders.cancel');
  select * into sale from public.sales_orders
  where id=requested_order_id for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  if sale.status='cancelled' then raise exception 'This sale is already cancelled'; end if;

  select * into request from public.sales_stock_out_requests
  where sales_order_id=sale.id for update;
  if request.id is not null then
    perform id from public.sales_stock_out_releases
    where request_id=request.id order by id for update;
    select coalesce(sum(quantity_released),0) into released_total
    from public.sales_stock_out_releases
    where request_id=request.id and status='confirmed';
    perform id from public.rma_return_receipts
    where stock_out_request_id=request.id order by id for update;
    select coalesce(sum(quantity_received),0) into returned_total
    from public.rma_return_receipts
    where stock_out_request_id=request.id and status='confirmed';
    if released_total>returned_total then
      raise exception 'This Sales Invoice has physically released products. Complete a proper physical return through RMA before cancellation.';
    end if;
  elsif sale.status in('shipped','partially_shipped','delivered') then
    raise exception 'Dispatched sales cannot be cancelled without a proper physical return';
  end if;

  for reservation in
    select * from public.inventory_reservations
    where order_id=sale.id and status='active'
    order by id for update
  loop
    update public.inventory_balances
    set reserved=greatest(reserved-reservation.quantity,0),updated_at=now()
    where warehouse_id=reservation.warehouse_id
      and product_id=reservation.product_id
      and variation_id is not distinct from reservation.variation_id
      and location_id is null;
    if not found then raise exception 'Reserved inventory balance was not found'; end if;
    update public.inventory_reservations
    set status='cancelled',released_at=now(),updated_at=now()
    where id=reservation.id;
  end loop;

  for allocation in
    select * from public.order_serial_allocations
    where order_id=sale.id and status in('active','packed')
    order by id for update
  loop
    select * into cancelled_serial from public.serial_numbers
    where id=allocation.serial_number_id for update;
    cancelled_serial_result_status:=case lower(coalesce(cancelled_serial.condition,''))
      when 'damaged' then 'damaged'
      when 'unavailable' then 'unavailable'
      when 'quarantined' then 'quarantined'
      when 'lost' then 'lost'
      when 'disposed' then 'disposed'
      else case
        when cancelled_serial.status in('allocated','packed','reserved') then 'available'
        else cancelled_serial.status
      end
    end;
    update public.serial_numbers
    set status=cancelled_serial_result_status,updated_at=now()
    where id=allocation.serial_number_id;
    insert into public.serial_number_history(
      serial_number_id,event_type,previous_status,new_status,
      previous_warehouse_id,new_warehouse_id,reason,actor_id
    ) values(
      cancelled_serial.id,'sale_cancelled_serial_released',cancelled_serial.status,
      cancelled_serial_result_status,cancelled_serial.warehouse_id,
      cancelled_serial.warehouse_id,left(requested_reason,500),actor_profile_id
    );
    update public.order_serial_allocations
    set status='cancelled',released_by=actor_profile_id,released_at=now(),
      release_reason=left(requested_reason,500)
    where id=allocation.id;
  end loop;

  if request.id is not null then
    update public.sales_stock_out_requests
    set status='cancelled',cancelled_at=now(),cancelled_by=actor_profile_id,
      cancellation_reason=left(requested_reason,1000),updated_at=now(),version=version+1
    where id=request.id;
  end if;
  update public.sales_orders
  set status='cancelled',cancelled_at=now(),updated_by=actor_profile_id,updated_at=now()
  where id=sale.id;
  insert into public.order_status_events(
    order_id,old_status,new_status,actor_profile_id,note
  ) values(sale.id,sale.status,'cancelled',actor_profile_id,left(requested_reason,1000));
end $$;

create or replace function public.confirm_physical_return_receipt(
  actor_profile_id uuid,
  requested_claim_id uuid,
  requested_release_item_id uuid,
  requested_operation_id uuid,
  requested_quantity numeric,
  requested_serial_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  claim public.rma_claims%rowtype;
  release_item public.sales_stock_out_release_items%rowtype;
  release public.sales_stock_out_releases%rowtype;
  request_item public.sales_stock_out_request_items%rowtype;
  request public.sales_stock_out_requests%rowtype;
  balance public.inventory_balances%rowtype;
  serial public.serial_numbers%rowtype;
  original_release_serial public.sales_stock_out_release_serials%rowtype;
  existing_receipt public.rma_return_receipts%rowtype;
  receipt_id uuid:=gen_random_uuid();
  movement_id uuid:=gen_random_uuid();
  movement_item_id uuid;
  already_returned numeric:=0;
  claim_already_returned numeric:=0;
  returnable numeric;
  serialized_count integer;
  serial_id uuid;
  claim_received_total numeric;
  next_claim_status text;
begin
  if requested_operation_id is null then raise exception 'A valid physical return operation ID is required'; end if;
  if requested_quantity<=0 or requested_quantity<>trunc(requested_quantity) then
    raise exception 'Physical return quantity must be a positive whole number';
  end if;
  perform public.assert_actor_permission(actor_profile_id,'rma.receive');
  select * into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.role<>'employee' or actor.status<>'active' then
    raise exception 'An active employee account is required to receive a physical return';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_operation_id::text,0));
  select * into existing_receipt from public.rma_return_receipts
  where operation_id=requested_operation_id;
  if existing_receipt.id is not null then
    if existing_receipt.rma_claim_id<>requested_claim_id
      or existing_receipt.stock_out_release_item_id<>requested_release_item_id
    then raise exception 'This physical return operation belongs to another receipt'; end if;
    return existing_receipt.id;
  end if;

  select * into claim from public.rma_claims
  where id=requested_claim_id for update;
  if claim.id is null then raise exception 'RMA claim not found'; end if;
  if claim.status not in('return_requested','product_received') then
    raise exception 'The RMA claim is not ready for physical return receipt';
  end if;
  select * into release_item from public.sales_stock_out_release_items
  where id=requested_release_item_id for update;
  if release_item.id is null then raise exception 'Original Stock Out release item not found'; end if;
  select * into release from public.sales_stock_out_releases
  where id=release_item.release_id and status='confirmed' for update;
  select * into request_item from public.sales_stock_out_request_items
  where id=release_item.request_item_id for update;
  select * into request from public.sales_stock_out_requests
  where id=request_item.request_id for update;
  if release.id is null or request_item.id is null or request.id is null
    or release.sales_order_id<>claim.sales_order_id
    or request_item.sales_order_item_id<>claim.sales_order_item_id
    or release_item.product_id<>claim.product_id
    or release_item.variation_id is distinct from claim.variation_id
  then raise exception 'RMA claim does not match the original physical Stock Out release'; end if;
  if not exists(
    select 1 from public.profile_warehouse_assignments assignment
    join public.warehouses warehouse on warehouse.id=assignment.warehouse_id
    where assignment.profile_id=actor_profile_id
      and assignment.warehouse_id=release_item.warehouse_id
      and assignment.is_active and assignment.ended_at is null and warehouse.is_active
  ) then raise exception 'The employee is not actively assigned to this return warehouse'; end if;

  perform id from public.rma_return_receipts
  where stock_out_release_item_id=release_item.id order by id for update;
  select coalesce(sum(quantity_received),0) into already_returned
  from public.rma_return_receipts
  where stock_out_release_item_id=release_item.id and status='confirmed';
  select coalesce(sum(quantity_received),0) into claim_already_returned
  from public.rma_return_receipts
  where rma_claim_id=claim.id and status='confirmed';
  returnable:=least(
    release_item.quantity_released-already_returned,
    claim.quantity-claim_already_returned
  );
  if requested_quantity>returnable then
    raise exception 'Return quantity exceeds the % unit(s) still returnable for this original release',greatest(returnable,0);
  end if;

  select count(*) into serialized_count
  from public.sales_stock_out_release_serials
  where release_item_id=release_item.id;
  if serialized_count>0 then
    if coalesce(array_length(requested_serial_ids,1),0)<>requested_quantity::integer
      or (select count(distinct id) from unnest(requested_serial_ids) id)<>requested_quantity::integer
    then raise exception 'Exactly one original SEN Serial is required for every physically returned unit'; end if;
    perform id from public.serial_numbers
    where id=any(requested_serial_ids) order by id for update;
    if (
      select count(*) from public.sales_stock_out_release_serials original
      where original.release_item_id=release_item.id
        and original.serial_number_id=any(requested_serial_ids)
        and not exists(
          select 1 from public.rma_return_receipt_serials received
          where received.original_release_serial_id=original.id
        )
    )<>requested_quantity::integer then
      raise exception 'Every returned SEN Serial must be an unreturned serial from the original Stock Out';
    end if;
    if claim.serial_number_id is not null and not claim.serial_number_id=any(requested_serial_ids) then
      raise exception 'The returned SEN Serial does not match this RMA claim';
    end if;
  elsif coalesce(array_length(requested_serial_ids,1),0)>0 then
    raise exception 'This non-serialized return cannot contain SEN Serial Numbers';
  end if;

  select * into balance from public.inventory_balances
  where warehouse_id=release_item.warehouse_id
    and product_id=release_item.product_id
    and variation_id is not distinct from release_item.variation_id
    and location_id is null for update;
  if balance.id is null then raise exception 'Return warehouse inventory balance not found'; end if;

  insert into public.inventory_movements(
    movement_type,id,reference,status,destination_warehouse_id,notes,
    initiated_by,confirmed_at
  ) values(
    'customer_return',movement_id,
    'RET-MV-'||upper(substr(replace(movement_id::text,'-',''),1,12)),
    'confirmed',release_item.warehouse_id,
    'Physical customer return for RMA '||claim.rma_number,actor_profile_id,now()
  );
  update public.inventory_balances
  set on_hand=on_hand+requested_quantity,
    unavailable=unavailable+requested_quantity,
    updated_at=now()
  where id=balance.id;
  insert into public.inventory_movement_items(
    quantity_delta,movement_id,product_id,variation_id,warehouse_id,balance_after
  ) values(
    requested_quantity,movement_id,release_item.product_id,release_item.variation_id,
    release_item.warehouse_id,balance.on_hand+requested_quantity
  ) returning id into movement_item_id;
  insert into public.rma_return_receipts(
    id,rma_claim_id,stock_out_request_id,stock_out_release_id,
    stock_out_release_item_id,sales_order_id,warehouse_id,operation_id,
    movement_id,quantity_received,received_by,received_by_name,received_at
  ) values(
    receipt_id,claim.id,request.id,release.id,release_item.id,release.sales_order_id,
    release_item.warehouse_id,requested_operation_id,movement_id,requested_quantity,
    actor_profile_id,coalesce(nullif(actor.full_name,''),actor.email,'Employee'),now()
  );

  if serialized_count>0 then
    foreach serial_id in array requested_serial_ids
    loop
      select * into original_release_serial
      from public.sales_stock_out_release_serials
      where release_item_id=release_item.id and serial_number_id=serial_id for update;
      select * into serial from public.serial_numbers where id=serial_id for update;
      insert into public.rma_return_receipt_serials(
        return_receipt_id,original_release_serial_id,serial_number_id,
        previous_status,new_status
      ) values(receipt_id,original_release_serial.id,serial.id,serial.status,'returned');
      update public.serial_numbers
      set warehouse_id=release_item.warehouse_id,status='returned',
        service_status='received_for_service',active_rma_claim_id=claim.id,
        last_movement_id=movement_id,updated_at=now()
      where id=serial.id;
      update public.order_serial_allocations
      set status='returned',release_reason='Physically returned through RMA '||claim.rma_number
      where id=original_release_serial.allocation_id;
      insert into public.serial_number_history(
        serial_number_id,event_type,previous_status,new_status,
        previous_warehouse_id,new_warehouse_id,movement_id,reason,actor_id
      ) values(
        serial.id,'customer_return',serial.status,'returned',serial.warehouse_id,
        release_item.warehouse_id,movement_id,'Physical return receipt '||claim.rma_number,
        actor_profile_id
      );
    end loop;
  end if;

  claim_received_total:=claim_already_returned+requested_quantity;
  next_claim_status:=case when claim_received_total>=claim.quantity then 'product_received' else claim.status end;
  update public.rma_claims
  set status=next_claim_status,
    received_at=case when next_claim_status='product_received' then coalesce(received_at,now()) else received_at end,
    updated_at=now()
  where id=claim.id;
  insert into public.rma_events(
    rma_claim_id,actor_profile_id,event_type,previous_status,new_status,note,metadata
  ) values(
    claim.id,actor_profile_id,'physical_return_received',claim.status,next_claim_status,
    'Physical Return Receipt confirmed at the warehouse.',
    jsonb_build_object('receipt_id',receipt_id,'movement_id',movement_id,
      'release_item_id',release_item.id,'quantity',requested_quantity,
      'warehouse_id',release_item.warehouse_id)
  );
  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,
    entity_id,description,new_values
  ) values(
    actor_profile_id,actor.role,claim.customer_profile_id,
    'rma.physical_return_received','rma','rma_return_receipt',receipt_id::text,
    'A customer return was physically received into the warehouse.',
    jsonb_build_object('rma_claim_id',claim.id,'sales_order_id',release.sales_order_id,
      'stock_out_release_id',release.id,'movement_id',movement_id,
      'warehouse_id',release_item.warehouse_id,'quantity',requested_quantity)
  );
  return receipt_id;
end $$;

revoke all on function public.cancel_sales_order(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.confirm_physical_return_receipt(uuid,uuid,uuid,uuid,numeric,uuid[])
  from public,anon,authenticated;
grant execute on function public.cancel_sales_order(uuid,uuid,text)
  to service_role;
grant execute on function public.confirm_physical_return_receipt(uuid,uuid,uuid,uuid,numeric,uuid[])
  to service_role;

begin;

alter table public.quotation_requests
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists quotation_requests_created_by_idx
  on public.quotation_requests(created_by, created_at desc);

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order,is_active
)
select
  m.id,
  'quotations.view_own',
  'View own quotations',
  'View only quotations created by this employee.',
  'view_own',
  false,
  9,
  true
from public.app_modules m
where m.key='quotations'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

commit;

-- Controlled quotation outcomes and one-to-one draft Sale conversion.
-- Existing quotation states, legacy invoice conversion, and downstream Sales
-- fulfilment remain unchanged.

begin;

alter table public.quotation_requests
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references public.profiles(id) on delete set null,
  add column if not exists customer_accepted_at timestamptz,
  add column if not exists customer_accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists customer_declined_at timestamptz,
  add column if not exists customer_declined_by uuid references public.profiles(id) on delete set null,
  add column if not exists customer_decline_reason text;

alter table public.quotation_requests
  drop constraint if exists quotation_requests_status_check;
alter table public.quotation_requests
  add constraint quotation_requests_status_check check (
    status in (
      'draft','submitted','reviewing','additional_info_required','quoted','approved',
      'rejected','accepted','declined','closed','expired','converted_to_invoice',
      'converted_to_sale'
    )
  );

alter table public.customer_notifications
  drop constraint if exists customer_notifications_notification_type_check;
alter table public.customer_notifications
  add constraint customer_notifications_notification_type_check check (
    notification_type in (
      'order_status','support_reply','support_new','system','quotation_status','quotation_expiry',
      'quotation_submitted','quotation_staff_new','quotation_assigned',
      'quotation_additional_info_required','quotation_information_required','quotation_approved',
      'quotation_rejected','quotation_expired','quotation_converted_to_invoice',
      'quotation_converted','quotation_updated','quotation_expiring','rma_status','rma_new','quotation_issued',
      'quotation_accepted','quotation_declined','quotation_converted_to_sale'
    )
  );

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order,is_active
)
select m.id,v.key,v.name,v.description,v.action,v.sensitive,v.sort_order,true
from public.app_modules m cross join (values
  (
    'quotations.record_customer_outcome',
    'Record customer quotation outcome',
    'Record customer acceptance or rejection with actor, date and reason.',
    'record_customer_outcome',true,45
  ),
  (
    'quotations.convert_to_sale',
    'Create Sales from Quotations',
    'Create one linked draft Sale from an accepted quotation.',
    'convert_to_sale',true,72
  )
) as v(key,name,description,action,sensitive,sort_order)
where m.key='quotations'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

create or replace function public.notify_quotation_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  notification_title text;
  notification_message text;
  notification_kind text;
  staff_profile record;
begin
  if tg_op='INSERT' then
    if new.status='submitted' then
      insert into public.customer_notifications(
        profile_id,notification_type,title,message,href,entity_type,entity_id
      ) values (
        new.profile_id,'quotation_submitted','Quotation request submitted',
        'Your request '||new.reference||' was submitted successfully.',
        '/account/quotations','quotation_request',new.id
      );
      for staff_profile in
        select p.id from public.profiles p
        where p.role='admin' and p.status='active' and p.id<>new.profile_id
      loop
        insert into public.customer_notifications(
          profile_id,notification_type,title,message,href,entity_type,entity_id
        ) values (
          staff_profile.id,'quotation_staff_new','New quotation request',
          'Quotation request '||new.reference||' requires review.',
          '/admin/quotations/'||new.id,'quotation_request',new.id
        );
      end loop;
    end if;
    return new;
  end if;

  if old.assigned_to is distinct from new.assigned_to and new.assigned_to is not null then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.assigned_to,'quotation_assigned','Quotation assigned',
      'Quotation '||new.reference||' has been assigned to you.',
      '/admin/quotations/'||new.id,'quotation_request',new.id
    );
  end if;

  if old.status is distinct from new.status then
    notification_kind:=case new.status
      when 'draft' then null
      when 'approved' then 'quotation_approved'
      when 'quoted' then 'quotation_issued'
      when 'accepted' then 'quotation_accepted'
      when 'declined' then 'quotation_declined'
      when 'rejected' then 'quotation_rejected'
      when 'additional_info_required' then 'quotation_additional_info_required'
      when 'expired' then 'quotation_expired'
      when 'converted_to_invoice' then 'quotation_converted_to_invoice'
      when 'converted_to_sale' then 'quotation_converted_to_sale'
      else 'quotation_status'
    end;
    notification_title:=case new.status
      when 'approved' then 'Quotation internally approved'
      when 'quoted' then 'Quotation issued'
      when 'accepted' then 'Quotation acceptance recorded'
      when 'declined' then 'Quotation rejection recorded'
      when 'rejected' then 'Quotation rejected by SEN'
      when 'additional_info_required' then 'More quotation information required'
      when 'expired' then 'Quotation expired'
      when 'converted_to_invoice' then 'Quotation converted to invoice'
      when 'converted_to_sale' then 'Quotation converted to Sale'
      else 'Quotation status updated'
    end;
    notification_message:=case new.status
      when 'approved' then 'Quotation '||new.reference||' was internally approved by SEN.'
      when 'quoted' then 'Quotation '||new.reference||' was issued to you.'
      when 'accepted' then 'Your acceptance of quotation '||new.reference||' was recorded by SEN staff.'
      when 'declined' then 'Your rejection of quotation '||new.reference||' was recorded by SEN staff.'
      when 'rejected' then 'Quotation '||new.reference||' was rejected by SEN.'
      when 'additional_info_required' then 'SEN needs additional information for '||new.reference||'.'
      when 'expired' then 'Quotation '||new.reference||' has expired.'
      when 'converted_to_invoice' then 'Quotation '||new.reference||' has been converted into a sales invoice.'
      when 'converted_to_sale' then 'Quotation '||new.reference||' has been converted into a draft Sale.'
      else 'Quotation '||new.reference||' is now '||replace(new.status,'_',' ')||'.'
    end;
    if notification_kind is not null then
      insert into public.customer_notifications(
        profile_id,notification_type,title,message,href,entity_type,entity_id
      ) values (
        new.profile_id,notification_kind,notification_title,notification_message,
        '/account/quotations','quotation_request',new.id
      );
    end if;
  elsif old.updated_at is distinct from new.updated_at then
    insert into public.customer_notifications(
      profile_id,notification_type,title,message,href,entity_type,entity_id
    ) values (
      new.profile_id,'quotation_updated','Quotation updated',
      'Quotation '||new.reference||' has been updated.',
      '/account/quotations','quotation_request',new.id
    );
  end if;
  return new;
end $$;

create or replace function public.transition_quotation_business_status(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_transition text,
  requested_reason text default null
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  required_permission text;
  previous_status text;
  next_status text;
  audit_description text;
  normalized_reason text;
  can_view_all boolean;
  can_view_own boolean;
begin
  required_permission:=case requested_transition
    when 'approve' then 'quotations.approve'
    when 'reject' then 'quotations.reject'
    when 'issue' then 'quotations.send'
    when 'accept' then 'quotations.record_customer_outcome'
    when 'decline' then 'quotations.record_customer_outcome'
    else null
  end;
  if required_permission is null then raise exception 'Invalid quotation transition'; end if;
  perform public.assert_actor_permission(actor_profile_id,required_permission);
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=coalesce(actor.role='admin',false) or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not (
    can_view_own and coalesce(quotation.created_by=actor_profile_id,false)
  ) then
    raise exception 'Quotation access denied';
  end if;

  normalized_reason:=nullif(left(btrim(coalesce(requested_reason,'')),2000),'');
  previous_status:=quotation.status;
  if requested_transition='approve' then
    if quotation.status not in ('draft','reviewing','quoted') then
      raise exception 'Quotation cannot be internally approved from its current state';
    end if;
    next_status:='approved';
    audit_description:='Quotation internally approved by staff.';
    update public.quotation_requests set
      status=next_status,approved_at=now(),approved_by=actor_profile_id,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='reject' then
    if quotation.status not in ('draft','reviewing','approved','quoted') then
      raise exception 'Quotation cannot be internally rejected from its current state';
    end if;
    next_status:='rejected';
    audit_description:='Quotation internally rejected by staff.';
    update public.quotation_requests set
      status=next_status,rejected_at=now(),rejected_by=actor_profile_id,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='issue' then
    if quotation.status<>'approved' then
      raise exception 'Only an internally approved quotation can be issued';
    end if;
    next_status:='quoted';
    audit_description:='Quotation issued to the customer by staff.';
    update public.quotation_requests set
      status=next_status,issued_at=now(),issued_by=actor_profile_id,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='accept' then
    if quotation.status<>'quoted' then
      raise exception 'Only an issued quotation can have customer acceptance recorded';
    end if;
    if quotation.expiration_date is not null and quotation.expiration_date<current_date then
      raise exception 'Expired quotation cannot be accepted';
    end if;
    next_status:='accepted';
    audit_description:='Customer acceptance recorded by staff.';
    update public.quotation_requests set
      status=next_status,customer_accepted_at=now(),
      customer_accepted_by=actor_profile_id,updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  elsif requested_transition='decline' then
    if quotation.status<>'quoted' then
      raise exception 'Only an issued quotation can have customer rejection recorded';
    end if;
    if requested_reason is null or normalized_reason is null then
      raise exception 'Customer rejection reason is required';
    end if;
    next_status:='declined';
    audit_description:='Customer rejection recorded by staff.';
    update public.quotation_requests set
      status=next_status,customer_declined_at=now(),
      customer_declined_by=actor_profile_id,customer_decline_reason=normalized_reason,
      updated_by=actor_profile_id,updated_at=now()
    where id=quotation.id;
  else
    raise exception 'Invalid quotation transition';
  end if;

  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,
    description,old_values,new_values
  ) values (
    actor_profile_id,actor.role,quotation.profile_id,
    case requested_transition
      when 'accept' then 'quotation.customer_acceptance_recorded'
      when 'decline' then 'quotation.customer_rejection_recorded'
      else 'quotation.'||requested_transition
    end,
    'quotations','quotation_request',quotation.id::text,audit_description,
    jsonb_build_object('status',previous_status),
    jsonb_build_object(
      'status',next_status,'transition',requested_transition,
      'reason',normalized_reason,'recorded_at',now()
    )
  );
  return next_status;
end $$;

create or replace function public.update_quotation_details_and_totals(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_expected_status text,
  requested_subject text,
  requested_company_name text,
  requested_customer_tax_identification_number text,
  requested_required_by date,
  requested_expiration_date date,
  requested_terms_and_conditions text,
  requested_payment_terms text,
  requested_delivery_information text,
  requested_customer_notes text,
  requested_internal_notes text,
  requested_discount_amount numeric,
  requested_tax_amount numeric
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.edit');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';
  if actor.id is null then raise exception 'Active actor not found'; end if;

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=coalesce(actor.role='admin',false) or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not (
    can_view_own and coalesce(quotation.created_by=actor_profile_id,false)
  ) then
    raise exception 'Quotation access denied';
  end if;

  if quotation.status in (
    'accepted','declined','rejected','closed','expired','converted_to_sale','converted_to_invoice'
  ) then
    raise exception 'An immutable quotation cannot be edited';
  end if;
  if requested_expected_status not in (
    'draft','submitted','reviewing','additional_info_required','approved','quoted'
  ) or quotation.status is distinct from requested_expected_status then
    raise exception 'Quotation changed before its details could be saved';
  end if;

  update public.quotation_requests set
    subject=requested_subject,
    company_name=requested_company_name,
    customer_tax_identification_number=requested_customer_tax_identification_number,
    required_by=requested_required_by,
    expiration_date=requested_expiration_date,
    terms_and_conditions=requested_terms_and_conditions,
    payment_terms=requested_payment_terms,
    delivery_information=requested_delivery_information,
    customer_notes=requested_customer_notes,
    message=requested_customer_notes,
    internal_notes=requested_internal_notes,
    discount_amount=requested_discount_amount,
    tax_amount=requested_tax_amount,
    updated_by=actor_profile_id,
    updated_at=now()
  where id=quotation.id;

  perform public.refresh_quotation_totals(quotation.id);
  return quotation.id;
end $$;

create or replace function public.search_eligible_quotations_for_sale(
  actor_profile_id uuid,
  requested_query text,
  requested_limit integer default 20
) returns table(
  quotation_id uuid,
  reference text,
  customer_id uuid,
  customer_name text,
  customer_company text,
  customer_email text,
  total_amount numeric,
  currency text,
  expiration_date date
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  search_query text:=left(btrim(coalesce(requested_query,'')),80);
  escaped_query text;
  search_pattern text;
  result_limit integer:=least(greatest(coalesce(requested_limit,20),1),20);
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.convert_to_sale');
  perform public.assert_actor_permission(actor_profile_id,'sales.create');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';
  can_view_all:=actor.role='admin' or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not can_view_own then raise exception 'Quotation access denied'; end if;
  if search_query='' then return; end if;
  escaped_query:=replace(search_query,E'\\',E'\\\\');
  escaped_query:=replace(escaped_query,'%',E'\\%');
  escaped_query:=replace(escaped_query,'_',E'\\_');
  search_pattern:='%'||escaped_query||'%';

  return query
  select
    q.id,q.reference,q.profile_id,
    coalesce(nullif(p.full_name,''),p.email),
    coalesce(nullif(q.company_name,''),p.company_name),
    p.email,q.total_amount,q.currency::text,q.expiration_date
  from public.quotation_requests q
  join public.profiles p
    on p.id=q.profile_id and p.role='customer' and p.status='active'
  where q.status='accepted'
    and (q.expiration_date is null or q.expiration_date>=current_date)
    and q.converted_order_id is null
    and (
      can_view_all
      or (can_view_own and q.created_by=actor_profile_id)
    )
    and (
      q.reference ilike search_pattern escape E'\\'
      or p.full_name ilike search_pattern escape E'\\'
      or coalesce(q.company_name,p.company_name,'') ilike search_pattern escape E'\\'
      or p.email ilike search_pattern escape E'\\'
    )
  order by
    case when lower(q.reference)=lower(search_query) then 0 else 1 end,
    q.updated_at desc,q.reference
  limit result_limit;
end $$;

create or replace function public.create_sale_from_quotation(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_customer_id uuid,
  requested_address_id uuid,
  requested_address jsonb,
  requested_billing_address_id uuid,
  requested_billing_address jsonb,
  requested_warehouse_id uuid,
  requested_source text,
  requested_expected_delivery_date date,
  requested_discount numeric,
  requested_shipping numeric,
  requested_service numeric,
  requested_tax numeric,
  requested_internal_notes text,
  requested_customer_notes text,
  requested_items jsonb,
  requested_adjustments jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  quote_item public.quotation_request_items%rowtype;
  product_row public.products%rowtype;
  variation_row public.product_variations%rowtype;
  entry jsonb;
  adjustment jsonb;
  expected_adjustment jsonb;
  expected_adjustments jsonb:='[]'::jsonb;
  validated_adjustments jsonb:='[]'::jsonb;
  adjustment_index integer;
  matching_adjustment_index integer;
  consumed_adjustment_indexes integer[]:='{}'::integer[];
  source_quotation_item_id uuid;
  requested_product_id uuid;
  requested_variation_id uuid;
  item_warehouse_id uuid;
  item_quantity numeric;
  item_unit_price numeric;
  item_line_discount numeric;
  item_line_tax numeric;
  baseline_unit_price numeric;
  catalogue_unit_price numeric;
  header_discount numeric:=round(coalesce(requested_discount,0),2);
  header_shipping numeric:=round(coalesce(requested_shipping,0),2);
  header_service numeric:=round(coalesce(requested_service,0),2);
  header_tax numeric:=round(coalesce(requested_tax,0),2);
  normalized_items jsonb:='[]'::jsonb;
  seen_source_ids uuid[]:='{}'::uuid[];
  created_sale_id uuid;
  created_sale_number text;
  created_sale_status text;
  accepted_values_edited boolean:=false;
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.convert_to_sale');
  perform public.assert_actor_permission(actor_profile_id,'sales.create');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=actor.role='admin' or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not (
    can_view_own and coalesce(quotation.created_by=actor_profile_id,false)
  ) then
    raise exception 'Quotation access denied';
  end if;

  if quotation.converted_order_id is not null then
    select o.order_number into created_sale_number
    from public.sales_orders o where o.id=quotation.converted_order_id;
    return jsonb_build_object(
      'sale_id',quotation.converted_order_id,
      'order_id',quotation.converted_order_id,
      'order_number',created_sale_number,
      'existing',true
    );
  end if;
  if quotation.status<>'accepted' then
    raise exception 'Only a customer-accepted quotation can be converted';
  end if;
  if quotation.expiration_date is not null and quotation.expiration_date<current_date then
    raise exception 'Expired quotation cannot be converted';
  end if;
  if quotation.currency is distinct from 'BDT' then
    raise exception 'Only BDT quotations can be converted to a Sale';
  end if;
  if requested_customer_id is distinct from quotation.profile_id then
    raise exception 'Sale customer must match the quotation customer';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=requested_customer_id and p.role='customer' and p.status='active'
  ) then raise exception 'Active quotation customer is required'; end if;
  if requested_address_id is not null and not exists(
    select 1 from public.customer_addresses a
    where a.id=requested_address_id and a.profile_id=requested_customer_id
  ) then
    raise exception 'Shipping address does not belong to the quotation customer';
  end if;
  if requested_billing_address_id is not null and not exists(
    select 1 from public.customer_addresses a
    where a.id=requested_billing_address_id and a.profile_id=requested_customer_id
  ) then
    raise exception 'Billing address does not belong to the quotation customer';
  end if;

  if not exists(
    select 1 from public.quotation_request_items qi
    where qi.quotation_id=quotation.id
  ) then raise exception 'Quotation has no items'; end if;
  if exists(
    select 1
    from public.quotation_request_items qi
    left join public.products p on p.id=qi.product_id and p.status='active'
    left join public.product_variations pv
      on pv.id=qi.variation_id and pv.product_id=qi.product_id and pv.status='active'
    where qi.quotation_id=quotation.id
      and (p.id is null or (qi.variation_id is not null and pv.id is null))
  ) then raise exception 'Quotation includes an unavailable catalogue item'; end if;

  if requested_items is null or jsonb_typeof(requested_items)<>'array'
    or jsonb_array_length(requested_items)=0
  then
    raise exception 'At least one Sale item is required';
  end if;
  if requested_adjustments is not null and jsonb_typeof(requested_adjustments)<>'array' then
    raise exception 'Sale adjustments are invalid';
  end if;
  if header_discount<0 or header_shipping<0 or header_service<0 or header_tax<0 then
    raise exception 'Sale totals cannot be negative';
  end if;

  for entry in
    select requested.value from jsonb_array_elements(requested_items) as requested(value)
  loop
    source_quotation_item_id:=nullif(entry->>'source_quotation_item_id','')::uuid;
    requested_product_id:=nullif(entry->>'product_id','')::uuid;
    requested_variation_id:=nullif(entry->>'variation_id','')::uuid;
    item_warehouse_id:=nullif(entry->>'warehouse_id','')::uuid;
    item_quantity:=nullif(entry->>'quantity','')::numeric;
    item_unit_price:=round(nullif(entry->>'unit_price','')::numeric,2);
    item_line_discount:=round(coalesce(nullif(entry->>'line_discount','')::numeric,0),2);
    item_line_tax:=round(coalesce(nullif(entry->>'line_tax','')::numeric,0),2);

    if requested_product_id is null then raise exception 'Sale product is required'; end if;
    if item_quantity is null or item_quantity<1 or item_quantity<>trunc(item_quantity) then
      raise exception 'Sale item quantity must be a whole number of at least 1';
    end if;
    if item_unit_price is null or item_unit_price<0
      or item_line_discount<0 or item_line_tax<0
      or item_line_discount>round(item_quantity*item_unit_price,2)
    then raise exception 'Sale item commercial values are invalid'; end if;

    select * into product_row from public.products p
    where p.id=requested_product_id and p.status='active';
    if product_row.id is null then raise exception 'Sale product is unavailable'; end if;
    select * into variation_row from public.product_variations pv
    where requested_variation_id is not null
      and pv.id=requested_variation_id
      and pv.product_id=requested_product_id and pv.status='active';
    if requested_variation_id is not null and variation_row.id is null then
      raise exception 'Sale variation is unavailable';
    end if;

    if source_quotation_item_id is not null then
      if source_quotation_item_id=any(seen_source_ids) then
        raise exception 'Each quotation item may be used only once';
      end if;
      seen_source_ids:=array_append(seen_source_ids,source_quotation_item_id);
      select * into quote_item from public.quotation_request_items qi
      where qi.id=source_quotation_item_id and qi.quotation_id=quotation.id;
      if quote_item.id is null then raise exception 'Quotation source item is invalid'; end if;
      if requested_product_id is distinct from quote_item.product_id
        or requested_variation_id is distinct from quote_item.variation_id
      then raise exception 'Quotation source product cannot be replaced in place'; end if;

      baseline_unit_price:=round(coalesce(quote_item.unit_price,quote_item.target_price,0),2);
      if item_unit_price<>baseline_unit_price then
        perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
        accepted_values_edited:=true;
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',source_quotation_item_id,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','manual_unit_price',
          'previous_value',baseline_unit_price,
          'new_value',item_unit_price
        ));
      end if;
      if item_line_discount<>round(coalesce(quote_item.discount_amount,0),2) then
        perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
        accepted_values_edited:=true;
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',source_quotation_item_id,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','fixed_line_discount',
          'previous_value',round(coalesce(quote_item.discount_amount,0),2),
          'new_value',item_line_discount
        ));
      end if;
      if item_quantity<>quote_item.quantity
        or item_line_tax<>round(coalesce(quote_item.tax_amount,0),2)
      then accepted_values_edited:=true; end if;
    else
      accepted_values_edited:=true;
      catalogue_unit_price:=round(coalesce(
        variation_row.sale_price,variation_row.regular_price,
        product_row.sale_price,product_row.regular_price,0
      ),2);
      if item_unit_price<>catalogue_unit_price then
        perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',null,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','manual_unit_price',
          'previous_value',catalogue_unit_price,
          'new_value',item_unit_price
        ));
      end if;
      if item_line_discount>0 then
        perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
        expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
          'source_quotation_item_id',null,
          'product_id',requested_product_id,
          'variation_id',requested_variation_id,
          'adjustment_type','fixed_line_discount',
          'previous_value',catalogue_unit_price,
          'new_value',item_line_discount
        ));
      end if;
    end if;

    normalized_items:=normalized_items||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'product_id',requested_product_id,
      'variation_id',requested_variation_id,
      'warehouse_id',item_warehouse_id,
      'quantity',item_quantity,
      'unit_price',item_unit_price,
      'line_discount',item_line_discount,
      'line_tax',item_line_tax
    )));
  end loop;

  if header_discount<>round(coalesce(quotation.discount_amount,0),2) then
    perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
    accepted_values_edited:=true;
    expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
      'source_quotation_item_id',null,
      'product_id',null,
      'variation_id',null,
      'adjustment_type','order_discount',
      'previous_value',round(coalesce(quotation.discount_amount,0),2),
      'new_value',header_discount
    ));
  end if;
  if header_service>0 then
    expected_adjustments:=expected_adjustments||jsonb_build_array(jsonb_build_object(
      'source_quotation_item_id',null,
      'product_id',null,
      'variation_id',null,
      'adjustment_type','service_charge',
      'previous_value',0,
      'new_value',header_service
    ));
  end if;
  if header_shipping<>0 or header_service<>0
    or header_tax<>round(coalesce(quotation.tax_amount,0),2)
    or cardinality(seen_source_ids)<>(
      select count(*) from public.quotation_request_items qi
      where qi.quotation_id=quotation.id
    )
  then accepted_values_edited:=true; end if;

  if jsonb_array_length(coalesce(requested_adjustments,'[]'::jsonb))
    <>jsonb_array_length(expected_adjustments)
  then
    raise exception 'Sale adjustments do not match reviewed commercial edits';
  end if;
  for expected_adjustment in
    select expected.value from jsonb_array_elements(expected_adjustments) as expected(value)
  loop
    matching_adjustment_index:=null;
    for adjustment,adjustment_index in
      select requested.value,requested.ordinality::integer
      from jsonb_array_elements(coalesce(requested_adjustments,'[]'::jsonb))
        with ordinality as requested(value,ordinality)
    loop
      if adjustment_index=any(consumed_adjustment_indexes) then continue; end if;
      if adjustment->>'adjustment_type'=expected_adjustment->>'adjustment_type'
        and nullif(adjustment->>'source_quotation_item_id','')::uuid
          is not distinct from nullif(expected_adjustment->>'source_quotation_item_id','')::uuid
        and nullif(adjustment->>'product_id','')::uuid
          is not distinct from nullif(expected_adjustment->>'product_id','')::uuid
        and nullif(adjustment->>'variation_id','')::uuid
          is not distinct from nullif(expected_adjustment->>'variation_id','')::uuid
        and nullif(adjustment->>'previous_value','')::numeric
          is not distinct from nullif(expected_adjustment->>'previous_value','')::numeric
        and nullif(adjustment->>'new_value','')::numeric
          is not distinct from nullif(expected_adjustment->>'new_value','')::numeric
      then
        matching_adjustment_index:=adjustment_index;
        exit;
      end if;
    end loop;
    if matching_adjustment_index is null then
      raise exception 'Sale adjustments do not match reviewed commercial edits';
    end if;
    if nullif(adjustment->>'order_item_id','') is not null then
      raise exception 'Creation adjustments cannot reference an existing Sale item';
    end if;
    if nullif(btrim(coalesce(adjustment->>'reason','')),'') is null then
      raise exception 'Price adjustment reason required';
    end if;
    consumed_adjustment_indexes:=array_append(
      consumed_adjustment_indexes,matching_adjustment_index
    );
    validated_adjustments:=validated_adjustments||jsonb_build_array(adjustment);
  end loop;

  created_sale_id:=public.create_minimal_sale(
    actor_profile_id,requested_customer_id,requested_address_id,requested_address,
    requested_billing_address_id,requested_billing_address,requested_warehouse_id,
    requested_source,requested_expected_delivery_date,header_discount,header_shipping,
    header_service,header_tax,requested_internal_notes,requested_customer_notes,
    normalized_items,validated_adjustments
  );
  select o.order_number,o.status into created_sale_number,created_sale_status
  from public.sales_orders o where o.id=created_sale_id;
  if created_sale_id is null or created_sale_status<>'draft' then
    raise exception 'Draft Sale creation failed';
  end if;

  insert into public.order_status_events(
    order_id,old_status,new_status,actor_profile_id,note
  ) values (
    created_sale_id,'draft','draft',actor_profile_id,
    'Draft Sale created from accepted quotation '||quotation.reference
  );

  update public.quotation_requests set
    status='converted_to_sale',converted_order_id=created_sale_id,
    converted_at=now(),converted_by=actor_profile_id,
    updated_by=actor_profile_id,updated_at=now()
  where id=quotation.id and converted_order_id is null;

  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,
    description,old_values,new_values
  ) values (
    actor_profile_id,actor.role,quotation.profile_id,'quotation.converted_to_sale',
    'quotations','quotation_request',quotation.id::text,
    'Customer-accepted quotation converted to one linked draft Sale by staff.',
    jsonb_build_object('status',quotation.status,'converted_order_id',quotation.converted_order_id),
    jsonb_build_object(
      'status','converted_to_sale','quotation_reference',quotation.reference,
      'sale_id',created_sale_id,'order_number',created_sale_number,
      'accepted_values_edited',accepted_values_edited,'converted_at',now()
    )
  );

  return jsonb_build_object(
    'sale_id',created_sale_id,'order_id',created_sale_id,
    'order_number',created_sale_number,'existing',false
  );
end $$;

revoke all on function public.transition_quotation_business_status(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.transition_quotation_business_status(uuid,uuid,text,text)
  to service_role;

revoke all on function public.update_quotation_details_and_totals(
  uuid,uuid,text,text,text,text,date,date,text,text,text,text,text,numeric,numeric
) from public,anon,authenticated;
grant execute on function public.update_quotation_details_and_totals(
  uuid,uuid,text,text,text,text,date,date,text,text,text,text,text,numeric,numeric
) to service_role;

revoke all on function public.search_eligible_quotations_for_sale(uuid,text,integer)
  from public,anon,authenticated;
grant execute on function public.search_eligible_quotations_for_sale(uuid,text,integer)
  to service_role;

revoke all on function public.create_sale_from_quotation(
  uuid,uuid,uuid,uuid,jsonb,uuid,jsonb,uuid,text,date,numeric,numeric,numeric,numeric,
  text,text,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.create_sale_from_quotation(
  uuid,uuid,uuid,uuid,jsonb,uuid,jsonb,uuid,text,date,numeric,numeric,numeric,numeric,
  text,text,jsonb,jsonb
) to service_role;

commit;

create or replace function public.update_quotation_details_and_totals(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_expected_status text,
  requested_subject text,
  requested_company_name text,
  requested_customer_tax_identification_number text,
  requested_required_by date,
  requested_expiration_date date,
  requested_terms_and_conditions text,
  requested_payment_terms text,
  requested_delivery_information text,
  requested_customer_notes text,
  requested_internal_notes text,
  requested_discount_amount numeric,
  requested_tax_amount numeric
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.edit');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';
  if actor.id is null then raise exception 'Active actor not found'; end if;

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=coalesce(actor.role='admin',false) or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not (
    can_view_own and coalesce(quotation.created_by=actor_profile_id,false)
  ) then
    raise exception 'Quotation access denied';
  end if;

  if requested_expected_status is distinct from 'draft'
    or quotation.status is distinct from 'draft'
  then
    raise exception 'Draft quotation changed before its details could be saved';
  end if;

  update public.quotation_requests set
    subject=requested_subject,
    company_name=requested_company_name,
    customer_tax_identification_number=requested_customer_tax_identification_number,
    required_by=requested_required_by,
    expiration_date=requested_expiration_date,
    terms_and_conditions=requested_terms_and_conditions,
    payment_terms=requested_payment_terms,
    delivery_information=requested_delivery_information,
    customer_notes=requested_customer_notes,
    message=requested_customer_notes,
    internal_notes=requested_internal_notes,
    discount_amount=requested_discount_amount,
    tax_amount=requested_tax_amount,
    updated_by=actor_profile_id,
    updated_at=now()
  where id=quotation.id;

  perform public.refresh_quotation_totals(quotation.id);
  return quotation.id;
end $$;

create or replace function public.update_draft_quotation(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_expected_updated_at timestamp with time zone,
  requested_subject text,
  requested_company_name text,
  requested_customer_tax_identification_number text,
  requested_required_by date,
  requested_expiration_date date,
  requested_terms_and_conditions text,
  requested_payment_terms text,
  requested_delivery_information text,
  requested_customer_notes text,
  requested_internal_notes text,
  requested_discount_amount numeric,
  requested_tax_amount numeric,
  requested_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  quotation public.quotation_requests%rowtype;
  existing_item public.quotation_request_items%rowtype;
  product_row public.products%rowtype;
  variation_row public.product_variations%rowtype;
  entry jsonb;
  requested_product_id uuid;
  requested_variation_id uuid;
  requested_line_key text;
  existing_line_keys text[]:=array[]::text[];
  seen_line_keys text[]:=array[]::text[];
  normalized_items jsonb:='[]'::jsonb;
  item_quantity numeric;
  item_unit_price numeric;
  item_line_discount numeric;
  item_line_tax numeric;
  item_product_name text;
  item_sku text;
  item_currency text;
  header_discount numeric:=round(coalesce(requested_discount_amount,0),2);
  header_tax numeric:=round(coalesce(requested_tax_amount,0),2);
  can_view_all boolean;
  can_view_own boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'quotations.edit');
  select * into actor from public.profiles p
  where p.id=actor_profile_id and p.status='active';
  if actor.id is null then raise exception 'Active actor not found'; end if;

  select * into quotation
  from public.quotation_requests q
  where q.id=requested_quotation_id
  for update;
  if quotation.id is null then raise exception 'Quotation not found'; end if;

  can_view_all:=coalesce(actor.role='admin',false) or exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('quotations.view','quotations.view_all')
  );
  can_view_own:=exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='quotations.view_own'
  );
  if not can_view_all and not (
    can_view_own and coalesce(quotation.created_by=actor_profile_id,false)
  ) then
    raise exception 'Quotation access denied';
  end if;

  if quotation.status is distinct from 'draft' then
    raise exception 'Only Draft quotations can be edited';
  end if;
  if quotation.updated_at is distinct from requested_expected_updated_at then
    raise exception 'Quotation changed before it could be saved';
  end if;
  if requested_items is null or jsonb_typeof(requested_items)<>'array'
    or jsonb_array_length(requested_items)<1
    or jsonb_array_length(requested_items)>50
  then
    raise exception 'A Draft quotation must contain 1 to 50 items';
  end if;
  if header_discount<0 or header_tax<0
    or header_discount>10000000 or header_tax>10000000
  then
    raise exception 'Quotation commercial values are invalid';
  end if;

  select coalesce(array_agg(
    coalesce(qi.product_id::text,'')||':'||coalesce(qi.variation_id::text,'')
  ),array[]::text[])
  into existing_line_keys
  from public.quotation_request_items qi
  where qi.quotation_id=quotation.id;

  for entry in select requested.value from jsonb_array_elements(requested_items) as requested(value)
  loop
    variation_row:=null;
    requested_product_id:=nullif(entry->>'product_id','')::uuid;
    requested_variation_id:=nullif(entry->>'variation_id','')::uuid;
    requested_line_key:=requested_product_id::text||':'||coalesce(requested_variation_id::text,'');
    item_quantity:=nullif(entry->>'quantity','')::numeric;
    item_unit_price:=round(nullif(entry->>'unit_price','')::numeric,2);
    item_line_discount:=round(coalesce(nullif(entry->>'discount_amount','')::numeric,0),2);
    item_line_tax:=round(coalesce(nullif(entry->>'tax_amount','')::numeric,0),2);

    if requested_product_id is null then raise exception 'Quotation product is required'; end if;
    if requested_line_key=any(seen_line_keys) then
      raise exception 'Each product or variation can only be added once';
    end if;
    seen_line_keys:=array_append(seen_line_keys,requested_line_key);
    if item_quantity is null or item_quantity<1 or item_quantity<>trunc(item_quantity)
      or item_quantity>1000000
    then
      raise exception 'Quotation item quantity must be a whole number of at least 1';
    end if;
    if item_unit_price is null or item_unit_price<0
      or item_line_discount<0 or item_line_tax<0
      or item_unit_price>10000000 or item_line_discount>10000000 or item_line_tax>10000000
      or item_line_discount>round(item_quantity*item_unit_price,2)
    then
      raise exception 'Quotation item commercial values are invalid';
    end if;
    if requested_variation_id is not null then
      select * into variation_row from public.product_variations pv
      where pv.id=requested_variation_id
        and pv.product_id=requested_product_id;
      if variation_row.id is null then
        raise exception 'Quotation variation does not belong to the submitted product';
      end if;
    end if;

    if requested_line_key<>all(existing_line_keys) then
      select * into product_row from public.products p
      where p.id=requested_product_id and p.status='active';
      if product_row.id is null then raise exception 'Quotation product is unavailable'; end if;
      if requested_variation_id is not null then
        select * into variation_row from public.product_variations pv
        where pv.id=requested_variation_id
          and pv.product_id=requested_product_id and pv.status='active';
        if variation_row.id is null then raise exception 'Quotation variation is unavailable'; end if;
      end if;
      item_product_name:=case when requested_variation_id is null then product_row.name
        else product_row.name||' — '||variation_row.combination_key end;
      item_sku:=coalesce(variation_row.sku,product_row.sku);
      item_currency:=quotation.currency;
    else
      select * into existing_item from public.quotation_request_items qi
      where qi.quotation_id=quotation.id
        and qi.product_id is not distinct from requested_product_id
        and qi.variation_id is not distinct from requested_variation_id
      limit 1;
      item_product_name:=existing_item.product_name_snapshot;
      item_sku:=existing_item.sku_snapshot;
      item_currency:=existing_item.currency;
    end if;

    entry:=jsonb_build_object(
      'product_id',requested_product_id,
      'variation_id',requested_variation_id,
      'product_name_snapshot',item_product_name,
      'sku_snapshot',item_sku,
      'quantity',item_quantity,
      'target_price',item_unit_price,
      'unit_price',item_unit_price,
      'discount_amount',item_line_discount,
      'tax_amount',item_line_tax,
      'currency',item_currency
    );
    normalized_items:=normalized_items||jsonb_build_array(entry);
  end loop;

  update public.quotation_requests set
    subject=requested_subject,
    company_name=requested_company_name,
    customer_tax_identification_number=requested_customer_tax_identification_number,
    required_by=requested_required_by,
    expiration_date=requested_expiration_date,
    terms_and_conditions=requested_terms_and_conditions,
    payment_terms=requested_payment_terms,
    delivery_information=requested_delivery_information,
    customer_notes=requested_customer_notes,
    message=requested_customer_notes,
    internal_notes=requested_internal_notes,
    discount_amount=header_discount,
    tax_amount=header_tax,
    updated_by=actor_profile_id,
    updated_at=now()
  where id=quotation.id;

  delete from public.quotation_request_items
  where quotation_id=quotation.id;

  for entry in select value from jsonb_array_elements(normalized_items)
  loop
    insert into public.quotation_request_items(
      quotation_id,product_id,variation_id,product_name_snapshot,sku_snapshot,
      quantity,target_price,unit_price,discount_amount,tax_amount,currency
    ) values (
      quotation.id,
      (entry->>'product_id')::uuid,
      nullif(entry->>'variation_id','')::uuid,
      entry->>'product_name_snapshot',
      nullif(entry->>'sku_snapshot',''),
      (entry->>'quantity')::numeric,
      (entry->>'target_price')::numeric,
      (entry->>'unit_price')::numeric,
      (entry->>'discount_amount')::numeric,
      (entry->>'tax_amount')::numeric,
      entry->>'currency'
    );
  end loop;

  perform public.refresh_quotation_totals(quotation.id);
  return quotation.id;
end $$;

revoke all on function public.update_quotation_details_and_totals(
  uuid,uuid,text,text,text,text,date,date,text,text,text,text,text,numeric,numeric
) from public,anon,authenticated;
grant execute on function public.update_quotation_details_and_totals(
  uuid,uuid,text,text,text,text,date,date,text,text,text,text,text,numeric,numeric
) to service_role;

revoke all on function public.update_draft_quotation(
  uuid,uuid,timestamp with time zone,text,text,text,date,date,text,text,text,text,text,numeric,numeric,jsonb
) from public,anon,authenticated;
grant execute on function public.update_draft_quotation(
  uuid,uuid,timestamp with time zone,text,text,text,date,date,text,text,text,text,text,numeric,numeric,jsonb
) to service_role;

-- Native application service access. Browser users never receive this role.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
