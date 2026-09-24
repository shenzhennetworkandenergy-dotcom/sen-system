export function SerialPrintLink({ serialId, className = "font-semibold text-[var(--primary)]", children = "Print label" }: { serialId: string; className?: string; children?: React.ReactNode }) {
  return <a href={`/admin/serials/print?ids=${encodeURIComponent(serialId)}`} className={className}>{children}</a>;
}
