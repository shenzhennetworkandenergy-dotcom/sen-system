import type { Metadata } from "next";

import { MarketingPage } from "@/components/layout/MarketingPage";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Technology Solutions",
  description:
    "Explore SEN enterprise networking, data center, energy, automation, medical and global sourcing solutions.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsPage() {
  return (
    <MarketingPage
      eyebrow="Solutions"
      title="Technology sourcing organized around real project outcomes."
      description="From model matching to coordinated delivery, SEN supports the equipment and documentation required for business-critical projects."
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {siteConfig.solutionAreas.map((solution) => (
          <a key={solution.href} href={solution.href} className="rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg">
            <h2 className="text-xl font-semibold text-slate-950">{solution.label}</h2>
            <p className="mt-3 leading-7 text-slate-700">{solution.description}</p>
            <span className="mt-5 block text-sm font-bold text-blue-700">Explore solution →</span>
          </a>
        ))}
      </div>
    </MarketingPage>
  );
}
