# Settings Trash Bin Design

## Goal

Replace the incomplete administrator Archive experience with a centralized
Settings → Trash Bin where administrators can search, filter, select, restore,
or permanently delete recoverable records.

## Scope

The Trash Bin is the user-facing home for every record registered in
`archive_entries`. It supports products, users, brands, attributes, business
categories, and archived employee records. The existing `/admin/archive` URL
remains compatible and redirects to `/admin/settings/trash-bin`.

The feature does not reinterpret ordinary inactive records as deleted. A record
appears only after a supported deletion workflow registers it in
`archive_entries`.

## Navigation and interface

- Settings links to a new Trash Bin card.
- The former top-level Archive navigation item becomes Trash Bin and points to
  the Settings route.
- The page shows the current deletion policy, searchable and type-filterable
  rows, archived date, administrator, reason, and record type.
- Administrators can select up to 100 rows.
- `Restore selected` is always available.
- `Delete permanently` is shown only while Permanent Deletion Mode is enabled.
- The server reloads Permanent Deletion Mode before every purge, so stale or
  forged requests cannot bypass the setting.

## Restore behavior

One security-definer database function restores all selected entries in a
transaction. It verifies an active administrator, validates every selected
Trash Bin entry, restores the underlying records according to their saved
metadata, removes the corresponding `archive_entries`, and writes an audit row
for each restored record.

Restoration rules:

- Product: restore the previous `active` or `draft` status and clear archive
  fields.
- User: restore the previous account status and clear archive fields.
- Brand and attribute: reactivate.
- Business category: clear `archived_at` and reactivate.
- Employee: call the HR lifecycle restoration path and return the employment
  record to active use.

If any selected record cannot be restored, the transaction fails and none of
the selected entries are changed.

## Permanent deletion behavior

Permanent deletion processes validated entries one at a time. Database-only
purges perform dependency checks, target deletion, archive-index deletion, and
audit insertion in one transaction. The action reports how many succeeded and
gives a concise reason for every protected record that could not be purged.

- Products with stock, serial, order, purchasing, customer, variation,
  reservation, movement, or financial history remain protected. An eligible
  product is transactionally removed while its Trash Bin row retains the
  private Storage path snapshot. The row and audit are finalized only after
  Storage succeeds, so failed cleanup stays visible and retryable.
- Users cannot delete themselves or the final active administrator. Accounts
  owning operational or financial history remain protected. Eligible accounts
  use a leased Trash Bin claim around Supabase Auth deletion; finalization
  atomically removes the index and writes audit, and interrupted claims can be
  resumed safely.
- Brands and attributes remain protected while assigned.
- Business categories remain protected while referenced by products or product
  classifications.
- Employee records remain protected while they have attendance, leave, payroll,
  performance, correction, or document history. Purging an unused employment
  record does not delete the associated user profile.

The operation is intentionally partial across selected rows because Auth,
Storage, and PostgreSQL cannot share one transaction. Each item is independently
validated and audited. Claim rows prevent restore/purge races, and external
failures remain retryable instead of being marked successful.

## Employee archive integration

The HR lifecycle RPC changes the employee archive state and the matching
`employee` Trash Bin entry in one transaction. Existing archived employees
remain visible in the employee directory, while all newly archived employee
records also appear centrally in Trash Bin.

## Error handling and audit

- Selection IDs must be strict UUIDs, unique, and limited to 100.
- Missing or unsupported entries are rejected before restore.
- Restore is all-or-nothing.
- Permanent deletion returns exact, safe dependency messages without exposing
  database internals.
- Audit records capture actor, entity type, entity ID, operation, and the saved
  Trash Bin snapshot.

## Verification

- Pure tests cover selection parsing, bounds, deduplication, mode gating, and
  result summaries.
- Source integration tests cover navigation, Settings routing, employee archive
  registration, legacy redirect, and action wiring.
- Local Supabase tests verify transactional restore and disabled-mode rejection.
- The complete release gate, lint, TypeScript production build, independent
  review, GitHub checks, production migrations, and live Vercel routes must pass.
