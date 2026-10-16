import { normalizeDraftSaleMoney } from "./create-draft-input.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DraftSaleEditItem = {
  id: string | null;
  product_id: string;
  variation_id: string | null;
  warehouse_id: string;
  quantity: number;
  unit_price: number;
  discount_type: "percentage" | "fixed";
  discount_value: number;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Sale item is invalid.");
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function optionalUuid(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value, label);
}

export function parseDraftSaleEditItems(value: unknown): DraftSaleEditItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one product is required.");
  }
  const seenIds = new Set<string>();
  return value.map((raw, index) => {
    const item = object(raw);
    const label = `Item ${index + 1}`;
    const id = optionalUuid(item.id, `${label} existing line`);
    if (id && seenIds.has(id)) throw new Error("A Sale line cannot be submitted twice.");
    if (id) seenIds.add(id);
    const quantity = Number(String(item.quantity ?? "").trim());
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error(`${label} quantity must be a whole number of at least 1.`);
    }
    const discountType = item.discount_type;
    if (discountType !== "percentage" && discountType !== "fixed") {
      throw new Error(`${label} discount type is invalid.`);
    }
    const discountValue = normalizeDraftSaleMoney(
      item.discount_value ?? 0,
      `${label} discount`,
    );
    if (discountType === "percentage" && discountValue > 100) {
      throw new Error(`${label} percentage discount cannot exceed 100.`);
    }
    return {
      id,
      product_id: uuid(item.product_id, `${label} product`),
      variation_id: optionalUuid(item.variation_id, `${label} variation`),
      warehouse_id: uuid(item.warehouse_id, `${label} warehouse`),
      quantity,
      unit_price: normalizeDraftSaleMoney(item.unit_price, `${label} unit price`),
      discount_type: discountType,
      discount_value: discountValue,
    };
  });
}

export function assertSaleCustomerLocked(
  requestedCustomerId: unknown,
  existingCustomerId: string,
) {
  if (uuid(requestedCustomerId, "Customer") !== existingCustomerId) {
    throw new Error("The Sale customer cannot be changed.");
  }
}
