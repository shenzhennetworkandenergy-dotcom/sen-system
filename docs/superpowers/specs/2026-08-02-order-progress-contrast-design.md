# Order progress contrast design

## Problem

The active order-progress tile and its matching disabled action use Tailwind blue-background utilities. A later dashboard-wide rule targets bordered rounded elements and replaces that background with translucent white, leaving white text on white.

## Fix

Add semantic order-progress state classes for the active tile and current action, then define their foreground, background, border, and background-image explicitly after the dashboard card rule. This is intentionally limited to order progress and does not weaken the shared dashboard surface design.

The active state uses dark blue text on a pale blue background. This stays clearly visible, communicates selection without relying on white-on-blue utility precedence, and remains readable when printing or under browser color adjustments.

## Verification

- Add a regression test that proves both active elements use the semantic state and that the foreground/background pair meets WCAG AA contrast.
- Verify the authenticated order page in the deployed app and inspect the computed foreground/background colors.

