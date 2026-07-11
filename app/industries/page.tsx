import type { Metadata } from "next";
import { industries } from "@/components/home/homeData";
import { PublicPage } from "@/components/pages/PublicPage";
export const metadata: Metadata = { title: "Industries", description: "Industries served by SEN including data centers, ISP, healthcare, manufacturing and energy infrastructure." };
export default function IndustriesPage(){return <PublicPage eyebrow="Industries" title="Technical supply support for demanding sectors" description="SEN focuses on sectors where reliable equipment selection, documentation and delivery coordination matter."><div className="flex flex-wrap gap-3">{industries.map(i=><span key={i} className="rounded-full border border-[var(--border)] px-5 py-3 text-sm font-semibold">{i}</span>)}</div></PublicPage>}
