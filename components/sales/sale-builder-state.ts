import type { QuotationSaleInitial } from "../../lib/quotations/sale-conversion-types";

export type SaleBuilderRow = {
  key: string;
  product_id: string;
  variation_id: string;
  source_quotation_item_id: string | null;
  quantity: string;
  unit_price: string;
  line_discount: string;
  discount_percent: string;
  line_tax: string;
  reason: string;
  catalogue_price: number;
  baseline_unit_price: number;
  baseline_line_discount: number;
};

export type SaleBuilderInitialState = {
  customerId: string;
  warehouseId: string;
  addressId: string;
  billingAddressId: string;
  rows: SaleBuilderRow[];
  expectedDeliveryDate: string;
  discountAmount: string;
  shippingAmount: string;
  serviceAmount: string;
  taxAmount: string;
  discountReason: string;
  customerNotes: string;
  internalNotes: string;
};

type SaleBuilderHeader = {
  discountAmount: string;
  serviceAmount: string;
  discountReason: string;
};

const money = (value: unknown) => {
  const number = Number(value);
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
};

export const approvedQuotationReason = (reference: string) =>
  `Approved quotation ${reference}`;

export function saleBuilderRowControlState(
  row: Pick<SaleBuilderRow, "source_quotation_item_id">,
) {
  const sourced = Boolean(row.source_quotation_item_id);
  return {
    productLocked: sourced,
    variationLocked: sourced,
    removable: !sourced,
  };
}

export function createBlankSaleBuilderRow(
  makeKey: () => string,
  reason = "",
): SaleBuilderRow {
  return {
    key: makeKey(),
    product_id: "",
    variation_id: "",
    source_quotation_item_id: null,
    quantity: "1",
    unit_price: "0",
    line_discount: "0",
    discount_percent: "0",
    line_tax: "0",
    reason,
    catalogue_price: 0,
    baseline_unit_price: 0,
    baseline_line_discount: 0,
  };
}

export function createSaleBuilderInitialState(
  initialQuotation: QuotationSaleInitial | undefined,
  warehouses: Array<{ id: string }>,
  makeKey: () => string,
): SaleBuilderInitialState {
  const warehouseId = warehouses[0]?.id ?? "";
  if (!initialQuotation) {
    return {
      customerId: "",
      warehouseId,
      addressId: "",
      billingAddressId: "",
      rows: [createBlankSaleBuilderRow(makeKey)],
      expectedDeliveryDate: "",
      discountAmount: "0",
      shippingAmount: "0",
      serviceAmount: "0",
      taxAmount: "0",
      discountReason: "",
      customerNotes: "",
      internalNotes: "",
    };
  }

  const reason = approvedQuotationReason(initialQuotation.reference);
  return {
    customerId: initialQuotation.customerId,
    warehouseId,
    addressId: initialQuotation.shippingAddressId ?? "",
    billingAddressId: initialQuotation.billingAddressId ?? "",
    rows: initialQuotation.lines.map((line) => ({
      key: `quotation:${line.quotationItemId}`,
      product_id: line.productId,
      variation_id: line.variationId ?? "",
      source_quotation_item_id: line.quotationItemId,
      quantity: String(line.quantity),
      unit_price: String(line.unitPrice),
      line_discount: String(line.lineDiscount),
      discount_percent: "0",
      line_tax: String(line.lineTax),
      reason,
      catalogue_price: line.unitPrice,
      baseline_unit_price: line.unitPrice,
      baseline_line_discount: line.lineDiscount,
    })),
    expectedDeliveryDate: initialQuotation.expectedDeliveryDate ?? "",
    discountAmount: String(initialQuotation.discountAmount),
    shippingAmount: "0",
    serviceAmount: "0",
    taxAmount: String(initialQuotation.taxAmount),
    discountReason: reason,
    customerNotes: initialQuotation.customerNotes ?? "",
    internalNotes: initialQuotation.internalNotes ?? "",
  };
}

function lineValues(row: SaleBuilderRow) {
  const quantity = Number(row.quantity);
  const unitPrice = money(row.unit_price);
  const gross = money(quantity * unitPrice);
  const requestedDiscount = money(
    Number(row.line_discount || 0) +
      gross * Number(row.discount_percent || 0) / 100,
  );
  return {
    quantity,
    unitPrice,
    discount: Math.min(gross, requestedDiscount),
    tax: money(row.line_tax),
    gross,
  };
}

export function buildSaleBuilderSubmission(
  rows: SaleBuilderRow[],
  warehouseId: string,
  validProductIds: Set<string>,
  initialQuotation: QuotationSaleInitial | undefined,
  header: SaleBuilderHeader,
) {
  const defaultReason = initialQuotation
    ? approvedQuotationReason(initialQuotation.reference)
    : "";
  const selected = rows.filter((row) =>
    Boolean(row.source_quotation_item_id) || validProductIds.has(row.product_id));
  const items = selected.map((row) => {
    const values = lineValues(row);
    const rawUnitPrice = Number(row.unit_price);
    const rawGross = Number(row.quantity || 0) * Number(row.unit_price || 0);
    const rawDiscount = Math.min(
      rawGross,
      Number(row.line_discount || 0) +
        rawGross * Number(row.discount_percent || 0) / 100,
    );
    return {
      product_id: row.product_id,
      variation_id: row.variation_id || null,
      warehouse_id: warehouseId,
      ...(initialQuotation
        ? { source_quotation_item_id: row.source_quotation_item_id }
        : {}),
      quantity: values.quantity,
      unit_price: initialQuotation ? values.unitPrice : rawUnitPrice,
      line_discount: initialQuotation ? values.discount : rawDiscount,
      line_tax: initialQuotation ? values.tax : 0,
      price_overridden: initialQuotation
        ? values.unitPrice !== money(row.baseline_unit_price)
        : rawUnitPrice !== row.catalogue_price,
      catalogue_price: initialQuotation ? money(row.catalogue_price) : row.catalogue_price,
      adjustment_reason: initialQuotation
        ? row.reason.trim() || defaultReason
        : row.reason,
    };
  });

  if (!initialQuotation) {
    return {
      mode: "manual" as const,
      quotationId: null,
      items,
      adjustments: [],
    };
  }

  const adjustments: Array<Record<string, unknown>> = [];
  for (const row of selected) {
    const values = lineValues(row);
    const reason = row.reason.trim() || defaultReason;
    const identifiers = {
      order_item_id: null,
      source_quotation_item_id: row.source_quotation_item_id,
      product_id: row.product_id,
      variation_id: row.variation_id || null,
    };
    const unitBaseline = money(row.baseline_unit_price);
    const discountBaseline = money(row.baseline_line_discount);
    if (values.unitPrice !== unitBaseline) {
      adjustments.push({
        ...identifiers,
        adjustment_type: "manual_unit_price",
        previous_value: unitBaseline,
        new_value: values.unitPrice,
        reason,
      });
    }
    if (values.discount !== discountBaseline) {
      adjustments.push({
        ...identifiers,
        adjustment_type: "fixed_line_discount",
        previous_value: row.source_quotation_item_id
          ? discountBaseline
          : money(row.catalogue_price),
        new_value: values.discount,
        reason,
      });
    }
  }

  const headerDiscount = money(header.discountAmount);
  const sourceDiscount = money(initialQuotation.discountAmount);
  const headerReason = header.discountReason.trim() || defaultReason;
  if (headerDiscount !== sourceDiscount) {
    adjustments.push({
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: null,
      variation_id: null,
      adjustment_type: "order_discount",
      previous_value: sourceDiscount,
      new_value: headerDiscount,
      reason: headerReason,
    });
  }
  const serviceAmount = money(header.serviceAmount);
  if (serviceAmount > 0) {
    adjustments.push({
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: null,
      variation_id: null,
      adjustment_type: "service_charge",
      previous_value: 0,
      new_value: serviceAmount,
      reason: headerReason,
    });
  }

  return {
    mode: "quotation" as const,
    quotationId: initialQuotation.quotationId,
    items,
    adjustments,
  };
}
