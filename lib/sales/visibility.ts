export type SalesVisibilityScope =
  | { kind: "all" }
  | { kind: "own"; profileId: string }
  | { kind: "none" };

export function resolveSalesVisibilityScope(input: {
  role: string;
  status: string;
  profileId: string;
  permissions: ReadonlySet<string>;
}): SalesVisibilityScope {
  if (input.status !== "active") return { kind: "none" };
  if (input.role === "admin") return { kind: "all" };
  if (input.role !== "employee") return { kind: "none" };
  if (input.permissions.has("sales.view") || input.permissions.has("sales.view_all")) {
    return { kind: "all" };
  }
  if (input.permissions.has("sales.view_own")) {
    return { kind: "own", profileId: input.profileId };
  }
  return { kind: "none" };
}

export function canAccessSaleUnderScope(
  scope: SalesVisibilityScope,
  saleCreatedBy: string,
) {
  return scope.kind === "all" ||
    (scope.kind === "own" && scope.profileId === saleCreatedBy);
}
