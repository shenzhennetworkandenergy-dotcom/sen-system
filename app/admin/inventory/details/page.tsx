/* eslint-disable @next/next/no-html-link-for-pages -- protected dashboard transitions intentionally use full-document navigation */
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getInventoryDetailRows, isInventoryMetric, type InventoryMetric } from "@/lib/inventory/data";

export const dynamic = "force-dynamic";

const labels: Record<InventoryMetric, string> = {
  active_products: "Active products",
  simple_products: "Simple products",
  variable_products: "Variable products",
  variations: "Products with variations",
  on_hand: "Products with stock on hand",
  available: "Products with available stock",
  reserved: "Products with reserved stock",
  low_stock: "Low-stock products",
  out_of_stock: "Out-of-stock products",
  serialized_units: "Products with serialized units",
};

const money = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });

export default async function InventoryDetailsPage({ searchParams }: { searchParams: Promise<{ metric?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("inventory.view");
  const params = await searchParams, metric = isInventoryMetric(params.metric) ? params.metric : undefined;
  const rows = await getInventoryDetailRows(metric);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title={metric ? labels[metric] : "Inventory details"} subtitle="Operational product status, quantities, current warehouse location and serialized-unit information.">
    <div className="mb-5 flex flex-wrap gap-3"><a href="/admin/inventory" className="rounded border px-4 py-2 font-semibold">← Inventory dashboard</a><a href="/admin/products" className="rounded border px-4 py-2 font-semibold">Product catalogue</a><a href="/admin/serials" className="rounded border px-4 py-2 font-semibold">Serial tracking</a></div>
    {rows.length ? <div className="grid gap-5 xl:grid-cols-2">{rows.map((row) => <article key={row.id} className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><a href={`/admin/products/${row.id}`} className="text-lg font-bold hover:text-[var(--primary)]">{row.name}</a><p className="mt-1 font-mono text-xs text-[var(--muted-text)]">{row.sku}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-900">{row.status}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${row.derivedStock === "in_stock" ? "bg-green-50 text-green-900" : row.derivedStock === "low_stock" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-900"}`}>{row.derivedStock.replaceAll("_", " ")}</span></div></div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-[var(--muted-text)]">Brand / model</dt><dd className="mt-1 font-semibold">{row.brand ?? "Not assigned"} / {row.model_number ?? "Not assigned"}</dd></div><div><dt className="text-[var(--muted-text)]">Price</dt><dd className="mt-1 font-semibold">{row.sale_price ?? row.regular_price ? money.format(Number(row.sale_price ?? row.regular_price)) : "Request quotation"}</dd></div><div><dt className="text-[var(--muted-text)]">Type</dt><dd className="mt-1 font-semibold capitalize">{row.product_type} · {row.variationCount} variation(s)</dd></div><div><dt className="text-[var(--muted-text)]">On hand / available</dt><dd className="mt-1 font-semibold">{row.onHand} / {row.available}</dd></div><div><dt className="text-[var(--muted-text)]">Reserved / incoming</dt><dd className="mt-1 font-semibold">{row.reserved} / {row.incoming}</dd></div><div><dt className="text-[var(--muted-text)]">Damaged / unavailable</dt><dd className="mt-1 font-semibold">{row.damaged} / {row.unavailable}</dd></div></dl>
      <div className="mt-5 rounded-xl bg-[var(--muted-surface)] p-4"><h2 className="font-semibold">Current location</h2>{row.currentLocations.length ? <ul className="mt-2 space-y-1 text-sm">{row.currentLocations.map((location) => <li key={location}>• {location}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted-text)]">No stock is currently assigned to a warehouse.</p>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><b>{row.serialCount}</b> serialized unit(s){row.serialCount ? <span className="ml-2 text-xs text-[var(--muted-text)]">{Object.entries(row.serialStatuses).map(([status, count]) => `${status}: ${count}`).join(" · ")}</span> : null}</div><div className="flex gap-2"><a href={`/admin/products/${row.id}`} className="rounded border px-3 py-2 text-sm font-semibold">Product details</a>{row.serialCount ? <a href={`/admin/serials?product=${row.id}`} className="rounded border px-3 py-2 text-sm font-semibold">View units</a> : null}</div></div>
    </article>)}</div> : <p className="rounded-2xl border bg-[var(--surface)] p-10 text-center text-[var(--muted-text)]">No products match this inventory status.</p>}
  </DashboardShell>;
}
