export const DAILY_CLOSING_PERMISSION_KEYS = [
  "inventory.daily_closing_view",
  "inventory.daily_closing_generate",
  "inventory.daily_closing_finalize",
  "inventory.daily_closing_print",
  "inventory.daily_closing_verify",
  "inventory.daily_closing_view_history",
  "inventory.daily_closing_export_pdf",
] as const;

export type DailyClosingPermissionKey = (typeof DAILY_CLOSING_PERMISSION_KEYS)[number];

export type DailyClosingMovementInput = {
  id: string;
  reference: string;
  movementType: string;
  status: string;
  transactionAt: string;
  itemId: string;
  productId: string;
  variationId: string | null;
  warehouseId: string;
  quantityDelta: number;
  balanceAfter?: number | null;
  sourceWarehouseId?: string | null;
  destinationWarehouseId?: string | null;
  productName: string;
  sku: string;
  model: string | null;
  unit?: string | null;
  serialDetails?: DailyClosingSerialDetail[];
};

export type DailyClosingSerialDetail = {
  serialNumberId: string;
  senSerial: string | null;
  manufacturerSerial: string | null;
  movementType: string;
  sourceWarehouseId: string | null;
  destinationWarehouseId: string | null;
};

export type DailyClosingBalanceInput = {
  productId: string;
  variationId: string | null;
  warehouseId: string;
  onHand: number;
  productName: string;
  sku: string;
  model: string | null;
  unit?: string | null;
};

export type DailyClosingRow = {
  key: string;
  productId: string;
  variationId: string | null;
  productName: string;
  sku: string;
  model: string | null;
  openingQty: number;
  stockIn: number;
  stockOut: number;
  closingQty: number;
  systemClosingQty: number;
  unit: string;
  reconciliationNeeded: boolean;
  remarks: string | null;
};

export type DailyClosingMovementDetail = DailyClosingMovementInput & {
  direction: "in" | "out";
};

export type DailyClosingSummary = {
  totalProductLines: number;
  totalOpeningQty: number;
  totalStockIn: number;
  totalStockOut: number;
  totalClosingQty: number;
  stockInTransactions: number;
  stockOutTransactions: number;
  serializedUnitsReceived: number;
  serializedUnitsDispatched: number;
  reconciliationNeeded: boolean;
};

export type DailyClosingAggregateResult = {
  rows: DailyClosingRow[];
  movementDetails: DailyClosingMovementDetail[];
  summary: DailyClosingSummary;
};

export type AggregateDailyClosingInput = {
  inventoryDate: string;
  warehouseId: string | null;
  includeAllProducts: boolean;
  movementOnly?: boolean;
  balances: DailyClosingBalanceInput[];
  movements: DailyClosingMovementInput[];
};

export type DailyClosingGenerationOptions = {
  date: string;
  warehouseId: string | null;
  includeAllProducts: boolean;
  includeSerialDetails: boolean;
  movementOnly?: boolean;
};

export type EmployeeDailyClosingScope = {
  inventoryDate: string;
  warehouseId: string;
};

export function constrainDailyClosingGeneration(
  role: string,
  submitted: DailyClosingGenerationOptions,
  employeeScope: EmployeeDailyClosingScope | null,
): DailyClosingGenerationOptions {
  if (role !== "employee") return submitted;
  if (!employeeScope) throw new Error("An active primary warehouse assignment is required.");
  return {
    date: employeeScope.inventoryDate,
    warehouseId: employeeScope.warehouseId,
    includeAllProducts: false,
    includeSerialDetails: false,
    movementOnly: true,
  };
}

export function canAccessDailyClosingSheet(
  role: string,
  sheet: { inventoryDate: string; warehouseId: string | null },
  employeeScope: EmployeeDailyClosingScope | null,
) {
  if (role !== "employee") return true;
  return Boolean(
    employeeScope
    && sheet.inventoryDate === employeeScope.inventoryDate
    && sheet.warehouseId === employeeScope.warehouseId,
  );
}

export function canUseDailyClosingAdminWorkflow(role: string) {
  return role === "admin";
}

const EMPLOYEE_DAILY_CLOSING_ACCESS_KEYS = new Set([
  "inventory.daily_closing_view",
  "inventory.daily_closing_generate",
  "inventory.daily_closing_print",
]);

export function canEmployeeAccessDailyClosingPage(permissions: Iterable<string>) {
  for (const permission of permissions) {
    if (EMPLOYEE_DAILY_CLOSING_ACCESS_KEYS.has(permission)) return true;
  }
  return false;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BUSINESS_TIME_ZONE = "Asia/Dhaka";
const BUSINESS_OFFSET_MS = 6 * 60 * 60 * 1000;
const EPSILON = 0.0001;

function assertDate(value: string) {
  if (!DAY_PATTERN.test(value)) throw new Error("Inventory date must be YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error("Inventory date is invalid.");
}

export function getDailyClosingDateRange(inventoryDate: string) {
  assertDate(inventoryDate);
  const localStart = Date.parse(`${inventoryDate}T00:00:00.000Z`) - BUSINESS_OFFSET_MS;
  const localEnd = localStart + 24 * 60 * 60 * 1000;
  return { start: new Date(localStart).toISOString(), end: new Date(localEnd).toISOString() };
}

export function getBusinessDateInDhaka(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function numberValue(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function rowKey(productId: string, variationId: string | null) {
  return `${productId}:${variationId ?? "base"}`;
}

function inScope(movement: DailyClosingMovementInput, warehouseId: string | null) {
  return warehouseId === null || movement.warehouseId === warehouseId;
}

function balanceInScope(balance: DailyClosingBalanceInput, warehouseId: string | null) {
  return warehouseId === null || balance.warehouseId === warehouseId;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function aggregateDailyClosing(input: AggregateDailyClosingInput): DailyClosingAggregateResult {
  const { start, end } = getDailyClosingDateRange(input.inventoryDate);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const currentBalances = new Map<string, { balance: number; meta: DailyClosingBalanceInput }>();
  for (const balance of input.balances) {
    if (!balanceInScope(balance, input.warehouseId)) continue;
    const key = rowKey(balance.productId, balance.variationId);
    const existing = currentBalances.get(key);
    currentBalances.set(key, {
      balance: (existing?.balance ?? 0) + numberValue(balance.onHand),
      meta: existing?.meta ?? balance,
    });
  }

  const confirmedMovements = input.movements.filter((movement) => {
    const timestamp = Date.parse(movement.transactionAt);
    return movement.status === "confirmed" && Number.isFinite(timestamp) && inScope(movement, input.warehouseId);
  });
  const postStartDelta = new Map<string, number>();
  for (const movement of confirmedMovements) {
    if (Date.parse(movement.transactionAt) >= startMs) {
      const key = rowKey(movement.productId, movement.variationId);
      postStartDelta.set(key, (postStartDelta.get(key) ?? 0) + numberValue(movement.quantityDelta));
    }
  }

  const dayMovements = confirmedMovements.filter((movement) => {
    const timestamp = Date.parse(movement.transactionAt);
    return timestamp >= startMs && timestamp < endMs;
  });
  const movementByKey = new Map<string, DailyClosingMovementInput[]>();
  for (const movement of dayMovements) {
    const key = rowKey(movement.productId, movement.variationId);
    movementByKey.set(key, [...(movementByKey.get(key) ?? []), movement]);
  }

  const keys = new Set<string>([...currentBalances.keys(), ...movementByKey.keys()]);
  const rows = [...keys].map((key) => {
    const balance = currentBalances.get(key);
    const movements = movementByKey.get(key) ?? [];
    const firstMovement = movements[0];
    const productId = balance?.meta.productId ?? firstMovement?.productId ?? "";
    const variationId = balance?.meta.variationId ?? firstMovement?.variationId ?? null;
    const systemClosingQty = numberValue(balance?.balance);
    const openingQty = systemClosingQty - numberValue(postStartDelta.get(key));
    const stockIn = sum(movements.filter((movement) => numberValue(movement.quantityDelta) > 0).map((movement) => numberValue(movement.quantityDelta)));
    const stockOut = sum(movements.filter((movement) => numberValue(movement.quantityDelta) < 0).map((movement) => Math.abs(numberValue(movement.quantityDelta))));
    const closingQty = openingQty + stockIn - stockOut;
    const latestBalanceAfter = [...movements].reverse().find((movement) => movement.balanceAfter !== null && movement.balanceAfter !== undefined)?.balanceAfter;
    const meta = balance?.meta ?? firstMovement;
    return {
      key,
      productId,
      variationId,
      productName: meta?.productName ?? "Not provided",
      sku: meta?.sku ?? "Not provided",
      model: meta?.model ?? null,
      openingQty,
      stockIn,
      stockOut,
      closingQty,
      systemClosingQty,
      unit: meta?.unit ?? "Pcs",
      reconciliationNeeded: Math.abs(closingQty - systemClosingQty) > EPSILON || (latestBalanceAfter !== undefined && Math.abs(closingQty - numberValue(latestBalanceAfter)) > EPSILON),
      remarks: null,
    } satisfies DailyClosingRow;
  }).filter((row) => input.movementOnly
    ? row.stockIn > EPSILON || row.stockOut > EPSILON
    : input.includeAllProducts || row.stockIn > EPSILON || row.stockOut > EPSILON || row.openingQty > EPSILON || row.closingQty > EPSILON)
    .sort((left, right) => left.productName.localeCompare(right.productName));

  const movementDetails = dayMovements.map((movement) => ({ ...movement, direction: numberValue(movement.quantityDelta) >= 0 ? "in" as const : "out" as const }));
  const serializedUnitsReceived = sum(movementDetails.filter((movement) => movement.direction === "in").map((movement) => movement.serialDetails?.length ?? 0));
  const serializedUnitsDispatched = sum(movementDetails.filter((movement) => movement.direction === "out").map((movement) => movement.serialDetails?.length ?? 0));
  const summary = {
    totalProductLines: rows.length,
    totalOpeningQty: sum(rows.map((row) => row.openingQty)),
    totalStockIn: sum(rows.map((row) => row.stockIn)),
    totalStockOut: sum(rows.map((row) => row.stockOut)),
    totalClosingQty: sum(rows.map((row) => row.closingQty)),
    stockInTransactions: movementDetails.filter((movement) => movement.direction === "in").length,
    stockOutTransactions: movementDetails.filter((movement) => movement.direction === "out").length,
    serializedUnitsReceived,
    serializedUnitsDispatched,
    reconciliationNeeded: rows.some((row) => row.reconciliationNeeded),
  } satisfies DailyClosingSummary;
  return { rows, movementDetails, summary };
}

