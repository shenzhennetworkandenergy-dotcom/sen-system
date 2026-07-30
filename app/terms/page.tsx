import type { Metadata } from "next";

import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for using the SEN website, catalogue, quotations and customer account.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <MarketingPage eyebrow="Legal" title="Website and quotation terms" description="Catalogue information supports product discovery; a confirmed SEN quotation or invoice is the final commercial record.">
      <article className="max-w-4xl space-y-6 rounded-2xl border bg-white p-6 leading-7 text-slate-700 shadow-sm sm:p-8">
        <section><h2 className="text-xl font-semibold text-slate-950">Product information</h2><p className="mt-2">Specifications, availability and prices may change. SEN verifies the requested model, configuration, quantity and delivery terms before order confirmation.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-950">Quotations and orders</h2><p className="mt-2">A submitted request is not an accepted order. Commercial terms become binding only after both parties confirm the applicable quotation, sales order or invoice.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-950">Acceptable use</h2><p className="mt-2">Do not misuse website forms, attempt unauthorized access, submit unlawful material or interfere with the service.</p></section>
      </article>
    </MarketingPage>
  );
}
