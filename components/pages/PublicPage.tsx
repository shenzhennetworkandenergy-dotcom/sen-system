import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function PublicPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <><PublicHeader /><main><section className="bg-[#07111f] py-20 text-white"><Container><p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">{eyebrow}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{description}</p><div className="mt-8"><Button href="/request-quote">Request a Quote</Button></div></Container></section><Container className="py-14">{children}</Container></main><PublicFooter /></>;
}
