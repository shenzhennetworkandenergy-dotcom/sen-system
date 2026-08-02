export type ProfileMenuPointerCapabilities = {
  pointerType: string;
  canHover: boolean;
  hasFinePointer: boolean;
};

type ProfileMenuHoverOpenRequest = ProfileMenuPointerCapabilities & {
  isOpen: boolean;
};

type ProfileMenuHoverLeaveRequest = ProfileMenuHoverOpenRequest & {
  openedByHover: boolean;
  hasFocusWithin: boolean;
};

type ProfileMenuFocusExitRequest = {
  isOpen: boolean;
  openedByHover: boolean;
  pointerInside: boolean;
  nextFocusWithin: boolean;
};

export function shouldEnhanceProfileMenuHover({
  pointerType,
  canHover,
  hasFinePointer,
}: ProfileMenuPointerCapabilities) {
  return pointerType === "mouse" && canHover && hasFinePointer;
}

export function shouldOpenProfileMenuOnHover({
  isOpen,
  ...capabilities
}: ProfileMenuHoverOpenRequest) {
  return !isOpen && shouldEnhanceProfileMenuHover(capabilities);
}

export function shouldCloseProfileMenuAfterHover({
  isOpen,
  openedByHover,
  hasFocusWithin,
  ...capabilities
}: ProfileMenuHoverLeaveRequest) {
  return (
    isOpen &&
    openedByHover &&
    !hasFocusWithin &&
    shouldEnhanceProfileMenuHover(capabilities)
  );
}

export function shouldCloseProfileMenuAfterFocusExit({
  isOpen,
  openedByHover,
  pointerInside,
  nextFocusWithin,
}: ProfileMenuFocusExitRequest) {
  return isOpen && openedByHover && !pointerInside && !nextFocusWithin;
}
