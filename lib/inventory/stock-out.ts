export type StockOutRequestStatus =
  | "pending_release"
  | "partially_released"
  | "fully_released"
  | "cancelled";

export type StockOutQuantity = {
  required: number;
  released: number;
};

export type ReleaseQuantityValidation = {
  remaining: number;
  reserved: number;
  onHand: number;
  quantity: number;
};

export type StockOutSerial = {
  productId: string;
  variationId: string | null;
  warehouseId: string | null;
  status: string;
  condition: string;
  conflicting: boolean;
};

export type ExpectedStockOutSerial = Pick<
  StockOutSerial,
  "productId" | "variationId" | "warehouseId"
>;

const ELIGIBLE_SERIAL_STATUSES = new Set([
  "available",
  "reserved",
  "allocated",
  "packed",
]);

const INELIGIBLE_SERIAL_CONDITIONS = new Set([
  "damaged",
  "disposed",
  "lost",
  "quarantined",
  "unavailable",
]);

function finiteQuantity(value: number) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function stockOutRemaining(required: number, released: number) {
  return Math.max(0, finiteQuantity(required) - finiteQuantity(released));
}

export function deriveStockOutStatus(
  items: StockOutQuantity[],
): Exclude<StockOutRequestStatus, "cancelled"> {
  const required = items.reduce(
    (total, item) => total + Math.max(0, finiteQuantity(item.required)),
    0,
  );
  const released = items.reduce(
    (total, item) => total + Math.max(0, finiteQuantity(item.released)),
    0,
  );

  if (required === 0 || released >= required) return "fully_released";
  if (released > 0) return "partially_released";
  return "pending_release";
}

export function isRevisionQuantityValid(required: number, released: number) {
  const nextRequired = Number(required);
  const alreadyReleased = Number(released);
  return (
    Number.isFinite(nextRequired) &&
    Number.isFinite(alreadyReleased) &&
    nextRequired >= 0 &&
    alreadyReleased >= 0 &&
    nextRequired >= alreadyReleased
  );
}

export function validateReleaseQuantity({
  remaining,
  reserved,
  onHand,
  quantity,
}: ReleaseQuantityValidation) {
  const releaseQuantity = Number(quantity);
  if (!Number.isFinite(releaseQuantity) || releaseQuantity <= 0) {
    return "Release quantity must be greater than zero.";
  }
  if (releaseQuantity > finiteQuantity(remaining)) {
    return "Release quantity exceeds the request's remaining quantity.";
  }
  if (releaseQuantity > finiteQuantity(reserved)) {
    return "Release quantity exceeds the reserved quantity.";
  }
  if (releaseQuantity > finiteQuantity(onHand)) {
    return "Release quantity exceeds the available physical stock.";
  }
  return null;
}

export function isEligibleStockOutSerial(
  serial: StockOutSerial,
  expected: ExpectedStockOutSerial,
) {
  const status = serial.status.trim().toLowerCase();
  const condition = serial.condition.trim().toLowerCase();
  return Boolean(
    serial.productId === expected.productId &&
      serial.variationId === expected.variationId &&
      serial.warehouseId === expected.warehouseId &&
      !serial.conflicting &&
      ELIGIBLE_SERIAL_STATUSES.has(status) &&
      !INELIGIBLE_SERIAL_CONDITIONS.has(condition),
  );
}
