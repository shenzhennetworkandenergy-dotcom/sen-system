import { industries } from "@/components/home/homeData";
import { SafeImage } from "@/components/ui/SafeImage";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function IndustriesSection() {
  return <Section className="bg-[var(--muted-surface)]"><SectionHeading eyebrow="Industries" heading="Industries we serve" description="The homepage keeps industry content structured so future pages can add deeper solution and product mapping."/><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{industries.map(({ name, imageSrc, imageAlt })=><article className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-sm" key={name}><SafeImage src={imageSrc} alt={imageAlt} width={960} height={540} className="aspect-video w-full object-cover" sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 100vw" /><div className="p-4"><h3 className="text-sm font-semibold text-[var(--foreground)]">{name}</h3></div></article>)}</div></Section>;
}
