/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
import { connection } from "next/server";

import { archiveProductAction } from "@/app/admin/products/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ProductQuickEdit } from "@/components/inventory/ProductQuickEdit";
import { requirePermission } from "@/lib/auth/permissions";
import { getProductList, getProductOptions, productListPageHref, type ProductListParams } from "@/lib/inventory/products";

export const dynamic = "force-dynamic";

export default async function ProductsPage({searchParams}:{searchParams:Promise<ProductListParams&{success?:string;error?:string}>}){
  await connection();
  const {profile,permissions}=await requirePermission("products.view"),params=await searchParams;
  const [{products,count,page,size},options]=await Promise.all([getProductList(params),getProductOptions()]);
  const pages=Math.max(1,Math.ceil(count/size));
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title="Products" subtitle="Manage SEN simple and variable products, classification, pricing and stock settings.">
    {params.success?<p className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p>:null}
    {params.error?<p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p>:null}
    <div className="mb-4 flex flex-wrap gap-2">
      <a href="/admin/products/new" className="rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Add product</a>
      {["Categories","Brands","Attributes"].map((label)=><a key={label} href={`/admin/${label.toLowerCase()}`} className="rounded-lg border px-4 py-2.5 font-semibold">{label}</a>)}
      <a href="/admin/inventory/export" className="rounded-lg border px-4 py-2.5 font-semibold">Export inventory CSV</a>
      <a href="/admin/products/import" className="rounded-lg border px-4 py-2.5 font-semibold">Import products CSV</a>
    </div>
    <form className="mb-4 grid gap-2 rounded-xl border bg-[var(--surface)] p-3 sm:grid-cols-2 lg:grid-cols-4">
      <input name="q" aria-label="Search products" placeholder="Search name or SKU" defaultValue={params.q} className="rounded-lg border p-2.5"/>
      <select name="category" aria-label="Category" defaultValue={params.category} className="rounded-lg border p-2.5"><option value="">All categories</option>{options.categories.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select name="brand" aria-label="Brand" defaultValue={params.brand} className="rounded-lg border p-2.5"><option value="">All brands</option>{options.brands.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select name="type" aria-label="Product type" defaultValue={params.type} className="rounded-lg border p-2.5"><option value="">All types</option><option value="simple">Simple</option><option value="variable">Variable</option></select>
      <select name="stock" aria-label="Stock status" defaultValue={params.stock} className="rounded-lg border p-2.5"><option value="">All stock states</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option><option value="on_backorder">On backorder</option></select>
      <select name="status" aria-label="Publication status" defaultValue={params.status} className="rounded-lg border p-2.5"><option value="">All publication states</option><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select>
      <select name="sort" aria-label="Sort products" defaultValue={params.sort} className="rounded-lg border p-2.5"><option value="updated">Recently updated</option><option value="name">Name</option></select>
      <button className="rounded-lg border px-4 py-2 font-semibold">Apply filters</button>
    </form>
    <form id="bulk-archive-form" action={archiveProductAction}/>
    {products.length?<div className="overflow-x-auto rounded-xl border bg-[var(--surface)]"><table className="w-full min-w-[1280px] text-left text-sm">
      <thead><tr className="border-b bg-slate-50"><th className="p-3"><span className="sr-only">Select</span></th><th>Image</th><th>Product</th><th>SKU</th><th>Type</th><th>Category</th><th>Brand</th><th>Price</th><th>Stock</th><th>Warehouses</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>{products.map((product)=>{const isPublic=product.status==="active"&&product.public_catalogue_visible;return <tr key={product.id} className="border-b align-top transition hover:bg-cyan-50/40">
        <td className="p-3"><input form="bulk-archive-form" type="checkbox" name="productIds" value={product.id} aria-label={`Select ${product.name}`}/></td>
        <td>{product.image?.signedUrl?<img src={product.image.signedUrl} alt={product.image.alt_text??product.name} className="h-14 w-20 rounded object-cover"/>:<div className="flex h-12 w-12 items-center justify-center rounded bg-[var(--muted-surface)] text-xs">-</div>}</td>
        <td><a href={`/admin/products/${product.id}`} className="font-semibold text-[var(--primary)] hover:underline">{product.name}</a><span className="block text-xs text-[var(--muted-text)]">{product.variationCount} variations</span></td>
        <td>{product.sku}</td><td>{product.product_type}</td><td>{product.category??"-"}</td><td>{product.brand??"-"}</td><td>{product.sale_price??product.regular_price??"-"} {product.currency}</td>
        <td><span className="font-medium">{product.available}</span><span className="block text-xs">{product.derivedStock.replaceAll("_"," ")}</span></td><td className="max-w-52 text-xs">{product.warehouseSummary}</td>
        <td><span className="block">{product.status}</span><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${isPublic?"bg-emerald-100 text-emerald-900":"bg-slate-100 text-slate-700"}`}>{isPublic?"Public":"Not public"}</span></td>
        <td>{new Date(product.updated_at).toLocaleDateString()}</td>
        <td><div className="flex min-w-28 flex-col items-start gap-2"><ProductQuickEdit product={product}/><a href={`/admin/products/${product.id}`} className="font-semibold text-[var(--primary)]">Full edit</a>{isPublic?<a href={`/products/${product.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700">Preview product ↗</a>:<span className="text-xs text-[var(--muted-text)]">Publish to preview</span>}</div></td>
      </tr>})}</tbody>
    </table></div>:<p className="rounded-xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">No products match these filters.</p>}
    <button form="bulk-archive-form" className="mt-4 rounded-lg border px-4 py-2 font-semibold">Archive selected</button>
    <nav className="mt-5 flex justify-between"><a aria-disabled={page<=1} href={productListPageHref(params,Math.max(1,page-1))} className="rounded border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-50">Previous</a><span>Page {page} of {pages}</span><a aria-disabled={page>=pages} href={productListPageHref(params,Math.min(pages,page+1))} className="rounded border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-50">Next</a></nav>
  </DashboardShell>
}
