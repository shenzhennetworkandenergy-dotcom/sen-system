# Murshida Manzil Accounts inside the Properties portal

The public Properties website has no Accounts link. Super Admin explicitly links one Properties project to the existing Manzil ledger by enabling `manzil_accounts_enabled` in that project's editor. Its existing active and approved project members see the Accounts link inside their signed-in project card. Accounts uses their existing Properties login; it never asks members for an ERP password or creates ERP accounts for them.

Members can view the overview, histories, income/owner reports and printable receipts. Entry forms, Edit and Delete links are omitted. Every mutation and the receipt edit/delete route independently requires `requireMurshidaManager`; hiding buttons is not the authorization boundary. Only an active Properties Super Admin can manage records. Their email must identify an existing active ERP administrator so the rent RPCs retain their existing actor checks. This administrator linkage must be verified before production publication. An unlinked administrator is limited to reading and sees a setup status message.

On the original ERP host, the existing ERP administrator guard and behavior remain unchanged. The property data stays in the existing `murshida_manzil` schema. No ledger copy or synchronization is introduced.

## Session authorization

The request proxy forwards only the Properties session cookie on the isolated host. General ERP authentication cannot consume that cookie, including unrelated Server Actions replayed on a permitted path. Each module request asks the loopback Properties service to verify the current session, account and active membership in the linked project. React request caching deduplicates that check only within the render. Revoking project access, disabling the project link, suspending the account, changing its credentials or signing out invalidates subsequent requests.

The private `/internal/manzil-access/` endpoint uses normal Django session/authentication middleware and, for Super Admin, the existing central authority revalidation. It also requires a dedicated server-only HMAC key, loopback source address and a current signed request bound to the session-cookie digest. Its identity response does not issue a browser bearer token. Invalid signatures, unexpected response formats, timeouts and outages fail closed. Configuration failures lead to a stable unavailable page rather than an authentication redirect loop.

The dedicated `MURSHIDA_ACCOUNTS_BRIDGE_KEY` must be identical in the ERP and Murshida Properties process environments and contain at least 48 characters. It is separate from the central administrator key. Production uses `http://127.0.0.1:3109` as the authority. The optional `MURSHIDA_ACCOUNTS_AUTHORITY_URL` accepts only a loopback HTTP origin. HTTPS forwarding metadata is preserved for the production Django service. Session cookies, passwords and the bridge key are never returned in page props or URLs.

## Routing and local review

`/manzil/` belongs to Django: it requires the Properties login and current project access, then sends the viewer to the module. Caddy routes only `/admin/murshida-manzil` and descendants, the two module images and Next assets to the existing ERP listener on port 3000. Ordinary Properties `/admin/`, `/portal/`, central site selection and public pages retain their own service. The internal authorization endpoint has no public Caddy route.

Use disposable local data. Set `MURSHIDA_ACCOUNTS_PREVIEW_ORIGIN=http://127.0.0.1:3021` and `MURSHIDA_ACCOUNTS_AUTHORITY_URL=http://127.0.0.1:8773` in the ignored ERP `.env.local`, along with the local bridge key. Run the ERP on port 3019 and Properties, with the same key and its own local SQLite database, on port 8773. `node scripts/murshida-accounts-preview.mjs` composes both services on port 3021 and blocks the private endpoint at the gateway.

## Publication after owner approval

1. Review, push and merge both approved repository changes.
2. Verify the central Super Admin email maps to the intended existing active ERP administrator. Prepare a dedicated bridge key on the VPS and configure both processes without disclosing it.
3. Back up the Properties database and apply additive migration `0015`. It defaults to no linked project; enable the setting only on the explicitly selected Manzil project. Existing project memberships remain unchanged.
4. Activate the compatible ERP and Properties revisions, validate Caddy, then activate the narrowly scoped routing. Keep previous releases, environment files and Caddy configuration available for rollback.
5. Verify the original public website, central administrator switch, ordinary member portal, approved member read-only flow, denied other-project flow, Super Admin mutations and revocation on existing sessions.

This is a Murshida Properties feature. SEN Properties does not receive this ledger or its project data.

## Local validation — 2026-11-19

Production build and focused lint pass. The existing Next.js 16.4.1 security advisory remains outside this feature's dependency scope. The full Murshida unit suite, Properties suite and deployment isolation checks pass. Integration checks cover public-link removal, one Properties sign-in, project-scoped member views, absence of edit controls, actual mutation rejection, Super Admin rent/expense writes, revocation and shared sign-out. Native Print / Save PDF remains part of the owner's manual review; the existing document components are reused and the Accounts chrome is hidden in print CSS.
