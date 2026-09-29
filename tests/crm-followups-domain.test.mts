import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFollowup,
  followupSortRank,
  isFollowupActionable,
  needsFollowupAttention,
} from "../lib/crm/followups.ts";

const now = new Date("2026-09-24T06:00:00.000Z");

test("follow-up dates deterministically classify in Asia/Dhaka", () => {
  assert.equal(classifyFollowup({ status: "active", nextFollowupAt: "2026-09-24T02:00:00.000Z" }, now), "due");
  assert.equal(classifyFollowup({ status: "active", nextFollowupAt: "2026-09-23T02:00:00.000Z" }, now), "overdue");
  assert.equal(classifyFollowup({ status: "active", nextFollowupAt: "2026-09-25T02:00:00.000Z" }, now), "upcoming");
});

test("workflow states override date-derived queue states", () => {
  assert.equal(classifyFollowup({ status: "waiting_customer", nextFollowupAt: "2026-09-20T00:00:00.000Z" }, now), "waiting_customer");
  assert.equal(classifyFollowup({ status: "completed", nextFollowupAt: "2026-09-24T00:00:00.000Z" }, now), "completed");
  assert.equal(classifyFollowup({ status: "do_not_contact", nextFollowupAt: null }, now), "do_not_contact");
  assert.equal(isFollowupActionable("do_not_contact"), false);
});

test("needs-attention uses explicit urgent, unassigned, review and three-day-overdue rules", () => {
  assert.equal(needsFollowupAttention({ status: "active", nextFollowupAt: "2026-09-25T00:00:00.000Z", priority: "urgent", assignedTo: "staff" }, now), true);
  assert.equal(needsFollowupAttention({ status: "active", nextFollowupAt: "2026-09-25T00:00:00.000Z", priority: "normal", assignedTo: null }, now), true);
  assert.equal(needsFollowupAttention({ status: "active", nextFollowupAt: "2026-09-25T00:00:00.000Z", priority: "normal", assignedTo: "staff", manualReview: true }, now), true);
  assert.equal(needsFollowupAttention({ status: "active", nextFollowupAt: "2026-09-20T00:00:00.000Z", priority: "normal", assignedTo: "staff" }, now), true);
  assert.equal(needsFollowupAttention({ status: "completed", nextFollowupAt: null, priority: "urgent", assignedTo: null }, now), false);
});

test("operational sorting keeps urgent overdue before other overdue, today and upcoming", () => {
  assert.equal(followupSortRank({ status: "active", nextFollowupAt: "2026-09-20T00:00:00.000Z", priority: "urgent" }, now), 0);
  assert.equal(followupSortRank({ status: "active", nextFollowupAt: "2026-09-20T00:00:00.000Z", priority: "normal" }, now), 1);
  assert.equal(followupSortRank({ status: "active", nextFollowupAt: "2026-09-24T00:00:00.000Z", priority: "normal" }, now), 2);
  assert.equal(followupSortRank({ status: "active", nextFollowupAt: "2026-09-25T00:00:00.000Z", priority: "normal" }, now), 4);
});
