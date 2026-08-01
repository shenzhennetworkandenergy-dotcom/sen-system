import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const root=new URL("../",import.meta.url);
const migration=await readFile(new URL("supabase/migrations/202607240001_purchasing_module.sql",root),"utf8");
const inboundMigration=await readFile(new URL("supabase/migrations/202607310010_purchase_inbound_workflow.sql",root),"utf8");
const employeeReceivingMigration=await readFile(new URL("supabase/migrations/202608010005_inventory_new_stock_receiving_module.sql",root),"utf8");
for(const table of ["suppliers","purchase_orders","purchase_order_items","purchase_order_status_events","purchase_receipts","purchase_receipt_items"]) assert.match(migration,new RegExp(`create table public\\.${table}\\b`),`Missing ${table}`);
for(const fn of ["create_purchase_order","update_purchase_order","transition_purchase_order","receive_purchase_order"]) assert.match(migration,new RegExp(`function public\\.${fn}\\b`),`Missing ${fn}`);
assert.match(inboundMigration,/create table public\.purchase_inbound_shipments\b/);
for(const fn of ["transition_purchase_inbound_shipment","post_received_purchase_order","close_stock_received_purchase_order"]) assert.match(inboundMigration,new RegExp(`function public\\.${fn}\\b`),`Missing ${fn}`);
for(const status of ["ready_for_shipment","shipped","received","stock_received"]) assert.ok(inboundMigration.includes(`'${status}'`),`Missing inbound status: ${status}`);
for(const permission of ["purchasing.create","purchasing.edit","purchasing.approve","purchasing.receive","purchasing.cancel","inventory.receive"]) assert.ok(migration.includes(permission),`Missing permission enforcement: ${permission}`);
assert.match(migration,/security definer set search_path=''/);
assert.match(migration,/revoke all on function public\.receive_purchase_order/);
assert.match(employeeReceivingMigration,/inventory\.receive_new_stock/);
assert.match(employeeReceivingMigration,/receive_purchase_order\(uuid,uuid,date,text,text,text,jsonb\)/);
const routes=["app/admin/purchasing/page.tsx","app/admin/purchasing/new/page.tsx","app/admin/purchasing/[id]/page.tsx","app/admin/purchasing/[id]/edit/page.tsx","app/admin/purchasing/[id]/receive/page.tsx","app/admin/purchasing/export/route.ts","app/admin/suppliers/page.tsx","app/admin/suppliers/[id]/page.tsx"];
await Promise.all(routes.map((route)=>access(new URL(route,root))));
const [receiptFormSource,purchasingActionsSource]=await Promise.all([
  readFile(new URL("components/purchasing/PurchaseReceiptForm.tsx",root),"utf8"),
  readFile(new URL("app/admin/purchasing/actions.ts",root),"utf8"),
]);
const receiptActionSource=purchasingActionsSource.slice(
  purchasingActionsSource.indexOf("export async function receivePurchaseOrderAction"),
  purchasingActionsSource.indexOf("export async function createSupplierAction"),
);
assert.match(receiptFormSource,/purchase_order_item_id:\s*item\.id,[\s\S]*?quantity:\s*value\.quantity/, "Receipt form must submit the database RPC quantity field.");
assert.match(receiptActionSource,/quantity:\s*parseWholeNumber\(item\.quantity,/, "Receipt action must validate and forward the form's quantity field.");

const envText=await readFile(new URL(".env.local",root),"utf8").catch(()=>"");
const fileEnv=Object.fromEntries(envText.split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const index=line.indexOf("=");return [line.slice(0,index),line.slice(index+1).replace(/^['"]|['"]$/g,"")];}));
const env={...fileEnv,...process.env};
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
  await db.from("purchase_inbound_shipments").delete().eq("purchase_order_id",id);
  await db.from("purchase_order_status_events").delete().eq("purchase_order_id",id);
  await db.from("purchase_order_items").delete().eq("purchase_order_id",id);
  await db.from("purchase_orders").delete().eq("id",id);
  if(movementIds.length){await db.from("inventory_movement_items").delete().in("movement_id",movementIds);await db.from("inventory_movements").delete().in("id",movementIds);}
}
async function cleanupProduct(id){
  const serials=(await db.from("serial_numbers").select("id").eq("product_id",id)).data??[];
  const serialIds=serials.map((row)=>row.id);
  if(serialIds.length){await db.from("serial_tracking_events").delete().in("serial_number_id",serialIds);await db.from("serial_number_history").delete().in("serial_number_id",serialIds);await db.from("serial_numbers").delete().in("id",serialIds);}
  await db.from("serial_generation_batches").delete().eq("product_id",id);
  await db.from("product_revisions").delete().eq("product_id",id);
  await db.from("inventory_balances").delete().eq("product_id",id);
  await db.from("products").delete().eq("id",id);
}
const staleSuppliers=(await db.from("suppliers").select("id").like("code","VERIFY-%")).data??[];
for(const supplier of staleSuppliers){const staleOrders=(await db.from("purchase_orders").select("id").eq("supplier_id",supplier.id)).data??[];for(const order of staleOrders)await cleanupOrder(order.id);await db.from("suppliers").delete().eq("id",supplier.id);}
const staleProducts=(await db.from("products").select("id").like("sku","VERIFY-%")).data??[];
for(const product of staleProducts)await cleanupProduct(product.id);
const [{data:actor,error:actorError},{data:warehouse,error:warehouseError},{data:brand,error:brandError},{data:template,error:templateError}]=await Promise.all([
  db.from("profiles").select("id").eq("role","admin").eq("status","active").limit(1).single(),
  db.from("warehouses").select("id").eq("is_active",true).limit(1).single(),
  db.from("brands").select("id").eq("is_active",true).limit(1).single(),
  db.from("permission_templates").select("id").eq("is_default",true).eq("is_active",true).limit(1).single(),
]);
assert.equal(actorError,null,actorError?.message); assert.equal(warehouseError,null,warehouseError?.message); assert.equal(brandError,null,brandError?.message); assert.equal(templateError,null,templateError?.message);
const marker=`VERIFY-${Date.now()}`; let supplierId; let orderId; let productId; let employeeId; let workLocationId;
try{
  const employee=await db.auth.admin.createUser({email:`employee-stock-${Date.now()}-${randomUUID()}@example.invalid`,password:`Local-${randomUUID()}-9a`,email_confirm:true,user_metadata:{full_name:"Stock receiving verifier"}});
  assert.equal(employee.error,null,employee.error?.message); assert.ok(employee.data.user); employeeId=employee.data.user.id;
  const employeeAccess=await db.rpc("admin_update_profile_access",{actor_profile_id:actor.id,target_profile_id:employeeId,requested_role:"employee",requested_status:"active",requested_template_id:template.id});
  assert.equal(employeeAccess.error,null,employeeAccess.error?.message);
  const workLocation=await db.from("work_locations").insert({name:"Stock receiving verification",code:`${marker}-WL`,location_type:"warehouse",country_code:"BD",timezone:"Asia/Dhaka",is_active:true,created_by:actor.id}).select("id").single(); assert.equal(workLocation.error,null,workLocation.error?.message); workLocationId=workLocation.data.id;
  const workplaceAssignment=await db.from("profile_work_locations").insert({profile_id:employeeId,work_location_id:workLocationId,is_primary:true,is_active:true,assigned_by:actor.id}); assert.equal(workplaceAssignment.error,null,workplaceAssignment.error?.message);
  const warehouseAssignment=await db.from("profile_warehouse_assignments").insert({profile_id:employeeId,warehouse_id:warehouse.id,is_primary:true,is_active:true,assigned_by:actor.id}); assert.equal(warehouseAssignment.error,null,warehouseAssignment.error?.message);
  const employeePermission=await db.rpc("admin_set_profile_permissions",{actor_profile_id:actor.id,target_profile_id:employeeId,requested_template_id:template.id,allowed_permission_keys:["inventory.receive_new_stock"],denied_permission_keys:["inventory.receive"]});
  assert.equal(employeePermission.error,null,employeePermission.error?.message);
  const product=await db.from("products").insert({name:"Purchasing verification product",slug:marker.toLowerCase(),sku:marker,model_number:marker,brand_id:brand.id,status:"active",product_type:"simple",purchase_cost:10,regular_price:12,currency:"BDT",manage_stock:true,serial_tracking_required:true,default_warehouse_id:warehouse.id,created_by:actor.id,updated_by:actor.id}).select("id").single();
  assert.equal(product.error,null,product.error?.message); productId=product.data.id;
  const supplier=await db.from("suppliers").insert({code:marker,name:"Purchasing verification supplier",supplier_type:"distributor",status:"active",country_code:"BD",country_name:"Bangladesh",default_currency:"BDT",created_by:actor.id,updated_by:actor.id}).select("id").single();
  assert.equal(supplier.error,null,supplier.error?.message); supplierId=supplier.data.id;
  const created=await db.rpc("create_purchase_order",{actor_profile_id:actor.id,requested_supplier_id:supplierId,requested_warehouse_id:warehouse.id,requested_currency:"BDT",requested_order_date:new Date().toISOString().slice(0,10),requested_expected_date:null,requested_supplier_reference:marker,requested_payment_terms:0,requested_discount:0,requested_shipping:0,requested_tax:0,requested_other:0,requested_internal_notes:"Automated local verification",requested_supplier_notes:null,requested_items:[{product_id:productId,variation_id:null,quantity:2,unit_cost:10,discount_amount:0,tax_amount:0,description:"Verification line"}]});
  assert.equal(created.error,null,created.error?.message); orderId=created.data;
  for(const action of ["submit","approve"]){const transition=await db.rpc("transition_purchase_order",{actor_profile_id:actor.id,requested_order_id:orderId,requested_action:action,requested_note:"Automated local verification"});assert.equal(transition.error,null,`${action}: ${transition.error?.message}`);}
  const confirmed=await db.rpc("confirm_purchase_order_and_generate_serials",{actor_profile_id:actor.id,requested_order_id:orderId,requested_note:"Automated local verification"}); assert.equal(confirmed.error,null,confirmed.error?.message); assert.equal(Number(confirmed.data),2);
  const prepared=await db.rpc("transition_purchase_inbound_shipment",{actor_profile_id:actor.id,requested_order_id:orderId,requested_action:"prepare",requested_transport_mode:"air",requested_carrier_name:"Verification carrier",requested_tracking_number:marker,requested_expected_departure_at:null,requested_expected_arrival_at:null,requested_note:"Automated local verification"}); assert.equal(prepared.error,null,prepared.error?.message);
  const shipped=await db.rpc("transition_purchase_inbound_shipment",{actor_profile_id:actor.id,requested_order_id:orderId,requested_action:"ship",requested_transport_mode:null,requested_carrier_name:null,requested_tracking_number:null,requested_expected_departure_at:null,requested_expected_arrival_at:null,requested_note:"Automated local verification"}); assert.equal(shipped.error,null,shipped.error?.message);
  const arrived=await db.rpc("transition_purchase_inbound_shipment",{actor_profile_id:actor.id,requested_order_id:orderId,requested_action:"receive",requested_transport_mode:null,requested_carrier_name:null,requested_tracking_number:null,requested_expected_departure_at:null,requested_expected_arrival_at:null,requested_note:"Automated local verification"}); assert.equal(arrived.error,null,arrived.error?.message);
  const beforeStock=await db.from("inventory_balances").select("on_hand").eq("warehouse_id",warehouse.id).eq("product_id",productId).maybeSingle(); assert.equal(Number(beforeStock.data?.on_hand??0),0,"Physical arrival must not post stock.");
  const item=await db.from("purchase_order_items").select("id").eq("purchase_order_id",orderId).single(); assert.equal(item.error,null,item.error?.message);
  const expectedSerials=await db.from("serial_numbers").select("id,status").eq("product_id",productId);
  assert.equal(expectedSerials.error,null,expectedSerials.error?.message); assert.equal(expectedSerials.data.length,2); assert.ok(expectedSerials.data.every((serial)=>serial.status==="expected"));
  const firstReceipt=await db.rpc("post_received_purchase_order",{actor_profile_id:employeeId,requested_order_id:orderId,requested_receipt_date:new Date().toISOString().slice(0,10),requested_delivery_reference:marker,requested_invoice_reference:null,requested_notes:"Employee received one physical unit",requested_items:[{purchase_order_item_id:item.data.id,quantity:1,condition:"new",manufacturer_serials:[]}]});
  assert.equal(firstReceipt.error,null,firstReceipt.error?.message);
  const partial=await db.from("purchase_orders").select("status,purchase_order_items(quantity_ordered,quantity_received,quantity_rejected)").eq("id",orderId).single();
  assert.equal(partial.error,null,partial.error?.message); assert.equal(partial.data.status,"partially_received"); assert.equal(Number(partial.data.purchase_order_items[0].quantity_ordered)-Number(partial.data.purchase_order_items[0].quantity_received)-Number(partial.data.purchase_order_items[0].quantity_rejected),1,"The employee badge must fall to one after the first unit is received.");
  const revokeEmployeePermission=await db.rpc("admin_set_profile_permissions",{actor_profile_id:actor.id,target_profile_id:employeeId,requested_template_id:template.id,allowed_permission_keys:[],denied_permission_keys:["inventory.receive_new_stock","inventory.receive"]});
  assert.equal(revokeEmployeePermission.error,null,revokeEmployeePermission.error?.message);
  const deniedReceipt=await db.rpc("post_received_purchase_order",{actor_profile_id:employeeId,requested_order_id:orderId,requested_receipt_date:new Date().toISOString().slice(0,10),requested_delivery_reference:marker,requested_invoice_reference:null,requested_notes:"Permission denial verification",requested_items:[{purchase_order_item_id:item.data.id,quantity:1,condition:"new",manufacturer_serials:[]}]});
  assert.match(deniedReceipt.error?.message??"",/permission/i,"Receiving must fail as soon as the employee permission is removed.");
  const restoreEmployeePermission=await db.rpc("admin_set_profile_permissions",{actor_profile_id:actor.id,target_profile_id:employeeId,requested_template_id:template.id,allowed_permission_keys:["inventory.receive_new_stock"],denied_permission_keys:["inventory.receive"]});
  assert.equal(restoreEmployeePermission.error,null,restoreEmployeePermission.error?.message);
  const finalReceipt=await db.rpc("post_received_purchase_order",{actor_profile_id:employeeId,requested_order_id:orderId,requested_receipt_date:new Date().toISOString().slice(0,10),requested_delivery_reference:marker,requested_invoice_reference:null,requested_notes:"Employee received final physical unit",requested_items:[{purchase_order_item_id:item.data.id,quantity:1,condition:"new",manufacturer_serials:[]}]});
  assert.equal(finalReceipt.error,null,finalReceipt.error?.message);
  const checked=await db.from("purchase_orders").select("status,purchase_order_items(quantity_ordered,quantity_received),purchase_receipts(inventory_movement_id,purchase_receipt_items(serial_generation_batch_id))").eq("id",orderId).single();
  assert.equal(checked.error,null,checked.error?.message); assert.equal(checked.data.status,"stock_received"); assert.equal(Number(checked.data.purchase_order_items[0].quantity_received),2); assert.ok(checked.data.purchase_receipts.every((receipt)=>receipt.inventory_movement_id));
  assert.ok(checked.data.purchase_receipts[0].purchase_receipt_items[0].serial_generation_batch_id,"Serialized receipt must preserve its generated SEN serial batch.");
  const serials=await db.from("serial_numbers").select("sen_serial,barcode_value,status,generation_batch_id").eq("product_id",productId);
  assert.equal(serials.error,null,serials.error?.message); assert.equal(serials.data.length,2); assert.ok(serials.data.every((serial)=>serial.sen_serial&&serial.barcode_value===serial.sen_serial&&serial.status==="available"));
  const balance=await db.from("inventory_balances").select("on_hand,incoming").eq("warehouse_id",warehouse.id).eq("product_id",productId).single(); assert.equal(balance.error,null,balance.error?.message); assert.equal(Number(balance.data.on_hand),2); assert.equal(Number(balance.data.incoming),0);
  const closed=await db.rpc("close_stock_received_purchase_order",{actor_profile_id:actor.id,requested_order_id:orderId,requested_note:"Automated local verification"}); assert.equal(closed.error,null,closed.error?.message);
}finally{
  if(orderId) await cleanupOrder(orderId);
  if(productId)await cleanupProduct(productId);
  if(supplierId) await db.from("suppliers").delete().eq("id",supplierId);
  if(employeeId){await db.from("profile_warehouse_assignments").delete().eq("profile_id",employeeId);await db.from("profile_work_locations").delete().eq("profile_id",employeeId);await db.from("audit_logs").delete().or(`actor_id.eq.${employeeId},target_profile_id.eq.${employeeId}`);await db.from("profile_permission_overrides").delete().eq("profile_id",employeeId);await db.from("profile_permission_templates").delete().eq("profile_id",employeeId);await db.auth.admin.deleteUser(employeeId,false);}
  if(workLocationId)await db.from("work_locations").delete().eq("id",workLocationId);
}
console.log(`Purchasing verification passed: ${routes.length} routes, 7 tables, 7 RPCs, employee one-by-one physical receiving with permission enforcement, badge countdown 2 -> 1 -> 0, atomic SEN serial activation, stock integration, and cleanup.`);
