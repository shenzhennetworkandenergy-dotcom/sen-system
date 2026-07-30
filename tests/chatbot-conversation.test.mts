import assert from "node:assert/strict";
import test from "node:test";

import {
  nextStepAfterConfirmation,
  nextStepForSearchResult,
  replyDelayMs,
} from "../lib/chatbot/conversation.ts";

test("broad and exact search results choose the correct conversation step", () => {
  assert.equal(nextStepForSearchResult({ matchType: "suggestions" }), "search");
  assert.equal(nextStepForSearchResult({ matchType: "confirmation" }), "confirm");
});

test("Yes requests WhatsApp while No returns to product clarification", () => {
  assert.equal(nextStepAfterConfirmation(true), "whatsapp");
  assert.equal(nextStepAfterConfirmation(false), "search");
});

test("assistant reply delay always stays between three and six seconds", () => {
  assert.equal(replyDelayMs(0), 3000);
  assert.equal(replyDelayMs(0.5), 4500);
  assert.equal(replyDelayMs(1), 6000);
});
