# CRM customer follow-ups

The follow-up system extends the existing CRM leads, companies, contacts, staff assignment and activity timeline. It does not create a second customer store. `crm_followups` holds the current operational state while `crm_activities` preserves the chronological interaction history.

## Queue definitions

All queue dates are stored as `timestamptz` and displayed/classified in `Asia/Dhaka`.

- **Due today:** active and scheduled during the current Dhaka calendar day.
- **Overdue:** active and scheduled before the current Dhaka calendar day.
- **Upcoming:** active and scheduled after today.
- **Waiting customer:** explicitly in `waiting_customer` state.
- **Completed today:** completed during the current Dhaka calendar day.
- **Needs attention:** any actionable follow-up that is urgent, unassigned, manually flagged, or at least three days overdue.

Do-not-contact leads are removed from normal operational queues. Their lead, follow-up records and activities remain available historically.

## Permissions

The module adds `crm.followups_view`, `crm.followups_create`, `crm.followups_edit`, `crm.followups_complete`, `crm.followups_assign` and `crm.followups_view_all`. Admins retain full access. Employees need the relevant permission and can act only on follow-ups they own or created, or leads assigned to/created by them. Assignment to another staff member requires `crm.followups_assign`; cross-owner visibility requires `crm.followups_view_all`.

## Offline verification

Source/domain checks:

```text
npm run test:crm-followups
```

Rollback-only database workflow test (loopback PostgreSQL only):

```text
set CRM_FOLLOWUPS_DATABASE_URL=postgresql://...@127.0.0.1:54322/postgres
npm run test:crm-followups:database
```

The database verifier applies the migration inside one transaction, exercises create/edit/activity/reschedule/complete/schedule-next/cancel/do-not-contact/ownership/audit flows, and rolls the transaction back.

## WhatsApp/Messenger CRM storage

The WhatsApp/Messenger CSV workspace keeps its storage backend explicit:

- set `CRM_WHATSAPP_STORAGE_BACKEND=filesystem` for offline/local use;
- set `CRM_WHATSAPP_STORAGE_BACKEND=supabase` for Vercel production.

Production fails closed when the backend is missing or unsupported. Vercel cannot use the filesystem backend. The Supabase backend stores private, revisioned CRM workspace objects and requires the service-role server client; no secret values belong in this document or in committed environment files.
