import { BusinessCategoryEditor } from "@/components/inventory/BusinessCategoryEditor";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { requirePermission } from "@/lib/auth/permissions";
import { getBusinessCategories } from "@/lib/catalog/business-categories";
import { categoryStyle } from "@/lib/catalog/themes";
import { deletionActionCopy } from "@/lib/deletion/policy";
import { getDeletionMode } from "@/lib/deletion/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { createCategoryAction } from "../catalog-actions";
import {
  deleteBusinessCategoryAction,
  moveBusinessCategoryAction,
  toggleBusinessCategoryAction,
} from "./business-category-actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { profile, permissions } = await requirePermission("products.view");
  const db = createSupabaseAdminClient();
  const [{ data: productCategories }, businessCategories, message, mode] =
    await Promise.all([
      db
        .from("product_categories")
        .select(
          "id,name,slug,sen_business_category,parent_id,is_active,sort_order",
        )
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      getBusinessCategories({
        includeInactive: true,
        includeFields: true,
        withProductCounts: true,
      }),
      searchParams,
      getDeletionMode(),
    ]);
  const canCreate =
    profile.role === "admin" || permissions.has("products.create");
  const canEdit = profile.role === "admin" || permissions.has("products.edit");

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={
        profile.role === "employee" ? permissions : undefined
      }
      title="Product Categories"
      subtitle="Manage business domains, visual themes, dynamic product fields and hierarchical product classifications."
    >
      {message.success || message.error ? (
        <p
          className={`mb-4 rounded border p-3 ${
            message.error
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-green-200 bg-green-50 text-green-900"
          }`}
        >
          {message.error ?? message.success}
        </p>
      ) : null}

      <section className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
              Database-driven
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              Business Categories
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted-text)]">
              Every active category appears automatically on the homepage and
              product catalogue. Its color and field schema follow it
              throughout the system.
            </p>
          </div>
          <span className="rounded-full border bg-slate-50 px-3 py-1 text-sm font-semibold">
            {businessCategories.length} categories
          </span>
        </div>

        {canCreate ? (
          <details className="mt-5 rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">
              + Create a business category
            </summary>
            <div className="mt-5">
              <BusinessCategoryEditor />
            </div>
          </details>
        ) : null}

        <div className="mt-5 space-y-4">
          {businessCategories.map((category, index) => (
            <article
              key={category.id}
              className="overflow-hidden rounded-xl border"
              style={categoryStyle(category)}
            >
              <div className="flex flex-wrap items-center gap-4 border-l-4 border-l-[var(--category-color)] bg-white p-4">
                <span
                  className="grid h-12 w-12 place-items-center rounded-xl text-xl font-bold"
                  style={{
                    background: "var(--category-color)",
                    color: "var(--category-foreground)",
                  }}
                  aria-hidden="true"
                >
                  {category.icon ?? "◆"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{category.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        category.active
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {category.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--muted-text)]">
                    /{category.slug} · {category.productCount} public products ·{" "}
                    {category.fields.length} dynamic fields ·{" "}
                    {category.themeColor}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <form
                      action={moveBusinessCategoryAction.bind(
                        null,
                        category.id,
                        "up",
                      )}
                    >
                      <button
                        disabled={index === 0}
                        className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                        aria-label={`Move ${category.name} up`}
                      >
                        ↑
                      </button>
                    </form>
                    <form
                      action={moveBusinessCategoryAction.bind(
                        null,
                        category.id,
                        "down",
                      )}
                    >
                      <button
                        disabled={index === businessCategories.length - 1}
                        className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                        aria-label={`Move ${category.name} down`}
                      >
                        ↓
                      </button>
                    </form>
                    <form
                      action={toggleBusinessCategoryAction.bind(
                        null,
                        category.id,
                        !category.active,
                      )}
                    >
                      <button className="rounded-lg border px-3 py-2 text-sm font-semibold">
                        {category.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                    {profile.role === "admin" ? (
                      <form
                        action={deleteBusinessCategoryAction.bind(
                          null,
                          category.id,
                        )}
                      >
                        <ConfirmSubmitButton
                          confirmation={`${deletionActionCopy(mode.permanentEnabled).confirmation} Business category: ${category.name}`}
                          className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
                        >
                          {deletionActionCopy(mode.permanentEnabled).button}
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <details className="border-t bg-slate-50 p-4">
                  <summary className="cursor-pointer font-semibold">
                    Edit category and product fields
                  </summary>
                  <div className="mt-5">
                    <BusinessCategoryEditor category={category} />
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Product Classifications</h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Optional parent/child classifications inside a business category,
          such as Networking → Servers.
        </p>
        {canCreate ? (
          <form
            action={createCategoryAction}
            className="mt-5 grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4"
          >
            <label>
              Name
              <input
                name="name"
                required
                className="mt-1 w-full rounded border bg-white p-2"
              />
            </label>
            <label>
              Slug
              <input
                name="slug"
                className="mt-1 w-full rounded border bg-white p-2"
              />
            </label>
            <label>
              Parent
              <select
                name="parent_id"
                className="mt-1 w-full rounded border bg-white p-2"
              >
                <option value="">Top level</option>
                {(productCategories ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Business category
              <select
                name="business_category_id"
                className="mt-1 w-full rounded border bg-white p-2"
              >
                {businessCategories
                  .filter((category) => category.active)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="rounded-lg border bg-white px-4 py-2 font-semibold">
              Add product classification
            </button>
          </form>
        ) : null}
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(productCategories ?? []).map((category) => (
            <article
              key={category.id}
              className="rounded-xl border bg-white p-4"
            >
              <h3 className="font-semibold">{category.name}</h3>
              <p className="text-sm text-[var(--muted-text)]">
                {category.sen_business_category} · {category.slug}
              </p>
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
