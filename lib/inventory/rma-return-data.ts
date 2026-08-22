import "server-only";

import { getEffectivePermissions } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PhysicalReturnSerial = {
  id: string;
  senSerial: string | null;
  manufacturerSerial: string | null;
  status: string;
};

export type PhysicalReturnReleaseItem = {
  id: string;
  releaseId: string;
  warehouseId: string;
  warehouseName: string;
  productName: string;
  sku: string;
  quantityReleased: number;
  quantityReturned: number;
  quantityReturnable: number;
  serials: PhysicalReturnSerial[];
};

export type AuthorizedPhysicalReturnClaim = {
  id: string;
  rmaNumber: string;
  status: string;
  quantity: number;
  description: string;
  customerName: string;
  orderNumber: string;
  productName: string;
  items: PhysicalReturnReleaseItem[];
};

export type AuthorizedPhysicalReturnLink = {
  id: string;
  rmaNumber: string;
  status: string;
  quantityRemaining: number;
  orderNumber?: string;
  warehouseName?: string;
};

export async function getAuthorizedPhysicalReturnQueue(
  profileId: string,
): Promise<AuthorizedPhysicalReturnLink[]> {
  const db = createSupabaseAdminClient();
  const [profileResult, permissions, assignmentResult] = await Promise.all([
    db.from("profiles").select("id,role,status").eq("id", profileId).maybeSingle(),
    getEffectivePermissions(profileId),
    db.from("profile_warehouse_assignments")
      .select("warehouse_id")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .is("ended_at", null),
  ]);
  if (profileResult.error || assignmentResult.error) {
    throw new Error("Unable to validate physical return queue access.");
  }
  if (
    profileResult.data?.role !== "employee" ||
    profileResult.data.status !== "active" ||
    !permissions.has("rma.receive")
  ) return [];

  const assignedIds = [...new Set((assignmentResult.data ?? []).map((row) => row.warehouse_id))];
  if (!assignedIds.length) return [];
  const warehousesResult = await db.from("warehouses")
    .select("id,name,code")
    .in("id", assignedIds)
    .eq("is_active", true);
  if (warehousesResult.error) throw new Error("Unable to load active return warehouses.");
  const warehouseById = new Map((warehousesResult.data ?? []).map((row) => [row.id, row]));
  const warehouseIds = [...warehouseById.keys()];
  if (!warehouseIds.length) return [];

  const claimsResult = await db.from("rma_claims")
    .select("id,rma_number,status,quantity,sales_order_id,sales_order_item_id,created_at")
    .in("status", ["return_requested", "product_received"])
    .order("created_at");
  if (claimsResult.error) throw new Error("Unable to load pending physical return claims.");
  const claims = claimsResult.data ?? [];
  if (!claims.length) return [];

  const requestItemsResult = await db.from("sales_stock_out_request_items")
    .select("id,sales_order_item_id")
    .in("sales_order_item_id", claims.map((claim) => claim.sales_order_item_id));
  if (requestItemsResult.error) throw new Error("Unable to load return Stock Out items.");
  const requestItems = requestItemsResult.data ?? [];
  if (!requestItems.length) return [];
  const saleItemByRequestItem = new Map(
    requestItems.map((item) => [item.id, item.sales_order_item_id]),
  );

  const releaseItemsResult = await db.from("sales_stock_out_release_items")
    .select("id,request_item_id,warehouse_id,quantity_released")
    .in("request_item_id", requestItems.map((item) => item.id))
    .in("warehouse_id", warehouseIds);
  if (releaseItemsResult.error) throw new Error("Unable to load authorized physical releases.");
  const releaseItems = releaseItemsResult.data ?? [];
  if (!releaseItems.length) return [];

  const [receiptsResult, ordersResult] = await Promise.all([
    db.from("rma_return_receipts")
      .select("rma_claim_id,warehouse_id,quantity_received")
      .in("rma_claim_id", claims.map((claim) => claim.id))
      .in("warehouse_id", warehouseIds)
      .eq("status", "confirmed"),
    db.from("sales_orders")
      .select("id,order_number")
      .in("id", [...new Set(claims.map((claim) => claim.sales_order_id))]),
  ]);
  if (receiptsResult.error || ordersResult.error) {
    throw new Error("Unable to load physical return queue history.");
  }
  const orderNumberById = new Map((ordersResult.data ?? []).map((order) => [order.id, order.order_number]));

  return claims.flatMap((claim) => {
    const claimReleases = releaseItems.filter(
      (release) => saleItemByRequestItem.get(release.request_item_id) === claim.sales_order_item_id,
    );
    if (!claimReleases.length) return [];
    const released = claimReleases.reduce(
      (sum, release) => sum + Number(release.quantity_released),
      0,
    );
    const returned = (receiptsResult.data ?? [])
      .filter((receipt) => receipt.rma_claim_id === claim.id)
      .reduce((sum, receipt) => sum + Number(receipt.quantity_received), 0);
    const quantityRemaining = Math.max(0, Math.min(
      Number(claim.quantity) - returned,
      released - returned,
    ));
    if (quantityRemaining <= 0) return [];
    const warehouse = warehouseById.get(claimReleases[0].warehouse_id);
    return [{
      id: claim.id,
      rmaNumber: claim.rma_number,
      status: claim.status,
      quantityRemaining,
      orderNumber: orderNumberById.get(claim.sales_order_id) ?? "Sales order",
      warehouseName: warehouse ? `${warehouse.name} (${warehouse.code})` : "Authorized warehouse",
    }];
  });
}

export async function getAuthorizedPhysicalReturnLinks(
  profileId: string,
  salesOrderId: string,
  warehouseId: string,
): Promise<AuthorizedPhysicalReturnLink[]> {
  const db = createSupabaseAdminClient();
  const [profileResult, permissions, assignmentResult, warehouseResult] = await Promise.all([
    db.from("profiles").select("id,role,status").eq("id", profileId).maybeSingle(),
    getEffectivePermissions(profileId),
    db.from("profile_warehouse_assignments")
      .select("warehouse_id")
      .eq("profile_id", profileId)
      .eq("warehouse_id", warehouseId)
      .eq("is_active", true)
      .is("ended_at", null)
      .maybeSingle(),
    db.from("warehouses").select("id,is_active").eq("id", warehouseId).maybeSingle(),
  ]);
  if (profileResult.error || assignmentResult.error || warehouseResult.error) {
    throw new Error("Unable to load authorized physical return work.");
  }
  if (
    profileResult.data?.role !== "employee" ||
    profileResult.data.status !== "active" ||
    !permissions.has("rma.receive") ||
    !assignmentResult.data ||
    !warehouseResult.data?.is_active
  ) return [];

  const claimsResult = await db.from("rma_claims")
    .select("id,rma_number,status,quantity,sales_order_item_id")
    .eq("sales_order_id", salesOrderId)
    .in("status", ["return_requested", "product_received"])
    .order("created_at");
  if (claimsResult.error) throw new Error("Unable to load return claims.");
  const claims = claimsResult.data ?? [];
  if (!claims.length) return [];

  const requestItemsResult = await db.from("sales_stock_out_request_items")
    .select("id,sales_order_item_id")
    .in("sales_order_item_id", claims.map((claim) => claim.sales_order_item_id));
  if (requestItemsResult.error) throw new Error("Unable to load return release requests.");
  const requestItems = requestItemsResult.data ?? [];
  if (!requestItems.length) return [];
  const releaseItemsResult = await db.from("sales_stock_out_release_items")
    .select("id,request_item_id")
    .in("request_item_id", requestItems.map((item) => item.id))
    .eq("warehouse_id", warehouseId);
  if (releaseItemsResult.error) throw new Error("Unable to load returnable releases.");
  const releaseItems = releaseItemsResult.data ?? [];
  if (!releaseItems.length) return [];

  const receiptResult = await db.from("rma_return_receipts")
    .select("rma_claim_id,quantity_received")
    .in("rma_claim_id", claims.map((claim) => claim.id))
    .eq("warehouse_id", warehouseId)
    .eq("status", "confirmed");
  if (receiptResult.error) throw new Error("Unable to load physical return receipts.");
  const releasedOrderItems = new Set(
    requestItems
      .filter((item) => releaseItems.some((release) => release.request_item_id === item.id))
      .map((item) => item.sales_order_item_id),
  );
  return claims.flatMap((claim) => {
    if (!releasedOrderItems.has(claim.sales_order_item_id)) return [];
    const returned = (receiptResult.data ?? [])
      .filter((receipt) => receipt.rma_claim_id === claim.id)
      .reduce((sum, receipt) => sum + Number(receipt.quantity_received), 0);
    const quantityRemaining = Math.max(0, Number(claim.quantity) - returned);
    return quantityRemaining > 0 ? [{
      id: claim.id,
      rmaNumber: claim.rma_number,
      status: claim.status,
      quantityRemaining,
    }] : [];
  });
}

export async function getAuthorizedPhysicalReturnClaim(
  profileId: string,
  claimId: string,
): Promise<AuthorizedPhysicalReturnClaim | null> {
  const db = createSupabaseAdminClient();
  const [profileResult, permissions, assignmentResult] = await Promise.all([
    db.from("profiles").select("id,role,status").eq("id", profileId).maybeSingle(),
    getEffectivePermissions(profileId),
    db.from("profile_warehouse_assignments")
      .select("warehouse_id")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .is("ended_at", null),
  ]);
  if (profileResult.error || assignmentResult.error) {
    throw new Error("Unable to validate physical return warehouse access.");
  }
  if (
    profileResult.data?.role !== "employee" ||
    profileResult.data.status !== "active" ||
    !permissions.has("rma.receive")
  ) return null;
  const assignedIds = [...new Set((assignmentResult.data ?? []).map((row) => row.warehouse_id))];
  if (!assignedIds.length) return null;
  const activeWarehouses = await db.from("warehouses")
    .select("id,name,code")
    .in("id", assignedIds)
    .eq("is_active", true);
  if (activeWarehouses.error) throw new Error("Unable to validate active return warehouses.");
  const warehouses = new Map((activeWarehouses.data ?? []).map((row) => [row.id, row]));
  const warehouseIds = [...warehouses.keys()];
  if (!warehouseIds.length) return null;

  const claimResult = await db.from("rma_claims").select("*").eq("id", claimId).maybeSingle();
  if (claimResult.error) throw new Error("Unable to load the RMA claim.");
  const claim = claimResult.data;
  if (!claim || !["return_requested", "product_received"].includes(claim.status)) return null;

  const requestItemsResult = await db.from("sales_stock_out_request_items")
    .select("id,product_name_snapshot,sku_snapshot")
    .eq("sales_order_item_id", claim.sales_order_item_id);
  if (requestItemsResult.error) throw new Error("Unable to load the original Stock Out request.");
  const requestItems = requestItemsResult.data ?? [];
  if (!requestItems.length) return null;
  const requestItemById = new Map(requestItems.map((row) => [row.id, row]));

  const releaseItemsResult = await db.from("sales_stock_out_release_items")
    .select("*")
    .in("request_item_id", requestItems.map((row) => row.id))
    .in("warehouse_id", warehouseIds)
    .order("created_at");
  if (releaseItemsResult.error) throw new Error("Unable to load physical Stock Out history.");
  const releaseItems = releaseItemsResult.data ?? [];
  if (!releaseItems.length) return null;

  const [receiptsResult, releaseSerialsResult, orderResult, customerResult] = await Promise.all([
    db.from("rma_return_receipts").select("stock_out_release_item_id,quantity_received")
      .eq("rma_claim_id", claim.id).eq("status", "confirmed"),
    db.from("sales_stock_out_release_serials").select("id,release_item_id,serial_number_id")
      .in("release_item_id", releaseItems.map((row) => row.id)),
    db.from("sales_orders").select("id,order_number").eq("id", claim.sales_order_id).maybeSingle(),
    db.from("profiles").select("id,full_name,email,company_name").eq("id", claim.customer_profile_id).maybeSingle(),
  ]);
  if (receiptsResult.error || releaseSerialsResult.error || orderResult.error || customerResult.error) {
    throw new Error("Unable to load physical return history.");
  }
  const receipts = receiptsResult.data ?? [];
  const releaseSerials = releaseSerialsResult.data ?? [];
  const originalReleaseSerialIds = releaseSerials.map((row) => row.id);
  const [returnedSerialsResult, serialsResult] = await Promise.all([
    originalReleaseSerialIds.length
      ? db.from("rma_return_receipt_serials").select("original_release_serial_id")
        .in("original_release_serial_id", originalReleaseSerialIds)
      : Promise.resolve({ data: [], error: null }),
    releaseSerials.length
      ? db.from("serial_numbers").select("id,sen_serial,manufacturer_serial,status")
        .in("id", releaseSerials.map((row) => row.serial_number_id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (returnedSerialsResult.error || serialsResult.error) {
    throw new Error("Unable to load original SEN Serial history.");
  }
  const returnedReleaseSerialIds = new Set(
    (returnedSerialsResult.data ?? []).map((row) => row.original_release_serial_id),
  );
  const serialById = new Map((serialsResult.data ?? []).map((row) => [row.id, row]));
  const claimReturned = receipts.reduce((sum, row) => sum + Number(row.quantity_received), 0);
  const claimRemaining = Math.max(0, Number(claim.quantity) - claimReturned);

  const items = releaseItems.map((releaseItem) => {
    const itemReturned = receipts
      .filter((row) => row.stock_out_release_item_id === releaseItem.id)
      .reduce((sum, row) => sum + Number(row.quantity_received), 0);
    const serials = releaseSerials
      .filter((row) => row.release_item_id === releaseItem.id && !returnedReleaseSerialIds.has(row.id))
      .map((row) => serialById.get(row.serial_number_id))
      .filter((serial): serial is NonNullable<typeof serial> => Boolean(serial))
      .map((serial) => ({
        id: serial.id,
        senSerial: serial.sen_serial,
        manufacturerSerial: serial.manufacturer_serial,
        status: serial.status,
      }));
    const requestItem = requestItemById.get(releaseItem.request_item_id);
    const warehouse = warehouses.get(releaseItem.warehouse_id);
    return {
      id: releaseItem.id,
      releaseId: releaseItem.release_id,
      warehouseId: releaseItem.warehouse_id,
      warehouseName: warehouse ? `${warehouse.name} (${warehouse.code})` : "Authorized warehouse",
      productName: requestItem?.product_name_snapshot ?? "Returned product",
      sku: requestItem?.sku_snapshot ?? "Not provided",
      quantityReleased: Number(releaseItem.quantity_released),
      quantityReturned: itemReturned,
      quantityReturnable: Math.max(0, Math.min(
        Number(releaseItem.quantity_released) - itemReturned,
        claimRemaining,
      )),
      serials,
    } satisfies PhysicalReturnReleaseItem;
  }).filter((item) => item.quantityReturnable > 0);

  const customer = customerResult.data;
  return {
    id: claim.id,
    rmaNumber: claim.rma_number,
    status: claim.status,
    quantity: Number(claim.quantity),
    description: claim.description,
    customerName: customer?.company_name || customer?.full_name || customer?.email || "Customer",
    orderNumber: orderResult.data?.order_number ?? "Sales order",
    productName: items[0]?.productName ?? requestItems[0]?.product_name_snapshot ?? "Product",
    items,
  };
}
