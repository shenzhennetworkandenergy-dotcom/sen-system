# Full System Functional Audit and Production Release Plan

> **Execution requirement:** Complete each phase in order, add a regression test before every defect fix, and do not release while any required verification is failing.

**Goal:** Verify every SEN system module offline, repair discovered defects, push the verified code, deploy it to Vercel, and verify the production release.

**Architecture:** Audit the existing Next.js 16 application in a clean Git worktree. Use the current verification scripts and focused Node tests as the baseline, then supplement them with schema checks, route/action review, and browser smoke tests. Preserve existing architecture and migrations; make only evidence-driven fixes.

**Technology:** Next.js 16.2.12, React 19, TypeScript, Supabase, Node test runner, ESLint, Vercel.

---

## Phase 1: Clean baseline and tooling

1. Install the locked dependencies with `npm ci`.
2. Read the relevant Next.js 16 documentation before changing framework-specific code.
3. Copy the uncommitted local environment configuration into the isolated worktree without committing it.
4. Record the Git state, configured remotes, Supabase status, migration state, and Vercel project association.
5. Run:
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - every `test:*` package script
   - every standalone `tests/*.mts` test
6. Classify every failure as a product defect, schema drift, test defect, or environment issue before changing code.

## Phase 2: Authentication, permissions, and navigation

Review middleware/proxy behavior, role resolution, offline permission fallback, route guards, admin/employee navigation, login/logout, and unauthorized redirects.

Verify:

- Public routes remain public.
- Admin, employee, and customer routes enforce the intended roles.
- Employee navigation, including `/employee/hr`, renders without server errors.
- Offline permission resolution works with the local database.
- Redirects display clear success or failure results instead of framework placeholder text.

For each defect:

1. Add a focused failing test that reproduces it.
2. Implement the smallest safe fix.
3. Re-run the focused test and the complete permission/authentication suite.

## Phase 3: Public storefront and customer functions

Review and verify homepage navigation, product catalog/search/detail pages, categories, cart, customer account, quotations, checkout-facing flows, contact/support entry points, public company pages, and product assistant behavior.

Verify desktop and mobile rendering, valid links, expected empty/error states, and server actions against the offline Supabase instance.

## Phase 4: Inventory and product administration

Review and verify products, categories, variants, attributes, media, pricing, currencies, stock movements, warehouses, serial numbers, barcode/QR handling, imports, and administrative deletion rules.

Run all inventory, variable-product, currency, product-media, supplier-code, and deletion-policy checks after every repair.

## Phase 5: Sales, orders, payments, and shipping

Review and verify quotations, sales creation, product search, order lifecycle, payment records, shipping records, customer linkage, status changes, totals, currencies, and permission boundaries.

Confirm validation prevents invalid quantities, totals, status transitions, and unauthorized mutations.

## Phase 6: Purchasing, suppliers, and accounting

Review and verify supplier records/categories, purchase orders, receipts, costs, expenses, accounting summaries, currency selection/suggestions, and cross-module inventory effects.

Confirm database constraints and application validation agree.

## Phase 7: CRM, support, chatbot, and messaging

Review and verify leads, contacts, activities, customer notifications, support flows, chatbot conversations, message read state, and notification persistence.

Confirm queries match the deployed schema and empty/unavailable services fail gracefully.

## Phase 8: HR and employee self-service

Review and verify employee creation/editing, multi-file image/PDF attachments, work schedules, attendance selection, automatic device time and timezone capture, admin time overrides, early/late check-in and check-out classification, overtime, holiday overtime, leave, payroll-facing currency fields, employee notifications, and self-service pages.

Confirm both admin HR and employee “My HR” flows work against the offline database.

## Phase 9: Database and offline integration

1. Compare local migration state with the repository.
2. Apply pending migrations forward without resetting or deleting local data.
3. Verify required tables, columns, policies, functions, triggers, and storage configuration.
4. Exercise representative authenticated reads and writes for each module.
5. Re-run the complete test suite, lint, type-check, and production build.
6. Start the production build locally and browser-test representative public, admin, employee, and error flows.

## Phase 10: Git and Vercel release

1. Review the final diff for secrets, generated files, unrelated changes, and migration safety.
2. Commit the verified changes on `codex/full-system-audit`.
3. Push the branch to `origin` without rewriting remote history.
4. Deploy the exact committed source to the linked Vercel production project.
5. Inspect deployment status until `Ready`.
6. Browser-test production public and protected routes.
7. Inspect production logs for new errors and verify the repaired queries/actions against the production schema.
8. Report completion only if offline and production checks are clean; otherwise return to the relevant phase and repeat.
