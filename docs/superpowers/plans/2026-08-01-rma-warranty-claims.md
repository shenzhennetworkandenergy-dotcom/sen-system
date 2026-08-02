# RMA Warranty Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple, database-backed RMA and warranty workflow where customers can see warranty coverage on delivered order items and submit claims, while administrators or specifically permitted employees can review, receive, resolve, and close them.

**Architecture:** Extend the existing Supabase sales, serial, inventory, permission, audit, and notification foundations with one forward-only RMA migration. Keep mutations in server actions and privileged database RPCs, keep customer reads ownership-scoped through RLS, and reuse the existing dashboard/account shells.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, Tailwind CSS, Node test runner.

## Global Constraints

- Preserve all existing working routes, functions, RLS, authentication, sales, inventory, purchasing, HR, and deployment behavior.
- Never expose service-role credentials or internal RMA notes to customers.
- Warranty begins only after a delivered order item is customer-eligible.
- Customers may claim only their own eligible delivered quantity/serials.
- Administrators retain full access; employees require explicit RMA permissions.
- Every staff mutation must append RMA history, central audit history, and a customer notification where applicable.

---

## Task 1: Executable RMA contract tests

- [ ] Add `scripts/verify-rma.mjs` covering required migration objects, permission keys, routes, navigation, product warranty fields, customer claim UI, staff workflow, audit calls, and notification integration.
- [ ] Add focused unit tests for status transitions, warranty dates, eligibility, and quantity validation.
- [ ] Add `test:rma` to `package.json` and confirm it fails before implementation.

## Task 2: Database foundation

- [ ] Add migration `202608010008_rma_warranty_claims.sql`.
- [ ] Add structured product warranty defaults and immutable sales-line warranty snapshots.
- [ ] Add `warranty_coverages`, `rma_claims`, `rma_events`, and `rma_attachments` with constraints, indexes, timestamps, RLS, grants, and human-readable RMA numbers.
- [ ] Add customer submission and staff transition RPCs with fixed `search_path`, ownership checks, permission checks, audit logs, and notifications.
- [ ] Add delivered-order coverage activation/backfill and private attachment storage policies.
- [ ] Extend serial lifecycle values and replacement linkage without weakening existing stock protections.

## Task 3: Domain and data access

- [ ] Add strongly typed RMA statuses, resolution values, labels, transition rules, eligibility helpers, and warranty date helpers.
- [ ] Add customer-scoped and staff-scoped RMA queries with bounded result sizes and safe errors.
- [ ] Add server actions for claim submission, attachment upload, assignment, workflow transitions, resolutions, closure, and warranty override.

## Task 4: Product warranty administration

- [ ] Add warranty enabled, duration, terms, and exclusions fields to the existing product form.
- [ ] Preserve the legacy `warranty_information` field and existing product save behavior.
- [ ] Persist structured fields using the smallest compatible change and validate months as a whole positive number.

## Task 5: Customer warranty experience

- [ ] Show warranty coverage, dates, quantity/serial, and claim status on `/account/orders/[id]`.
- [ ] Add `/account/rma`, `/account/rma/new`, and `/account/rma/[id]` with ownership-scoped data.
- [ ] Require description, validate claim type and quantity, support optional safe attachments, and show a confirmation/RMA number.
- [ ] Add an RMA/Warranty card and unread notification visibility in My Account.

## Task 6: Staff RMA workspace

- [ ] Add `/admin/rma` and `/admin/rma/[id]` with filters, claim summary, customer/order/product/serial/warranty context, attachments, and timeline.
- [ ] Add assignment and the simple lifecycle: Submitted → Under Review → Return Requested → Product Received → Resolution in Progress → Closed.
- [ ] Add resolutions: Repaired, Replaced, Refunded, Rejected, Damaged beyond repair/retired.
- [ ] Add RMA navigation, permission-aware employee visibility, and actionable dashboard badge counts.

## Task 7: Local verification

- [ ] Reset a disposable local Supabase database and confirm all migrations apply cleanly.
- [ ] Run RMA tests, standalone tests, lint, TypeScript/production build, and `git diff --check`.
- [ ] Browser-test customer claim submission and staff review/resolve/close flows at desktop and mobile sizes.
- [ ] Confirm previous account, sales, inventory, purchasing, and permission routes still load.

## Task 8: Delivery and live verification

- [ ] Commit all intended files on a focused branch; verify clean status and commit contents.
- [ ] Push the branch, create a PR, confirm GitHub head/files/checks/mergeability, and test Vercel Preview.
- [ ] Review and apply the migration to the linked Supabase target, then redeploy with matching environment variables.
- [ ] Re-run authenticated customer and staff RMA tests on Vercel and inspect runtime logs.
- [ ] Report READY TO MERGE only after all code, database, Preview, permission, and regression checks pass.
