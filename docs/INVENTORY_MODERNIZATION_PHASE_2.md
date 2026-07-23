# Inventory Modernization — Phase 2

Phase 2 connects Phase 1 physical inventory to customer fulfilment:

1. Staff create an order with immutable commercial and delivery snapshots.
2. Confirmation reserves stock at a warehouse.
3. Exact serialized units are allocated and physically packed.
4. One or more partial shipments are created from packed quantities.
5. Dispatch validates packing and updates stock/serial state atomically.
6. Staff add customer-visible or internal tracking checkpoints.
7. Delivery updates line, allocation, serial, shipment, and order state.
8. Customers view only their safe order, shipment, serial, and document data.

Database changes are additive. Mutations run through server-only service-role RPCs with fixed search paths; browser clients have no direct stock-mutation policy. Admins and employees are separately authorized by granular permission keys.

## Offline workflow

Apply migrations to local Supabase, run `npm run test:inventory-phase2`, execute the rollback-only SQL acceptance test, then run all existing static tests, lint, and production build. Hosted Supabase, GitHub, and Vercel remain unchanged until explicit approval.

## Deployment later

Review and back up the hosted database, apply migrations in timestamp order, configure Preview/Production variables, deploy a preview, repeat the authenticated role and fulfilment matrix, then merge only after approval.
