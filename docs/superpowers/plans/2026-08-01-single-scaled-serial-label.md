# Single Scaled SEN Serial Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one SEN serial label per job and scale all label contents uniformly inside any administrator-defined physical size.

**Architecture:** Add a pure inventory layout module that computes a centered scale for a 70 x 42 mm master canvas and defensively selects one printable record. The existing Server Component uses that helper, queries one serial, and renders the compact canvas inside the unchanged exact-size page.

**Tech Stack:** Next.js 16 Server Components, React 19, TypeScript, CSS transforms, Supabase, Node test runner.

## Global Constraints

- Keep the existing saved-size database and permission behavior unchanged.
- Preserve the selected outer width and height in millimetres and the matching dynamic `@page` rule.
- Render and print exactly one serial label after size selection.
- Do not change unrelated modules.

---

### Task 1: Add layout and single-record regression tests

**Files:**
- Create: `tests/serial-label-layout.test.mts`
- Create: `lib/inventory/serial-label-layout.ts`

**Interfaces:**
- Produces: `createSerialLabelLayout(widthMm: number, heightMm: number): SerialLabelLayout`
- Produces: `selectSingleSerialForLabelPrinter<T>(rows: readonly T[]): T[]`

- [ ] **Step 1: Write the failing tests**

Test that 50 x 30 mm and 10 x 10 mm outputs remain within a 0.75 mm inset on every side, retain the 70 x 42 mm master canvas and use a positive uniform scale. Test that a three-row input returns only its first row and an empty input stays empty.

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/serial-label-layout.test.mts` and confirm it fails because `lib/inventory/serial-label-layout.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Create constants for the 70 x 42 mm canvas and 0.75 mm inset. Validate finite positive dimensions, compute `scale = min((width - 1.5) / 70, (height - 1.5) / 42)`, center the scaled canvas, and return only the first row from the single-record selector.

- [ ] **Step 4: Re-run the focused test and verify GREEN**

Run the same command and confirm every assertion passes.

### Task 2: Render one uniformly scaled label

**Files:**
- Modify: `app/admin/serials/print/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/serial-label-layout.test.mts`

**Interfaces:**
- Consumes: `createSerialLabelLayout` and `selectSingleSerialForLabelPrinter` from Task 1.
- Produces: one `.serial-label` with one `.serial-label-canvas` per selected print job.

- [ ] **Step 1: Add acceptance assertions before production changes**

Assert that the page applies a one-row database limit, uses the single-record selector and renders the canvas from the layout helper. Assert that the stylesheet supplies compact master-canvas dimensions for logo, barcode and QR code.

- [ ] **Step 2: Run the focused test and verify RED**

Confirm the acceptance assertions fail because the print page still uses `limit(500)` and maps all returned rows.

- [ ] **Step 3: Implement the smallest page and CSS change**

Change the serial query to `limit(1)`, defensively select one returned row before asset generation, calculate the layout once, render an absolutely positioned transformed master canvas, and add compact scoped label element styles. Keep the outer dimensions and `@page` rule unchanged.

- [ ] **Step 4: Re-run the focused test and verify GREEN**

Confirm layout and acceptance assertions pass.

### Task 3: Verify and release

**Files:**
- Modify only if a verification failure directly identifies a defect in Task 1 or Task 2.

- [ ] **Step 1: Run offline automated checks**

Run the focused test, `npm run test:standalone`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

- [ ] **Step 2: Verify authenticated local behavior**

Open a multi-record label action, choose 50 x 30 mm, confirm exactly one label exists, inspect its scale and bounds, and confirm the print document uses one 50 x 30 mm page.

- [ ] **Step 3: Review and commit**

Run `git diff --check` and inspect the scoped diff. Commit only the design, plan, regression test, helper, print page and label CSS.

- [ ] **Step 4: Push and deploy**

Push the feature branch and `main`, deploy production to Vercel, then run production route/database smoke checks and inspect the deployment status.

## Self-review

- Every requirement maps to Task 1 or Task 2.
- Function names and constants are consistent across tasks.
- No placeholders or unrelated refactors are included.
