begin;

create or replace function public.admin_save_product(
  actor_profile_id uuid,
  requested_product_id uuid,
  requested_product jsonb,
  requested_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.admin_save_product(uuid,uuid,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.admin_save_product(uuid,uuid,jsonb,uuid)
  to service_role;

commit;
