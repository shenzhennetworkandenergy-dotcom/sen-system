import type { Metadata } from "next";

import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = {
  title: "Contact SEN",
  description:
    "Contact SEN in Dhaka for enterprise technology products, sourcing, quotations and project support.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Contact SEN"
      title="Talk to our sourcing and project team."
      description="Share a product model, technical specification, quantity, tender, or project requirement and our team will respond with the next practical step."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-semibold">Bangladesh office</h2>
          <address className="mt-4 space-y-3 not-italic leading-7 text-slate-700">
            <p>House 67, Level 3, Laboratory Road, New Elephant Road</p>
            <p>Behind Multiplan Center, Dhaka 1205, Bangladesh</p>
            <p><a className="font-semibold text-blue-700 underline" href="tel:+8801805226599">+880 1805-226599</a> (Call/WhatsApp)</p>
            <p><a className="font-semibold text-blue-700 underline" href="mailto:szwaqia@vip.163.com">szwaqia@vip.163.com</a></p>
          </address>
        </section>
        <section className="rounded-2xl border bg-blue-950 p-6 text-white shadow-sm sm:p-8">
          <h2 className="text-2xl font-semibold">Need a formal quotation?</h2>
          <p className="mt-4 leading-7 text-blue-100">Search and select the exact catalogue product, then include your quantity, configuration and delivery requirements.</p>
          <a href="/request-quote/general" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950">Request a quotation</a>
        </section>
      </div>
    </MarketingPage>
  );
}
