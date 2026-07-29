export const chatbotInquiryStatuses = [
  "collecting_contact",
  "new",
  "contacted",
  "qualified",
  "converted",
  "closed",
  "cancelled",
  "spam",
] as const;

export type ChatbotInquiryStatus = (typeof chatbotInquiryStatuses)[number];
