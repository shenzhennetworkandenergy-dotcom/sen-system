# Native PostgreSQL Offline Design

## Objective

Run the complete SEN platform on one Windows office server and serve office users over the LAN without Supabase, Supabase CLI, Docker, or internet access. Preserve existing business data, profile identifiers, permissions, audit history, uploaded files, and user identities.

## Deployment architecture

Windows runs PostgreSQL 17 as a service and the Next.js standalone application as a second managed service. The application listens on a configurable LAN address while PostgreSQL listens only on localhost. A server-only database adapter owns connection pooling, transactions, and typed query results. Browsers never receive database credentials.

Uploads are stored beneath a configurable protected data root. Authorized route handlers stream files after checking the current session and record ownership. Public product media is served through a bounded public-media route; private HR and support documents remain authorization-gated.

## Compatibility strategy

The first release uses an application-owned compatibility adapter with the subset of query and RPC behavior used by the repository. Existing feature modules continue to call centralized client factories while those factories return the local adapter. This constrains the change surface and permits feature-by-feature replacement later without blocking the offline release.

PostgreSQL remains the source of truth. Existing public tables, constraints, indexes, triggers, audit logs, and security-definer business functions are preserved. Supabase-only RLS helpers and Auth references are replaced by application authorization and explicit actor arguments already used by privileged RPCs. Database roles grant the application only the required schema access.

## Authentication

New local tables store password credentials, hashed session tokens, expiry, revocation, password-reset requirements, failed-attempt counters, and lockout timestamps. Passwords use a memory-hard or adaptive hash available to the Node runtime. Session cookies are HTTP-only, same-site, signed by random server secrets, and secure when TLS is enabled.

Profile UUIDs remain unchanged. The migration utility imports Supabase Auth users and compatible password hashes when verification is supported. Unsupported or federated accounts retain their profile but are marked `password_reset_required`. An administrator can issue a temporary password locally without exposing stored hashes.

## Database migration

The exporter reads schema and data from the source Supabase PostgreSQL database using administrator-provided credentials. It produces encrypted or access-restricted artifacts containing schema data, Auth identity metadata, and a file manifest. The importer validates migration versions, restores records in dependency order, preserves UUIDs and timestamps, resets sequences, verifies row counts and key totals, and writes a signed migration report.

No production or hosted data is modified. Import runs into a newly created local database. Cutover occurs only after validation succeeds.

## Storage migration

The migration utility downloads each referenced Supabase Storage object, verifies size and content hash, maps it to a collision-safe local path, and updates application storage references through a manifest. Missing objects are reported without silently dropping database rows. Private files inherit their existing record-level permissions.

## Windows operation

PowerShell setup scripts validate PostgreSQL 17, create a dedicated database and least-privilege service account, generate secrets, install schema, import data, create storage directories, build the standalone application, and register the application as a Windows service. Separate scripts start, stop, diagnose, back up, restore, update, and uninstall the application without deleting business data by default.

Backups contain a PostgreSQL custom-format dump, the storage tree, configuration metadata, and checksums. Backup writes are atomic and restoration requires an explicit target database and confirmation.

## Configuration

Local configuration uses `DATABASE_URL`, `SESSION_SECRET`, `SEN_DATA_ROOT`, `SEN_PUBLIC_ORIGIN`, `SEN_BIND_HOST`, and `PORT`. Supabase URL and keys are not required in native mode. A temporary `SEN_BACKEND=supabase` compatibility switch remains available only during verified migration and is excluded from the final offline startup script.

## Error handling

Startup fails closed when database connectivity, schema version, secrets, or storage permissions are invalid. User-facing errors remain safe and actionable. Database and storage errors include correlation identifiers in local logs but never expose credentials, SQL, password hashes, or filesystem internals to browsers.

## Verification

Automated coverage proves adapter filtering, mutation, RPC, session lifecycle, role and permission enforcement, upload authorization, migration row counts, and backup integrity. Existing module tests run unchanged where possible. Final acceptance requires the complete release gate, PostgreSQL integration tests, fresh-database installation, authenticated browser checks for public/admin/employee/customer routes, service restart recovery, and a backup/restore drill on disposable data.

## Scope boundaries

The first native release targets Windows and office-LAN operation. Internet hosting, mobile apps, multi-site replication, external identity providers, email delivery, and public TLS termination are outside this phase. The design does not remove historical Supabase migration files because they remain the authoritative schema history used to construct the native PostgreSQL baseline.
