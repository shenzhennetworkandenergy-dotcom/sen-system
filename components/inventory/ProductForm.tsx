"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { getProductOptions } from "@/lib/inventory/products";
import { RichTextEditor } from "@/components/inventory/RichTextEditor";
import { ProductIdentityFields } from "@/components/inventory/ProductIdentityFields";
import { ProductAttributeFields } from "@/components/inventory/ProductAttributeFields";
import { InlineCategoryField } from "@/components/inventory/InlineCategoryField";
import { CategorySpecificationFields } from "@/components/inventory/CategorySpecificationFields";
import {
  categoryVariationSuggestions,
  parseStoredSpecifications,
} from "@/lib/inventory/category-specifications";
import { roundMoney } from "@/lib/validation/numbers";

type Options = Awaited<ReturnType<typeof getProductOptions>>;
type Product = Record<string, unknown>;
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 invalid:border-red-400 invalid:bg-red-50/40";
const required = <span className="ml-1 text-red-600" aria-hidden="true">*</span>;

function SubmitButtons() {
  const { pending } = useFormStatus();
  return <div className="flex flex-wrap items-center gap-3">
    <button name="submit_intent" value="save" disabled={pending} className="min-h-12 rounded-lg bg-[var(--primary)] px-6 py-3 font-semibold text-[var(--primary-foreground)] transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60">
      {pending ? "Saving product…" : "Save product"}
    </button>
    <button name="submit_intent" value="save_generate" disabled={pending} className="min-h-12 rounded-lg border px-6 py-3 font-semibold transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md disabled:cursor-wait disabled:opacity-60">
      {pending ? "Please wait…" : "Save and generate serials"}
    </button>
    {pending ? <span className="flex items-center gap-2 text-sm font-semibold text-blue-800" role="status"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700"/>Validating and saving…</span> : null}
  </div>;
}

export function ProductForm({ action, options, product }: { action: (formData: FormData) => void | Promise<void>; options: Options; product?: Product }) {
  const value = (key: string, fallback = "") => String(product?.[key] ?? fallback);
  const moneyValue = (key: string) => {
    const raw = product?.[key];
    if (raw === null || raw === undefined || raw === "") return "";
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? String(roundMoney(parsed)) : "";
  };
  const [validationMessage, setValidationMessage] = useState("");
  const [productType, setProductType] = useState(value("product_type", "simple"));
  const [businessCategoryId, setBusinessCategoryId] = useState(
    value("business_category_id", options.businessCategories[0]?.id ?? ""),
  );
  let storedSpecifications: Record<string, unknown> = {};
  try {
    storedSpecifications = parseStoredSpecifications(
      value("specifications", "{}"),
    );
  } catch {
    storedSpecifications = {};
  }
  const selectedBusinessCategory =
    options.businessCategories.find(
      (category) => category.id === businessCategoryId,
    ) ?? null;
  const variationSuggestions = selectedBusinessCategory
    ? categoryVariationSuggestions(
        selectedBusinessCategory.fields,
        storedSpecifications,
      )
    : [];

  const focusField = (field: HTMLElement, message: string) => {
    setValidationMessage(message);
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => field.focus({ preventScroll: true }), 250);
  };

  const handleInvalid = (event: FormEvent<HTMLFormElement>) => {
    const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.form?.querySelector(":invalid") !== field) return;
    const label = field.closest("label")?.childNodes[0]?.textContent?.trim() || field.name.replaceAll("_", " ");
    focusField(field, `${label} is required or contains an invalid value. Please complete this field.`);
  };

  const validateProduct = (event: FormEvent<HTMLFormElement>) => {
    setValidationMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const specifications = form.elements.namedItem("specifications") as HTMLTextAreaElement;
    try {
      const parsed = JSON.parse(String(data.get("specifications") || "{}"));
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
      specifications.setCustomValidity("");
    } catch {
      event.preventDefault();
      specifications.setCustomValidity("Use a valid JSON object, for example: {\"CPU\":\"Intel Xeon\"}");
      specifications.reportValidity();
      focusField(specifications, "Specifications must be a valid JSON object. An example has been added below the field.");
      return;
    }
    const regular = Number(data.get("regular_price") || 0);
    const sale = Number(data.get("sale_price") || 0);
    const saleInput = form.elements.namedItem("sale_price") as HTMLInputElement;
    for (const [key, label] of [["purchase_cost", "Purchase cost"], ["regular_price", "Regular price"], ["sale_price", "Sale price"]] as const) {
      const priceInput = form.elements.namedItem(key) as HTMLInputElement;
      if (priceInput.value && !/^\d+(?:\.\d{1,2})?$/.test(priceInput.value)) {
        event.preventDefault();
        priceInput.setCustomValidity(`${label} can have no more than 2 digits after the decimal point.`);
        priceInput.reportValidity();
        focusField(priceInput, `${label} can have no more than 2 digits after the decimal point.`);
        return;
      }
      priceInput.setCustomValidity("");
    }
    if (sale > 0 && regular > 0 && sale > regular) {
      event.preventDefault();
      saleInput.setCustomValidity("Sale price cannot be higher than the regular price.");
      saleInput.reportValidity();
      focusField(saleInput, "Sale price cannot be higher than the regular price.");
      return;
    }
    saleInput.setCustomValidity("");
  };

  return <form action={action} onInvalid={handleInvalid} onSubmit={validateProduct} className="space-y-6">
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><b>Before saving:</b> fields marked <span className="font-bold text-red-700">*</span> are required. Active products with Public catalogue visibility enabled appear on the public Products page after saving.</p>
    {validationMessage ? <div className="sticky top-3 z-20 rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-900 shadow-lg" role="alert">{validationMessage}</div> : null}
    <section className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">General</h2><div className="mt-4 grid gap-4 md:grid-cols-2">
      <label>Name{required}<input name="name" required autoFocus={!product} defaultValue={value("name")} className={input}/></label>
      <label>Slug <span className="text-xs text-[var(--muted-text)]">(optional; generated from name)</span><input name="slug" defaultValue={value("slug")} className={input}/></label>
      <ProductIdentityFields brands={options.brands} productId={value("id") || undefined} initialBrandId={value("brand_id")} initialModel={value("model_number")} initialSku={value("sku")}/>
      <label>Product type{required}<select name="product_type" required value={productType} onChange={(event) => setProductType(event.target.value)} className={input}><option value="simple">Simple product</option><option value="variable">Variable product</option></select></label>
      <label>Status{required}<select name="status" required defaultValue={value("status", "active")} className={input}><option value="draft">Draft — admin only</option><option value="active">Active / published</option><option value="archived">Archived</option></select></label>
      <label>SEN business category{required}<select name="business_category_id" required value={businessCategoryId} onChange={(event) => setBusinessCategoryId(event.target.value)} className={input}><option value="">Choose a business category</option>{options.businessCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="mt-1 block text-xs text-[var(--muted-text)]">This selection applies its public theme and loads only its configured product fields.</span></label>
      <InlineCategoryField categories={options.categories} initialValue={value("category_id")} businessCategoryId={businessCategoryId}/>
      <label>Barcode <span className="text-xs text-[var(--muted-text)]">(optional)</span><input name="barcode" defaultValue={value("barcode")} className={input}/></label>
      <label>Manufacturer part number <span className="text-xs text-[var(--muted-text)]">(optional)</span><input name="manufacturer_part_number" defaultValue={value("manufacturer_part_number")} className={input}/></label>
    </div><RichTextEditor name="short_description" label="Short description" defaultValue={value("short_description")} maxLength={4000}/><RichTextEditor name="description" label="Full description" defaultValue={value("description")} maxLength={20000}/></section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Pricing</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label>Purchase cost (BDT)<input type="number" inputMode="decimal" step="0.01" min="0" name="purchase_cost" defaultValue={moneyValue("purchase_cost")} onInput={(event) => event.currentTarget.setCustomValidity("")} className={input}/></label>
      <label>Regular price (BDT)<input type="number" inputMode="decimal" step="0.01" min="0" name="regular_price" defaultValue={moneyValue("regular_price")} onInput={(event) => event.currentTarget.setCustomValidity("")} className={input}/></label>
      <label>Sale price (BDT)<input type="number" inputMode="decimal" step="0.01" min="0" name="sale_price" defaultValue={moneyValue("sale_price")} onInput={(event) => event.currentTarget.setCustomValidity("")} className={input}/></label>
      <label>Currency<input type="hidden" name="currency" value="BDT"/><span className={`${input} block bg-[var(--muted-surface)] font-semibold`}>BDT — Bangladeshi Taka</span></label>
    </div></div>
      <div className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Inventory</h2><div className="mt-4 grid gap-4">
        <label>Stock status{required}<select name="stock_status" required defaultValue={value("stock_status", "in_stock")} className={input}><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="on_backorder">On backorder</option></select></label>
        <label>Low-stock threshold<input type="number" inputMode="numeric" step="1" min="0" name="low_stock_threshold" defaultValue={value("low_stock_threshold", "0")} className={input}/></label>
        {[["manage_stock", "Manage stock"], ["allow_backorders", "Allow backorders"], ["sold_individually", "Sold individually"], ["serial_tracking_required", "Serial tracking required"], ["batch_tracking_enabled", "Batch/lot tracking"]].map(([key, label]) => <label key={key} className="flex gap-2"><input type="checkbox" name={key} defaultChecked={Boolean(product?.[key] ?? (key === "manage_stock"))}/>{label}</label>)}
      </div></div>
    </section>
    <CategorySpecificationFields key={businessCategoryId} category={selectedBusinessCategory} values={storedSpecifications}/>
    <ProductAttributeFields key={`${businessCategoryId}-${productType}`} productType={productType} suggestions={variationSuggestions}/>
    <section className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Shipping, warranty and advanced</h2><div className="mt-4 grid gap-4 md:grid-cols-4">{["weight", "length", "width", "height"].map((key) => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<input type="number" min="0" step="0.0001" name={key} defaultValue={value(key)} className={input}/></label>)}</div><div className="mt-4 grid gap-4 md:grid-cols-2"><label>Country of origin<input name="country_of_origin" defaultValue={value("country_of_origin")} className={input}/></label><label>Warranty information<input name="warranty_information" defaultValue={value("warranty_information")} className={input}/></label></div><details className="mt-4 rounded-lg border bg-slate-50 p-3"><summary className="cursor-pointer font-semibold">Legacy and extra specifications JSON</summary><label className="mt-3 block">Specifications JSON<textarea name="specifications" defaultValue={value("specifications", "{}")} onInput={(event) => event.currentTarget.setCustomValidity("")} className="mt-1 min-h-24 w-full rounded border bg-white p-3 font-mono text-sm"/><span className="mt-1 block text-xs text-[var(--muted-text)]">Category fields above are authoritative. Unrelated legacy keys in this JSON object are preserved.</span></label></details><label className="mt-4 block">Internal notes<textarea name="internal_notes" defaultValue={value("internal_notes")} className="mt-1 min-h-24 w-full rounded border p-3"/></label><div className="mt-4 flex flex-wrap gap-4"><label><input type="checkbox" name="featured" defaultChecked={Boolean(product?.featured)}/> Featured</label><label className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-950"><input type="checkbox" name="public_catalogue_visible" defaultChecked={product ? Boolean(product.public_catalogue_visible) : true}/> Show on public Products page</label></div></section>
    <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-6"><h2 className="text-xl font-semibold">Product images</h2><p className="mt-1 text-sm text-[var(--muted-text)]">Save the product first, then upload its main and gallery images from the product page. Images upload directly to secure storage so their original quality is preserved online.</p></section>
    <SubmitButtons/>
  </form>;
}
