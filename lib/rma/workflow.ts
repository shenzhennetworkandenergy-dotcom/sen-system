export const rmaStatuses = [
  "submitted",
  "under_review",
  "return_requested",
  "product_received",
  "resolution_in_progress",
  "closed",
] as const;

export type RmaStatus = (typeof rmaStatuses)[number];

export const rmaResolutions = [
  "repaired",
  "replaced",
  "refund_approved",
  "credit_issued",
  "claim_rejected",
  "no_fault_found",
  "damaged_beyond_repair_retired",
] as const;

export type RmaResolution = (typeof rmaResolutions)[number];

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const rmaTransitions: Record<RmaStatus, readonly RmaStatus[]> = {
  submitted: ["under_review"],
  under_review: ["return_requested", "resolution_in_progress", "closed"],
  return_requested: ["product_received", "closed"],
  product_received: ["resolution_in_progress", "closed"],
  resolution_in_progress: ["closed"],
  closed: [],
};

export function canTransitionRma(from: RmaStatus, to: RmaStatus) {
  return rmaTransitions[from].includes(to);
}

export function calculateWarrantyEnd(start: Date | string, months: number) {
  const source = typeof start === "string" ? new Date(`${start}T00:00:00Z`) : new Date(start);
  if (!Number.isFinite(source.getTime()) || !Number.isInteger(months) || months < 0) {
    throw new Error("Invalid warranty date or duration.");
  }
  const day = source.getUTCDate();
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result.toISOString().slice(0, 10);
}

export function isWarrantyEligible(input: {
  deliveredQuantity: number;
  claimedQuantity: number;
  warrantyEnd: string;
  now?: string;
}) {
  const today = input.now ?? new Date().toISOString().slice(0, 10);
  return input.deliveredQuantity > input.claimedQuantity && input.warrantyEnd >= today;
}
