"use client";

import {
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
} from "react";

import {
  shouldCloseProfileMenuAfterFocusExit,
  shouldCloseProfileMenuAfterHover,
  shouldEnhanceProfileMenuHover,
  shouldOpenProfileMenuOnHover,
} from "@/lib/ui/profile-menu";

type ProfileMenuDisclosureProps = {
  children: ReactNode;
};

export function ProfileMenuDisclosure({
  children,
}: ProfileMenuDisclosureProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const openedByHover = useRef(false);
  const clickedWithPointer = useRef(false);
  const pointerInside = useRef(false);

  const isEligibleMousePointer = (pointerType: string) =>
    shouldEnhanceProfileMenuHover({
      pointerType,
      canHover: window.matchMedia("(hover: hover)").matches,
      hasFinePointer: window.matchMedia("(pointer: fine)").matches,
    });

  const handlePointerEnter = (event: PointerEvent<HTMLDetailsElement>) => {
    if (!isEligibleMousePointer(event.pointerType)) return;

    pointerInside.current = true;

    const details = detailsRef.current;
    if (
      !details ||
      !shouldOpenProfileMenuOnHover({
        isOpen: details.open,
        pointerType: event.pointerType,
        canHover: window.matchMedia("(hover: hover)").matches,
        hasFinePointer: window.matchMedia("(pointer: fine)").matches,
      })
    ) {
      return;
    }

    details.open = true;
    openedByHover.current = true;
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDetailsElement>) => {
    if (!isEligibleMousePointer(event.pointerType)) return;

    pointerInside.current = false;

    const details = detailsRef.current;
    if (
      !details ||
      !shouldCloseProfileMenuAfterHover({
        isOpen: details.open,
        openedByHover: openedByHover.current,
        hasFocusWithin: details.matches(":focus-within"),
        pointerType: event.pointerType,
        canHover: window.matchMedia("(hover: hover)").matches,
        hasFinePointer: window.matchMedia("(pointer: fine)").matches,
      })
    ) {
      return;
    }

    details.open = false;
    openedByHover.current = false;
  };

  const handleBlur = (event: FocusEvent<HTMLDetailsElement>) => {
    const details = detailsRef.current;
    if (!details) return;

    const nextFocusWithin =
      event.relatedTarget instanceof Node &&
      details.contains(event.relatedTarget);

    if (
      !shouldCloseProfileMenuAfterFocusExit({
        isOpen: details.open,
        openedByHover: openedByHover.current,
        pointerInside: pointerInside.current,
        nextFocusWithin,
      })
    ) {
      return;
    }

    details.open = false;
    openedByHover.current = false;
  };

  const isSummaryTarget = (target: EventTarget | null) =>
    target instanceof Element && target.closest("summary") !== null;

  const handlePointerDown = (event: PointerEvent<HTMLDetailsElement>) => {
    clickedWithPointer.current =
      isSummaryTarget(event.target) && isEligibleMousePointer(event.pointerType);
  };

  const handleClick = (event: MouseEvent<HTMLDetailsElement>) => {
    if (!isSummaryTarget(event.target)) return;

    const wasOpenedByHover = openedByHover.current;
    const wasPointerClick = event.detail > 0 && clickedWithPointer.current;
    clickedWithPointer.current = false;

    if (!wasOpenedByHover || !wasPointerClick) return;

    event.preventDefault();
    detailsRef.current!.open = true;
    openedByHover.current = false;
  };

  return (
    <details
      ref={detailsRef}
      className="sen-profile-menu"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onBlur={handleBlur}
      onToggle={() => {
        if (!detailsRef.current?.open) openedByHover.current = false;
      }}
    >
      {children}
    </details>
  );
}
