import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  aggregateDailyClosing,
  getDailyClosingDateRange,
  type AggregateDailyClosingInput,
  type DailyClosingBalanceInput,
  type DailyClosingMovementInput,
} from "@/lib/inventory/daily-closing";

type DailyClosingSourceOptions = {
  inventoryDate: string;
  warehouseId: string | null;
  includeSerialDetails: boolean;
  includeAllProducts: boolean;
  movementOnly?: boolean;
};

type QueryResult<T> = { data: T[] | null; error: { code?: string; message?: string; details?: string; hint?: string } | null };

type DailyClosingMovementRecord = {
  id: string;
  reference: string;
  movement_type: string;
  status: string;
  source_warehouse_id: string | null;
  destination_warehouse_id: string | null;
  created_at: string;
  confirmed_at: string | null;
};

type DailyClosingBalanceRecord = {
  id: string;
  warehouse_id: string;
  product_id: string;
  variation_id: string | null;
  on_hand: number;
};

type DailyClosingMovementItemRecord = {
  id: string;
  movement_id: string;
  product_id: string;
  variation_id: string | null;
  warehouse_id: string;
  quantity_delta: number;
  balance_after: number | null;
};

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
const EMPLOYEE_QUERY_PAGE_SIZE = 1000;
const EMPLOYEE_MOVEMENT_ID_CHUNK_SIZE = 250;

async function loadEmployeeBalances(db: AdminClient, warehouseId: string): Promise<QueryResult<DailyClosingBalanceRecord>> {
  const rows: DailyClosingBalanceRecord[] = [];
  for (let offset = 0; ; offset += EMPLOYEE_QUERY_PAGE_SIZE) {
    const result = await db.from("inventory_balances").select("id,warehouse_id,product_id,variation_id,on_hand").eq("warehouse_id", warehouseId).is("location_id", null).order("id", { ascending: true }).range(offset, offset + EMPLOYEE_QUERY_PAGE_SIZE - 1);
    if (result.error) return { data: null, error: result.error };
    const page = (result.data ?? []) as DailyClosingBalanceRecord[];
    rows.push(...page);
    if (page.length < EMPLOYEE_QUERY_PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

async function loadEmployeeConfirmedMovements(db: AdminClient, start: string): Promise<QueryResult<DailyClosingMovementRecord>> {
  const columns = "id,reference,movement_type,status,source_warehouse_id,destination_warehouse_id,created_at,confirmed_at";
  const rows: DailyClosingMovementRecord[] = [];
  for (const timestamp of ["confirmed_at", "created_at"] as const) {
    for (let offset = 0; ; offset += EMPLOYEE_QUERY_PAGE_SIZE) {
      let query = db.from("inventory_movements").select(columns).eq("status", "confirmed").gte(timestamp, start).order(timestamp, { ascending: true }).order("id", { ascending: true }).range(offset, offset + EMPLOYEE_QUERY_PAGE_SIZE - 1);
      if (timestamp === "created_at") query = query.is("confirmed_at", null);
      const result = await query;
      if (result.error) return { data: null, error: result.error };
      const page = (result.data ?? []) as DailyClosingMovementRecord[];
      rows.push(...page);
      if (page.length < EMPLOYEE_QUERY_PAGE_SIZE) break;
    }
  }
  rows.sort((left, right) => Date.parse(left.confirmed_at ?? left.created_at) - Date.parse(right.confirmed_at ?? right.created_at));
  return { data: rows, error: null };
}

async function loadEmployeeMovementItems(db: AdminClient, movementIds: string[], warehouseId: string): Promise<QueryResult<DailyClosingMovementItemRecord>> {
  const rows: DailyClosingMovementItemRecord[] = [];
  for (let startIndex = 0; startIndex < movementIds.length; startIndex += EMPLOYEE_MOVEMENT_ID_CHUNK_SIZE) {
    const chunk = movementIds.slice(startIndex, startIndex + EMPLOYEE_MOVEMENT_ID_CHUNK_SIZE);
    for (let offset = 0; ; offset += EMPLOYEE_QUERY_PAGE_SIZE) {
      const result = await db.from("inventory_movement_items").select("id,movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after").in("movement_id", chunk).eq("warehouse_id", warehouseId).order("id", { ascending: true }).range(offset, offset + EMPLOYEE_QUERY_PAGE_SIZE - 1);
      if (result.error) return { data: null, error: result.error };
      const page = (result.data ?? []) as DailyClosingMovementItemRecord[];
      rows.push(...page);
      if (page.length < EMPLOYEE_QUERY_PAGE_SIZE) break;
    }
  }
  return { data: rows, error: null };
}

function logQueryError(context: string, error: QueryResult<unknown>["error"]) {
  if (error) console.error(context, { code: error.code, message: error.message, details: error.details, hint: error.hint });
}

export async function getDailyClosingSourceData(options: DailyClosingSourceOptions) {
  const db = createSupabaseAdminClient();
  const { start } = getDailyClosingDateRange(options.inventoryDate);
  const employeeScoped = options.movementOnly === true && options.warehouseId !== null;
  const [warehousesResult, productsResult, variationsResult, balancesResult, movementsResult] = await Promise.all([
    db.from("warehouses").select("id,code,name,country_name").eq("is_active", true).order("name"),
    db.from("products").select("id,name,sku,model_number,serial_tracking_required").neq("status", "archived").order("name").limit(10000),
    db.from("product_variations").select("id,product_id,sku").eq("status", "active").limit(10000),
    employeeScoped ? loadEmployeeBalances(db, options.warehouseId!) : db.from("inventory_balances").select("warehouse_id,product_id,variation_id,on_hand").is("location_id", null).limit(20000),
    employeeScoped ? loadEmployeeConfirmedMovements(db, start) : db.from("inventory_movements").select("id,reference,movement_type,status,source_warehouse_id,destination_warehouse_id,created_at,confirmed_at").gte("created_at", start).order("created_at", { ascending: true }).limit(20000),
  ]);
  const firstError = [warehousesResult, productsResult, variationsResult, balancesResult, movementsResult].find((result) => result.error)?.error;
  if (firstError) {
    logQueryError("Daily closing source query failed", firstError);
    throw new Error("Unable to load inventory data for the daily closing sheet.");
  }

  const warehouses = warehousesResult.data ?? [];
  const products = productsResult.data ?? [];
  const variations = variationsResult.data ?? [];
  const balances = balancesResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const productMap = new Map(products.map((product) => [product.id, product]));
  const variationMap = new Map(variations.map((variation) => [variation.id, variation]));
  const movementIds = movements.map((movement) => movement.id);
  const itemsResult = movementIds.length
    ? employeeScoped
      ? await loadEmployeeMovementItems(db, movementIds, options.warehouseId!)
      : await db.from("inventory_movement_items").select("id,movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after").in("movement_id", movementIds).limit(50000)
    : { data: [], error: null };
  if (itemsResult.error) {
    logQueryError("Daily closing movement-item query failed", itemsResult.error);
    throw new Error("Unable to load inventory movement details.");
  }
  const items = itemsResult.data ?? [];

  const serialHistoryByMovement = new Map<string, Array<{ serialNumberId: string; eventType: string; previousWarehouseId: string | null; newWarehouseId: string | null }>>();
  const serialMap = new Map<string, { productId: string; variationId: string | null; senSerial: string | null; manufacturerSerial: string | null }>();
  if (options.includeSerialDetails && movementIds.length) {
    const historyResult = await db.from("serial_number_history").select("serial_number_id,movement_id,event_type,previous_warehouse_id,new_warehouse_id").in("movement_id", movementIds).gte("occurred_at", getDailyClosingDateRange(options.inventoryDate).start).lt("occurred_at", getDailyClosingDateRange(options.inventoryDate).end).limit(50000);
    if (historyResult.error) {
      logQueryError("Daily closing serial history query failed", historyResult.error);
      throw new Error("Unable to load serialized inventory details.");
    }
    const history = historyResult.data ?? [];
    const serialIds = [...new Set(history.map((row) => row.serial_number_id))];
    if (serialIds.length) {
      const serialResult = await db.from("serial_numbers").select("id,product_id,variation_id,sen_serial,manufacturer_serial").in("id", serialIds).limit(50000);
      if (serialResult.error) {
        logQueryError("Daily closing serial query failed", serialResult.error);
        throw new Error("Unable to load serialized inventory details.");
      }
      for (const serial of serialResult.data ?? []) serialMap.set(serial.id, { productId: serial.product_id, variationId: serial.variation_id, senSerial: serial.sen_serial, manufacturerSerial: serial.manufacturer_serial });
    }
    for (const row of history) {
      if (!row.movement_id) continue;
      const list = serialHistoryByMovement.get(row.movement_id) ?? [];
      list.push({ serialNumberId: row.serial_number_id, eventType: row.event_type, previousWarehouseId: row.previous_warehouse_id, newWarehouseId: row.new_warehouse_id });
      serialHistoryByMovement.set(row.movement_id, list);
    }
  }

  const movementById = new Map(movements.map((movement) => [movement.id, movement]));
  const movementInputs: DailyClosingMovementInput[] = items.map((item) => {
    const movement = movementById.get(item.movement_id);
    const product = productMap.get(item.product_id);
    const variation = item.variation_id ? variationMap.get(item.variation_id) : null;
    const serialDetails = (serialHistoryByMovement.get(item.movement_id) ?? []).map((history) => {
      const serial = serialMap.get(history.serialNumberId);
      if (!serial || serial.productId !== item.product_id || serial.variationId !== (item.variation_id ?? null)) return null;
      return {
        serialNumberId: history.serialNumberId,
        senSerial: serial.senSerial,
        manufacturerSerial: serial.manufacturerSerial,
        movementType: history.eventType,
        sourceWarehouseId: history.previousWarehouseId,
        destinationWarehouseId: history.newWarehouseId,
      };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row));
    return {
      id: movement?.id ?? item.movement_id,
      reference: movement?.reference ?? "Not provided",
      movementType: movement?.movement_type ?? "correction",
      status: movement?.status ?? "confirmed",
      transactionAt: movement?.confirmed_at ?? movement?.created_at ?? new Date(0).toISOString(),
      itemId: item.id,
      productId: item.product_id,
      variationId: item.variation_id,
      warehouseId: item.warehouse_id,
      quantityDelta: Number(item.quantity_delta ?? 0),
      balanceAfter: Number(item.balance_after ?? 0),
      sourceWarehouseId: movement?.source_warehouse_id ?? null,
      destinationWarehouseId: movement?.destination_warehouse_id ?? null,
      productName: product?.name ?? "Not provided",
      sku: variation?.sku ?? product?.sku ?? "Not provided",
      model: product?.model_number ?? null,
      unit: "Pcs",
      serialDetails,
    };
  });
  const balanceInputs: DailyClosingBalanceInput[] = balances.map((balance) => {
    const product = productMap.get(balance.product_id);
    const variation = balance.variation_id ? variationMap.get(balance.variation_id) : null;
    return {
      productId: balance.product_id,
      variationId: balance.variation_id,
      warehouseId: balance.warehouse_id,
      onHand: Number(balance.on_hand ?? 0),
      productName: product?.name ?? "Not provided",
      sku: variation?.sku ?? product?.sku ?? "Not provided",
      model: product?.model_number ?? null,
      unit: "Pcs",
    };
  });
  const input: AggregateDailyClosingInput = {
    inventoryDate: options.inventoryDate,
    warehouseId: options.warehouseId,
    includeAllProducts: options.includeAllProducts,
    movementOnly: options.movementOnly,
    balances: balanceInputs,
    movements: movementInputs,
  };
  return { warehouses, products, variations, input, aggregate: aggregateDailyClosing(input) };
}

