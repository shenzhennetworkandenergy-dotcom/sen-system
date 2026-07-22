# Orders

Phase 2 adds staff-created customer orders under `/admin/orders` and customer history under `/account/orders`.

Orders store immutable customer, address, product, SKU, model, price, currency, tax, discount, shipping, and serial-policy snapshots. Confirmation reserves stock atomically. Cancellation releases eligible reservations. Order state is derived from allocation, packing, shipment, and delivery totals rather than manually guessed.

Serialized lines require exact physical-unit allocation. Units can be found manually, by scanner-style input, or automatically from eligible stock. Allocation, release/replacement, packing, shipment, and delivery remain auditable. Completed or dispatched allocations cannot be silently reused.

The local acceptance test in `supabase/tests/phase2_orders_tracking.sql` exercises the full order lifecycle inside a transaction and rolls it back.
