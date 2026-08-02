import assert from "node:assert/strict";
import test from "node:test";

import { shouldEnhanceProfileMenuHover } from "../lib/ui/profile-menu.ts";

test("enables profile hover only for a fine mouse that can hover", () => {
  assert.equal(
    shouldEnhanceProfileMenuHover({
      pointerType: "mouse",
      canHover: true,
      hasFinePointer: true,
    }),
    true,
  );
});

test("keeps the profile disclosure native for touch, pen, coarse, and non-hover pointers", () => {
  for (const capabilities of [
    { pointerType: "touch", canHover: true, hasFinePointer: true },
    { pointerType: "pen", canHover: true, hasFinePointer: true },
    { pointerType: "mouse", canHover: true, hasFinePointer: false },
    { pointerType: "mouse", canHover: false, hasFinePointer: true },
  ]) {
    assert.equal(shouldEnhanceProfileMenuHover(capabilities), false);
  }
});
