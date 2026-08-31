# Plan: Receivables Phase 6A Security and Reporting Foundation

## Goal

Add a server-side, read-only reporting foundation for Receivables on top of the verified production baseline `2200a209632071e6b4e0eb30f8cb75addb2846b0`. Centralize actor/scope resolution, preserve the existing Sales ownership scope, prevent accounting and payroll detail leakage, and provide pure date, currency, filter, and pagination primitives for later reporting work. Do not add a migration, financial writes, report UI, exports, or changes to protected Attendance, Payroll, Sales, Accounting, or other business logic.

## Design constraints

- Every service-role reporting query receives a resolved scope before it executes.
- Customer Sales rows, summaries, metrics, and dashboard aggregates use one `resolveSalesVisibilityScope` result.
- Non-Sales data requires both the Receivables module and loan visibility permissions.
- Accounting reconciliation is queried only when the actor has the existing accounting read authority.
- Payroll-sensitive fields are exposed only to the current HR authority boundary (active, non-archived administrators, matching `is_hr_admin`).
- Client/RSC props are explicit sanitized DTOs; raw transaction/audit metadata is never forwarded.
- Dates are normalized as inclusive Asia/Dhaka calendar ranges and converted to half-open UTC timestamp bounds.
- Currency totals are grouped by normalized code; no FX or implicit BDT conversion is introduced.
- Existing migrations remain unchanged; no Phase 6A migration is created.

## Implementation steps (test-first)

1. **Baseline and contracts** — Verify the clean worktree, production baseline, and protected Attendance files. Add a focused Phase 6A test file covering scope matrices, archived-admin payroll denial, date boundaries, currency grouping, filter/search normalization, bounded pagination, and sanitized accounting/payroll DTO contracts. Run it and capture the expected failures.
2. **Pure reporting primitives** — Add a dependency-free reporting utility module with typed scope inputs, scope resolution, Dhaka date helpers, currency-grouping helpers, normalized search/filter values, and bounded pagination. Keep pure functions independently testable under Node.
3. **Server actor resolver** — Add a server-only resolver that reads the current profile and effective permissions, invokes the existing Sales visibility resolver, applies the existing HR-admin predicate semantics, and returns a minimal immutable reporting scope. Never accept a caller-supplied actor identity as authority.
4. **DAL scope contract** — Extend the Receivables DAL access contract to consume the centralized scope while preserving existing read models and no-write behavior. Ensure dashboard, customer rows/summaries/metrics, non-Sales lists, party options, and reconciliation all use the same scope gates and bounded query helpers.
5. **Accounting/payroll privacy fix** — In non-Sales detail and reconciliation reads, skip protected accounting queries entirely without accounting visibility. Sanitize transaction metadata and audit old/new/metadata fields for viewers without accounting or payroll authority. Preserve operational movement history and prevent hidden posted transactions from exposing unsafe reversal controls.
6. **Route integration** — Replace ad-hoc route permission booleans with the centralized scope contract in dashboard, customer, loans list, loan detail, and reconciliation routes. Render accounting sections only when the scope permits them; keep Attendance/navigation files untouched.
7. **Regression tests** — Add static/source and pure behavior tests for row/aggregate scope parity, direct detail/reconciliation URL gates, service-role query ordering, accounting leak prevention, payroll privacy, opening/reversal read semantics, and protected-module boundaries. Run focused tests and confirm all new tests fail only before the corresponding implementation.
8. **Verification** — Run the Receivables Phase 1–5 suite, Sales visibility/payment-accounting regressions, Phase 4 Payroll and HR/Attendance tests, native/offline parity, migration-order checks, full standalone regression, TypeScript, ESLint, production build, and `git diff --check`. Use only safe local fixtures for optional authenticated UAT; clean them afterward. Recheck production and stop without deployment.

## Files expected to change

- `lib/receivables/reporting.ts` (pure reporting contracts/helpers)
- `lib/receivables/reporting-access.ts` (server-only actor/scope resolver)
- `lib/receivables/data.ts` (centralized scope contract, guarded/sanitized reads)
- Receivables route pages under `app/admin/receivables/` (scope wiring and accounting-section gate)
- Focused Phase 6A tests under `tests/`
- This plan document

Protected Attendance/calendar/navigation files, all migrations, and non-Receivables business logic must remain unchanged.
