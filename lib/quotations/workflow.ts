export type QuotationBusinessStatus =
  | "draft"
  | "submitted"
  | "reviewing"
  | "additional_info_required"
  | "approved"
  | "rejected"
  | "quoted"
  | "accepted"
  | "declined"
  | "closed"
  | "expired"
  | "converted_to_sale"
  | "converted_to_invoice";

type QuotationStatusMeta = {
  label: string;
  color: "gray" | "blue" | "green" | "red" | "amber";
};

export const quotationStatusMeta: Record<
  QuotationBusinessStatus,
  QuotationStatusMeta
> = {
  draft: { label: "Draft", color: "gray" },
  submitted: { label: "Submitted", color: "gray" },
  reviewing: { label: "Under Review", color: "blue" },
  additional_info_required: { label: "Additional Information Required", color: "amber" },
  approved: { label: "Approved", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  quoted: { label: "Issued", color: "blue" },
  accepted: { label: "Accepted", color: "green" },
  declined: { label: "Rejected by Customer", color: "red" },
  closed: { label: "Closed", color: "gray" },
  expired: { label: "Expired", color: "amber" },
  converted_to_sale: { label: "Converted to Sale", color: "green" },
  converted_to_invoice: { label: "Converted to Invoice", color: "green" },
};

const transitionSources = {
  approve: new Set(["draft", "reviewing", "quoted"]),
  reject: new Set(["draft", "reviewing", "approved", "quoted"]),
  issue: new Set(["approved"]),
  accept: new Set(["quoted"]),
  decline: new Set(["quoted"]),
  convert: new Set(["accepted"]),
} as const;

export type QuotationTransition = keyof typeof transitionSources;

export function isQuotationExpired(
  expirationDate: string | null | undefined,
  today: string,
) {
  return Boolean(expirationDate && expirationDate < today);
}

export function canTransitionQuotation(
  status: string,
  transition: QuotationTransition,
  expirationDate?: string | null,
  today?: string,
) {
  return (
    transitionSources[transition].has(status) &&
    !(
      transition === "accept" &&
      today !== undefined &&
      isQuotationExpired(expirationDate, today)
    )
  );
}

export function isQuotationSaleEligible(
  quotation: {
    status: string;
    expirationDate: string | null | undefined;
    convertedOrderId: string | null;
  },
  today: string,
) {
  return (
    quotation.status === "accepted" &&
    quotation.convertedOrderId === null &&
    !isQuotationExpired(quotation.expirationDate, today)
  );
}

export function isQuotationImmutable(status: string) {
  return new Set([
    "accepted",
    "declined",
    "rejected",
    "closed",
    "expired",
    "converted_to_sale",
    "converted_to_invoice",
  ]).has(status);
}
