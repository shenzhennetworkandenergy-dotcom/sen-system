export type ConversationSearchResult = {
  matchType: "suggestions" | "confirmation" | "none" | "information";
};

export function nextStepForSearchResult(
  result: ConversationSearchResult,
): "search" | "confirm" {
  return result.matchType === "confirmation" ? "confirm" : "search";
}

export function nextStepAfterConfirmation(confirmed: boolean): "search" | "whatsapp" {
  return confirmed ? "whatsapp" : "search";
}

export function replyDelayMs(randomValue = Math.random()) {
  const bounded = Math.min(1, Math.max(0, randomValue));
  return 3000 + Math.round(bounded * 3000);
}
