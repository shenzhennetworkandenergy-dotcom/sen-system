import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils/cn";
import type { StatusVariant } from "@/types/status";

type StatusBadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: StatusVariant;
};

const variantClasses: Record<StatusVariant, string> = {
  neutral: "border-[var(--border)] bg-[var(--muted-surface)] text-[var(--muted-text)]",
  success: "border-transparent bg-[var(--success)]/10 text-[var(--success)]",
  warning: "border-transparent bg-[var(--warning)]/10 text-[var(--warning)]",
  destructive: "border-transparent bg-[var(--destructive)]/10 text-[var(--destructive)]",
};

export function StatusBadge({ variant = "neutral", className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
