import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type AppShellProps = {
  header?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AppShell({ header, sidebar, children, className }: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-[var(--background)] text-[var(--foreground)]", className)}>
      {header ? <div className="border-b border-[var(--border)]">{header}</div> : null}
      <div className="flex min-h-screen">
        {sidebar ? (
          <aside className="w-72 border-r border-[var(--border)] bg-[var(--surface)]">{sidebar}</aside>
        ) : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
