# Permission System Audit Implementation Plan

**Goal:** Make saved employee permissions control navigation, direct-route access, and available actions consistently without exposing unchecked modules.

## Work

1. Add behavior tests for employee navigation, especially `employees.view`, sales aliases, and denied modules.
2. Add a permission-protected employee directory and detail page that expose only safe employee profile information.
3. Make the dashboard shell derive navigation from the authenticated role so employee pages can never render unrestricted admin navigation.
4. Align navigation permission aliases with their destination page guards and repair workspace module-card routing.
5. Extend the signed-in offline integration test to verify the Employees module appears, loads, and unrelated modules remain denied.
6. Run the permission matrix audit, standalone tests, lint, TypeScript/build, and release gate.
7. Push a focused branch, open and merge a reviewed PR, deploy, then verify the production permission state and routes.
