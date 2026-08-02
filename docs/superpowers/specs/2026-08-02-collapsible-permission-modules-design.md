# Collapsible Permission Modules Design

## Goal

Make long permission lists easier to scan by allowing administrators to expand or collapse each permission module independently.

## Selected interaction

Each permission module is rendered as a native HTML `details` section. Modules start collapsed. The summary row remains visible and contains:

- the module name;
- the module description;
- a live `selected / total` permission count; and
- a chevron that rotates when the module opens.

Clicking or keyboard-activating one summary toggles only that module. Expanded content retains the existing Select all, Clear module, permission checkboxes, sensitive badges, descriptions, and grant-origin labels.

## Alternatives considered

1. **Native `details` sections — selected.** Accessible browser behavior, independent module state, no new React state, and permission inputs remain mounted.
2. **Controlled React accordion.** Offers programmatic control but adds state and event code with no current product requirement for global expand/collapse behavior.
3. **CSS-only checkbox toggles.** Avoids JavaScript but creates weaker semantics and duplicate hidden form controls.

## Data and form behavior

Collapsing a module only changes its visual disclosure state. It does not unmount inputs or change the selected permission set, so existing form submission and Reset to template behavior remain unchanged. Module counts recalculate from the existing `selected` set after individual, Select all, Clear module, or template-reset changes.

## Responsive and accessibility behavior

The summary row wraps on narrow screens so the name, description, and count remain readable. Native summary keyboard behavior is preserved. The chevron is decorative and hidden from assistive technology. Focus indicators use the existing application styles.

## Scope

Only the shared `PermissionChecklist` presentation changes. This automatically covers the focused employee editor, user profile permission editor, reusable template editor, and custom-template creator. Database permissions, save actions, navigation, and authorization checks are unchanged.

## Verification

- A focused regression test verifies one native disclosure per permission module, collapsed-by-default markup, and the live selected-count contract.
- Existing employee-permission tests verify permission semantics remain unchanged.
- Lint, TypeScript, the full standalone suite, and the production build must pass.
- Browser checks verify independent desktop and mobile disclosure behavior without changing checkbox selections.
