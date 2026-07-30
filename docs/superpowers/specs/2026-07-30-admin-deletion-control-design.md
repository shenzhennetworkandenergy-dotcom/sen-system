# Admin Deletion Control Design

## Goal

Give every active administrator one system-wide switch that controls whether delete actions permanently remove records or move them into a recoverable archive.

## Approved behavior

- Every active administrator can enable or disable Permanent Deletion Mode.
- The switch lives at **Admin → Settings → Data Management**.
- Changing the switch is itself audited.
- With the switch disabled, delete actions archive records, remove them from normal admin/public queries, and expose them in a central Archive page.
- With the switch enabled, delete actions permanently remove eligible records.
- Archived users cannot sign in. Archived products cannot appear publicly, be searched, or be selected in new transactions.
- Administrators can restore archived records.
- Permanent deletion requires an explicit confirmation in the UI.
- The current administrator cannot delete their own account, and the final active administrator cannot be deleted.
- Audit records remain immutable so destructive actions remain attributable.

## Data model

`system_settings` stores the singleton `permanent_deletion_enabled` value and the administrator who last changed it.

`archive_entries` is the central archive index. It stores the entity type, entity ID, display label, archive reason, actor, time, and a small metadata snapshot. The original business record remains in its source table while archived.

Products and profiles keep using their existing archive columns. Restore operations clear those columns and restore a safe status. Additional modules can register archive handlers without duplicating mode or authorization logic.

## Security

All setting, delete, and restore operations are server actions that authenticate an active administrator at execution time. Client-provided IDs are validated and the target row is re-read from the database. The setting is never trusted from the browser.

The setting changes deletion policy; it does not bypass database integrity. A permanent deletion that would violate protected shared history fails loudly rather than silently deleting unrelated records. Unused development products and users can be permanently removed as requested.

## User experience

The Data Management page contains:

- A clearly labeled Permanent Deletion Mode switch with its current state.
- A warning explaining the active behavior.
- The administrator and time of the latest change.
- A link to the Archive.

The Archive page contains filters for entity type and text search, restore controls, and permanent-delete controls that appear only while Permanent Deletion Mode is enabled.

Product and user danger zones display the effective action: **Archive** while the mode is off and **Delete permanently** while it is on.

## Initial entity coverage

The first complete slice covers products and users because those records already have guarded delete actions and archive metadata. The shared deletion policy and archive registry are intentionally reusable for categories, brands, attributes, suppliers, CRM, purchasing, sales, inventory, logistics, and finance.

Transactional records retain their existing cancel/void/reverse workflows until a module-specific permanent purge can preserve stock and accounting integrity. This prevents a product cleanup control from corrupting invoices, payments, inventory balances, or ledgers.
