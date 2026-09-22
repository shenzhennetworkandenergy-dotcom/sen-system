do $$
declare table_list text;
begin
  if exists (select 1 from public.profiles) then
    raise exception 'Migration target already contains user accounts; refusing to replace local data.';
  end if;
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into table_list
    from pg_tables
   where schemaname = 'public';
  if table_list is not null then
    execute 'truncate table ' || table_list || ' restart identity cascade';
  end if;
end $$;
