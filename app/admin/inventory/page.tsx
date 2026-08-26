import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getInventorySummary, type InventoryMetric } from "@/lib/inventory/data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type InventoryIconName =
  | "serial"
  | "receive"
  | "scan"
  | "search"
  | "print"
  | "refresh"
  | "list"
  | "batch"
  | "download"
  | "product"
  | "stock"
  | "category"
  | "brand"
  | "attributes"
  | "transfer"
  | "warehouse"
  | "calendar"
  | "box"
  | "layers"
  | "variation"
  | "hand"
  | "check"
  | "lock"
  | "alert"
  | "slash"
  | "barcode";

type InventoryAction = {
  label: string;
  href: string;
  icon: InventoryIconName;
  tone: string;
  primary?: boolean;
};

function InventoryIcon({ name, className = "h-4 w-4" }: { name: InventoryIconName; className?: string }) {
  const props = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "serial":
      return <svg {...props}><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" /><path d="m8 9 4 2.25L16 9M12 11.25V17" /></svg>;
    case "receive":
      return <svg {...props}><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /><path d="m17 15 2 2 2-2" /></svg>;
    case "scan":
      return <svg {...props}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M7 12h10M9 9v6M12 9v6M15 9v6" /></svg>;
    case "search":
      return <svg {...props}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></svg>;
    case "print":
      return <svg {...props}><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v6H7zM17 12h.01" /></svg>;
    case "refresh":
      return <svg {...props}><path d="M20 11a8 8 0 0 0-14.8-4L3 10" /><path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14" /><path d="M21 19v-5h-5" /></svg>;
    case "list":
      return <svg {...props}><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>;
    case "batch":
      return <svg {...props}><path d="M4 7h16M4 12h16M4 17h16" /><path d="M7 4v16M12 4v16M17 4v16" /></svg>;
    case "download":
      return <svg {...props}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>;
    case "product":
      return <svg {...props}><path d="m4 7 8-4 8 4v10l-8 4-8-4z" /><path d="m4 7 8 4 8-4M12 11v10" /></svg>;
    case "stock":
      return <svg {...props}><path d="M4 8h16v12H4z" /><path d="M8 8V5h8v3M8 13h8M12 11v4" /></svg>;
    case "category":
      return <svg {...props}><path d="M4 5h7l2 2h7v12H4z" /><path d="M8 12h8M12 8v8" /></svg>;
    case "brand":
      return <svg {...props}><path d="m12 3 2.6 5.3L20.5 9l-4.25 4.15 1 5.85L12 16.2l-5.25 2.8 1-5.85L3.5 9l5.9-.7z" /></svg>;
    case "attributes":
      return <svg {...props}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" /></svg>;
    case "transfer":
      return <svg {...props}><path d="M4 7h13M14 4l3 3-3 3M20 17H7M10 14l-3 3 3 3" /></svg>;
    case "warehouse":
      return <svg {...props}><path d="m3 10 9-6 9 6v10H3z" /><path d="M7 20v-6h10v6M7 10h.01M12 10h.01M17 10h.01" /></svg>;
    case "calendar":
      return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></svg>;
    case "layers":
      return <svg {...props}><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" /></svg>;
    case "variation":
      return <svg {...props}><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="m9.5 9.5 5 5" /></svg>;
    case "hand":
      return <svg {...props}><path d="M7 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6.5A6.5 6.5 0 0 1 15.5 21H12a6 6 0 0 1-5.4-3.4L4.3 12a1.6 1.6 0 0 1 2.7-1.6Z" /></svg>;
    case "check":
      return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="m8 12 2.7 2.7L16.5 9" /></svg>;
    case "lock":
      return <svg {...props}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>;
    case "alert":
      return <svg {...props}><path d="m12 3 9 17H3z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case "slash":
      return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="m7 7 10 10" /></svg>;
    case "barcode":
      return <svg {...props}><path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14" /></svg>;
    case "box":
    default:
      return <svg {...props}><path d="m4 7 8-4 8 4v10l-8 4-8-4z" /><path d="m4 7 8 4 8-4M12 11v10" /></svg>;
  }
}

const serialActions: readonly InventoryAction[] = [
  { label: "Generate serials", href: "/admin/serials/generate", icon: "serial", tone: "blue", primary: true },
  { label: "Add serialized stock", href: "/admin/serials/generate", icon: "receive", tone: "cyan", primary: true },
  { label: "Scan serial", href: "/admin/serials/scan", icon: "scan", tone: "slate" },
  { label: "Search serials", href: "/admin/serials", icon: "search", tone: "slate" },
  { label: "Print labels", href: "/admin/serials/print", icon: "print", tone: "slate" },
  { label: "Reprint labels", href: "/admin/serials/print", icon: "print", tone: "slate" },
  { label: "Regenerate eligible serials", href: "/admin/serials/regenerate", icon: "refresh", tone: "slate" },
  { label: "View all serials", href: "/admin/serials", icon: "list", tone: "slate" },
  { label: "View generation batches", href: "/admin/serials/batches", icon: "batch", tone: "slate" },
  { label: "Export serials", href: "/admin/serials/export", icon: "download", tone: "slate" },
];

const quickActions: readonly InventoryAction[] = [
  { label: "Add product", href: "/admin/products/new", icon: "product", tone: "blue" },
  { label: "Add stock", href: "/admin/inventory/adjustments/new", icon: "stock", tone: "emerald" },
  { label: "Add serialized stock", href: "/admin/serials/generate", icon: "receive", tone: "cyan" },
  { label: "Add category", href: "/admin/categories", icon: "category", tone: "purple" },
  { label: "Add brand", href: "/admin/brands", icon: "brand", tone: "indigo" },
  { label: "Manage attributes", href: "/admin/attributes", icon: "attributes", tone: "violet" },
  { label: "Transfer stock", href: "/admin/inventory/adjustments/new", icon: "transfer", tone: "amber" },
  { label: "Manage warehouses", href: "/admin/warehouses", icon: "warehouse", tone: "navy" },
];

const metricTone: Record<InventoryMetric, { icon: InventoryIconName; accent: string; iconSurface: string; iconText: string }> = {
  active_products: { icon: "product", accent: "border-blue-200 hover:border-blue-400", iconSurface: "bg-blue-50", iconText: "text-blue-700" },
  simple_products: { icon: "box", accent: "border-cyan-200 hover:border-cyan-400", iconSurface: "bg-cyan-50", iconText: "text-cyan-700" },
  variable_products: { icon: "variation", accent: "border-purple-200 hover:border-purple-400", iconSurface: "bg-purple-50", iconText: "text-purple-700" },
  variations: { icon: "layers", accent: "border-indigo-200 hover:border-indigo-400", iconSurface: "bg-indigo-50", iconText: "text-indigo-700" },
  on_hand: { icon: "hand", accent: "border-emerald-200 hover:border-emerald-400", iconSurface: "bg-emerald-50", iconText: "text-emerald-700" },
  available: { icon: "check", accent: "border-green-200 hover:border-green-400", iconSurface: "bg-green-50", iconText: "text-green-700" },
  reserved: { icon: "lock", accent: "border-amber-200 hover:border-amber-400", iconSurface: "bg-amber-50", iconText: "text-amber-700" },
  low_stock: { icon: "alert", accent: "border-orange-200 hover:border-orange-400", iconSurface: "bg-orange-50", iconText: "text-orange-700" },
  out_of_stock: { icon: "slash", accent: "border-red-200 hover:border-red-400", iconSurface: "bg-red-50", iconText: "text-red-700" },
  serialized_units: { icon: "barcode", accent: "border-blue-200 hover:border-blue-400", iconSurface: "bg-blue-50", iconText: "text-blue-700" },
};

const quickTone: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50/45 hover:border-blue-400 hover:bg-blue-50",
  emerald: "border-emerald-200 bg-emerald-50/45 hover:border-emerald-400 hover:bg-emerald-50",
  cyan: "border-cyan-200 bg-cyan-50/45 hover:border-cyan-400 hover:bg-cyan-50",
  purple: "border-purple-200 bg-purple-50/45 hover:border-purple-400 hover:bg-purple-50",
  indigo: "border-indigo-200 bg-indigo-50/45 hover:border-indigo-400 hover:bg-indigo-50",
  violet: "border-violet-200 bg-violet-50/45 hover:border-violet-400 hover:bg-violet-50",
  amber: "border-amber-200 bg-amber-50/45 hover:border-amber-400 hover:bg-amber-50",
  navy: "border-slate-200 bg-slate-50/60 hover:border-blue-300 hover:bg-blue-50/70",
};

export default async function InventoryPage() {
  const { profile, permissions } = await requirePermission("inventory.view");
  const db = createSupabaseAdminClient();
  const [summary, { data: movements }] = await Promise.all([
    getInventorySummary(profile.id),
    db
      .from("inventory_movements")
      .select("id,reference,movement_type,status,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const canDailyClosing =
    profile.role === "admin" ||
    permissions.has("inventory.daily_closing_view") ||
    permissions.has("inventory.daily_closing_generate");
  const cards: Array<[string, number, InventoryMetric]> = [
    ["Active products", summary.active_products, "active_products"],
    ["Simple products", summary.simple_products, "simple_products"],
    ["Variable products", summary.variable_products, "variable_products"],
    ["Variations", summary.variations, "variations"],
    ["On hand", summary.on_hand, "on_hand"],
    ["Available", summary.available, "available"],
    ["Reserved", summary.reserved, "reserved"],
    ["Low stock", summary.low_stock, "low_stock"],
    ["Out of stock", summary.out_of_stock, "out_of_stock"],
    ["Serialized units", summary.serialized_units, "serialized_units"],
  ];

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Inventory"
      subtitle="Real-time SEN product stock across warehouses."
    >
      <section data-inventory-zone="serial-operations" aria-labelledby="inventory-serial-heading" className="mb-6 overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50/80 to-blue-50 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-blue-700">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-100 text-blue-700"><InventoryIcon name="barcode" /></span>
              Serial Operations
            </div>
            <h2 id="inventory-serial-heading" className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Generate, receive, scan, manage and print serialized inventory units.</h2>
          </div>
          <p className="max-w-xs text-sm leading-6 text-slate-600">Keep serialized stock traceable from receipt through release.</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {serialActions.map((action) => (
            <a key={action.label} href={action.href} className={action.primary ? "group flex min-h-14 items-center gap-3 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-900 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2" : "group flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"}>
              <span className={action.primary ? "text-cyan-100" : "text-blue-700"}><InventoryIcon name={action.icon} /></span><span>{action.label}</span>
            </a>
          ))}
        </div>
      </section>

      <section data-inventory-zone="quick-actions" aria-labelledby="inventory-quick-heading" className="mb-6 rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><InventoryIcon name="box" className="h-5 w-5" /></span>
          <div><h2 id="inventory-quick-heading" className="text-xl font-bold tracking-tight text-slate-900">Quick Inventory Actions</h2><p className="mt-1 text-sm text-slate-500">Common catalog, stock and warehouse tasks.</p></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <a key={action.label} href={action.href} className={`group flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${quickTone[action.tone]}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/80 text-[var(--primary)] shadow-sm transition group-hover:scale-105"><InventoryIcon name={action.icon} /></span><span>{action.label}</span>
            </a>
          ))}
          {canDailyClosing ? <a href="/admin/inventory/daily-closing" className="group flex min-h-16 items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm font-semibold text-indigo-900 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/80 text-indigo-700 shadow-sm"><InventoryIcon name="calendar" /></span><span>Daily Inventory Closing Sheet</span></a> : null}
        </div>
      </section>

      <section data-inventory-zone="summary-metrics" aria-label="Inventory summary details" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value, metric]) => {
          const tone = metricTone[metric];
          return <a key={metric} href={`/admin/inventory/details?metric=${metric}`} className={`group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 sm:p-5 ${tone.accent}`}><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-slate-600">{label}</p><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone.iconSurface} ${tone.iconText}`}><InventoryIcon name={tone.icon} /></span></div><p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p><span className="mt-3 flex items-center gap-1 text-xs font-semibold text-[var(--primary)] transition group-hover:gap-2">View details <span aria-hidden="true">→</span></span></a>;
        })}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article data-inventory-zone="warehouse-stock" className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><InventoryIcon name="warehouse" className="h-5 w-5" /></span><div><h2 className="text-xl font-bold tracking-tight text-slate-900">Stock by warehouse</h2><p className="mt-1 text-sm text-slate-500">Availability across your active locations.</p></div></div>
          {summary.warehouses.length ? <div className="mt-5 space-y-3">{summary.warehouses.map((warehouse) => <div key={warehouse.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/30"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-slate-900">{warehouse.name} <span className="font-medium text-slate-500">({warehouse.code})</span></b><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{warehouse.available} available</span></div><p className="mt-2 text-sm text-slate-600">{warehouse.on_hand} on hand</p></div>)}</div> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No warehouses or stock balances exist yet.</p>}
        </article>

        <article data-inventory-zone="stock-movements" className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><InventoryIcon name="refresh" className="h-5 w-5" /></span><div><h2 className="text-xl font-bold tracking-tight text-slate-900">Recent stock movements</h2><p className="mt-1 text-sm text-slate-500">The latest changes recorded in inventory.</p></div></div>
          {movements?.length ? <ul className="mt-5 space-y-2">{movements.map((movement) => <li key={movement.id}><a href={`/admin/inventory/movements/${movement.id}`} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-blue-800">{movement.reference}</span><span className="mt-1 block text-xs capitalize text-slate-500">{movement.movement_type.replaceAll("_", " ")} · {new Date(movement.created_at).toLocaleString()}</span></span><span className="text-lg text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" aria-hidden="true">→</span></a></li>)}</ul> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No stock movements have been recorded.</p>}
        </article>
      </section>
    </DashboardShell>
  );
}
