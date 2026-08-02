# Responsive Chat Resize Design

## Goal

Resize the floating SEN Product Assistant so it remains useful without dominating the page, and make its dimensions predictable across desktop, tablet, portrait mobile, and short landscape screens.

## Confirmed root cause

The current desktop rule uses `height: min(46rem, calc(100vh - 6.5rem))`, while the mobile rule uses nearly the full dynamic viewport height. At common desktop and mobile resolutions this leaves almost no visual space around the panel, producing the overlong result shown in production.

## Responsive sizing

- Preserve the existing desktop maximum width of `24rem`.
- Desktop height uses `clamp(30rem, 62vh, 36rem)` with a dynamic-viewport safety cap, producing a balanced 480–576 px panel.
- Tablet height is capped at `34rem` and remains constrained by available dynamic viewport height.
- Portrait mobile keeps fixed side gutters and caps height at `31rem` instead of filling the screen.
- Short landscape screens use the available height minus safe top and bottom space.
- The message history remains the only flexible scrolling area; header, tabs, and composer remain visible.

## Scope

- Do not change chat width, text, workflow, tabs, submission behavior, data, permissions, or animation behavior.
- Do not change unrelated homepage, product, or dashboard styles.
- Preserve the compact typography introduced in the previous release.

## Verification

- CSS contract tests cover the base desktop rule and every responsive breakpoint.
- Browser checks cover 1440×900 desktop, 768×1024 tablet, 390×844 portrait mobile, and 844×390 landscape mobile.
- At every size the chat must fit inside the viewport, the page must not overflow horizontally, and the panel must remain materially shorter than the previous viewport-filling version.
