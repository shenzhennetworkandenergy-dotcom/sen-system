const quickAccessLinks = [
  { label: "Add Product", subtitle: "Create a new product", href: "/admin/products/new", icon: "product", gradient: "from-[#0759c8] to-[#1687e5]", dark: false },
  { label: "Create Sale", subtitle: "Start a new sale", href: "/admin/sales/new", icon: "sale", gradient: "from-[#087e4e] to-[#15af67]", dark: false },
  { label: "Create Quotation", subtitle: "Prepare a quotation", href: "/admin/quotations/new", icon: "document", gradient: "from-[#6d30c9] to-[#a044e5]", dark: false },
  { label: "New Cargo Job", subtitle: "Create a tracking job", href: "/admin/cargo-tracking/new", icon: "cargo", gradient: "from-[#be490d] to-[#f58220]", dark: false },
  { label: "New Purchase Order", subtitle: "Create a supplier order", href: "/admin/purchasing/new", icon: "purchase", gradient: "from-[#c92349] to-[#f43f5e]", dark: false },
  { label: "Create RMB Payment", subtitle: "Record an RMB payment", href: "/admin/rmb-payments/new", icon: "payment", gradient: "from-[#087a91] to-[#0ba8b6]", dark: false },
  { label: "Accounting", subtitle: "Open accounting", href: "/admin/accounting", icon: "accounting", gradient: "from-[#3730a3] to-[#5755e8]", dark: false },
  { label: "Cashbook Audit", subtitle: "Review cashbook entries", href: "/admin/accounting/audit", icon: "audit", gradient: "from-[#b91c67] to-[#ed4eaa]", dark: false },
  { label: "Work Scheduler", subtitle: "Manage today's work", href: "/admin/work-scheduler", icon: "calendar", gradient: "from-[#ffda4b] to-[#ffb514]", dark: true },
] as const;

function QuickAccessIcon({ name }: { name: (typeof quickAccessLinks)[number]["icon"] }) {
  const shape = name === "product" ? <><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></>
    : name === "sale" ? <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m3 7 6-4 5 4 7-5"/></>
    : name === "document" ? <><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h7"/></>
    : name === "cargo" ? <><path d="M2 7h12v10H2zM14 10h4l4 4v3h-8M5 20h2M17 20h2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>
    : name === "purchase" ? <><path d="M3 4h2l2 12h12l2-9H6M8 20h.01M18 20h.01"/></>
    : name === "payment" ? <><circle cx="12" cy="12" r="9"/><path d="M9 8h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h5M12 6v12"/></>
    : name === "accounting" ? <><path d="M4 6h16M4 18h16M7 3v18M17 3v18M10 10h4M10 14h4"/></>
    : name === "audit" ? <><path d="M6 3h12v18H6zM9 8h6M9 12h3m-3 5 2 2 4-4"/></>
    : <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 18h3M15 14h3"/></>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shape}</svg>;
}

export function QuickAccessSection() {
  return <section aria-labelledby="quick-access-title" className="mb-3 rounded-2xl border border-sky-200 bg-[var(--surface)] p-3 shadow-sm">
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <span aria-hidden="true" className="text-xl leading-none text-blue-600">⚡</span>
      <div>
        <h2 id="quick-access-title" className="text-sm font-extrabold uppercase tracking-wide text-[#173b74]">Quick Access</h2>
        <p className="text-xs text-[var(--muted-text)]">One-click shortcuts for your most common tasks</p>
      </div>
      <span className="ml-auto hidden rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 sm:inline-flex">Admin Shortcuts</span>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {quickAccessLinks.map(({ label, subtitle, href, icon, gradient, dark }) => <a key={href} href={href} className={`group flex min-h-[76px] min-w-0 items-center gap-3 rounded-xl bg-gradient-to-r ${gradient} px-4 py-3 shadow-[0_3px_9px_rgba(15,23,42,0.14)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(15,23,42,0.2)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-800 motion-reduce:transform-none ${dark ? "text-slate-950" : "text-white"}`}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/25 ring-1 ring-white/20"><QuickAccessIcon name={icon}/></span>
        <span className="min-w-0"><span className="block text-sm font-bold leading-tight">{label}</span><span className={`mt-1 block text-xs leading-tight ${dark ? "text-slate-800" : "text-white/90"}`}>{subtitle}</span></span>
        <span aria-hidden="true" className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/25 text-xl leading-none transition-transform group-hover:translate-x-0.5">→</span>
      </a>)}
    </div>
  </section>;
}
