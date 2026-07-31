# HR Permanent Deletion Controls

## Goal

Allow an administrator to permanently delete selected attendance records and selected employee documents only while the existing global Permanent Deletion Mode is enabled.

## Access and safety

- Existing HR access remains admin-only.
- The user interface displays deletion controls only while Permanent Deletion Mode is enabled.
- Every server action independently reloads Permanent Deletion Mode and rejects forged or stale requests when it is disabled.
- Identifiers must be valid UUIDs, deduplicated, and bounded to 100 attendance records or 50 documents per request.
- Every successful deletion writes an HR audit record.

## Attendance deletion

The attendance page adds row checkboxes and a “Delete selected attendance” action. A database function performs the operation atomically, verifies that the actor is an administrator and that Permanent Deletion Mode is enabled, clears nullable correction-request references to preserve correction history, deletes the selected attendance rows, records an audit entry, and returns the deleted count.

## Employee document deletion

The employee detail page adds document checkboxes and a “Delete selected documents” action. The server validates that every selected document belongs to the displayed employee, removes the private storage objects, deletes their metadata rows, and writes one audit entry containing the count and identifiers. If storage removal fails, metadata is not deleted and the administrator receives a precise error.

## Verification

Tests cover permission-mode gating, bounded UUID selection, migration safeguards, user-interface availability, storage plus metadata deletion wiring, and regression behavior. The complete release gate, lint, TypeScript production build, pull request checks, and deployed route behavior must pass.
