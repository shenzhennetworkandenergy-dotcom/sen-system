export const QUOTATION_VIEW_PERMISSIONS = [
  "quotations.view_own",
  "quotations.view",
  "quotations.view_all",
] as const;

export type QuotationViewScope = "own" | "all";

export type QuotationTraceabilityLookup = {
  convertedOrderId: string;
  createdBy?: string;
};

export function resolveQuotationViewScope(
  role: string,
  permissions: ReadonlySet<string>,
): QuotationViewScope | null {
  if (role === "admin") return "all";
  if (
    permissions.has("quotations.view") ||
    permissions.has("quotations.view_all")
  ) {
    return "all";
  }
  return permissions.has("quotations.view_own") ? "own" : null;
}

export function mustRestrictQuotationToCreator(
  role: string,
  permissions: ReadonlySet<string>,
) {
  return resolveQuotationViewScope(role, permissions) === "own";
}

export function buildQuotationTraceabilityLookup(
  saleId: string,
  scope: QuotationViewScope | null,
  profileId: string,
): QuotationTraceabilityLookup | null {
  if (!scope) return null;
  if (scope === "all") return { convertedOrderId: saleId };
  return { convertedOrderId: saleId, createdBy: profileId };
}

export function buildSaleSourceQuotationLookup(
  saleId: string,
  role: string,
  permissions: ReadonlySet<string>,
  profileId: string,
) {
  return buildQuotationTraceabilityLookup(
    saleId,
    resolveQuotationViewScope(role, permissions),
    profileId,
  );
}

export function canOpenQuotationDocument(
  role: string,
  permissions: ReadonlySet<string>,
) {
  const scope = resolveQuotationViewScope(role, permissions);
  return (
    scope === "all" ||
    (scope === "own" && permissions.has("quotations.print"))
  );
}
