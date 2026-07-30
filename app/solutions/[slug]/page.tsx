import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingPage } from "@/components/layout/MarketingPage";
import { siteConfig } from "@/config/site";

function solutionFor(slug: string) {
  return siteConfig.solutionAreas.find((item) => item.href === `/solutions/${slug}`);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const solution = solutionFor(slug);
  if (!solution) return { title: "Solution not found" };
  return {
    title: solution.label,
    description: solution.description,
    alternates: { canonical: solution.href },
  };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const solution = solutionFor((await params).slug);
  if (!solution) notFound();
  return (
    <MarketingPage eyebrow="SEN solution" title={solution.label} description={solution.description}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-semibold">Designed for {solution.useCase.toLowerCase()}</h2>
          <p className="mt-4 leading-8 text-slate-700">SEN reviews the required specification, compatibility, quantity, availability and delivery destination before preparing a project quotation. This reduces model mismatch and keeps the procurement record clear.</p>
        </section>
        <aside className="rounded-2xl bg-blue-950 p-6 text-white sm:p-8">
          <h2 className="text-xl font-semibold">Start your requirement</h2>
          <a href="/request-quote/general" className="mt-5 inline-flex rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950">Request a quotation</a>
        </aside>
      </div>
    </MarketingPage>
  );
}
