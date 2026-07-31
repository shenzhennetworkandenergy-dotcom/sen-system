import {
  parseMoney,
  parseWholeNumber,
  roundMoney,
} from "../validation/numbers.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type QuotationCreateItem = {
  productId: string;
  variationId: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineSubtotal: number;
  lineTotal: number;
};

export function parseQuotationItems(value: unknown): QuotationCreateItem[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error("Choose at least one product.");
  }
  if (value.length > 50) {
    throw new Error("A quotation can contain up to 50 products.");
  }

  const items = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Item ${index + 1} is invalid.`);
    }
    const source = item as Record<string, unknown>;
    const productId = String(source.product_id ?? "").trim();
    const variationValue = String(source.variation_id ?? "").trim();
    if (!uuidPattern.test(productId)) {
      throw new Error(`Item ${index + 1} product is invalid.`);
    }
    if (variationValue && !uuidPattern.test(variationValue)) {
      throw new Error(`Item ${index + 1} variation is invalid.`);
    }
    const quantity = parseWholeNumber(
      source.quantity,
      `Item ${index + 1} quantity`,
      { required: true, minimum: 1, maximum: 1_000_000 },
    )!;
    const unitPrice = parseMoney(
      source.unit_price,
      `Item ${index + 1} unit price`,
      { required: true },
    )!;
    const discountAmount = parseMoney(
      source.discount_amount ?? 0,
      `Item ${index + 1} discount`,
      { required: true },
    )!;
    const taxAmount = parseMoney(
      source.tax_amount ?? 0,
      `Item ${index + 1} tax`,
      { required: true },
    )!;
    const lineSubtotal = roundMoney(quantity * unitPrice);
    if (discountAmount > lineSubtotal) {
      throw new Error(`Item ${index + 1} discount cannot exceed its subtotal.`);
    }
    return {
      productId,
      variationId: variationValue || null,
      quantity,
      unitPrice,
      discountAmount,
      taxAmount,
      lineSubtotal,
      lineTotal: roundMoney(lineSubtotal - discountAmount + taxAmount),
    };
  });

  const keys = items.map(
    (item) => `${item.productId}:${item.variationId ?? "parent"}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("Each product or variation can only be added once.");
  }
  return items;
}
