import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type HeadingLevel = "h1" | "h2" | "h3" | "h4";

type SectionHeadingProps = ComponentPropsWithoutRef<"div"> & {
  eyebrow?: string;
  heading: ReactNode;
  description?: ReactNode;
  level?: HeadingLevel;
};

export function SectionHeading({
  eyebrow,
  heading,
  description,
  level: Heading = "h2",
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl", className)} {...props}>
      {eyebrow ? (
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
          {eyebrow}
        </p>
      ) : null}
      <Heading className="text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
        {heading}
      </Heading>
      {description ? (
        <p className="mt-4 text-base leading-7 text-[var(--muted-text)] sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}
