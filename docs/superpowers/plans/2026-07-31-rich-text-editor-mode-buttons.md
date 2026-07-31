# Rich Text Editor Mode Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give both product description editors separate Visual and HTML source mode buttons with a clear selected state.

**Architecture:** Keep the change inside the shared `RichTextEditor` component so both product description fields receive identical behavior. Preserve the existing mode state, hidden form value, content synchronization, formatting commands, and server sanitization.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Node test runner

## Global Constraints

- Both editors open in Visual mode.
- Switching modes must preserve current content.
- Product persistence, sanitization, field names, formatting commands, and database behavior remain unchanged.
- Add no dependency and do not refactor unrelated files.

---

### Task 1: Explicit editor mode controls

**Files:**
- Create: `tests/rich-text-editor-mode-buttons.test.mts`
- Modify: `components/inventory/RichTextEditor.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `mode: "visual" | "html"` React state and `setMode`
- Produces: two buttons labeled `Visual` and `HTML source`, each with `aria-pressed`

- [ ] **Step 1: Write the failing regression test**

Create a Node source-contract test that reads the component and asserts:

```ts
assert.match(source, />Visual</);
assert.match(source, />HTML source</);
assert.match(source, /onClick=\{\(\)=>setMode\("visual"\)\}/);
assert.match(source, /onClick=\{\(\)=>setMode\("html"\)\}/);
assert.match(source, /aria-pressed=\{mode==="visual"\}/);
assert.match(source, /aria-pressed=\{mode==="html"\}/);
assert.doesNotMatch(source, /setMode\(mode==="visual"\?"html":"visual"\)/);
```

Add this package script:

```json
"test:rich-text-editor": "node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/rich-text-editor-mode-buttons.test.mts"
```

- [ ] **Step 2: Run the test and confirm the old toggle fails**

Run:

```powershell
npm run test:rich-text-editor
```

Expected: FAIL because the component contains one conditional toggle rather
than separate Visual and HTML source buttons.

- [ ] **Step 3: Implement the minimal component change**

In `RichTextEditor.tsx`, replace only the mode-toggle button with:

```tsx
<div className="ml-auto inline-flex rounded-lg border bg-[var(--muted-surface)] p-0.5" role="group" aria-label={`${label} editor mode`}>
  <button
    type="button"
    onClick={() => setMode("visual")}
    aria-pressed={mode === "visual"}
    className={mode === "visual" ? activeModeClass : inactiveModeClass}
  >
    Visual
  </button>
  <button
    type="button"
    onClick={() => setMode("html")}
    aria-pressed={mode === "html"}
    className={mode === "html" ? activeModeClass : inactiveModeClass}
  >
    HTML source
  </button>
</div>
```

Define the two static class strings within the component. The active state
uses the project primary color and foreground; both states retain visible
focus rings.

- [ ] **Step 4: Run focused and project verification**

Run:

```powershell
npm run test:rich-text-editor
npm run lint
npm run build
```

Expected: all commands exit successfully with no TypeScript or lint errors.

- [ ] **Step 5: Inspect the final diff**

Run:

```powershell
git diff --check
git diff -- components/inventory/RichTextEditor.tsx tests/rich-text-editor-mode-buttons.test.mts package.json
git status --short
```

Expected: only the planned implementation/test/package files are uncommitted;
the approved specification and this plan are already documented separately.

- [ ] **Step 6: Commit the implementation**

```powershell
git add components/inventory/RichTextEditor.tsx tests/rich-text-editor-mode-buttons.test.mts package.json docs/superpowers/plans/2026-07-31-rich-text-editor-mode-buttons.md
git commit -m "Improve rich text editor mode controls"
```
