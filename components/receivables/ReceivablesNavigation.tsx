import { routes } from "@/lib/constants/routes";

export function ReceivablesNavigation({
  canViewCustomer,
  canViewLoans,
  canReconcile = false,
  canViewReports = false,
}: {
  canViewCustomer: boolean;
  canViewLoans: boolean;
  canReconcile?: boolean;
  canViewReports?: boolean;
}) {
  const items = [
    { label: "Receivables Dashboard", href: routes.adminReceivables, visible: true },
    {
      label: "Customer Receivables",
      href: routes.adminCustomerReceivables,
      visible: canViewCustomer,
    },
    {
      label: "Loans & Advances",
      href: routes.adminReceivableLoans,
      visible: canViewLoans,
    },
    {
      label: "Accounting Reconciliation",
      href: "/admin/receivables/reconciliation",
      visible: canReconcile,
    },
    {
      label: "Reports",
      href: routes.adminReceivableReports,
      visible: canViewReports,
    },
  ];
  return (
    <nav aria-label="Receivables" className="mb-4 flex flex-wrap gap-2">
      {items
        .filter((item) => item.visible)
        .map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--primary)] shadow-sm transition hover:border-blue-400 hover:bg-blue-50"
          >
            {item.label}
          </a>
        ))}
    </nav>
  );
}
