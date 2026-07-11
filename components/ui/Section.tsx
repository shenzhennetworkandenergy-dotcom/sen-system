import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils/cn";
import { Container } from "@/components/ui/Container";

type SectionProps = ComponentPropsWithoutRef<"section"> & {
  constrained?: boolean;
};

export function Section({ constrained = true, className, children, ...props }: SectionProps) {
  return (
    <section className={cn("py-16 sm:py-20", className)} {...props}>
      {constrained ? <Container>{children}</Container> : children}
    </section>
  );
}
