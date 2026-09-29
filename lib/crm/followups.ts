import type {
  CrmFollowupQueueStatus,
  CrmFollowupWorkflowStatus,
} from "./types.ts";

export const CRM_TIME_ZONE = "Asia/Dhaka";
export const CRM_ATTENTION_OVERDUE_DAYS = 3;

export type FollowupClassificationInput = {
  status: CrmFollowupWorkflowStatus;
  nextFollowupAt: string | null;
  priority?: string | null;
  assignedTo?: string | null;
  manualReview?: boolean;
};

function dateKey(value: string | Date, timeZone = CRM_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function classifyFollowup(
  input: FollowupClassificationInput,
  now = new Date(),
): CrmFollowupQueueStatus {
  if (input.status !== "active") return input.status;
  if (!input.nextFollowupAt) return "upcoming";
  const due = dateKey(input.nextFollowupAt);
  const today = dateKey(now);
  if (due < today) return "overdue";
  if (due === today) return "due";
  return "upcoming";
}

export function isFollowupActionable(status: CrmFollowupQueueStatus) {
  return ["due", "overdue", "upcoming", "waiting_customer"].includes(status);
}

export function needsFollowupAttention(
  input: FollowupClassificationInput,
  now = new Date(),
) {
  if (input.status === "completed" || input.status === "cancelled" || input.status === "do_not_contact") return false;
  if (input.priority === "urgent" || !input.assignedTo || input.manualReview) return true;
  if (!input.nextFollowupAt || classifyFollowup(input, now) !== "overdue") return false;
  return now.getTime() - new Date(input.nextFollowupAt).getTime() >= CRM_ATTENTION_OVERDUE_DAYS * 86_400_000;
}

export function followupSortRank(input: FollowupClassificationInput, now = new Date()) {
  const status = classifyFollowup(input, now);
  if (status === "overdue" && input.priority === "urgent") return 0;
  if (status === "overdue") return 1;
  if (status === "due") return 2;
  if (status === "waiting_customer") return 3;
  if (status === "upcoming") return 4;
  return 5;
}

export function formatCrmDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: CRM_TIME_ZONE,
  }).format(new Date(value));
}
