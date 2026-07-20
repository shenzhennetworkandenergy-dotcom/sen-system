# Activity and Audit

SEN reuses `audit_logs` as the single activity source. Phase 3B adds actor role, module, entity type/reference, safe description and old/new summaries while retaining the original actor, target, action, metadata and timestamp fields.

Stable action keys include `auth.login`, `auth.logout`, `account.access_changed`, `permissions.overrides_updated`, `permissions.template_created`, `permissions.template_updated`, `permissions.template_duplicated` and `permissions.template_status_changed`.

Use `writeAuditLog` from `lib/audit/log.ts` for application events not already recorded atomically by a database RPC. The helper redacts field names resembling passwords, tokens, cookies, authorization headers, secrets or keys. Callers must still submit only the minimum safe old/new values.

Admins can review all safe activity. Employees with `activity.view_own` can review only rows where they are the actor. Browser clients have no policy allowing arbitrary audit inserts. Large JSON is summarized rather than printed automatically.

Future modules should use stable actions such as `products.created`, `inventory.adjusted`, `sales.created`, `purchasing.approved` and `shipments.received` and include only safe entity references.
