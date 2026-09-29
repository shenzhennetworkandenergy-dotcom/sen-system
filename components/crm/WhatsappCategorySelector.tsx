"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createWhatsappCategoryCsvAction } from "@/app/admin/crm/whatsapp/preview/actions";

type CategorySummary = { name: string; slug: string; fileName: string; rowCount: number };

export function WhatsappCategorySelector({ admin, categories, selectedSlug }: {
  admin: boolean;
  categories: CategorySummary[];
  selectedSlug: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = categories.find((category) => category.slug === selectedSlug)!;

  const createCategory = (formData: FormData) => startTransition(async () => {
    setError("");
    const result = await createWhatsappCategoryCsvAction(formData);
    if (!result.ok) { setError(result.error); return; }
    router.push(`/admin/crm/whatsapp/preview?category=${encodeURIComponent(result.category.slug)}`);
    router.refresh();
  });

  return <div className="mb-3 rounded-lg border bg-[var(--surface)] p-2 text-xs">
    <div className="flex flex-wrap items-center gap-1.5">
      {categories.map((category) => <Link
        aria-current={category.slug === selectedSlug ? "page" : undefined}
        className={`rounded-md border px-2 py-1 font-semibold ${category.slug === selectedSlug ? "border-blue-600 bg-blue-50 text-blue-800" : "hover:bg-[var(--muted-surface)]"}`}
        href={`/admin/crm/whatsapp/preview?category=${encodeURIComponent(category.slug)}`}
        key={category.slug}
      >{category.name} <span className="opacity-65">({category.rowCount})</span></Link>)}
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p><span className="font-semibold">Current CSV:</span> {selected.fileName}</p>
      {admin ? <form action={createCategory} className="flex gap-1">
        <input aria-label="New CRM category name" className="min-w-40 rounded-md border px-2 py-1" disabled={pending} name="name" placeholder="New category" required />
        <button className="rounded-md border px-2 py-1 font-bold" disabled={pending} type="submit">{pending ? "Creating…" : "Create CSV"}</button>
      </form> : null}
    </div>
    {error ? <p className="mt-1 font-semibold text-red-700">{error}</p> : null}
  </div>;
}
