import { DashboardShell } from "@/components/dashboard/Shell";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { getInventorySelectors } from "@/lib/inventory/data";
import { adjustInventoryAction, transferInventoryAction } from "../../actions";

export default async function NewAdjustmentPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile, permissions } = await requireAnyPermission(["inventory.adjust_stock", "inventory.transfer"]);
  const [options, message] = await Promise.all([getInventorySelectors(), searchParams]);
  const productMap = new Map(options.products.map((item) => [item.id, item])), warehouseMap = new Map(options.warehouses.map((item) => [item.id, item]));
  const productOptions = options.products.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.sku}{item.serial_tracking_required ? " - serialized" : ""}</option>);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Stock operations" subtitle="Create an atomic adjustment, opening balance, or confirmed warehouse transfer.">
    {message.error ? <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-900">{message.error}</p> : null}
    {options.balances.length ? <section className="mb-6 overflow-x-auto rounded-xl border bg-[var(--surface)]"><h2 className="p-4 text-lg font-semibold">Current quantities</h2><table className="w-full min-w-[720px] text-left text-sm"><thead><tr><th className="p-3">Product</th><th>Warehouse</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead><tbody>{options.balances.slice(0, 100).map((balance) => <tr key={balance.id} className="border-t"><td className="p-3">{productMap.get(balance.product_id)?.name ?? balance.product_id}</td><td>{warehouseMap.get(balance.warehouse_id)?.name ?? balance.warehouse_id}</td><td>{balance.on_hand}</td><td>{balance.reserved}</td><td>{balance.available}</td></tr>)}</tbody></table></section> : <p className="mb-6 rounded-xl border bg-[var(--surface)] p-5 text-[var(--muted-text)]">No current balances. The first positive adjustment creates an opening balance.</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <form action={adjustInventoryAction} className="space-y-4 rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Adjust stock</h2>
        <label>Warehouse<select name="warehouse_id" required className="mt-1 w-full rounded border p-3"><option value="">Select warehouse</option>{options.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label>
        <label>Product<select name="product_id" required className="mt-1 w-full rounded border p-3"><option value="">Select product</option>{productOptions}</select></label>
        <label>Variation (optional)<select name="variation_id" className="mt-1 w-full rounded border p-3"><option value="">Parent product</option>{options.variations.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.combination_key}</option>)}</select></label>
        <label>Reason<select name="reason_id" required className="mt-1 w-full rounded border p-3"><option value="">Select reason</option>{options.reasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Quantity change<input name="quantity_change" type="number" step="0.0001" required placeholder="Use a negative value to decrease" className="mt-1 w-full rounded border p-3" /></label>
        <label>Serial numbers<textarea name="serials" placeholder="One serial per line when serial tracking is enabled" className="mt-1 min-h-28 w-full rounded border p-3" /></label><label>Notes<textarea name="notes" className="mt-1 min-h-24 w-full rounded border p-3" /></label>
        <button className="min-h-12 rounded bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]">Confirm adjustment</button>
      </form>
      <form action={transferInventoryAction} className="space-y-4 rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Transfer stock</h2>
        <label>Source warehouse<select name="source_id" required className="mt-1 w-full rounded border p-3"><option value="">Select source</option>{options.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label>
        <label>Destination warehouse<select name="destination_id" required className="mt-1 w-full rounded border p-3"><option value="">Select destination</option>{options.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label>
        <label>Product<select name="product_id" required className="mt-1 w-full rounded border p-3"><option value="">Select product</option>{productOptions}</select></label>
        <label>Variation (optional)<select name="variation_id" className="mt-1 w-full rounded border p-3"><option value="">Parent product</option>{options.variations.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.combination_key}</option>)}</select></label>
        <label>Quantity<input name="quantity" type="number" min="0.0001" step="0.0001" required className="mt-1 w-full rounded border p-3" /></label>
        <label>Serial numbers<textarea name="serials" placeholder="One serial per line for serialized products" className="mt-1 min-h-28 w-full rounded border p-3" /></label><label>Notes<textarea name="notes" className="mt-1 min-h-24 w-full rounded border p-3" /></label>
        <button className="min-h-12 rounded bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]">Confirm transfer</button>
      </form>
    </div>
  </DashboardShell>;
}
