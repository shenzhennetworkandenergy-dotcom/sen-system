"use client";

import { useMemo, useState } from "react";
import { CurrencyCombobox } from "@/components/forms/CurrencyCombobox";
import { supplierCodePreview } from "@/lib/purchasing/supplier-codes";

type SupplierDefaults = Record<string, string | number | boolean | null>;
type CategoryOption = { id: string; pathNames: string[]; pathLabel: string };
type BrandOption = { id: string; name: string };

export function SupplierForm({ action, categories, brands, defaults = {}, submitLabel }: {
  action: (form: FormData) => void | Promise<void>;
  categories: CategoryOption[];
  brands: BrandOption[];
  defaults?: SupplierDefaults;
  submitLabel: string;
}) {
  const field = (name: string) => defaults[name] == null ? "" : String(defaults[name]);
  const savedCode = field("code");
  const [categoryId, setCategoryId] = useState(field("supplier_category_id"));
  const [suffix, setSuffix] = useState<number | null>(null);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const previewCode = useMemo(() => {
    if (savedCode) return savedCode;
    if (!selectedCategory || suffix === null) return "";
    return supplierCodePreview(selectedCategory.pathNames, suffix);
  }, [savedCode, selectedCategory, suffix]);
  const changeCategory = (value: string) => {
    setCategoryId(value);
    if (!savedCode && value) {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      setSuffix(values[0] % 100000);
    } else {
      setSuffix(null);
    }
  };

  return <form action={action} className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 shadow-sm sm:grid-cols-2">
    <label className="text-sm font-semibold sm:col-span-2">Supplier category *<select name="supplier_category_id" required value={categoryId} onChange={(event) => changeCategory(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="">Select the complete supplier category path</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.pathLabel}</option>)}</select></label>
    <label className="text-sm font-semibold">Supplier code<input name="code_preview" readOnly value={previewCode} placeholder={categoryId ? "Generating code…" : "Select a category first"} className="mt-1 w-full cursor-not-allowed rounded-xl border bg-[var(--muted-surface)] px-3 py-2.5 font-mono uppercase" /><span className="mt-1 block text-xs font-normal text-[var(--muted-text)]">{savedCode ? "Saved codes remain unchanged unless an administrator regenerates them." : "Generated from every selected category level and verified again when saved."}</span></label>
    <label className="text-sm font-semibold">Supplier name *<input name="name" required maxLength={160} defaultValue={field("name")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Brand<select name="brand_id" defaultValue={field("brand_id")} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="">No brand selected</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
    <label className="text-sm font-semibold">Type<select name="supplier_type" defaultValue={field("supplier_type") || "distributor"} className="mt-1 w-full rounded-xl border px-3 py-2.5">{["manufacturer","distributor","reseller","service_provider","logistics","other"].map((value)=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
    <label className="text-sm font-semibold">Status<select name="status" defaultValue={field("status") || "active"} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="active">Active</option><option value="on_hold">On hold</option><option value="archived">Archived</option></select></label>
    <label className="text-sm font-semibold">Contact person<input name="contact_person" maxLength={160} defaultValue={field("contact_person")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Email<input name="email" type="email" maxLength={200} defaultValue={field("email")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Phone<input name="phone" maxLength={50} defaultValue={field("phone")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Website<input name="website_url" type="url" maxLength={300} defaultValue={field("website_url")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Country *<input name="country_name" required maxLength={100} defaultValue={field("country_name")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Default currency *<CurrencyCombobox name="default_currency" required defaultValue={field("default_currency") || "BDT"} className="mt-1 w-full rounded-xl border px-3 py-2.5 uppercase" /></label>
    <label className="text-sm font-semibold sm:col-span-2">Address<textarea name="address" maxLength={500} defaultValue={field("address")} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold sm:col-span-2">Notes<textarea name="notes" maxLength={2000} defaultValue={field("notes")} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
    <button disabled={!categoryId || (!savedCode && !previewCode)} className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">{submitLabel}</button>
  </form>;
}
