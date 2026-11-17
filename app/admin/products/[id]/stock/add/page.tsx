import { notFound } from "next/navigation";
import { adjustQuotedStockAction } from "@/app/admin/inventory/actions";
import { receiveQuotedSerializedStockAction, receiveSerializedStockAction } from "@/app/admin/serials/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationStockPopup } from "@/components/inventory/QuotationStockPopup";
import { SerializedStockForm } from "@/components/inventory/SerializedStockForm";
import { requirePermission } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { uuidOrNull } from "@/lib/inventory/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type StockSearchParams = { error?: string; from?: string; warehouse?: string; variation?: string };

async function QuotedProductStock({ id, message }: { id: string; message: StockSearchParams }) {
  await requireProfile(["admin"]);
  const warehouseId = uuidOrNull(message.warehouse ?? null);
  const variationId = uuidOrNull(message.variation ?? null);
  if (!uuidOrNull(id) || !warehouseId || (message.variation !== undefined && !variationId)) notFound();

  const db = createSupabaseAdminClient();
  const [productResult, warehouseResult, variationResult, reasonResult] = await Promise.all([
    db.from("products").select("id,name,sku,serial_tracking_required").eq("id", id).eq("status", "active").maybeSingle(),
    db.from("warehouses").select("id,name,code").eq("id", warehouseId).eq("is_active", true).maybeSingle(),
    variationId
      ? db.from("product_variations").select("id,sku,combination_key").eq("id", variationId).eq("product_id", id).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("stock_adjustment_reasons").select("id,name,direction").eq("is_active", true).order("sort_order"),
  ]);
  if ([productResult, warehouseResult, variationResult, reasonResult].some((result) => result.error)) {
    throw new Error("Unable to load stock adjustment options.");
  }
  const product = productResult.data;
  const warehouse = warehouseResult.data;
  const variation = variationResult.data;
  if (!product || !warehouse || (variationId && !variation)) notFound();

  const target = { productId: product.id, warehouseId: warehouse.id, variationId: variation?.id ?? null };
  return (
    <div className="sen-dashboard-shell min-h-screen">
      <main className="sen-dashboard-content mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <header className="sen-dashboard-title space-y-2 rounded-xl border p-5">
          <h1 className="text-2xl font-bold">Add / remove stock</h1>
          <p className="font-semibold">{product.name}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-[var(--muted-text)]">SKU</dt><dd>{product.sku}</dd></div>
            <div><dt className="text-[var(--muted-text)]">Warehouse</dt><dd>{warehouse.name} ({warehouse.code})</dd></div>
            {variation ? <div><dt className="text-[var(--muted-text)]">Variation</dt><dd>{variation.combination_key} · {variation.sku}</dd></div> : null}
          </dl>
        </header>
        <QuotationStockPopup
          reasons={reasonResult.data ?? []}
          adjustAction={adjustQuotedStockAction.bind(null, target)}
          receiveAction={product.serial_tracking_required ? receiveQuotedSerializedStockAction.bind(null, target) : undefined}
        />
      </main>
    </div>
  );
}

export default async function AddProductStockPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<StockSearchParams>;
}) {
  const [{ id }, message] = await Promise.all([params, searchParams]);
  if (message.from === "quotation-sale") return <QuotedProductStock id={id} message={message} />;

  const { profile, permissions } = await requirePermission("inventory.receive");
  const db = createSupabaseAdminClient();
  const [{ data: product }, { data: warehouses }, { data: reasons }, { data: balances }, { count: serialCount }] = await Promise.all([
    db.from("products").select("id,name,sku,model_number,serial_tracking_required,brands(name)").eq("id", id).maybeSingle(),
    db.from("warehouses").select("id,name,code").eq("is_active", true).order("name"),
    db.from("stock_adjustment_reasons").select("id,name").eq("is_active", true).order("sort_order"),
    db.from("inventory_balances").select("warehouse_id,on_hand,available,warehouses(name,code)").eq("product_id", id),
    db.from("serial_numbers").select("id", { count: "exact", head: true }).eq("product_id", id),
  ]);
  if (!product) notFound();

  return (
    <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Add serialized stock" subtitle="Receive physical units into an existing catalogue model.">
      {message.error ? <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-900">{message.error}</p> : null}
      <section className="mb-6 grid gap-4 rounded-xl border bg-[var(--surface)] p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div><span className="text-sm text-[var(--muted-text)]">Product</span><b className="block">{product.name}</b></div>
        <div><span className="text-sm text-[var(--muted-text)]">SKU</span><b className="block">{product.sku}</b></div>
        <div><span className="text-sm text-[var(--muted-text)]">Model</span><b className="block">{product.model_number}</b></div>
        <div><span className="text-sm text-[var(--muted-text)]">Existing units</span><b className="block">{serialCount ?? 0}</b></div>
        <div><span className="text-sm text-[var(--muted-text)]">Warehouse stock</span><b className="block">{(balances ?? []).reduce((sum, row) => sum + Number(row.available), 0)} available</b></div>
      </section>
      {product.serial_tracking_required
        ? <SerializedStockForm action={receiveSerializedStockAction.bind(null, id)} warehouses={warehouses ?? []} reasons={reasons ?? []} />
        : <p className="rounded border border-amber-300 bg-amber-50 p-4">This product is not configured for serial tracking. Edit the product before receiving serialized units.</p>}
    </DashboardShell>
  );
}
