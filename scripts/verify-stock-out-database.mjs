import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.STOCK_OUT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("STOCK_OUT_DATABASE_URL or DATABASE_URL is required for the Stock Out database verification.");
}

const client = new pg.Client({ connectionString: databaseUrl });
const query = (text, values = []) => client.query(text, values);
const one = async (text, values = []) => (await query(text, values)).rows[0];
let savepointCounter = 0;

async function expectDatabaseError(work, pattern) {
  const savepoint = `expected_failure_${++savepointCounter}`;
  await query(`savepoint ${savepoint}`);
  try {
    await work();
    assert.fail("Expected the database operation to fail.");
  } catch (error) {
    assert.match(String(error?.message ?? error), pattern);
  } finally {
    await query(`rollback to savepoint ${savepoint}`);
    await query(`release savepoint ${savepoint}`);
  }
}

function id() {
  return randomUUID();
}

await client.connect();
try {
  const capabilities = await one(`
    select
      to_regprocedure('public.finalize_sale_invoice(uuid,uuid,uuid,bigint)') is not null as finalize,
      to_regprocedure('public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)') is not null as stock_out,
      to_regprocedure('public.confirm_physical_return_receipt(uuid,uuid,uuid,uuid,numeric,uuid[])') is not null as physical_return
  `);
  assert.deepEqual(capabilities, { finalize: true, stock_out: true, physical_return: true },
    "Apply the additive Stock Out migration before running this verification.");

  await query("begin");
  await query("select set_config('sen.actor_role','service_role',true)");
  const fixture = {
    admin: id(), employee: id(), customer: id(), warehouse: id(), product: id(),
    order: id(), orderItem: id(), balance: id(), reservation: id(),
  };
  const stamp = fixture.order.slice(0, 8);
  const category = await one("select id from public.business_categories where is_active order by created_at limit 1");
  assert.ok(category?.id, "A seeded business category is required for local verification.");

  await query(`insert into public.profiles(id,email,full_name,role,status) values
    ($1,$2,'Stock Out Test Admin','admin','active'),
    ($3,$4,'Stock Out Test Employee','employee','active'),
    ($5,$6,'Stock Out Test Customer','customer','active')`, [
    fixture.admin, `stock-out-admin-${stamp}@local.test`,
    fixture.employee, `stock-out-employee-${stamp}@local.test`,
    fixture.customer, `stock-out-customer-${stamp}@local.test`,
  ]);
  await query(`insert into public.warehouses(id,code,name,country_code,country_name,is_active)
    values($1,$2,'Stock Out Test Warehouse','BD','Bangladesh',true)`,
    [fixture.warehouse, `T-${stamp}`]);
  await query(`insert into public.profile_warehouse_assignments(
    profile_id,warehouse_id,is_primary,is_active,assigned_by
  ) values($1,$2,true,true,$3)`, [fixture.employee, fixture.warehouse, fixture.admin]);
  await query(`insert into public.profile_permission_overrides(
    profile_id,permission_id,effect,reason,assigned_by,is_active
  ) select $1,id,'allow','Stock Out rollback-only verification',$2,true
    from public.permissions where key=any($3::text[])`, [
    fixture.employee, fixture.admin, ["inventory.release_sales_stock", "rma.receive"],
  ]);
  assert.equal(Number((await one(
    "select count(*) count from public.effective_permissions_for_profile($1) where permission_key=any($2::text[])",
    [fixture.employee, ["inventory.release_sales_stock", "rma.receive"]],
  )).count), 2);

  await query(`insert into public.products(
    id,name,slug,sku,status,business_category_id,serial_tracking_required,
    public_catalogue_visible,created_by,updated_by
  ) values($1,$2,$3,$4,'active',$5,false,true,$6,$6)`, [
    fixture.product, "Rollback Stock Out Product", `rollback-stock-out-${stamp}`,
    `RB-STO-${stamp}`, category.id, fixture.admin,
  ]);
  await query(`insert into public.inventory_balances(
    id,warehouse_id,product_id,on_hand,reserved,damaged,unavailable
  ) values($1,$2,$3,10,3,1,1)`, [fixture.balance, fixture.warehouse, fixture.product]);
  assert.equal(Number((await one("select available from public.inventory_balances where id=$1", [fixture.balance])).available), 5,
    "Available must equal physical minus reserved, damaged, and unavailable.");

  await query(`insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,
    fulfillment_warehouse_id,status,subtotal,total_amount,confirmed_at,created_by,updated_by
  ) values($1,$2,$3,'{}'::jsonb,$4,'confirmed',300,300,now(),$5,$5)`, [
    fixture.order, `TEST-SALE-${stamp}`, fixture.customer, fixture.warehouse, fixture.admin,
  ]);
  await query(`insert into public.sales_order_items(
    id,order_id,product_id,fulfillment_warehouse_id,quantity,packed_quantity,
    unit_price,line_subtotal,line_total,currency,serial_tracking_required_snapshot,
    product_name_snapshot,sku_snapshot
  ) values($1,$2,$3,$4,3,3,100,300,300,'BDT',false,$5,$6)`, [
    fixture.orderItem, fixture.order, fixture.product, fixture.warehouse,
    "Rollback Stock Out Product", `RB-STO-${stamp}`,
  ]);
  await query(`insert into public.inventory_reservations(
    id,product_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id
  ) values($1,$2,$3,3,'active',$4,$5,$6,$7)`, [
    fixture.reservation, fixture.product, fixture.warehouse, `TEST-SALE-${stamp}`,
    fixture.admin, fixture.order, fixture.orderItem,
  ]);

  const finalizationToken = id();
  const firstDocument = (await one("select public.finalize_sale_invoice($1,$2,$3,$4) id", [
    fixture.admin, fixture.order, finalizationToken, 0,
  ])).id;
  const retriedDocument = (await one("select public.finalize_sale_invoice($1,$2,$3,$4) id", [
    fixture.admin, fixture.order, finalizationToken, 0,
  ])).id;
  assert.equal(retriedDocument, firstDocument, "Invoice finalization token must be idempotent.");
  await expectDatabaseError(() => query(
    "select public.finalize_sale_invoice($1,$2,$3,$4)",
    [fixture.admin, fixture.order, id(), 0],
  ), /another tab|refresh/i);
  const firstRequest = await one("select * from public.sales_stock_out_requests where sales_order_id=$1", [fixture.order]);
  const secondDocument = (await one("select public.finalize_sale_invoice($1,$2,$3,$4) id", [
    fixture.admin, fixture.order, id(), Number(firstRequest.version),
  ])).id;
  assert.notEqual(secondDocument, firstDocument, "A new finalization creates an immutable invoice revision.");
  const request = await one("select * from public.sales_stock_out_requests where sales_order_id=$1", [fixture.order]);
  assert.equal(Number((await one("select count(*) count from public.sales_stock_out_requests where sales_order_id=$1", [fixture.order])).count), 1);
  assert.equal(Number((await one("select count(*) count from public.sales_stock_out_request_revisions where request_id=$1", [request.id])).count), 2);
  assert.equal(Number((await one("select count(*) count from public.sales_stock_out_requests where id=$1 and status in('pending_release','partially_released')", [request.id])).count), 1,
    "One pending invoice must count as one badge request, not three units.");
  const requestItem = await one("select * from public.sales_stock_out_request_items where request_id=$1", [request.id]);

  const firstReleaseToken = id();
  const firstPayload = { request_version: Number(request.version), items: [{
    request_item_id: requestItem.id, quantity: 2, serial_ids: [],
  }] };
  const firstRelease = (await one(
    "select public.confirm_sales_stock_out($1,$2,$3,$4::jsonb) id",
    [fixture.employee, request.id, firstReleaseToken, JSON.stringify(firstPayload)],
  )).id;
  const retriedRelease = (await one(
    "select public.confirm_sales_stock_out($1,$2,$3,$4::jsonb) id",
    [fixture.employee, request.id, firstReleaseToken, JSON.stringify(firstPayload)],
  )).id;
  assert.equal(retriedRelease, firstRelease, "Stock Out operation token must not deduct twice.");
  let balance = await one("select on_hand,reserved,damaged,unavailable,available from public.inventory_balances where id=$1", [fixture.balance]);
  assert.deepEqual(Object.fromEntries(Object.entries(balance).map(([key, value]) => [key, Number(value)])), {
    on_hand: 8, reserved: 1, damaged: 1, unavailable: 1, available: 5,
  });
  let updatedRequest = await one("select * from public.sales_stock_out_requests where id=$1", [request.id]);
  assert.equal(updatedRequest.status, "partially_released");
  assert.equal(Number(updatedRequest.remaining_quantity), 1);
  await expectDatabaseError(() => query(
    "select public.confirm_sales_stock_out($1,$2,$3,$4::jsonb)",
    [fixture.employee, request.id, id(), JSON.stringify(firstPayload)],
  ), /already been updated|refresh/i);

  const revisionPayload = (quantity) => JSON.stringify([{
    id: fixture.orderItem,
    quantity,
    unit_price: 100,
    discount_type: "fixed",
    discount_value: 0,
  }]);
  await query("select public.update_sale_lines($1,$2,$3,$4::jsonb)", [
    fixture.admin, fixture.order, "Increase after partial physical release", revisionPayload(4),
  ]);
  assert.equal(
    Number((await one("select count(*) count from public.sale_documents where order_id=$1 and document_type='invoice' and status='generated'", [fixture.order])).count),
    1,
    "Saving an edit must preserve the last successfully finalized invoice until replacement finalization commits.",
  );
  assert.equal(
    Number((await one("select reserved from public.inventory_balances where id=$1", [fixture.balance])).reserved),
    1,
    "Saving an unfinalized invoice revision must not change reservation or public availability.",
  );
  let revisionRequest = await one("select * from public.sales_stock_out_requests where id=$1", [request.id]);
  await query("select public.finalize_sale_invoice($1,$2,$3,$4)", [
    fixture.admin, fixture.order, id(), Number(revisionRequest.version),
  ]);
  balance = await one("select reserved from public.inventory_balances where id=$1", [fixture.balance]);
  revisionRequest = await one("select * from public.sales_stock_out_requests where id=$1", [request.id]);
  assert.equal(Number(balance.reserved), 2, "A revision increase reserves only the two unreleased units.");
  assert.equal(Number(revisionRequest.remaining_quantity), 2);

  await query("select public.update_sale_lines($1,$2,$3,$4::jsonb)", [
    fixture.admin, fixture.order, "Reduce after partial physical release", revisionPayload(3),
  ]);
  assert.equal(
    Number((await one("select reserved from public.inventory_balances where id=$1", [fixture.balance])).reserved),
    2,
    "Reservation remains on the last finalized revision until the new revision commits.",
  );
  revisionRequest = await one("select * from public.sales_stock_out_requests where id=$1", [request.id]);
  await query("select public.finalize_sale_invoice($1,$2,$3,$4)", [
    fixture.admin, fixture.order, id(), Number(revisionRequest.version),
  ]);
  balance = await one("select reserved from public.inventory_balances where id=$1", [fixture.balance]);
  updatedRequest = await one("select * from public.sales_stock_out_requests where id=$1", [request.id]);
  assert.equal(Number(balance.reserved), 1, "A revision reduction preserves released units and one remaining reservation.");
  assert.equal(Number(updatedRequest.remaining_quantity), 1);

  await query("savepoint invalid_revision");
  await query("update public.sales_order_items set quantity=1,packed_quantity=1 where id=$1", [fixture.orderItem]);
  await expectDatabaseError(() => query(
    "select public.finalize_sale_invoice($1,$2,$3,$4)",
    [fixture.admin, fixture.order, id(), Number(updatedRequest.version)],
  ), /lower than|already physically released/i);
  await query("rollback to savepoint invalid_revision");
  await query("release savepoint invalid_revision");

  const finalPayload = { request_version: Number(updatedRequest.version), items: [{
    request_item_id: requestItem.id, quantity: 1, serial_ids: [],
  }] };
  await query("select public.confirm_sales_stock_out($1,$2,$3,$4::jsonb)", [
    fixture.employee, request.id, id(), JSON.stringify(finalPayload),
  ]);
  updatedRequest = await one("select * from public.sales_stock_out_requests where id=$1", [request.id]);
  assert.equal(updatedRequest.status, "fully_released");
  assert.equal(Number(updatedRequest.remaining_quantity), 0);
  assert.equal(Number((await one("select count(*) count from public.sales_stock_out_requests where id=$1 and status in('pending_release','partially_released')", [request.id])).count), 0);
  balance = await one("select on_hand,reserved,available from public.inventory_balances where id=$1", [fixture.balance]);
  assert.deepEqual({ onHand: Number(balance.on_hand), reserved: Number(balance.reserved), available: Number(balance.available) },
    { onHand: 7, reserved: 0, available: 5 });
  assert.equal((await one("select status from public.inventory_reservations where id=$1", [fixture.reservation])).status, "consumed");
  assert.equal(Number((await one("select count(*) count from public.inventory_movements where movement_type='stock_out' and initiated_by=$1", [fixture.employee])).count), 2);

  const shipmentId = id();
  await query(`insert into public.shipments(
    id,shipment_number,order_id,status,transport_mode,origin_snapshot,destination_snapshot,
    created_by,updated_by,confirmed_at
  ) values($1,$2,$3,'confirmed','road','{}','{}',$4,$4,now())`, [
    shipmentId, `TEST-SHP-${stamp}`, fixture.order, fixture.admin,
  ]);
  await query("insert into public.shipment_items(shipment_id,order_item_id,quantity) values($1,$2,3)", [shipmentId, fixture.orderItem]);
  const movementsBeforeDispatch = Number((await one("select count(*) count from public.inventory_movements")).count);
  await query("select public.dispatch_order_shipment($1,$2)", [fixture.admin, shipmentId]);
  assert.equal(Number((await one("select count(*) count from public.inventory_movements")).count), movementsBeforeDispatch,
    "Shipment dispatch must not create another physical movement.");
  balance = await one("select on_hand,reserved from public.inventory_balances where id=$1", [fixture.balance]);
  assert.deepEqual({ onHand: Number(balance.on_hand), reserved: Number(balance.reserved) }, { onHand: 7, reserved: 0 });

  await expectDatabaseError(() => query("select public.cancel_sales_order($1,$2,$3)", [
    fixture.admin, fixture.order, "Cancellation before return must fail",
  ]), /proper physical return/i);

  const coverageId = id();
  const claimId = id();
  await query(`insert into public.warranty_coverages(
    id,sales_order_id,sales_order_item_id,customer_profile_id,product_id,
    covered_quantity,warranty_duration_months,starts_at,ends_at,status
  ) values($1,$2,$3,$4,$5,3,12,current_date,current_date+365,'active')`, [
    coverageId, fixture.order, fixture.orderItem, fixture.customer, fixture.product,
  ]);
  await query(`insert into public.rma_claims(
    id,customer_profile_id,warranty_coverage_id,sales_order_id,sales_order_item_id,
    product_id,claim_type,quantity,description,status
  ) values($1,$2,$3,$4,$5,$6,'return',3,$7,'return_requested')`, [
    claimId, fixture.customer, coverageId, fixture.order, fixture.orderItem,
    fixture.product, "Rollback-only physical customer return verification.",
  ]);
  const releaseItems = (await query(`select item.id,item.quantity_released
    from public.sales_stock_out_release_items item
    join public.sales_stock_out_releases release on release.id=item.release_id
    where release.request_id=$1 order by item.created_at`, [request.id])).rows;
  assert.equal(releaseItems.length, 2);
  for (const item of releaseItems) {
    const token = id();
    const receipt = (await one(
      "select public.confirm_physical_return_receipt($1,$2,$3,$4,$5,$6::uuid[]) id",
      [fixture.employee, claimId, item.id, token, Number(item.quantity_released), []],
    )).id;
    const retriedReceipt = (await one(
      "select public.confirm_physical_return_receipt($1,$2,$3,$4,$5,$6::uuid[]) id",
      [fixture.employee, claimId, item.id, token, Number(item.quantity_released), []],
    )).id;
    assert.equal(retriedReceipt, receipt, "Physical Return Receipt token must be idempotent.");
  }
  balance = await one("select on_hand,reserved,damaged,unavailable,available from public.inventory_balances where id=$1", [fixture.balance]);
  assert.deepEqual(Object.fromEntries(Object.entries(balance).map(([key, value]) => [key, Number(value)])), {
    on_hand: 10, reserved: 0, damaged: 1, unavailable: 4, available: 5,
  });
  assert.equal(Number((await one("select count(*) count from public.inventory_movements where movement_type='customer_return' and initiated_by=$1", [fixture.employee])).count), 2);
  const beforeCancellation = Number((await one("select count(*) count from public.inventory_movements")).count);
  await query("select public.cancel_sales_order($1,$2,$3)", [fixture.admin, fixture.order, "Cancelled after all physical returns"]);
  assert.equal((await one("select status from public.sales_stock_out_requests where id=$1", [request.id])).status, "cancelled");
  assert.equal(Number((await one("select count(*) count from public.inventory_movements")).count), beforeCancellation,
    "Invoice cancellation must not create fake stock movement.");

  // A second finalized invoice is cancelled before release: reservation only.
  const order2 = id(), item2 = id(), reservation2 = id();
  await query(`update public.inventory_balances set reserved=reserved+2 where id=$1`, [fixture.balance]);
  await query(`insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,fulfillment_warehouse_id,
    status,subtotal,total_amount,confirmed_at,created_by,updated_by
  ) values($1,$2,$3,'{}',$4,'confirmed',200,200,now(),$5,$5)`, [
    order2, `TEST-CANCEL-${stamp}`, fixture.customer, fixture.warehouse, fixture.admin,
  ]);
  await query(`insert into public.sales_order_items(
    id,order_id,product_id,fulfillment_warehouse_id,quantity,packed_quantity,
    unit_price,line_subtotal,line_total,currency,serial_tracking_required_snapshot,
    product_name_snapshot,sku_snapshot
  ) values($1,$2,$3,$4,2,2,100,200,200,'BDT',false,$5,$6)`, [
    item2, order2, fixture.product, fixture.warehouse, "Rollback Stock Out Product", `RB-STO-${stamp}`,
  ]);
  await query(`insert into public.inventory_reservations(
    id,product_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id
  ) values($1,$2,$3,2,'active',$4,$5,$6,$7)`, [
    reservation2, fixture.product, fixture.warehouse, `TEST-CANCEL-${stamp}`, fixture.admin, order2, item2,
  ]);
  await query("select public.finalize_sale_invoice($1,$2,$3,$4)", [fixture.admin, order2, id(), 0]);
  const physicalBeforePreReleaseCancel = Number((await one("select on_hand from public.inventory_balances where id=$1", [fixture.balance])).on_hand);
  await query("select public.cancel_sales_order($1,$2,$3)", [fixture.admin, order2, "Cancelled before physical release"]);
  balance = await one("select on_hand,reserved from public.inventory_balances where id=$1", [fixture.balance]);
  assert.equal(Number(balance.on_hand), physicalBeforePreReleaseCancel);
  assert.equal(Number(balance.reserved), 0);
  assert.equal((await one("select status from public.inventory_reservations where id=$1", [reservation2])).status, "cancelled");

  // Serialized confirmation proves exact-unit linkage and permanent uniqueness.
  const serialProduct = id(), serialBalance = id(), serialOrder = id(), serialItem = id(), serialReservation = id();
  const serialIds = [id(), id()];
  const replacementSerialId = id();
  await query(`insert into public.products(
    id,name,slug,sku,status,business_category_id,serial_tracking_required,
    public_catalogue_visible,created_by,updated_by
  ) values($1,$2,$3,$4,'active',$5,true,true,$6,$6)`, [
    serialProduct, "Rollback Serialized Product", `rollback-serial-${stamp}`,
    `RB-SER-${stamp}`, category.id, fixture.admin,
  ]);
  await query(`insert into public.inventory_balances(id,warehouse_id,product_id,on_hand,reserved)
    values($1,$2,$3,3,2)`, [serialBalance, fixture.warehouse, serialProduct]);
  await query(`insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,fulfillment_warehouse_id,
    status,subtotal,total_amount,confirmed_at,created_by,updated_by
  ) values($1,$2,$3,'{}',$4,'confirmed',200,200,now(),$5,$5)`, [
    serialOrder, `TEST-SERIAL-${stamp}`, fixture.customer, fixture.warehouse, fixture.admin,
  ]);
  await query(`insert into public.sales_order_items(
    id,order_id,product_id,fulfillment_warehouse_id,quantity,allocated_quantity,packed_quantity,
    unit_price,line_subtotal,line_total,currency,serial_tracking_required_snapshot,
    product_name_snapshot,sku_snapshot
  ) values($1,$2,$3,$4,2,2,2,100,200,200,'BDT',true,$5,$6)`, [
    serialItem, serialOrder, serialProduct, fixture.warehouse,
    "Rollback Serialized Product", `RB-SER-${stamp}`,
  ]);
  await query(`insert into public.inventory_reservations(
    id,product_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id
  ) values($1,$2,$3,2,'active',$4,$5,$6,$7)`, [
    serialReservation, serialProduct, fixture.warehouse, `TEST-SERIAL-${stamp}`,
    fixture.admin, serialOrder, serialItem,
  ]);
  for (let index = 0; index < serialIds.length; index += 1) {
    await query(`insert into public.serial_numbers(
      id,manufacturer_serial,sen_serial,barcode_value,product_id,warehouse_id,status,condition
    ) values($1,$2,$3,$3,$4,$5,'packed','new')`, [
      serialIds[index], `RB-MFG-${stamp}-${index}`, `RB-SEN-${stamp}-${index}`,
      serialProduct, fixture.warehouse,
    ]);
    await query(`insert into public.order_serial_allocations(
      order_id,order_item_id,serial_number_id,warehouse_id,status,allocation_method,allocated_by,packed_at
    ) values($1,$2,$3,$4,'packed','scan',$5,now())`, [
      serialOrder, serialItem, serialIds[index], fixture.warehouse, fixture.admin,
    ]);
  }
  await query(`insert into public.serial_numbers(
    id,manufacturer_serial,sen_serial,barcode_value,product_id,warehouse_id,status,condition
  ) values($1,$2,$3,$3,$4,$5,'available','new')`, [
    replacementSerialId, `RB-MFG-${stamp}-replacement`, `RB-SEN-${stamp}-replacement`,
    serialProduct, fixture.warehouse,
  ]);
  await query("select public.finalize_sale_invoice($1,$2,$3,$4)", [fixture.admin, serialOrder, id(), 0]);
  const serialRequest = await one("select * from public.sales_stock_out_requests where sales_order_id=$1", [serialOrder]);
  const serialRequestItem = await one("select * from public.sales_stock_out_request_items where request_id=$1", [serialRequest.id]);
  await expectDatabaseError(() => query(
    "select public.confirm_sales_stock_out($1,$2,$3,$4::jsonb)", [
      fixture.employee, serialRequest.id, id(), JSON.stringify({
        request_version: Number(serialRequest.version),
        items: [{ request_item_id: serialRequestItem.id, quantity: 2, serial_ids: [serialIds[0], replacementSerialId] }],
      }),
    ],
  ), /assigned to this finalized invoice|replace serial/i);

  const allocations = (await query(`select id,serial_number_id from public.order_serial_allocations
    where order_item_id=$1 order by allocated_at,id`, [serialItem])).rows;
  const replacedAllocation = allocations.find((row) => row.serial_number_id === serialIds[1]);
  assert.ok(replacedAllocation, "The preassigned replacement allocation must exist.");
  const preparedShipmentId = id(), preparedShipmentItemId = id();
  await query(`insert into public.shipments(
    id,shipment_number,order_id,status,transport_mode,origin_snapshot,destination_snapshot,
    created_by,updated_by,confirmed_at
  ) values($1,$2,$3,'ready','road','{}','{}',$4,$4,now())`, [
    preparedShipmentId, `TEST-SERIAL-SHP-${stamp}`, serialOrder, fixture.admin,
  ]);
  await query("insert into public.shipment_items(id,shipment_id,order_item_id,quantity) values($1,$2,$3,1)", [
    preparedShipmentItemId, preparedShipmentId, serialItem,
  ]);
  await query("insert into public.shipment_serials(shipment_item_id,allocation_id,serial_number_id) values($1,$2,$3)", [
    preparedShipmentItemId, replacedAllocation.id, serialIds[1],
  ]);
  await query("update public.serial_numbers set status='damaged',condition='damaged' where id=$1", [serialIds[1]]);
  await query("select public.replace_stock_out_serial($1,$2,$3,$4,$5,$6)", [
    fixture.employee, serialRequestItem.id, serialIds[1], replacementSerialId,
    "Physical unit replacement verification", id(),
  ]);
  assert.equal(
    (await one("select serial_number_id from public.shipment_serials where allocation_id=$1", [replacedAllocation.id])).serial_number_id,
    replacementSerialId,
    "Prepared shipment must follow an audited serial replacement.",
  );
  assert.equal(
    (await one("select status from public.serial_numbers where id=$1", [serialIds[1]])).status,
    "damaged",
    "Replacing an ineligible physical unit must never make the previous SEN Serial available.",
  );
  await query("select public.confirm_sales_stock_out($1,$2,$3,$4::jsonb)", [
    fixture.employee, serialRequest.id, id(), JSON.stringify({
      request_version: Number(serialRequest.version),
      items: [{ request_item_id: serialRequestItem.id, quantity: 2, serial_ids: [serialIds[0], replacementSerialId] }],
    }),
  ]);
  const releasedSerialIds = [serialIds[0], replacementSerialId];
  assert.equal(Number((await one("select count(*) count from public.sales_stock_out_release_serials where serial_number_id=any($1::uuid[])", [releasedSerialIds])).count), 2);
  assert.equal(Number((await one("select count(*) count from public.serial_numbers where id=any($1::uuid[]) and status='warehouse_released'", [releasedSerialIds])).count), 2);

  // A physically returned serial can be cleared by the existing RMA/service
  // workflow and safely participate in a later, separately audited sale.
  const serialReleaseItem = await one(`select release_item.id
    from public.sales_stock_out_release_items release_item
    join public.sales_stock_out_releases release on release.id=release_item.release_id
    where release.request_id=$1`, [serialRequest.id]);
  const serialClaimId = id();
  const serialCoverageId = id();
  await query(`insert into public.warranty_coverages(
    id,sales_order_id,sales_order_item_id,customer_profile_id,product_id,
    serial_number_id,covered_quantity,warranty_duration_months,starts_at,ends_at,status
  ) values($1,$2,$3,$4,$5,$6,1,12,current_date,current_date+365,'active')`, [
    serialCoverageId, serialOrder, serialItem, fixture.customer, serialProduct, serialIds[0],
  ]);
  await query(`insert into public.rma_claims(
    id,rma_number,customer_profile_id,warranty_coverage_id,sales_order_id,
    sales_order_item_id,product_id,serial_number_id,claim_type,quantity,description,status
  ) values($1,$2,$3,$4,$5,$6,$7,$8,'return',1,$9,'return_requested')`, [
    serialClaimId, `TEST-RMA-SERIAL-${stamp}`, fixture.customer, serialCoverageId,
    serialOrder, serialItem, serialProduct, serialIds[0],
    "Rollback serialized return verification.",
  ]);
  await query(
    "select public.confirm_physical_return_receipt($1,$2,$3,$4,$5,$6::uuid[])",
    [fixture.employee, serialClaimId, serialReleaseItem.id, id(), 1, [serialIds[0]]],
  );
  await query(`update public.inventory_balances
    set unavailable=unavailable-1,reserved=reserved+1 where id=$1`, [serialBalance]);
  await query(`update public.serial_numbers
    set status='packed',service_status='normal',active_rma_claim_id=null where id=$1`, [serialIds[0]]);

  const reuseOrder = id(), reuseItem = id(), reuseReservation = id();
  await query(`insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,fulfillment_warehouse_id,
    status,subtotal,total_amount,confirmed_at,created_by,updated_by
  ) values($1,$2,$3,'{}',$4,'confirmed',100,100,now(),$5,$5)`, [
    reuseOrder, `TEST-SERIAL-REUSE-${stamp}`, fixture.customer, fixture.warehouse, fixture.admin,
  ]);
  await query(`insert into public.sales_order_items(
    id,order_id,product_id,fulfillment_warehouse_id,quantity,allocated_quantity,packed_quantity,
    unit_price,line_subtotal,line_total,currency,serial_tracking_required_snapshot,
    product_name_snapshot,sku_snapshot
  ) values($1,$2,$3,$4,1,1,1,100,100,100,'BDT',true,$5,$6)`, [
    reuseItem, reuseOrder, serialProduct, fixture.warehouse,
    "Rollback Serialized Product", `RB-SER-${stamp}`,
  ]);
  await query(`insert into public.inventory_reservations(
    id,product_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id
  ) values($1,$2,$3,1,'active',$4,$5,$6,$7)`, [
    reuseReservation, serialProduct, fixture.warehouse, `TEST-SERIAL-REUSE-${stamp}`,
    fixture.admin, reuseOrder, reuseItem,
  ]);
  await query(`insert into public.order_serial_allocations(
    order_id,order_item_id,serial_number_id,warehouse_id,status,allocation_method,allocated_by,packed_at
  ) values($1,$2,$3,$4,'packed','scan',$5,now())`, [
    reuseOrder, reuseItem, serialIds[0], fixture.warehouse, fixture.admin,
  ]);
  await query("select public.finalize_sale_invoice($1,$2,$3,$4)", [fixture.admin, reuseOrder, id(), 0]);
  const reuseRequest = await one("select * from public.sales_stock_out_requests where sales_order_id=$1", [reuseOrder]);
  const reuseRequestItem = await one("select * from public.sales_stock_out_request_items where request_id=$1", [reuseRequest.id]);
  await query("select public.confirm_sales_stock_out($1,$2,$3,$4::jsonb)", [
    fixture.employee, reuseRequest.id, id(), JSON.stringify({
      request_version: Number(reuseRequest.version),
      items: [{ request_item_id: reuseRequestItem.id, quantity: 1, serial_ids: [serialIds[0]] }],
    }),
  ]);
  assert.equal(
    Number((await one("select count(*) count from public.sales_stock_out_release_serials where serial_number_id=$1", [serialIds[0]])).count),
    2,
    "The returned SEN Serial must retain both immutable physical release lifecycles.",
  );

  // Upstream allocation rejects ineligible physical units and cancellation
  // must never resurrect an unavailable allocated unit as saleable.
  const unavailableSerialId = id(), unavailableOrder = id(), unavailableItem = id();
  await query(`insert into public.serial_numbers(
    id,manufacturer_serial,sen_serial,barcode_value,product_id,warehouse_id,status,condition
  ) values($1,$2,$3,$3,$4,$5,'available','unavailable')`, [
    unavailableSerialId, `RB-MFG-${stamp}-unavailable`, `RB-SEN-${stamp}-unavailable`,
    serialProduct, fixture.warehouse,
  ]);
  await query(`insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,fulfillment_warehouse_id,
    status,subtotal,total_amount,confirmed_at,created_by,updated_by
  ) values($1,$2,$3,'{}',$4,'confirmed',100,100,now(),$5,$5)`, [
    unavailableOrder, `TEST-UNAVAILABLE-${stamp}`, fixture.customer, fixture.warehouse, fixture.admin,
  ]);
  await query(`insert into public.sales_order_items(
    id,order_id,product_id,fulfillment_warehouse_id,quantity,
    unit_price,line_subtotal,line_total,currency,serial_tracking_required_snapshot,
    product_name_snapshot,sku_snapshot
  ) values($1,$2,$3,$4,1,100,100,100,'BDT',true,$5,$6)`, [
    unavailableItem, unavailableOrder, serialProduct, fixture.warehouse,
    "Rollback Serialized Product", `RB-SER-${stamp}`,
  ]);
  await expectDatabaseError(
    () => query("select public.allocate_order_serials($1,$2,$3::uuid[],$4)", [
      fixture.admin, unavailableItem, [unavailableSerialId], "manual",
    ]),
    /not eligible/i,
  );
  await query(`insert into public.order_serial_allocations(
    order_id,order_item_id,serial_number_id,warehouse_id,status,allocation_method,allocated_by
  ) values($1,$2,$3,$4,'active','manual',$5)`, [
    unavailableOrder, unavailableItem, unavailableSerialId, fixture.warehouse, fixture.admin,
  ]);
  await query("update public.serial_numbers set status='allocated' where id=$1", [unavailableSerialId]);
  await query("select public.cancel_sales_order($1,$2,$3)", [
    fixture.admin, unavailableOrder, "Cancel ineligible serial verification",
  ]);
  assert.equal(
    (await one("select status from public.serial_numbers where id=$1", [unavailableSerialId])).status,
    "unavailable",
    "Cancelling a sale must preserve an unavailable SEN Serial state.",
  );

  await query("rollback");
  console.log("Stock Out database verification passed: invoice, badges, physical release, shipment, cancellation, return, and serial ledgers rolled back cleanly.");
} catch (error) {
  try { await query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}
