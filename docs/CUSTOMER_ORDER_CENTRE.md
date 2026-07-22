# Customer Order Centre

Authenticated customers can manage their own reusable delivery addresses and view only orders linked to their profile. Each completed order keeps its original address snapshot even when a saved address changes later.

Customers can view order status, totals, product snapshots, shipment timelines, estimated routes, delivered/dispatch-visible SEN serials, and explicitly authorized documents. Internal notes, supplier data, cost data, internal movement history, unrelated customers, and unrestricted product documents are never exposed.

Document downloads use short-lived signed URLs. Customer access is limited to warranty documents and purchase invoices marked `customer_order_restricted` for their own order.
