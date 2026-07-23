# Shipments

One order may have multiple partial shipments. Staff build a shipment only from packed quantities and assigned serialized units. Confirmation freezes the draft for dispatch review. Dispatch atomically updates shipment quantities, reservations, stock balances, serial status, and audit history.

Supported transport modes are air, sea, road, local delivery, customer pickup, and other. Shipment records keep origin/destination snapshots, estimated and actual dates, package count, weight, dimensions, staff notes, customer notes, tracking events, and route points.

Tracking locations are staff-recorded operational checkpoints. They are not live GPS. Customers only receive events explicitly marked customer-visible or both.

Phase 3 adds an optional, explicit foreground browser-location session for an eligible active shipment. It never starts silently, is throttled, stops when requested or when the page closes, and is displayed to customers with truthful fresh/recent/stale wording rather than an unconditional “Live” claim.
