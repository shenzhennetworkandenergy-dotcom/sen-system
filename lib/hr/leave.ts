export const leaveApplicationTypeCodes = ["ANNUAL", "CASUAL", "SICK", "EMERGENCY", "UNPAID", "OTHER"] as const;

export type LeaveApplicationStatus =
  | "APPLICATION_GENERATED"
  | "SIGNED_COPY_SUBMITTED"
  | "APPROVED"
  | "REJECTED";

export function calculateLeaveDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!startDate || !endDate || Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function leaveApplicationStatus(status: string, signedUploadedAt?: string | null): LeaveApplicationStatus {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  return signedUploadedAt ? "SIGNED_COPY_SUBMITTED" : "APPLICATION_GENERATED";
}

export function leaveApplicationStatusLabel(status: LeaveApplicationStatus) {
  return status.replaceAll("_", " ");
}

