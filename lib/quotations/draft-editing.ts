import { roundMoney } from "../validation/numbers.ts";

export type DraftQuotationValues = {
  id: string;
  reference: string;
  updatedAt: string;
  subject: string;
  companyName: string;
  customerTaxIdentificationNumber: string;
  requiredBy: string;
  expirationDate: string;
  discountAmount: number;
  taxAmount: number;
  paymentTerms: string;
  deliveryInformation: string;
  termsAndConditions: string;
  customerNotes: string;
  internalNotes: string;
  items: Array<{
    productId: string;
    variationId: string | null;
    quantity: number | string;
    unitPrice: number | string;
    discountAmount: number | string;
    taxAmount: number | string;
  }>;
};

type DraftQuotationLoaderItem = {
  product_id: string;
  variation_id: string | null;
  quantity: number | string;
  unit_price: number | string | null;
  discount_amount: number | string | null;
  tax_amount: number | string | null;
};

type FixedCustomer = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  company_name: string | null;
};

export type DraftQuotationLoader = {
  id: string;
  reference: string;
  updated_at: string;
  subject: string | null;
  company_name: string | null;
  customer_tax_identification_number: string | null;
  required_by: string | null;
  expiration_date: string | null;
  discount_amount: number | string | null;
  tax_amount: number | string | null;
  terms_and_conditions: string | null;
  payment_terms: string | null;
  delivery_information: string | null;
  customer_notes: string | null;
  message: string | null;
  internal_notes: string | null;
  quotation_request_items: DraftQuotationLoaderItem[];
  profiles: FixedCustomer;
};

export function mapDraftQuotationEditInitialValues(quotation: DraftQuotationLoader) {
  return {
    fixedCustomer: quotation.profiles,
    draft: {
      id: quotation.id,
      reference: quotation.reference,
      updatedAt: quotation.updated_at,
      subject: quotation.subject ?? "",
      companyName: quotation.company_name ?? "",
      customerTaxIdentificationNumber:
        quotation.customer_tax_identification_number ?? "",
      requiredBy: quotation.required_by ?? "",
      expirationDate: quotation.expiration_date ?? "",
      discountAmount: Number(quotation.discount_amount ?? 0),
      taxAmount: Number(quotation.tax_amount ?? 0),
      termsAndConditions: quotation.terms_and_conditions ?? "",
      paymentTerms: quotation.payment_terms ?? "",
      deliveryInformation: quotation.delivery_information ?? "",
      customerNotes: quotation.customer_notes ?? quotation.message ?? "",
      internalNotes: quotation.internal_notes ?? "",
      items: quotation.quotation_request_items.map((item) => ({
        productId: item.product_id,
        variationId: item.variation_id,
        quantity: item.quantity,
        unitPrice: item.unit_price ?? 0,
        discountAmount: item.discount_amount ?? 0,
        taxAmount: item.tax_amount ?? 0,
      })),
    } satisfies DraftQuotationValues,
  };
}

export type DraftQuotationTotalLine = {
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
};

export function calculateDraftQuotationLine(line: DraftQuotationTotalLine) {
  const subtotal = roundMoney(line.quantity * line.unitPrice);
  return {
    subtotal,
    total: roundMoney(
      Math.max(subtotal - line.discountAmount + line.taxAmount, 0),
    ),
  };
}

export function calculateDraftQuotationTotals(
  lines: readonly DraftQuotationTotalLine[],
  headerDiscount: number,
  headerTax: number,
) {
  const lineTotals = lines.reduce(
    (result, line) => {
      const calculated = calculateDraftQuotationLine(line);
      return {
        subtotal: roundMoney(result.subtotal + calculated.subtotal),
        lineDiscount: roundMoney(result.lineDiscount + line.discountAmount),
        lineTax: roundMoney(result.lineTax + line.taxAmount),
        itemTotal: roundMoney(result.itemTotal + calculated.total),
      };
    },
    { subtotal: 0, lineDiscount: 0, lineTax: 0, itemTotal: 0 },
  );
  const discount = roundMoney(lineTotals.lineDiscount + headerDiscount);
  const tax = roundMoney(lineTotals.lineTax + headerTax);
  return {
    ...lineTotals,
    discount,
    tax,
    total: roundMoney(Math.max(lineTotals.itemTotal - headerDiscount + headerTax, 0)),
  };
}

export function categorizeDraftEditItems<
  T extends { productId: string; variationId: string | null },
>(existingLineKeys: ReadonlySet<string>, items: readonly T[]) {
  const retainedItems: T[] = [];
  const newItems: T[] = [];
  for (const item of items) {
    if (existingLineKeys.has(`${item.productId}:${item.variationId ?? ""}`)) {
      retainedItems.push(item);
    } else {
      newItems.push(item);
    }
  }
  return { retainedItems, newItems };
}

export function catalogueForDraftEditRow<T extends { id: string }>(
  activeItems: readonly T[],
  retainedItem: T | undefined,
  isRetained: boolean,
) {
  if (!isRetained || !retainedItem || activeItems.some((item) => item.id === retainedItem.id)) {
    return [...activeItems];
  }
  return [...activeItems, retainedItem];
}

export type DraftQuotationUpdateInput = Omit<
  DraftQuotationValues,
  "id" | "reference" | "updatedAt"
> & {
  expectedUpdatedAt: string;
};

export function buildDraftQuotationUpdatePayload(input: DraftQuotationUpdateInput) {
  return {
    requested_expected_updated_at: input.expectedUpdatedAt,
    requested_subject: input.subject,
    requested_company_name: input.companyName,
    requested_customer_tax_identification_number:
      input.customerTaxIdentificationNumber,
    requested_required_by: input.requiredBy || null,
    requested_expiration_date: input.expirationDate || null,
    requested_terms_and_conditions: input.termsAndConditions || null,
    requested_payment_terms: input.paymentTerms || null,
    requested_delivery_information: input.deliveryInformation || null,
    requested_customer_notes: input.customerNotes || null,
    requested_internal_notes: input.internalNotes || null,
    requested_discount_amount: input.discountAmount,
    requested_tax_amount: input.taxAmount,
    requested_items: input.items.map((item) => ({
      product_id: item.productId,
      variation_id: item.variationId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_amount: item.discountAmount,
      tax_amount: item.taxAmount,
    })),
  };
}

export function draftEditErrorDestination(
  quotationId: string,
  reason: "validation" | "stale" | "transition",
) {
  return reason === "validation"
    ? `/admin/quotations/${quotationId}/edit`
    : `/admin/quotations/${quotationId}/manage`;
}

export async function runDraftQuotationUpdate<TPayload>(
  dependencies: {
    mutate: (name: "update_draft_quotation", payload: TPayload) => Promise<boolean>;
    audit: () => Promise<void>;
    revalidate: () => void;
  },
  payload: TPayload,
) {
  const saved = await dependencies.mutate("update_draft_quotation", payload);
  if (!saved) return false;
  await dependencies.audit();
  dependencies.revalidate();
  return true;
}
