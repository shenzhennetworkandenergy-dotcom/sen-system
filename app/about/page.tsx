import type { Metadata } from "next";

import { MarketingPage } from "@/components/layout/MarketingPage";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "About SEN",
  description:
    "Learn how Shenzhen Energy & Networks connects China-based technology sourcing with Bangladesh operations and global project delivery.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow="About SEN"
      title="China-based sourcing. Bangladesh operations. Global project support."
      description={siteConfig.description}
    >
      <div className="grid gap-6 md:grid-cols-3">
        {[
          ["Technical matching", "We match models, specifications and compatible components before quotation."],
          ["Verified procurement", "Products, suppliers and images are reviewed before catalogue publication and delivery."],
          ["Coordinated delivery", "Our team supports quotation, sourcing, documentation and project delivery from one workflow."],
        ].map(([title, text]) => (
          <article key={title} className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-3 leading-7 text-slate-700">{text}</p>
          </article>
        ))}
      </div>
    </MarketingPage>
  );
}
