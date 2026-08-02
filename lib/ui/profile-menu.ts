export type ProfileMenuPointerCapabilities = {
  pointerType: string;
  canHover: boolean;
  hasFinePointer: boolean;
};

export function shouldEnhanceProfileMenuHover({
  pointerType,
  canHover,
  hasFinePointer,
}: ProfileMenuPointerCapabilities) {
  return pointerType === "mouse" && canHover && hasFinePointer;
}
