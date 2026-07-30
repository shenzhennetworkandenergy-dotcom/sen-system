"use client";

import type { BusinessCategory } from "@/types/category";

const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

export function CategorySpecificationFields({
  category,
  values,
}: {
  category: BusinessCategory | null;
  values: Record<string, unknown>;
}) {
  if (!category) return null;

  return (
    <section
      className="rounded-xl border bg-[var(--surface)] p-6"
      style={{ borderTopColor: category.themeColor, borderTopWidth: 4 }}
    >
      <p
        className="text-xs font-bold uppercase tracking-[0.14em]"
        style={{ color: category.themeColor }}
      >
        {category.name}
      </p>
      <h2 className="mt-1 text-xl font-semibold">
        Category-specific specifications
      </h2>
      <p className="mt-1 text-sm text-[var(--muted-text)]">
        Only fields configured for this business category are displayed.
      </p>
      {category.fields.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {category.fields.map((field) => {
            const name = `category_spec_${field.field_key}`;
            const label = (
              <>
                {field.label}
                {field.unit ? ` (${field.unit})` : ""}
                {field.is_required ? (
                  <span className="ml-1 text-red-600">*</span>
                ) : null}
              </>
            );
            const help = field.help_text ? (
              <span className="mt-1 block text-xs text-[var(--muted-text)]">
                {field.help_text}
              </span>
            ) : null;

            if (field.field_type === "textarea") {
              return (
                <label key={field.field_key} className="font-medium md:col-span-2">
                  {label}
                  <textarea
                    name={name}
                    required={field.is_required}
                    defaultValue={String(values[field.field_key] ?? "")}
                    placeholder={field.placeholder ?? undefined}
                    rows={4}
                    className={input}
                  />
                  {help}
                </label>
              );
            }
            if (field.field_type === "select") {
              return (
                <label key={field.field_key} className="font-medium">
                  {label}
                  <select
                    name={name}
                    required={field.is_required}
                    defaultValue={String(values[field.field_key] ?? "")}
                    className={input}
                  >
                    <option value="">Choose {field.label.toLowerCase()}</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {help}
                </label>
              );
            }
            if (field.field_type === "boolean") {
              return (
                <label key={field.field_key} className="font-medium">
                  {label}
                  <select
                    name={name}
                    required={field.is_required}
                    defaultValue={String(values[field.field_key] ?? "")}
                    className={input}
                  >
                    <option value="">Not specified</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                  {help}
                </label>
              );
            }
            return (
              <label key={field.field_key} className="font-medium">
                {label}
                <input
                  name={name}
                  type={field.field_type === "number" ? "number" : "text"}
                  step={field.field_type === "number" ? "any" : undefined}
                  required={field.is_required}
                  defaultValue={String(values[field.field_key] ?? "")}
                  placeholder={field.placeholder ?? undefined}
                  className={input}
                />
                {help}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-[var(--muted-text)]">
          This category currently uses the standard product fields only.
        </p>
      )}
    </section>
  );
}

