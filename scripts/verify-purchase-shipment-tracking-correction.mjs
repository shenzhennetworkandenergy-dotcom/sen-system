import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.SHIPMENT_CORRECTION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("SHIPMENT_CORRECTION_DATABASE_URL or DATABASE_URL is required for shipment correction verification.");
}

const client = new pg.Client({ connectionString: databaseUrl });
const query = (text, values = []) => client.query(text, values);
const one = async (text, values = []) => (await query(text, values)).rows[0];
let savepoint = 0;

async function expectDatabaseError(work, pattern) {
  const name = `expected_failure_${++savepoint}`;
  await query(`savepoint ${name}`);
  try {
    await work();
    assert.fail("Expected the database operation to fail.");
  } catch (error) {
    assert.match(String(error?.message ?? error), pattern);
  } finally {
    await query(`rollback to savepoint ${name}`);
    await query(`release savepoint ${name}`);
  }
}

const id = () => randomUUID();

await client.connect();
try {
  const capability = await one(`
    select to_regprocedure(
      'public.correct_purchase_inbound_shipment_tracking(uuid,uuid,uuid,uuid,text,text)'
    ) is not null as available
  `);
  assert.equal(capability.available, true,
    "Apply the additive supplier shipment tracking correction migration first.");

  await query("begin");
  await query("select set_config('sen.actor_role','service_role',true)");
  await query("select set_config('request.jwt.claim.role','service_role',true)");

  const admin = id();
  const authorizedEmployee = id();
  const unauthorizedEmployee = id();
  const warehouse = id();
  const supplier = id();
  const purchaseOrder = id();
  const shipment = id();
  const oldCarrier = id();
  const newCarrier = id();
  const inactiveCarrier = id();
  const stamp = purchaseOrder.slice(0, 8);

  await query(`insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
    ($1,$2,jsonb_build_object('full_name','Tracking Test Admin'),now(),now()),
    ($3,$4,jsonb_build_object('full_name','Tracking Test Authorized'),now(),now()),
    ($5,$6,jsonb_build_object('full_name','Tracking Test Unauthorized'),now(),now())`, [
    admin, `tracking-admin-${stamp}@local.test`,
    authorizedEmployee, `tracking-authorized-${stamp}@local.test`,
    unauthorizedEmployee, `tracking-unauthorized-${stamp}@local.test`,
  ]);
  await query(`update public.profiles
    set role=case id when $1 then 'admin'::public.account_role else 'employee'::public.account_role end,
        status='active'
    where id=any($2::uuid[])`, [admin, [admin, authorizedEmployee, unauthorizedEmployee]]);
  await query(`insert into public.profile_permission_overrides(
    profile_id,permission_id,effect,reason,assigned_by,is_active
  ) select $1,id,'allow','Supplier tracking correction verification',$2,true
    from public.permissions where key=any($3::text[])`, [
    authorizedEmployee, admin, ["purchasing.edit", "shipments.create"],
  ]);
  await query(`insert into public.profile_permission_overrides(
    profile_id,permission_id,effect,reason,assigned_by,is_active
  ) select $1,id,'allow','Supplier tracking correction denial verification',$2,true
    from public.permissions where key='purchasing.edit'`, [unauthorizedEmployee, admin]);

  await query(`insert into public.warehouses(id,code,name,country_code,country_name,is_active)
    values($1,$2,'Tracking Test Warehouse','BD','Bangladesh',true)`, [warehouse, `TR-${stamp}`]);
  await query(`insert into public.suppliers(
    id,code,name,supplier_type,status,country_code,country_name,created_by
  ) values($1,$2,'Tracking Test Supplier','logistics','active','CN','China',$3)`, [
    supplier, `SUP-${stamp}`, admin,
  ]);
  await query(`insert into public.purchase_orders(
    id,order_number,supplier_id,destination_warehouse_id,status,created_by,updated_by
  ) values($1,$2,$3,$4,'shipped',$5,$5)`, [
    purchaseOrder, `TEST-PO-${stamp}`, supplier, warehouse, admin,
  ]);
  await query(`insert into public.purchase_carriers(id,name,status,created_by)
    values($1,'Old Test Carrier','active',$4),
          ($2,'Corrected Test Carrier','active',$4),
          ($3,'Inactive Test Carrier','inactive',$4)`, [oldCarrier, newCarrier, inactiveCarrier, admin]);
  await query(`insert into public.purchase_inbound_shipments(
    id,purchase_order_id,status,transport_mode,carrier_id,carrier_name,
    tracking_number,created_by,updated_by,shipped_at
  ) values($1,$2,'shipped','courier',$3,'Old Test Carrier','OLD-TRACKING',$4,$4,now())`, [
    shipment, purchaseOrder, oldCarrier, admin,
  ]);

  const before = await one(`select
    shipment.status as shipment_status,
    purchase.status as purchase_status,
    (select count(*) from public.purchase_order_status_events where purchase_order_id=$1) as event_count,
    (select count(*) from public.purchase_receipts where purchase_order_id=$1) as receipt_count
    from public.purchase_inbound_shipments shipment
    join public.purchase_orders purchase on purchase.id=shipment.purchase_order_id
    where shipment.id=$2`, [purchaseOrder, shipment]);

  const result = await one(`select public.correct_purchase_inbound_shipment_tracking(
    $1,$2,$3,$4,$5,$6
  ) id`, [
    admin, purchaseOrder, shipment, newCarrier,
    "  NEW-TRACKING-123  ", "  Supplier corrected both values.  ",
  ]);
  assert.equal(result.id, shipment);

  const corrected = await one(`select status,carrier_id,carrier_name,tracking_number,updated_by
    from public.purchase_inbound_shipments where id=$1`, [shipment]);
  assert.deepEqual(corrected, {
    status: "shipped",
    carrier_id: newCarrier,
    carrier_name: "Corrected Test Carrier",
    tracking_number: "NEW-TRACKING-123",
    updated_by: admin,
  });
  const unchanged = await one(`select
    purchase.status as purchase_status,
    (select count(*) from public.purchase_order_status_events where purchase_order_id=$1) as event_count,
    (select count(*) from public.purchase_receipts where purchase_order_id=$1) as receipt_count
    from public.purchase_orders purchase where purchase.id=$1`, [purchaseOrder]);
  assert.equal(unchanged.purchase_status, before.purchase_status);
  assert.equal(unchanged.event_count, before.event_count);
  assert.equal(unchanged.receipt_count, before.receipt_count);

  const audit = await one(`select actor_id,action,entity_type,entity_id,old_values,new_values,metadata
    from public.audit_logs
    where action='purchasing.inbound.tracking_corrected' and entity_id=$1
    order by created_at desc,id desc limit 1`, [shipment]);
  assert.equal(audit.actor_id, admin);
  assert.equal(audit.entity_type, "purchase_inbound_shipment");
  assert.equal(audit.old_values.tracking_number, "OLD-TRACKING");
  assert.equal(audit.new_values.tracking_number, "NEW-TRACKING-123");
  assert.equal(audit.metadata.purchase_order_id, purchaseOrder);
  assert.equal(audit.metadata.supplier_shipment_id, shipment);
  assert.equal(audit.metadata.correction_reason, "Supplier corrected both values.");

  await one(`select public.correct_purchase_inbound_shipment_tracking(
    $1,$2,$3,$4,$5,$6
  ) id`, [
    authorizedEmployee, purchaseOrder, shipment, newCarrier,
    "EMPLOYEE-CORRECTION", "Authorized employee correction",
  ]);
  assert.equal(
    (await one("select tracking_number from public.purchase_inbound_shipments where id=$1", [shipment])).tracking_number,
    "EMPLOYEE-CORRECTION",
  );

  await expectDatabaseError(() => query(
    "select public.correct_purchase_inbound_shipment_tracking($1,$2,$3,$4,$5,$6)",
    [unauthorizedEmployee, purchaseOrder, shipment, newCarrier, "DENIED", null],
  ), /permission denied/i);
  await expectDatabaseError(() => query(
    "select public.correct_purchase_inbound_shipment_tracking($1,$2,$3,$4,$5,$6)",
    [admin, purchaseOrder, shipment, newCarrier, "   ", null],
  ), /cannot be cleared/i);
  await expectDatabaseError(() => query(
    "select public.correct_purchase_inbound_shipment_tracking($1,$2,$3,$4,$5,$6)",
    [admin, purchaseOrder, shipment, inactiveCarrier, "STILL-SAFE", null],
  ), /active carrier/i);

  await query("update public.purchase_inbound_shipments set status='cancelled' where id=$1", [shipment]);
  await expectDatabaseError(() => query(
    "select public.correct_purchase_inbound_shipment_tracking($1,$2,$3,$4,$5,$6)",
    [admin, purchaseOrder, shipment, newCarrier, "CANCELLED-EDIT", null],
  ), /cancelled|cannot be corrected/i);

  await query("rollback");
  console.log("Supplier shipment tracking correction verification passed and rolled back cleanly.");
} catch (error) {
  try { await query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}
