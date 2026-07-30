import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = {
  title: "Order and Serial Tracking",
  description: "Open your SEN customer account to view order, shipment and assigned serial-number records.",
  robots: { index: false, follow: true },
};

export default function TrackingPage() {
  return (
    <MarketingPage eyebrow="Customer service" title="Order and serial tracking" description="Shipment updates and assigned serial numbers are protected inside the customer account so commercial and delivery information remains private.">
      <div className="grid gap-6 sm:grid-cols-2">
        <Link href="/account/orders" className="rounded-2xl border bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow-lg"><h2 className="text-xl font-semibold">Open order tracking</h2><p className="mt-3 text-slate-700">View status, shipment events and delivery information for your orders.</p></Link>
        <Link href="/account/sales" className="rounded-2xl border bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow-lg"><h2 className="text-xl font-semibold">Open sales history</h2><p className="mt-3 text-slate-700">View invoices, payments and serial numbers assigned to delivered products.</p></Link>
      </div>
    </MarketingPage>
  );
}
