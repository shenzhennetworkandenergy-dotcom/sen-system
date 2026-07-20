# Serial Tracking

Serialized inventory records manufacturer serial, optional SEN serial and barcode, product/variation, current warehouse/location, status, condition, acquisition reference, warranty dates, notes, and last movement. Database uniqueness prevents duplicate identities, and each unit has one current warehouse.

Opening/positive adjustments register the exact serial list. Negative adjustments and transfers require the exact existing units, so balances cannot change without preserving identity. The atomic RPCs enforce serial count and location consistency.

`/admin/serials` requires `serials.view` and supports bounded search plus warehouse/status filters. Detail pages show identity, location, warranty data, and the last traceable movement. A full shipment lifecycle and richer per-unit event timeline remain future work.
