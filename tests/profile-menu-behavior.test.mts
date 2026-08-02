import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldCloseProfileMenuAfterHover,
  shouldEnhanceProfileMenuHover,
  shouldOpenProfileMenuOnHover,
} from "../lib/ui/profile-menu.ts";

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

test("marks only a closed eligible disclosure as hover-opened", () => {
  const eligibleMouse = {
    pointerType: "mouse",
    canHover: true,
    hasFinePointer: true,
  };

  assert.equal(
    shouldOpenProfileMenuOnHover({ isOpen: false, ...eligibleMouse }),
    true,
  );
  assert.equal(
    shouldOpenProfileMenuOnHover({ isOpen: true, ...eligibleMouse }),
    false,
  );
});

test("closes only a hover-origin menu after focus leaves", () => {
  const eligibleMouse = {
    pointerType: "mouse",
    canHover: true,
    hasFinePointer: true,
  };

  assert.equal(
    shouldCloseProfileMenuAfterHover({
      isOpen: true,
      openedByHover: true,
      hasFocusWithin: false,
      ...eligibleMouse,
    }),
    true,
  );
  assert.equal(
    shouldCloseProfileMenuAfterHover({
      isOpen: true,
      openedByHover: true,
      hasFocusWithin: true,
      ...eligibleMouse,
    }),
    false,
  );
  assert.equal(
    shouldCloseProfileMenuAfterHover({
      isOpen: true,
      openedByHover: false,
      hasFocusWithin: false,
      ...eligibleMouse,
    }),
    false,
  );
});
