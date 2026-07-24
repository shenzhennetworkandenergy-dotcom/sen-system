import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const root=new URL("../",import.meta.url);
const migration=await readFile(new URL("supabase/migrations/202607240001_purchasing_module.sql",root),"utf8");
for(const table of ["suppliers","purchase_orders","purchase_order_items","purchase_order_status_events","purchase_receipts","purchase_receipt_items"]) assert.match(migration,new RegExp(`create table public\\.${table}\\b`),`Missing ${table}`);
for(const fn of ["create_purchase_order","update_purchase_order","transition_purchase_order","receive_purchase_order"]) assert.match(migration,new RegExp(`function public\\.${fn}\\b`),`Missing ${fn}`);
for(const permission of ["purchasing.create","purchasing.edit","purchasing.approve","purchasing.receive","purchasing.cancel","inventory.receive"]) assert.ok(migration.includes(permission),`Missing permission enforcement: ${permission}`);
assert.match(migration,/security definer set search_path=''/);
assert.match(migration,/revoke all on function public\.receive_purchase_order/);
const routes=["app/admin/purchasing/page.tsx","app/admin/purchasing/new/page.tsx","app/admin/purchasing/[id]/page.tsx","app/admin/purchasing/[id]/edit/page.tsx","app/admin/purchasing/[id]/receive/page.tsx","app/admin/purchasing/export/route.ts","app/admin/suppliers/page.tsx","app/admin/suppliers/[id]/page.tsx"];
await Promise.all(routes.map((route)=>access(new URL(route,root))));

const envText=await readFile(new URL(".env.local",root),"utf8");
const env=Object.fromEntries(envText.split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const index=line.indexOf("=");return [line.slice(0,index),line.slice(index+1).replace(/^['"]|['"]$/g,"")];}));
const url=env.NEXT_PUBLIC_SUPABASE_URL;
const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url&&key,"Local Supabase URL and server key are required.");
assert.ok(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url),"Purchasing integration verification refuses to mutate a non-local database.");
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
for(const table of ["suppliers","purchase_orders","purchase_order_items","purchase_receipts"]){const probe=await db.from(table).select("id").limit(1);assert.equal(probe.error,null,`${table} is not available in local Supabase: ${probe.error?.message}`);}
async function cleanupOrder(id){
  const receipts=(await db.from("purchase_receipts").select("id,inventory_movement_id").eq("purchase_order_id",id)).data??[];
  const receiptIds=receipts.map((row)=>row.id), movementIds=receipts.map((row)=>row.inventory_movement_id).filter(Boolean);
  if(receiptIds.length){await db.from("purchase_receipt_items").delete().in("purchase_receipt_id",receiptIds);await db.from("purchase_receipts").delete().in("id",receiptIds);}
  await db.from("purchase_order_status_events").delete().eq("purchase_order_id",id);
  await db.from("purchase_order_items").delete().eq("purchase_order_id",id);
  await db.from("purchase_orders").delete().eq("id",id);
  if(movementIds.length){await db.from("inventory_movement_items").delete().in("movement_id",movementIds);await db.from("inventory_movements").delete().in("id",movementIds);}
}
const staleSuppliers=(await db.from("suppliers").select("id").like("code","VERIFY-%")).data??[];
for(const supplier of staleSuppliers){const staleOrders=(await db.from("purchase_orders").select("id").eq("supplier_id",supplier.id)).data??[];for(const order of staleOrders)await cleanupOrder(order.id);await db.from("suppliers").delete().eq("id",supplier.id);}
const staleProducts=(await db.from("products").select("id").like("sku","VERIFY-%")).data??[];
for(const product of staleProducts){await db.from("inventory_balances").delete().eq("product_id",product.id);await db.from("products").delete().eq("id",product.id);}
const [{data:actor,error:actorError},{data:warehouse,error:warehouseError}]=await Promise.all([
  db.from("profiles").select("id").eq("role","admin").eq("status","active").limit(1).single(),
  db.from("warehouses").select("id").eq("is_active",true).limit(1).single(),
]);
assert.equal(actorError,null,actorError?.message); assert.equal(warehouseError,null,warehouseError?.message);
const marker=`VERIFY-${Date.now()}`; let supplierId; let orderId; let productId;
try{
  const product=await db.from("products").insert({name:"Purchasing verification product",slug:marker.toLowerCase(),sku:marker,status:"active",product_type:"simple",purchase_cost:10,regular_price:12,currency:"BDT",manage_stock:true,serial_tracking_required:false,default_warehouse_id:warehouse.id,created_by:actor.id,updated_by:actor.id}).select("id").single();
  assert.equal(product.error,null,product.error?.message); productId=product.data.id;
  const supplier=await db.from("suppliers").insert({code:marker,name:"Purchasing verification supplier",supplier_type:"distributor",status:"active",country_code:"BD",country_name:"Bangladesh",default_currency:"BDT",created_by:actor.id,updated_by:actor.id}).select("id").single();
  assert.equal(supplier.error,null,supplier.error?.message); supplierId=supplier.data.id;
  const created=await db.rpc("create_purchase_order",{actor_profile_id:actor.id,requested_supplier_id:supplierId,requested_warehouse_id:warehouse.id,requested_currency:"BDT",requested_order_date:new Date().toISOString().slice(0,10),requested_expected_date:null,requested_supplier_reference:marker,requested_payment_terms:0,requested_discount:0,requested_shipping:0,requested_tax:0,requested_other:0,requested_internal_notes:"Automated local verification",requested_supplier_notes:null,requested_items:[{product_id:productId,variation_id:null,quantity:1,unit_cost:10,discount_amount:0,tax_amount:0,description:"Verification line"}]});
  assert.equal(created.error,null,created.error?.message); orderId=created.data;
  for(const action of ["submit","approve","order"]){const transition=await db.rpc("transition_purchase_order",{actor_profile_id:actor.id,requested_order_id:orderId,requested_action:action,requested_note:"Automated local verification"});assert.equal(transition.error,null,`${action}: ${transition.error?.message}`);}
  const item=await db.from("purchase_order_items").select("id").eq("purchase_order_id",orderId).single(); assert.equal(item.error,null,item.error?.message);
  const receipt=await db.rpc("receive_purchase_order",{actor_profile_id:actor.id,requested_order_id:orderId,requested_receipt_date:new Date().toISOString().slice(0,10),requested_delivery_reference:marker,requested_invoice_reference:null,requested_notes:"Automated local verification",requested_items:[{purchase_order_item_id:item.data.id,quantity:1,condition:"new",manufacturer_serials:[]}]});
  assert.equal(receipt.error,null,receipt.error?.message);
  const checked=await db.from("purchase_orders").select("status,purchase_order_items(quantity_ordered,quantity_received),purchase_receipts(inventory_movement_id)").eq("id",orderId).single();
  assert.equal(checked.error,null,checked.error?.message); assert.equal(checked.data.status,"received"); assert.equal(Number(checked.data.purchase_order_items[0].quantity_received),1); assert.ok(checked.data.purchase_receipts[0].inventory_movement_id);
  const balance=await db.from("inventory_balances").select("on_hand,incoming").eq("warehouse_id",warehouse.id).eq("product_id",productId).single(); assert.equal(balance.error,null,balance.error?.message); assert.equal(Number(balance.data.on_hand),1); assert.equal(Number(balance.data.incoming),0);
  const closed=await db.rpc("transition_purchase_order",{actor_profile_id:actor.id,requested_order_id:orderId,requested_action:"close",requested_note:"Automated local verification"}); assert.equal(closed.error,null,closed.error?.message);
}finally{
  if(orderId) await cleanupOrder(orderId);
  if(productId){await db.from("inventory_balances").delete().eq("product_id",productId);await db.from("products").delete().eq("id",productId);}
  if(supplierId) await db.from("suppliers").delete().eq("id",supplierId);
}
console.log(`Purchasing verification passed: ${routes.length} routes, 6 tables, 4 RPCs, local create/approval/order/receipt/close workflow, stock integration, and cleanup.`);
