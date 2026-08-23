export type EligibleQuotationOption = {
  quotationId: string;
  reference: string;
  customerId: string;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string;
  totalAmount: number;
  currency: string;
  expirationDate: string | null;
};

export const QUOTATION_SALE_CONVERSION_PERMISSIONS = [
  "quotations.convert_to_sale",
  "sales.create",
] as const;

export type QuotationSaleInitialLine = {
  quotationItemId: string;
  productId: string;
  variationId: string | null;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTax: number;
};

export type QuotationSaleInitial = {
  quotationId: string;
  reference: string;
  customerId: string;
  billingAddressId: string | null;
  shippingAddressId: string | null;
  expectedDeliveryDate: string | null;
  discountAmount: number;
  taxAmount: number;
  customerNotes: string | null;
  internalNotes: string | null;
  paymentTerms: string | null;
  deliveryInformation: string | null;
  termsAndConditions: string | null;
  lines: QuotationSaleInitialLine[];
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isUuid(value) ? value : undefined;
}

function nullableDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && datePattern.test(value) ? value : undefined;
}

function finiteMoney(value: unknown): number | null {
  if (typeof value === "string" && !value.trim()) return null;
  const number =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function nonnegativeMoney(value: unknown): number | null {
  const number = finiteMoney(value);
  return number !== null && number >= 0 ? number : null;
}

function positiveWholeQuantity(value: unknown): number | null {
  const number = finiteMoney(value);
  return number !== null && number > 0 && Number.isInteger(number)
    ? number
    : null;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function normalizableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function nullableCustomerEmail(value: unknown): string | null {
  if (value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

export function isEligibleQuotationSalePrefill(value: unknown, today: string) {
  if (!isRecord(value) || !datePattern.test(today)) return false;
  const expirationDate = nullableDate(value.expirationDate);
  return (
    value.status === "accepted" &&
    value.convertedOrderId === null &&
    value.customerRole === "customer" &&
    value.customerStatus === "active" &&
    expirationDate !== undefined &&
    (expirationDate === null || expirationDate >= today)
  );
}

export function normalizeQuotationSaleInitial(
  quotation: unknown,
  items: unknown,
): QuotationSaleInitial | null {
  if (!isRecord(quotation) || !Array.isArray(items)) return null;
  const billingAddressId = nullableUuid(quotation.billing_address_id);
  const shippingAddressId = nullableUuid(quotation.shipping_address_id);
  const expectedDeliveryDate = nullableDate(quotation.required_by);
  const discountAmount =
    quotation.discount_amount === null ? 0 : nonnegativeMoney(quotation.discount_amount);
  const taxAmount = quotation.tax_amount === null ? 0 : nonnegativeMoney(quotation.tax_amount);
  const customerNotes = nullableText(quotation.customer_notes);
  const internalNotes = nullableText(quotation.internal_notes);
  const paymentTerms = nullableText(quotation.payment_terms);
  const deliveryInformation = nullableText(quotation.delivery_information);
  const termsAndConditions = nullableText(quotation.terms_and_conditions);
  if (
    !isUuid(quotation.id) ||
    !isUuid(quotation.profile_id) ||
    !normalizableText(quotation.reference) ||
    billingAddressId === undefined ||
    shippingAddressId === undefined ||
    expectedDeliveryDate === undefined ||
    discountAmount === null ||
    taxAmount === null ||
    customerNotes === undefined ||
    internalNotes === undefined ||
    paymentTerms === undefined ||
    deliveryInformation === undefined ||
    termsAndConditions === undefined
  ) {
    return null;
  }

  const lines: QuotationSaleInitialLine[] = [];
  for (const item of items) {
    if (!isRecord(item)) return null;
    const variationId = nullableUuid(item.variation_id);
    const quantity = positiveWholeQuantity(item.quantity);
    const unitPrice = nonnegativeMoney(
      item.unit_price === null ? item.target_price : item.unit_price,
    );
    const lineDiscount =
      item.discount_amount === null ? 0 : nonnegativeMoney(item.discount_amount);
    const lineTax = item.tax_amount === null ? 0 : nonnegativeMoney(item.tax_amount);
    if (
      !isUuid(item.id) ||
      !isUuid(item.product_id) ||
      variationId === undefined ||
      quantity === null ||
      unitPrice === null ||
      lineDiscount === null ||
      lineTax === null
    ) {
      return null;
    }
    lines.push({
      quotationItemId: item.id,
      productId: item.product_id,
      variationId,
      quantity,
      unitPrice,
      lineDiscount,
      lineTax,
    });
  }
  if (!lines.length) return null;

  return {
    quotationId: quotation.id,
    reference: normalizableText(quotation.reference)!,
    customerId: quotation.profile_id,
    billingAddressId,
    shippingAddressId,
    expectedDeliveryDate,
    discountAmount,
    taxAmount,
    customerNotes,
    internalNotes,
    paymentTerms,
    deliveryInformation,
    termsAndConditions,
    lines,
  };
}

export function validateQuotationSaleAddresses(
  initial: QuotationSaleInitial | null,
  ownedAddressIds: unknown,
): QuotationSaleInitial | null {
  if (!initial || !Array.isArray(ownedAddressIds)) return null;
  const owned = new Set(ownedAddressIds.filter(isUuid));
  const isOwnedOrNull = (addressId: string | null) =>
    addressId === null || owned.has(addressId);
  return isOwnedOrNull(initial.shippingAddressId) &&
    isOwnedOrNull(initial.billingAddressId)
    ? initial
    : null;
}

export function normalizeEligibleQuotationOptions(
  payload: unknown,
): EligibleQuotationOption[] {
  if (!Array.isArray(payload)) return [];
  const options: EligibleQuotationOption[] = [];
  for (const row of payload) {
    if (options.length === 20) break;
    if (!isRecord(row)) continue;
    const reference = normalizableText(row.reference);
    const customerEmail = nullableCustomerEmail(row.customer_email);
    const customerName = normalizableText(row.customer_name);
    const customerCompany = normalizableText(row.customer_company);
    const totalAmount = nonnegativeMoney(row.total_amount);
    const expirationDate = nullableDate(row.expiration_date);
    const currency = normalizableText(row.currency);
    if (
      !isUuid(row.quotation_id) ||
      !isUuid(row.customer_id) ||
      !reference ||
      !customerName ||
      customerEmail === null ||
      totalAmount === null ||
      expirationDate === undefined ||
      !currency
    ) {
      continue;
    }
    options.push({
      quotationId: row.quotation_id,
      reference,
      customerId: row.customer_id,
      customerName,
      customerCompany,
      customerEmail,
      totalAmount,
      currency,
      expirationDate,
    });
  }
  return options;
}

export function quotationSaleDestination(quotationId: unknown): string | null {
  if (!isUuid(quotationId)) return null;
  return `/admin/sales/new?${new URLSearchParams({ quotation: quotationId })}`;
}

export type QuotationTypeaheadState = {
  options: EligibleQuotationOption[];
  activeIndex: number;
  loading: boolean;
  error: string | null;
  requestId: number;
};

export type QuotationTypeaheadStateEvent =
  | { type: "query" | "escape"; requestId: number }
  | { type: "loading"; requestId: number }
  | {
    type: "response";
    requestId: number;
    options: EligibleQuotationOption[];
    error: string | null;
  };

export function quotationTypeaheadStateTransition(
  state: QuotationTypeaheadState,
  event: QuotationTypeaheadStateEvent,
): QuotationTypeaheadState {
  if (event.type === "query" || event.type === "escape") {
    return {
      options: [],
      activeIndex: -1,
      loading: false,
      error: null,
      requestId: event.requestId,
    };
  }
  if (event.requestId !== state.requestId) return state;
  if (event.type === "loading") {
    return { ...state, options: [], activeIndex: -1, loading: true, error: null };
  }
  if (event.type !== "response") return state;
  return {
    options: event.options,
    activeIndex: -1,
    loading: false,
    error: event.error,
    requestId: state.requestId,
  };
}

export function quotationTypeaheadKeyResult(
  key: unknown,
  activeIndex: unknown,
  optionCount: unknown,
) {
  const count =
    typeof optionCount === "number" && Number.isInteger(optionCount) && optionCount > 0
      ? optionCount
      : 0;
  const current =
    typeof activeIndex === "number" &&
    Number.isInteger(activeIndex) &&
    activeIndex >= 0 &&
    activeIndex < count
      ? activeIndex
      : -1;
  if (key === "ArrowDown" && count) {
    return { activeIndex: current === count - 1 ? 0 : current + 1, select: false, close: false };
  }
  if (key === "ArrowUp" && count) {
    return { activeIndex: current <= 0 ? count - 1 : current - 1, select: false, close: false };
  }
  if (key === "Enter") {
    return { activeIndex: current, select: current >= 0, close: false };
  }
  if (key === "Escape") {
    return { activeIndex: -1, select: false, close: true };
  }
  return { activeIndex: current, select: false, close: false };
}
