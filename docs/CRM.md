# SEN CRM

The basic CRM is a database-backed operational module for companies, contacts, sales leads and follow-up activities.

## Routes

- `/admin/crm` — pipeline summary, filters and lead register
- `/admin/crm/companies` — company register and creation
- `/admin/crm/contacts` — contact register and creation
- `/admin/crm/leads/new` — new lead
- `/admin/crm/leads/[id]` — lead details, stage changes and activity timeline
- `/admin/crm/export` — CSV export

## Permissions

The module uses the existing canonical permissions: `crm.view`, `crm.create`, `crm.edit`, `crm.delete` and `crm.export`. Administrators retain full access. Employees see CRM only when their effective permissions allow it.

## Data and security

CRM records are stored in `crm_companies`, `crm_contacts`, `crm_leads` and `crm_activities`. Reads use RLS and `crm.view`. Mutations use server-only, service-role RPCs that recheck the acting profile and its permission. Every mutation writes to the existing audit log.

All opportunity values currently use BDT. A company can optionally be associated with an existing customer profile, and lead ownership is limited to active administrators or employees.

## Local-first workflow

Apply `202607240003_basic_crm_module.sql` only to the local Supabase instance during offline review. Run `npm run test:crm`, lint, build and authenticated browser checks before any GitHub push or cloud migration.
