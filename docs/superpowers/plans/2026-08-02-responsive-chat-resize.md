# Responsive Chat Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized floating chat height with balanced breakpoint-aware dimensions while preserving width and behavior.

**Architecture:** Keep the correction isolated to the existing `.sen-messenger-window` rules in `app/globals.css`. Extend the existing CSS contract test to parse root and media-query declarations, then validate the rendered panel at four representative device sizes.

**Tech Stack:** Next.js 16, global CSS, PostCSS, Node test runner, in-app browser verification.

## Global Constraints

- Keep the desktop maximum width at `24rem`.
- Do not change chat content, workflow, data, permissions, or unrelated styles.
- Keep header, tabs, and composer visible while the message history scrolls.

---

### Task 1: Responsive chat height contracts

**Files:**
- Modify: `tests/product-home-chat-improvements.test.mts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.sen-messenger-window` base and media-query declarations.
- Produces: balanced height rules for desktop, tablet, portrait mobile, and short landscape screens.

- [ ] **Step 1: Write the failing CSS contract tests**

Assert the root height is `clamp(30rem, 62vh, 36rem)`, the dynamic-viewport maximum is present, tablet is capped at `34rem`, portrait mobile is capped at `31rem`, and short landscape reserves vertical space.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: FAIL because the current desktop and mobile rules fill nearly the entire viewport and tablet/landscape rules do not exist.

- [ ] **Step 3: Implement the minimum CSS correction**

Update only `.sen-messenger-window` height and responsive media-query declarations. Preserve the existing width, internal scrolling, typography, and behavior.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: all responsive chat contract tests pass.

- [ ] **Step 5: Verify four rendered device sizes**

Start the production build locally and inspect 1440×900, 768×1024, 390×844, and 844×390. At each size assert the panel is inside the viewport and the document has no horizontal overflow.

- [ ] **Step 6: Run and release the verified correction**

Run `npm run test:standalone`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`; commit, push the existing branch, deploy with `npx vercel deploy --prod --yes`, and repeat production route and live responsive checks.
