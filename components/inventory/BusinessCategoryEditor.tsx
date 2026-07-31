"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createBusinessCategoryAction,
  updateBusinessCategoryAction,
} from "@/app/admin/categories/business-category-actions";
import type {
  BusinessCategory,
  BusinessCategoryField,
} from "@/types/category";

type EditorField = {
  label: string;
  fieldKey: string;
  fieldType: string;
  placeholder: string;
  helpText: string;
  unit: string;
  options: string;
  required: boolean;
  filterable: boolean;
  useForVariations: boolean;
  active: boolean;
};

const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-950 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

function editorField(field?: BusinessCategoryField): EditorField {
  return {
    label: field?.label ?? "",
    fieldKey: field?.field_key ?? "",
    fieldType: field?.field_type ?? "text",
    placeholder: field?.placeholder ?? "",
    helpText: field?.help_text ?? "",
    unit: field?.unit ?? "",
    options: field?.options?.join(", ") ?? "",
    required: field?.is_required ?? false,
    filterable: field?.is_filterable ?? false,
    useForVariations: field?.use_for_variations ?? false,
    active: field?.is_active ?? true,
  };
}

function SaveButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)] disabled:cursor-wait disabled:opacity-60"
    >
      {pending
        ? "Saving category…"
        : editing
          ? "Save category changes"
          : "Create business category"}
    </button>
  );
}

export function BusinessCategoryEditor({
  category,
}: {
  category?: BusinessCategory;
}) {
  const [color, setColor] = useState(category?.themeColor ?? "#0D6EFD");
  const [fields, setFields] = useState<EditorField[]>(
    category?.fields.map(editorField) ?? [],
  );
  const updateField = (index: number, patch: Partial<EditorField>) =>
    setFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    );
  const moveField = (index: number, offset: number) =>
    setFields((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  const action = category
    ? updateBusinessCategoryAction.bind(null, category.id)
    : createBusinessCategoryAction;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="fields_json" value={JSON.stringify(fields)} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="font-medium">
          Category name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={category?.name}
            placeholder="Example: Clothing"
            className={input}
          />
        </label>
        <label className="font-medium">
          Slug
          <input
            name="slug"
            maxLength={120}
            defaultValue={category?.slug}
            placeholder="Generated from name"
            className={input}
          />
        </label>
        <label className="font-medium">
          Display order
          <input
            name="sort_order"
            type="number"
            min="0"
            max="100000"
            step="1"
            defaultValue={category?.sortOrder ?? 100}
            className={input}
          />
        </label>
        <label className="font-medium">
          Icon or emoji
          <input
            name="icon"
            maxLength={12}
            defaultValue={category?.icon ?? ""}
            placeholder="◆"
            className={input}
          />
        </label>
        <label className="font-medium md:col-span-2">
          Short description
          <textarea
            name="description"
            maxLength={1000}
            rows={3}
            defaultValue={category?.description ?? ""}
            className={input}
          />
        </label>
        <label className="font-medium md:col-span-2">
          Category tagline
          <textarea
            name="tagline"
            maxLength={240}
            rows={3}
            defaultValue={category?.tagline ?? ""}
            className={input}
          />
        </label>
        <label className="font-medium">
          Theme color
          <span className="mt-1 flex gap-2">
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value.toUpperCase())}
              className="h-11 w-14 cursor-pointer rounded-lg border bg-white p-1"
              aria-label="Choose theme color"
            />
            <input
              name="theme_color"
              required
              pattern="#[0-9A-Fa-f]{6}"
              value={color}
              onChange={(event) => setColor(event.target.value.toUpperCase())}
              className="min-w-0 flex-1 rounded-lg border p-2.5 font-mono uppercase"
            />
          </span>
        </label>
        <label className="font-medium xl:col-span-2">
          Optional category image storage path
          <input
            name="image_path"
            maxLength={500}
            defaultValue={category?.imagePath ?? ""}
            placeholder="categories/clothing.webp"
            className={input}
          />
        </label>
        <label className="flex items-end gap-2 rounded-lg border p-3 font-medium">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={category?.active ?? true}
          />
          Active and visible
        </label>
      </div>

      <section className="rounded-xl border bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Category-specific product fields</h3>
            <p className="text-sm text-[var(--muted-text)]">
              These controls appear automatically when this business category is
              selected on the product form.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFields((current) => [...current, editorField()])}
            className="rounded-lg border bg-white px-4 py-2 font-semibold"
          >
            + Add field
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {fields.map((field, index) => (
            <article
              key={`${field.fieldKey}-${index}`}
              className="rounded-xl border bg-white p-4"
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="font-medium">
                  Label
                  <input
                    required
                    value={field.label}
                    onChange={(event) =>
                      updateField(index, { label: event.target.value })
                    }
                    placeholder="Example: Fabric Type"
                    className={input}
                  />
                </label>
                <label className="font-medium">
                  Stable key
                  <input
                    value={field.fieldKey}
                    onChange={(event) =>
                      updateField(index, { fieldKey: event.target.value })
                    }
                    placeholder="Generated from label"
                    className={input}
                  />
                </label>
                <label className="font-medium">
                  Field type
                  <select
                    value={field.fieldType}
                    onChange={(event) =>
                      updateField(index, { fieldType: event.target.value })
                    }
                    className={input}
                  >
                    <option value="text">Text</option>
                    <option value="textarea">Long text</option>
                    <option value="number">Number</option>
                    <option value="select">Selection list</option>
                    <option value="boolean">Yes / no</option>
                  </select>
                </label>
                <label className="font-medium">
                  Unit
                  <input
                    value={field.unit}
                    onChange={(event) =>
                      updateField(index, { unit: event.target.value })
                    }
                    placeholder="GB, V, W, Gbps"
                    className={input}
                  />
                </label>
                {field.fieldType === "select" ? (
                  <label className="font-medium md:col-span-2">
                    Options, comma separated
                    <input
                      required
                      value={field.options}
                      onChange={(event) =>
                        updateField(index, { options: event.target.value })
                      }
                      placeholder="Small, Medium, Large"
                      className={input}
                    />
                  </label>
                ) : null}
                <label className="font-medium">
                  Placeholder
                  <input
                    value={field.placeholder}
                    onChange={(event) =>
                      updateField(index, { placeholder: event.target.value })
                    }
                    className={input}
                  />
                </label>
                <label className="font-medium">
                  Help text
                  <input
                    value={field.helpText}
                    onChange={(event) =>
                      updateField(index, { helpText: event.target.value })
                    }
                    className={input}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      updateField(index, { required: event.target.checked })
                    }
                  />
                  Required
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={field.filterable}
                    onChange={(event) =>
                      updateField(index, { filterable: event.target.checked })
                    }
                  />
                  Filterable
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={field.useForVariations}
                    onChange={(event) =>
                      updateField(index, {
                        useForVariations: event.target.checked,
                      })
                    }
                  />
                  Suggest for variations
                </label>
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveField(index, -1)}
                    disabled={index === 0}
                    className="rounded border px-2 py-1 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(index, 1)}
                    disabled={index === fields.length - 1}
                    className="rounded border px-2 py-1 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFields((current) =>
                        current.filter((_, fieldIndex) => fieldIndex !== index),
                      )
                    }
                    className="rounded border border-red-300 px-2 py-1 font-semibold text-red-700"
                  >
                    Remove
                  </button>
                </span>
              </div>
            </article>
          ))}
          {!fields.length ? (
            <p className="rounded-lg border border-dashed bg-white p-5 text-center text-sm text-[var(--muted-text)]">
              No category-specific fields. Add one whenever this category needs
              its own product specifications.
            </p>
          ) : null}
        </div>
      </section>
      <SaveButton editing={Boolean(category)} />
    </form>
  );
}

