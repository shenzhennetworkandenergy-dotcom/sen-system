import type { ArchiveEntityType } from "./policy";

export type TrashOperationResult = {
  succeeded: number;
  failures: string[];
};

export const trashEntityLabels: Record<ArchiveEntityType, string> = {
  product: "Product",
  user: "User",
  brand: "Brand",
  attribute: "Attribute",
  business_category: "Business category",
  employee: "Employee",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseTrashSelection(
  values: unknown[],
  maximum = 100,
): string[] {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error("Trash Bin requires a positive selection limit.");
  }

  const selected = [
    ...new Set(values.map((value) => String(value ?? "").trim())),
  ];
  if (selected.length === 0 || selected.every((value) => value.length === 0)) {
    throw new Error("Select at least one Trash Bin item.");
  }
  if (selected.length > maximum) {
    throw new Error(`Select up to ${maximum} Trash Bin item(s) at a time.`);
  }
  if (selected.some((value) => !uuidPattern.test(value))) {
    throw new Error("The selection contains an invalid Trash Bin item.");
  }

  return selected;
}

export function summarizeTrashResult(result: TrashOperationResult): string {
  const succeeded = Math.max(0, Math.trunc(result.succeeded));
  const prefix = `${succeeded} item(s) processed.`;
  if (result.failures.length === 0) return prefix;

  const safeFailures = result.failures
    .map((failure) => String(failure).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const failureCount = result.failures.length;
  const failurePrefix = `${prefix} ${failureCount} failed: `;
  const maximumDetailsLength = Math.max(0, 500 - failurePrefix.length);
  const details = safeFailures.join("; ").slice(0, maximumDetailsLength);

  return `${failurePrefix}${details}`;
}
