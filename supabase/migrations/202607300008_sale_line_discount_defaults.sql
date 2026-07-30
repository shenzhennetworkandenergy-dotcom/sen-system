-- Keep fixed-discount metadata accurate for new sale items created by legacy RPCs.

create or replace function public.sync_new_sale_item_discount_metadata()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.line_discount > 0 and coalesce(new.discount_value,0) = 0 then
    new.discount_type := 'fixed';
    new.discount_value := new.line_discount;
  end if;
  return new;
end $$;

drop trigger if exists sync_new_sale_item_discount_metadata
  on public.sales_order_items;
create trigger sync_new_sale_item_discount_metadata
before insert on public.sales_order_items
for each row execute function public.sync_new_sale_item_discount_metadata();
