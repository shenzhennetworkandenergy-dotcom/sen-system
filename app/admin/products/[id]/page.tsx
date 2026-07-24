/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ProductForm } from "@/components/inventory/ProductForm";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { requirePermission } from "@/lib/auth/permissions";
import { getProductOptions } from "@/lib/inventory/products";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createVariationAction,
  deleteProductAction,
  updateProductAction,
  uploadProductMediaAction,
} from "../actions";
import { manageProductMediaAction } from "../media-actions";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { profile, permissions } = await requirePermission("products.view");
  const [{ id }, message] = await Promise.all([params, searchParams]);
  const db = createSupabaseAdminClient();
  const [
    { data: product, error },
    options,
    { data: assignment },
    { data: variations },
    { data: media },
    { data: revisions },
    { data: serialUnits },
    { data: balances },
  ] = await Promise.all([
    db.from("products").select("*").eq("id", id).maybeSingle(),
    getProductOptions(),
    db.from("product_category_assignments").select("category_id").eq("product_id", id).eq("is_primary", true).maybeSingle(),
    db.from("product_variations").select("id,sku,combination_key,status,regular_price,manage_stock").eq("product_id", id).order("created_at"),
    db.from("product_media").select("id,media_type,media_purpose,visibility,storage_path,alt_text,sort_order,is_primary").eq("product_id", id).order("sort_order"),
    db.from("product_revisions").select("id,revision_number,actor_id,created_at").eq("product_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("serial_numbers").select("id,status,generation_batch_id").eq("product_id", id).limit(1000),
    db.from("inventory_balances").select("available,on_hand,warehouses(name,code)").eq("product_id", id),
  ]);

  if (error) throw new Error("Unable to load product.");
  if (!product) notFound();

  const paths = (media ?? []).filter((item) => item.media_type === "image").map((item) => item.storage_path);
  const { data: signed } = paths.length
    ? await db.storage.from("product-media").createSignedUrls(paths, 3600)
    : { data: [] };
  const urlMap = new Map<string, string>(
    (signed ?? [])
      .filter((item) => item.path && item.signedUrl)
      .map((item) => [String(item.path), String(item.signedUrl)]),
  );
  const formProduct = {
    ...product,
    category_id: assignment?.category_id ?? "",
    specifications: JSON.stringify(product.specifications ?? {}, null, 2),
  };
  const update = updateProductAction.bind(null, id);
  const variation = createVariationAction.bind(null, id);
  const upload = uploadProductMediaAction.bind(null, id);
  const manage = manageProductMediaAction.bind(null, id);
  const can = (key: string) => profile.role === "admin" || permissions.has(key);
  const expectedCount = (serialUnits ?? []).filter((unit) => unit.status === "expected").length;
  const availableSerialCount = (serialUnits ?? []).filter((unit) => unit.status === "available").length;
  const physicalCount = (serialUnits ?? []).filter((unit) => !["expected", "voided", "removed"].includes(unit.status)).length;
  const availableBalance = (balances ?? []).reduce((sum, item) => sum + Number(item.available), 0);
  const isPublic = product.status === "active" && product.public_catalogue_visible;

  return <DashboardShell
    admin={profile.role === "admin"}
    employeePermissions={profile.role === "employee" ? permissions : undefined}
    title={product.name}
    subtitle={`SKU ${product.sku} · ${product.product_type} product`}
  >
    {message.success ? <p className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-green-900">{message.success}</p> : null}
    {message.error ? <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-900">{message.error}</p> : null}

    <section className="mb-6 rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Product operations</p>
          <span className="mt-1 block text-sm text-[var(--muted-text)]">Model: {product.model_number ?? "Not provided"}</span>
        </div>
        {isPublic
          ? <a href={`/products/${product.slug}`} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Preview public product ↗</a>
          : <a href="#product-settings" className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">Not public — review publishing settings</a>}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-3"><span className="text-xs text-[var(--muted-text)]">Generated labels</span><strong className="block text-2xl">{serialUnits?.length ?? 0}</strong></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><span className="text-xs text-amber-800">Awaiting receipt</span><strong className="block text-2xl text-amber-950">{expectedCount}</strong></div>
        <div className="rounded-xl border bg-white p-3"><span className="text-xs text-[var(--muted-text)]">Received physical units</span><strong className="block text-2xl">{physicalCount}</strong></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-xs text-emerald-800">Available stock</span><strong className="block text-2xl text-emerald-950">{availableBalance}</strong><span className="text-xs text-emerald-800">{availableSerialCount} available serial(s)</span></div>
      </div>

      {expectedCount ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <div><strong>{expectedCount} serial label(s) are generated but not yet stock.</strong><p className="text-sm">Receive the generation batches to make these units available and update the stock quantity.</p></div>
        <a href={`/admin/serials/batches?product=${id}`} className="rounded bg-amber-900 px-4 py-2 font-semibold text-white">Receive expected units</a>
      </div> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {product.serial_tracking_required && can("inventory.receive") ? <a href={`/admin/products/${id}/stock/add`} className="rounded bg-[var(--primary)] px-4 py-3 font-semibold text-white">Add serialized stock</a> : null}
        {can("serials.generate") ? <a href={`/admin/products/${id}/serials/new`} className="rounded border bg-white px-4 py-3 font-semibold">Generate serial labels</a> : null}
        <a href={`/admin/serials?product=${id}`} className="rounded border bg-white px-4 py-3 font-semibold">View all serials</a>
        {can("inventory.adjust_stock") ? <a href={`/admin/inventory/adjustments/new?product=${id}`} className="rounded border bg-white px-4 py-3 font-semibold">Adjust / remove stock</a> : null}
        <a href={`/admin/serials/print?product=${id}`} className="rounded border bg-white px-4 py-3 font-semibold">Print labels</a>
        <a href="/admin/serials/scan" className="rounded border bg-white px-4 py-3 font-semibold">Scan serial</a>
        <a href="#product-images" className="rounded border bg-white px-4 py-3 font-semibold">Manage images</a>
        <a href={`/admin/inventory/movements?product=${id}`} className="rounded border bg-white px-4 py-3 font-semibold">Inventory movements</a>
      </div>
    </section>

    <section id="product-images" className="mb-6 rounded-xl border bg-[var(--surface)] p-6">
      <h2 className="text-xl font-semibold">Product Images</h2>
      {media?.some((item) => item.media_type === "image") ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {media.filter((item) => item.media_type === "image").map((item) => <article key={item.id} className="overflow-hidden rounded-xl border">
          <div className="aspect-[4/3] bg-[var(--muted-surface)]">{urlMap.get(item.storage_path) ? <img src={urlMap.get(item.storage_path)} alt={item.alt_text ?? product.name} className="h-full w-full object-contain" /> : null}</div>
          <form action={manage} className="space-y-2 p-3">
            <input type="hidden" name="media_id" value={item.id} />
            <b>{item.is_primary ? "Main image" : "Gallery image"}</b>
            <input name="alt_text" defaultValue={item.alt_text ?? ""} aria-label="Image alt text" className="w-full rounded border p-2" />
            <div className="flex flex-wrap gap-2">
              <button name="intent" value="alt" className="rounded border px-2 py-1">Save alt</button>
              {!item.is_primary ? <button name="intent" value="main" className="rounded border px-2 py-1">Set as main</button> : null}
              <button name="intent" value="remove" className="rounded border border-red-300 px-2 py-1 text-red-700">Remove</button>
            </div>
          </form>
        </article>)}
      </div> : <p className="mt-3 text-[var(--muted-text)]">No product images uploaded.</p>}
      <form action={upload} className="mt-5 grid gap-3 md:grid-cols-2">
        <label>New image<input type="file" name="file" required accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full rounded border p-2" /></label>
        <label>Purpose<select name="media_purpose" className="mt-1 w-full rounded border p-2"><option value="gallery_image">Gallery image</option><option value="main_product_image">Main product image</option></select></label>
        <label>Alt text<input name="alt_text" className="mt-1 w-full rounded border p-2" /></label>
        <button className="self-end rounded border px-4 py-2 font-semibold">Upload image</button>
      </form>
    </section>

    <div id="product-settings"><ProductForm action={update} options={options} product={formProduct} /></div>

    {product.product_type === "variable" ? <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6">
      <h2 className="text-xl font-semibold">Variations</h2>
      {variations?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr><th>SKU</th><th>Combination</th><th>Price</th><th>Stock level</th><th>Status</th></tr></thead><tbody>{variations.map((item) => <tr key={item.id} className="border-t"><td className="py-3">{item.sku}</td><td>{item.combination_key}</td><td>{item.regular_price ?? "—"}</td><td>{item.manage_stock ? "Variation" : "Parent"}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-[var(--muted-text)]">No variations yet.</p>}
      <form action={variation} className="mt-5 grid gap-3 md:grid-cols-4">
        <label>Variation SKU<input name="sku" required className="mt-1 w-full rounded border p-2" /></label>
        <label>Combination<input name="combination_key" required className="mt-1 w-full rounded border p-2" /></label>
        <label>Regular price<input name="regular_price" type="number" min="0" step=".0001" className="mt-1 w-full rounded border p-2" /></label>
        <label>Purchase cost<input name="purchase_cost" type="number" min="0" step=".0001" className="mt-1 w-full rounded border p-2" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="manage_stock" />Manage variation stock</label>
        <button className="rounded border px-4 py-2 font-semibold">Add variation</button>
      </form>
    </section> : null}

    <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6">
      <h2 className="text-xl font-semibold">Product revision history</h2>
      {revisions?.length ? <ol className="mt-3 space-y-2">{revisions.map((revision) => <li key={revision.id} className="rounded border p-3"><strong>Revision {revision.revision_number}</strong><span className="block text-sm text-[var(--muted-text)]">{new Date(revision.created_at).toLocaleString()}</span></li>)}</ol> : <p className="mt-3 text-[var(--muted-text)]">History begins with the next saved revision.</p>}
    </section>

    {profile.role === "admin" ? <section className="mt-6 rounded-xl border border-red-300 bg-red-50 p-6 text-red-950">
      <h2 className="text-xl font-semibold">Delete product</h2>
      <p className="mt-2 text-sm">Permanent deletion is allowed only for unused products without stock, serials, variations, movements, reservations, or orders. Products with business history must be archived.</p>
      <form action={deleteProductAction.bind(null, id)}><ConfirmSubmitButton confirmation={`Permanently delete ${product.name}? This cannot be undone.`} className="mt-4 rounded border border-red-700 px-4 py-2 font-semibold text-red-800">Delete unused product</ConfirmSubmitButton></form>
    </section> : null}
  </DashboardShell>;
}
