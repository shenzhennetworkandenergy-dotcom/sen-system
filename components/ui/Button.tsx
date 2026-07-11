import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "sm" | "md" | "lg";
type SharedButtonProps = { children?: ReactNode; variant?: ButtonVariant; size?: ButtonSize; className?: string };
type NativeButtonProps = SharedButtonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedButtonProps> & { href?: never };
type LinkButtonProps = SharedButtonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedButtonProps> & { href: string; disabled?: boolean };
export type ButtonProps = NativeButtonProps | LinkButtonProps;

const variantClasses: Record<ButtonVariant, string> = { primary: "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90", secondary: "border-transparent bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--muted-surface)]", outline: "border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--muted-surface)]" };
const sizeClasses: Record<ButtonSize, string> = { sm: "h-9 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, ...rest } = props;
  const classes = cn("inline-flex items-center justify-center rounded-[var(--radius-md)] border font-medium transition", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]", "disabled:pointer-events-none disabled:opacity-50", "aria-disabled:pointer-events-none aria-disabled:opacity-50", variantClasses[variant], sizeClasses[size], className);
  if ("href" in rest && typeof rest.href === "string") {
    const { href, disabled, ...anchorProps } = rest;
    return <a {...anchorProps} href={disabled ? undefined : href} className={classes} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : anchorProps.tabIndex} />;
  }
  return <button {...rest} className={classes} />;
}
