import {
  quotationStatusMeta,
  type QuotationBusinessStatus,
} from "@/lib/quotations/workflow";

const colors = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-sky-100 text-sky-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-900",
} as const;

export function QuotationStatusBadge({ status }: { status: string }) {
  const meta = quotationStatusMeta[status as QuotationBusinessStatus] ?? {
    label: status.replaceAll("_", " "),
    color: "gray" as const,
  };

  return (
    <span
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${colors[meta.color]}`}
    >
      {meta.label}
    </span>
  );
}
