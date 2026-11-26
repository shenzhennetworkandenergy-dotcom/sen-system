create table public.company_whatsapp_contacts (
  phone_number_id text not null,
  recipient text not null check (recipient ~ '^[1-9][0-9]{7,14}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  customer_profile_id uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (phone_number_id, recipient)
);

alter table public.company_whatsapp_contacts enable row level security;
revoke all on public.company_whatsapp_contacts from public, anon, authenticated, service_role;
grant select, insert, update on public.company_whatsapp_contacts to service_role;

create table public.company_whatsapp_price_replies (
  phone_number_id text not null,
  incoming_message_id text not null,
  provider_message_id text not null,
  body text not null check (char_length(body) between 1 and 4096),
  accepted_at timestamptz not null default now(),
  primary key (phone_number_id, incoming_message_id),
  foreign key (phone_number_id, incoming_message_id)
    references public.company_whatsapp_inbox(phone_number_id, message_id) on delete cascade
);

alter table public.company_whatsapp_price_replies enable row level security;
revoke all on public.company_whatsapp_price_replies from public, anon, authenticated, service_role;
grant select, insert on public.company_whatsapp_price_replies to service_role;

create function public.company_whatsapp_phone(p_phone text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  with cleaned as (
    select regexp_replace(translate(p_phone, '০১২৩৪৫৬৭৮৯', '0123456789'), '^[[:space:]]+|[[:space:]]+$', '', 'g') as value
  ), digits as (
    select value, regexp_replace(value, '[^0-9]', '', 'g') as number
    from cleaned where value ~ '^[+]?[-0-9[:space:]()]+$'
  ), normalized as (
    select case
      when number like '00%' then substr(number, 3)
      when value not like '+%' and number ~ '^01[3-9][0-9]{8}$' then '88' || number
      else number
    end as phone
    from digits
  )
  select phone from normalized where phone ~ '^[1-9][0-9]{7,14}$'
$$;

revoke all on function public.company_whatsapp_phone(text) from public, anon, authenticated;
grant execute on function public.company_whatsapp_phone(text) to service_role;

create function public.company_whatsapp_directory(
  p_phone_number_id text,
  p_visible_customer_ids uuid[],
  p_recent boolean,
  p_query text default '',
  p_recipient text default null,
  p_offset integer default 0
)
returns table (
  recipient text, display_name text, company_name text, customer_profile_id uuid,
  saved_name text, linked_customer_id uuid, ambiguous boolean,
  latest_at timestamptz, message_preview text
)
language sql stable
set search_path = ''
as $$
  with customers as (
    select p.id, p.full_name, p.company_name, public.company_whatsapp_phone(p.phone) as phone
    from public.profiles p
    where p.role = 'customer' and p.status = 'active' and p.archived_at is null
  ), by_phone as (
    select c.phone, count(*) as matches, min(c.id::text)::uuid as first_id
    from customers c where c.phone is not null and (p_recipient is null or c.phone = p_recipient)
    group by c.phone
  ), saved as (
    select c.* from public.company_whatsapp_contacts c
    where c.phone_number_id = p_phone_number_id and (p_recipient is null or c.recipient = p_recipient)
  ), numbers as (
    select p_recipient as phone where p_recipient is not null
    union
    select b.phone from by_phone b where p_recipient is null and not p_recent
    union
    select s.recipient from saved s where p_recipient is null and not p_recent
    union
    select m.sender from public.company_whatsapp_inbox m
    where m.phone_number_id = p_phone_number_id and p_recipient is null and p_recent
  ), matched as (
    select n.phone,
      coalesce(s.display_name, nullif(btrim(c.full_name), ''), nullif(btrim(c.company_name), '')) as label,
      c.full_name, c.company_name, c.id,
      s.display_name as saved_name, s.customer_profile_id as linked_customer_id,
      (coalesce(b.matches, 0) > 1 and c.id is null) as ambiguous
    from numbers n
    left join by_phone b on b.phone = n.phone
    left join saved s on s.recipient = n.phone
    left join customers c on c.id = coalesce(s.customer_profile_id, case when b.matches = 1 then b.first_id end)
    where p_visible_customer_ids is null or c.id = any(p_visible_customer_ids)
  )
  select m.phone, m.label, m.company_name, m.id,
    case when p_visible_customer_ids is null then m.saved_name end,
    case when p_visible_customer_ids is null then m.linked_customer_id end,
    m.ambiguous, latest.received_at, left(latest.body, 160)
  from matched m
  left join lateral (
    select i.received_at, i.body from public.company_whatsapp_inbox i
    where i.phone_number_id = p_phone_number_id and i.sender = m.phone
    order by i.received_at desc, i.message_id desc limit 1
  ) as latest on true
  where p_query = '' or strpos(lower(concat_ws(' ', m.label, m.full_name, m.company_name, m.phone)), lower(p_query)) > 0
    or (
      p_query ~ '^[+০-৯0-9 ()-]+$'
      and regexp_replace(translate(p_query, '০১২৩৪৫৬৭৮৯', '0123456789'), '[^0-9]', '', 'g') <> ''
      and strpos(m.phone, regexp_replace(translate(p_query, '০১২৩৪৫৬৭৮৯', '0123456789'), '[^0-9]', '', 'g')) > 0
    )
    or m.phone = public.company_whatsapp_phone(p_query)
  order by case when p_recent then latest.received_at end desc nulls last, lower(m.label) nulls last, m.phone
  limit 31 offset greatest(p_offset, 0)
$$;

revoke all on function public.company_whatsapp_directory(text, uuid[], boolean, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.company_whatsapp_directory(text, uuid[], boolean, text, text, integer) to service_role;
