export type QuotationStockTarget = {
  productId: string;
  variationId: string | null;
  warehouseId: string;
};

export type QuotationStockResult = {
  status: "idle" | "success" | "error";
  message: string;
  detailsHref?: string;
};

export const QUOTATION_STOCK_SAVED = "sen:quotation-stock-saved";
