export type SalesViewScope = "own" | "all" | null;

export function resolveSalesViewScope(role: string, permissions: ReadonlySet<string>): SalesViewScope {
  if (role === "admin") return "all";
  if (permissions.has("sales.view") || permissions.has("sales.view_all")) {
    return "all";
  }
  return permissions.has("sales.view_own") ? "own" : null;
}

export function canAccessSale(
  scope: "own" | "all" | null,
  actorId: string,
  createdBy: string | null,
) {
  if (scope === "all") return true;
  if (scope !== "own") return false;
  return Boolean(createdBy) && createdBy === actorId;
}
