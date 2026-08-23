const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_DATABASE_MONEY = 99_999_999_999_999.9999;

const SALES_SOURCES = new Set([
  "website",
  "facebook",
  "whatsapp",
  "phone",
  "email",
  "direct_office",
  "existing_customer",
  "sales_representative",
  "referral",
  "other",
]);

const ADJUSTMENT_TYPES = new Set([
  "manual_unit_price",
  "fixed_line_discount",
  "order_discount",
  "service_charge",
]);

type AddressSnapshot = Record<string, string | number | null | undefined>;

export type DraftSaleItem = {
  product_id: string;
  variation_id: string | null;
  warehouse_id: string;
  source_quotation_item_id?: string | null;
  quantity: number;
  unit_price: number;
  catalogue_price: number;
  line_discount: number;
  line_tax: number;
  price_overridden: boolean;
  adjustment_reason: string;
};

export type DraftSaleAdjustment = {
  order_item_id: null;
  source_quotation_item_id?: string | null;
  product_id?: string | null;
  variation_id?: string | null;
  adjustment_type: "manual_unit_price" | "fixed_line_discount" | "order_discount" | "service_charge";
  previous_value: number;
  new_value: number;
  reason: string;
};

export type DraftSaleInput = {
  customerId: string;
  addressId: string | null;
  address: AddressSnapshot;
  billingAddressId: string | null;
  billingAddress: AddressSnapshot | null;
  warehouseId: string;
  source: string;
  expectedDeliveryDate: string | null;
  discountAmount: number;
  shippingAmount: number;
  serviceAmount: number;
  taxAmount: number;
  internalNotes: string | null;
  customerNotes: string | null;
  items: DraftSaleItem[];
  adjustments: DraftSaleAdjustment[];
  hasPriceOverride: boolean;
  hasDiscount: boolean;
};

export type DraftSaleInputMode = "manual" | "quotation";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Sale item is invalid.");
  }
  return value as Record<string, unknown>;
}

function parseUuid(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const candidate = value.trim();
  if (!UUID_PATTERN.test(candidate)) throw new Error(`${label} is invalid.`);
  return candidate;
}

function nullableUuid(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const candidate = value.trim();
  return candidate ? parseUuid(candidate, label) : null;
}

function parseMoney(value: unknown, label: string): number {
  const raw = String(value ?? "").trim();
  if (!MONEY_PATTERN.test(raw)) {
    throw new Error(`${label} must be a valid amount with no more than 2 decimal places.`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be at least 0.00.`);
  }
  const cents = Math.round((parsed + Number.EPSILON) * 100);
  const normalized = cents / 100;
  if (
    !Number.isFinite(cents) ||
    !Number.isSafeInteger(cents) ||
    !Number.isFinite(normalized) ||
    normalized > MAX_DATABASE_MONEY
  ) {
    throw new Error(`${label} is outside the supported range.`);
  }
  return normalized;
}

function parseQuantity(value: unknown, label: string): number {
  const raw = String(value ?? "").trim();
  if (!WHOLE_NUMBER_PATTERN.test(raw)) {
    throw new Error(`${label} must be a whole number without decimals.`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a whole number from 1 to ${Number.MAX_SAFE_INTEGER}.`);
  }
  return parsed;
}

function parseArray(form: FormData, key: string): unknown[] {
  try {
    const parsed = JSON.parse(String(form.get(key) ?? "[]")) as unknown;
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${key.replaceAll("_", " ")} is invalid.`);
  }
}

function optionalText(form: FormData, key: string, max = 2000): string | null {
  return String(form.get(key) ?? "").trim().slice(0, max) || null;
}

function requiredText(form: FormData, key: string, max: number): string {
  const value = String(form.get(key) ?? "").trim().slice(0, max);
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`);
  return value;
}

function optionalCoordinate(form: FormData, key: "latitude" | "longitude") {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  const valid = Number.isFinite(value) &&
    (key === "latitude" ? value >= -90 && value <= 90 : value >= -180 && value <= 180);
  if (!valid) throw new Error(`${key === "latitude" ? "Latitude" : "Longitude"} is invalid.`);
  return value;
}

function addressFromForm(form: FormData): AddressSnapshot {
  return {
    recipient_name: requiredText(form, "recipient_name", 160),
    phone: requiredText(form, "phone", 40),
    alternate_phone: optionalText(form, "alternate_phone", 40) ?? undefined,
    address_line_1: requiredText(form, "address_line_1", 240),
    address_line_2: optionalText(form, "address_line_2", 240) ?? undefined,
    area: optionalText(form, "area", 120) ?? undefined,
    city: requiredText(form, "city", 120),
    region: optionalText(form, "region", 120) ?? undefined,
    postal_code: optionalText(form, "postal_code", 30) ?? undefined,
    country_code: requiredText(form, "country_code", 2).toUpperCase(),
    delivery_instructions: optionalText(form, "delivery_instructions", 500) ?? undefined,
    latitude: optionalCoordinate(form, "latitude"),
    longitude: optionalCoordinate(form, "longitude"),
    map_label: optionalText(form, "map_label", 160) ?? undefined,
  };
}

function parseDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = DATE_PATTERN.exec(raw);
  if (!match) throw new Error("Expected delivery date is invalid.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error("Expected delivery date is invalid.");
  return raw;
}

function parseItem(value: unknown, index: number, retainQuotationSource: boolean): DraftSaleItem {
  const item = record(value);
  const label = `Item ${index + 1}`;
  const unitPrice = parseMoney(item.unit_price, `${label} unit price`);
  const sourceQuotationItemId = retainQuotationSource
    ? nullableUuid(item.source_quotation_item_id, `${label} source quotation item`)
    : null;
  if (
    item.adjustment_reason !== undefined &&
    item.adjustment_reason !== null &&
    typeof item.adjustment_reason !== "string"
  ) {
    throw new Error(`${label} adjustment reason is invalid.`);
  }
  const normalized: DraftSaleItem = {
    product_id: parseUuid(item.product_id, `${label} product`),
    variation_id: nullableUuid(item.variation_id, `${label} variation`),
    warehouse_id: parseUuid(item.warehouse_id, `${label} warehouse`),
    quantity: parseQuantity(item.quantity, `${label} quantity`),
    unit_price: unitPrice,
    catalogue_price: parseMoney(
      item.catalogue_price ?? item.unit_price,
      `${label} catalogue price`,
    ),
    line_discount: parseMoney(item.line_discount ?? 0, `${label} discount`),
    line_tax: parseMoney(item.line_tax ?? 0, `${label} tax`),
    price_overridden: Boolean(item.price_overridden),
    adjustment_reason: (item.adjustment_reason || "Sales price adjustment").slice(0, 500),
  };
  if (sourceQuotationItemId) normalized.source_quotation_item_id = sourceQuotationItemId;
  return normalized;
}

function lineMatchesAdjustment(
  adjustment: DraftSaleAdjustment,
  items: DraftSaleItem[],
) {
  return items.some((item) =>
    (item.source_quotation_item_id ?? null) === (adjustment.source_quotation_item_id ?? null) &&
    item.product_id === adjustment.product_id &&
    item.variation_id === adjustment.variation_id,
  );
}

function parseAdjustment(value: unknown, index: number, items: DraftSaleItem[]): DraftSaleAdjustment {
  const item = record(value);
  const label = `Adjustment ${index + 1}`;
  if (typeof item.adjustment_type !== "string") {
    throw new Error(`${label} type is invalid.`);
  }
  const adjustmentType = item.adjustment_type;
  if (!ADJUSTMENT_TYPES.has(adjustmentType)) {
    throw new Error(`${label} type is invalid.`);
  }
  if (item.order_item_id !== null && item.order_item_id !== undefined && item.order_item_id !== "") {
    throw new Error(`${label} cannot reference an existing Sale item.`);
  }
  if (typeof item.reason !== "string") throw new Error(`${label} reason is invalid.`);
  const reason = item.reason.trim().slice(0, 500);
  if (!reason) throw new Error(`${label} reason is required.`);
  const isLine = adjustmentType === "manual_unit_price" || adjustmentType === "fixed_line_discount";
  const parsed: DraftSaleAdjustment = {
    order_item_id: null,
    source_quotation_item_id: nullableUuid(item.source_quotation_item_id, `${label} source quotation item`),
    product_id: nullableUuid(item.product_id, `${label} product`),
    variation_id: nullableUuid(item.variation_id, `${label} variation`),
    adjustment_type: adjustmentType as DraftSaleAdjustment["adjustment_type"],
    previous_value: parseMoney(item.previous_value, `${label} previous value`),
    new_value: parseMoney(item.new_value, `${label} new value`),
    reason,
  };
  if (isLine) {
    if (!parsed.product_id || !lineMatchesAdjustment(parsed, items)) {
      throw new Error(`${label} does not match a Sale line.`);
    }
  } else if (parsed.source_quotation_item_id || parsed.product_id || parsed.variation_id) {
    throw new Error(`${label} header identifiers are invalid.`);
  }
  return parsed;
}

function legacyAdjustments(
  form: FormData,
  items: DraftSaleItem[],
  discountAmount: number,
  serviceAmount: number,
): DraftSaleAdjustment[] {
  const adjustments = items
    .filter((item) => item.price_overridden || item.line_discount > 0)
    .map((item): DraftSaleAdjustment => ({
      order_item_id: null,
      adjustment_type: item.price_overridden ? "manual_unit_price" : "fixed_line_discount",
      previous_value: item.catalogue_price,
      new_value: item.price_overridden ? item.unit_price : item.line_discount,
      reason: item.adjustment_reason,
    }));
  if (discountAmount > 0) adjustments.push({
    order_item_id: null,
    adjustment_type: "order_discount",
    previous_value: 0,
    new_value: discountAmount,
    reason: String(form.get("discount_reason") || "Order discount").slice(0, 500),
  });
  if (serviceAmount > 0) adjustments.push({
    order_item_id: null,
    adjustment_type: "service_charge",
    previous_value: 0,
    new_value: serviceAmount,
    reason: "Installation or service charge",
  });
  return adjustments;
}

export function parseDraftSaleInput(
  form: FormData,
  options: { mode: DraftSaleInputMode },
): DraftSaleInput {
  const mode = options?.mode;
  if (mode !== "manual" && mode !== "quotation") {
    throw new Error("Draft Sale input mode is invalid.");
  }
  const customerId = parseUuid(form.get("customer_id"), "Customer");
  const warehouseId = parseUuid(form.get("warehouse_id"), "Warehouse");
  const addressId = nullableUuid(form.get("address_id"), "Delivery address");
  const billingAddressId = nullableUuid(form.get("billing_address_id"), "Billing address");
  const source = String(form.get("sales_source") ?? "direct_office").trim();
  if (!SALES_SOURCES.has(source)) throw new Error("Sales source is invalid.");

  const rawItems = parseArray(form, "items");
  if (!rawItems.length) throw new Error("At least one product is required.");
  const items = rawItems.map((value, index) => parseItem(value, index, mode === "quotation"));
  const discountAmount = parseMoney(form.get("discount_amount") || 0, "Order discount");
  const shippingAmount = parseMoney(form.get("shipping_amount") || 0, "Shipping charge");
  const serviceAmount = parseMoney(form.get("service_amount") || 0, "Installation / service");
  const taxAmount = parseMoney(form.get("tax_amount") || 0, "VAT / tax");
  const address = addressId ? {} : addressFromForm(form);
  let adjustments: DraftSaleAdjustment[];
  if (mode === "manual") {
    adjustments = legacyAdjustments(form, items, discountAmount, serviceAmount);
  } else {
    if (!form.has("adjustments") || !String(form.get("adjustments") ?? "").trim()) {
      throw new Error("Sale adjustments are invalid.");
    }
    adjustments = parseArray(form, "adjustments")
      .map((value, index) => parseAdjustment(value, index, items));
  }

  return {
    customerId,
    addressId,
    address,
    billingAddressId,
    billingAddress: addressId ? null : address,
    warehouseId,
    source,
    expectedDeliveryDate: parseDate(form.get("expected_delivery_date")),
    discountAmount,
    shippingAmount,
    serviceAmount,
    taxAmount,
    internalNotes: optionalText(form, "internal_notes", 2000),
    customerNotes: optionalText(form, "customer_notes", 2000),
    items,
    adjustments,
    hasPriceOverride: items.some((item) => item.price_overridden),
    hasDiscount: items.some((item) => item.line_discount > 0) || discountAmount > 0,
  };
}

function commonSaleRpcArguments(actorProfileId: string, input: DraftSaleInput) {
  return {
    actor_profile_id: actorProfileId,
    requested_customer_id: input.customerId,
    requested_address_id: input.addressId,
    requested_address: input.address,
    requested_billing_address_id: input.billingAddressId,
    requested_billing_address: input.billingAddress,
    requested_warehouse_id: input.warehouseId,
    requested_source: input.source,
    requested_expected_delivery_date: input.expectedDeliveryDate,
    requested_discount: input.discountAmount,
    requested_shipping: input.shippingAmount,
    requested_service: input.serviceAmount,
    requested_tax: input.taxAmount,
    requested_internal_notes: input.internalNotes,
    requested_customer_notes: input.customerNotes,
    requested_items: input.items,
    requested_adjustments: input.adjustments,
  };
}

export function buildManualSaleRpcArguments(
  actorProfileId: string,
  input: DraftSaleInput,
) {
  return commonSaleRpcArguments(actorProfileId, input);
}

export function buildQuotationSaleRpcArguments(
  actorProfileId: string,
  quotationId: string,
  input: DraftSaleInput,
) {
  return {
    ...commonSaleRpcArguments(actorProfileId, input),
    requested_quotation_id: quotationId,
  };
}

export function normalizeConversionSaleResult(value: unknown): {
  saleId: string;
  saleNumber: string;
  existing: boolean;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (
    typeof result.sale_id !== "string" ||
    typeof result.order_id !== "string" ||
    typeof result.order_number !== "string"
  ) return null;
  const saleId = result.sale_id.trim();
  const orderId = result.order_id.trim();
  const saleNumber = result.order_number.trim();
  if (
    !UUID_PATTERN.test(saleId) ||
    orderId !== saleId ||
    !saleNumber ||
    saleNumber.length > 160 ||
    typeof result.existing !== "boolean"
  ) return null;
  return { saleId, saleNumber, existing: result.existing };
}
