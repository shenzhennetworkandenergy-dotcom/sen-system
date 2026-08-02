import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldCloseProfileMenuAfterFocusExit,
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

test("closes a hover-opened profile menu when focus exits after the pointer already left", () => {
  const eligibleMouse = {
    pointerType: "mouse",
    canHover: true,
    hasFinePointer: true,
  };
  const openedByHover = shouldOpenProfileMenuOnHover({
    isOpen: false,
    ...eligibleMouse,
  });

  assert.equal(openedByHover, true);
  assert.equal(
    shouldCloseProfileMenuAfterHover({
      isOpen: true,
      openedByHover,
      hasFocusWithin: true,
      ...eligibleMouse,
    }),
    false,
    "pointer exit must keep the menu open while keyboard focus remains inside",
  );
  assert.equal(
    shouldCloseProfileMenuAfterFocusExit({
      isOpen: true,
      openedByHover,
      pointerInside: false,
      nextFocusWithin: false,
    }),
    true,
    "the later focus exit must close the hover-origin menu",
  );
  assert.equal(
    shouldCloseProfileMenuAfterFocusExit({
      isOpen: true,
      openedByHover: false,
      pointerInside: false,
      nextFocusWithin: false,
    }),
    false,
    "a click-pinned or native disclosure must remain open",
  );
  assert.equal(
    shouldCloseProfileMenuAfterFocusExit({
      isOpen: true,
      openedByHover,
      pointerInside: true,
      nextFocusWithin: false,
    }),
    false,
    "focus exit must not close the menu while the pointer is still inside",
  );
});
