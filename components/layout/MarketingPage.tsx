import type { ReactNode } from "react";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Container } from "@/components/ui/Container";

export function MarketingPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="public-experience">
      <PublicHeader />
      <main>
        <section className="sen-catalogue-hero text-white">
          <Container className="py-14 sm:py-20">
            <p className="sen-kicker">{eyebrow}</p>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">
              {description}
            </p>
          </Container>
        </section>
        <Container className="py-10 sm:py-16">{children}</Container>
      </main>
      <PublicFooter />
    </div>
  );
}
