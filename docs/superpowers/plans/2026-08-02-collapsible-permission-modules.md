# Collapsible Permission Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every permission module as an independently collapsible, accessible section with a live selected-permission count.

**Architecture:** Keep the existing `PermissionChecklist` state and form controls intact. Add a pure summary helper for deterministic count text, then wrap each module in a native `details`/`summary` disclosure so collapsing never unmounts permission inputs.

**Tech Stack:** Next.js 16.2 App Router, React 19 client components, TypeScript, Tailwind CSS 4, Node test runner.

## Global Constraints

- Every module starts collapsed and opens independently.
- The collapsed summary shows module name, description, selected count, total count, and a decorative chevron.
- Select all, Clear module, Reset to template, checkbox names, checkbox values, and save behavior remain unchanged.
- Permission inputs remain mounted while their module is collapsed.
- Database, authorization, navigation, and server actions are out of scope.

---

### Task 1: Permission module disclosure and summary

**Files:**
- Create: `lib/permissions/checklist.ts`
- Create: `tests/permission-checklist-collapse.test.mts`
- Modify: `components/permissions/PermissionChecklist.tsx`

**Interfaces:**
- Produces: `permissionModuleSelectionSummary(permissionKeys: readonly string[], selected: ReadonlySet<string>): { selectedCount: number; totalCount: number; label: string }`.
- Consumes: the existing `selected` set and each module's permission keys.

- [ ] **Step 1: Write the failing tests**

Create tests that import `permissionModuleSelectionSummary`, verify the count and label for partial and empty selections, and inspect `PermissionChecklist.tsx` for a native `details`/`summary` disclosure, no default `open` attribute, the summary helper call, module test IDs, and the existing checkbox/select/clear controls.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/permission-checklist-collapse.test.mts
```

Expected: FAIL because `lib/permissions/checklist.ts` does not exist.

- [ ] **Step 3: Add the pure summary helper**

Implement the exact exported function:

```ts
export function permissionModuleSelectionSummary(
  permissionKeys: readonly string[],
  selected: ReadonlySet<string>,
) {
  const selectedCount = permissionKeys.filter((key) => selected.has(key)).length;
  const totalCount = permissionKeys.length;
  return {
    selectedCount,
    totalCount,
    label: `${selectedCount} of ${totalCount} selected`,
  };
}
```

- [ ] **Step 4: Convert each module to a native disclosure**

In `PermissionChecklist.tsx`, import the helper and replace each always-open fieldset wrapper with:

```tsx
<details data-testid={`permission-module-${module.key}`} className="group rounded-xl border bg-[var(--surface)]">
  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
    <span className="min-w-0 flex-1">
      <span className="block font-semibold">{module.name}</span>
      <span className="mt-1 block text-sm text-[var(--muted-text)]">{module.description}</span>
    </span>
    <span className="flex items-center gap-3">
      <span className="rounded-full bg-[var(--muted-surface)] px-3 py-1 text-xs font-semibold">{summary.label}</span>
      <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-180">⌄</span>
    </span>
  </summary>
  <fieldset className="border-t p-4">
    <legend className="sr-only">{module.name}</legend>
    {/* Preserve existing controls and permission labels verbatim. */}
  </fieldset>
</details>
```

Do not add `open` to `details`. Compute `summary` from the current `selected` set so counts update after all existing selection actions.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/permission-checklist-collapse.test.mts
```

Expected: all tests pass.

- [ ] **Step 6: Run regression verification**

Run:

```powershell
npm run test:employee-permission-submodules
npm run test:standalone
npm run lint
npx tsc --noEmit
npm run build
```

Expected: every command exits successfully.

- [ ] **Step 7: Verify in the browser**

Open an administrator permission editor on desktop and mobile widths. Verify modules are initially collapsed, opening one leaves the others collapsed, Select all updates the summary count, collapsing and reopening preserves checked values, and the page has no horizontal overflow.

- [ ] **Step 8: Commit the implementation**

```powershell
git add -- components/permissions/PermissionChecklist.tsx lib/permissions/checklist.ts tests/permission-checklist-collapse.test.mts docs/superpowers/plans/2026-08-02-collapsible-permission-modules.md
git commit -m "feat: collapse permission modules"
```
