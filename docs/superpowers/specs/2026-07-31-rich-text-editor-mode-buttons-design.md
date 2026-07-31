# Rich Text Editor Mode Buttons

## Goal

Replace the single mode-toggle button in the product short-description and
full-description editors with two explicit mode buttons: **Visual** and
**HTML source**.

## Scope

The change is limited to the shared `RichTextEditor` component used by both
product description fields. Product persistence, server-side sanitization,
field names, maximum lengths, formatting commands, and database behavior are
unchanged.

## Interaction

- Both editors open in Visual mode.
- The toolbar always shows separate **Visual** and **HTML source** buttons.
- Selecting either button switches directly to that mode.
- The active button has a clearly selected style; the inactive button remains
  outlined.
- Buttons expose their selected state with `aria-pressed`.
- Switching modes preserves the current editor content.
- Bold, italic, and list controls continue to work in Visual mode exactly as
  before.

## Implementation

Update only `components/inventory/RichTextEditor.tsx`:

- Replace the conditional single toggle with two explicit buttons.
- Keep the existing `mode` state and content synchronization.
- Use existing project colors and focus styles without adding dependencies.

## Verification

- Confirm both description editors render both mode buttons.
- Confirm Visual is selected initially.
- Confirm HTML source shows the source editor and becomes selected.
- Confirm Visual returns to the visual editor without losing changes.
- Run ESLint and the production build.
- Confirm no unrelated tracked files are modified.
