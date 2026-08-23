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
