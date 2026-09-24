# Quotation Customer Experience and Own-View Access Design

## Scope

Improve only the existing Quotation workflow by reusing the current Sales customer type-ahead, adding non-navigating customer quick-create, and introducing creator-scoped quotation viewing. Existing Sales, CRM, quotation operation permissions, and historical records retain their current meaning.

## Customer workflow

`QuotationBuilder` owns the customer options and selected customer state. A separate quick-create form uses a React Server Action with `useActionState`, so it is not nested inside the quotation form and does not navigate or reload the page. The action authenticates `quotations.create`, creates the same Supabase Auth/profile/default-address customer used by Sales and CRM, returns a safe customer DTO, and the builder appends and selects it immediately.

Sales and Quotations use one `CustomerTypeahead` component and one pure search function. Search is case-insensitive across full name, company, email, and phone and returns at most 20 matching active customers. Sales keeps its current selection callback so default-address behavior is unchanged.

The existing Sales and Quotation customer actions share one server-only basic customer creation service. The Sales form keeps its existing redirect behavior; only the Quotation form uses returned action state.

## Ownership and permissions

An additive migration adds nullable `quotation_requests.created_by`, an index, and permission `quotations.view_own`. Existing rows remain null and are not backfilled or reassigned. New staff-created quotations set `created_by` from the authenticated profile. Existing `quotations.view` and `quotations.view_all` remain broad-access permissions.

A shared access policy resolves employees to either `all` or `own` scope. Quotation list, management, printable document, and mutation lookups apply `created_by = current profile` when the employee has `quotations.view_own` without either broad-view permission. Admins and existing broad viewers retain current access. Operation permissions remain independent: own-view does not grant edit, assign, approve, reject, print, history, or conversion.

The printable document requires `quotations.print` for an own-only viewer, while preserving the current printable access behavior for existing broad viewers. Mutation actions keep their existing operation permission and additionally enforce creator scope only for own-only viewers.

## Data safety

The migration is additive, nullable, indexed, and contains no data update, deletion, ownership backfill, permission grant, or template assignment. Customer quick-create rolls back the newly created auth user if its profile or address cannot be saved. Existing customer email uniqueness remains the duplicate guard.

## Verification

Tests cover name/company/email/phone search, selection limits, access-scope resolution, broad-permission compatibility, independent operation permissions, migration safety, create-action ownership, direct-page scoping, and shared component use by Sales and Quotations. The final gate includes focused tests, the complete standalone suite, existing quotation/Sales verifiers, TypeScript, ESLint, production build, local browser verification, migration dry-run, and a non-destructive production smoke test after deployment.
