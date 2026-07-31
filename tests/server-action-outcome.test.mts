import test from "node:test";
import assert from "node:assert/strict";
import { captureMutationOutcome } from "../lib/actions/mutation-outcome.ts";

test("a successful mutation remains a success for redirect handling", async () => {
  const outcome = await captureMutationOutcome(async () => ({
    id: "order-123",
    message: "Draft order created.",
  }));

  assert.deepEqual(outcome, {
    ok: true,
    value: {
      id: "order-123",
      message: "Draft order created.",
    },
  });
});

test("a failed mutation exposes the original failure without throwing", async () => {
  const failure = new Error("Insufficient stock.");
  const outcome = await captureMutationOutcome(async () => {
    throw failure;
  });

  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error, failure);
});
