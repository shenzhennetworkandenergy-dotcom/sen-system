export const crmLeadStatuses = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export const crmLeadSources = ["website", "referral", "phone", "email", "social", "event", "existing_customer", "other"] as const;
export const crmLeadPriorities = ["low", "medium", "high", "urgent"] as const;
export const crmActivityTypes = ["note", "call", "email", "meeting", "follow_up"] as const;

export type CrmLeadStatus = (typeof crmLeadStatuses)[number];
export type CrmLeadSource = (typeof crmLeadSources)[number];
export type CrmLeadPriority = (typeof crmLeadPriorities)[number];
export type CrmActivityType = (typeof crmActivityTypes)[number];
