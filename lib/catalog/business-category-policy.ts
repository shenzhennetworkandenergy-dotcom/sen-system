import {
  normalizeFieldDefinitions,
  normalizeThemeColor,
} from "./business-category-domain.ts";

function requiredText(form: FormData, key: string, maximum: number) {
  const value = String(form.get(key) ?? "").trim();
  if (!value || value.length > maximum) {
    throw new Error(`${key.replaceAll("_", " ")} is required and must be under ${maximum} characters.`);
  }
  return value;
}

function optionalText(form: FormData, key: string, maximum: number) {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > maximum) {
    throw new Error(`${key.replaceAll("_", " ")} must be under ${maximum} characters.`);
  }
  return value || null;
}

function categorySlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function parseBusinessCategoryForm(form: FormData) {
  const name = requiredText(form, "name", 120);
  const slug = categorySlug(String(form.get("slug") ?? "") || name);
  if (!slug) throw new Error("Category slug is invalid.");
  const rawSortOrder = String(form.get("sort_order") ?? "0").trim();
  const sortOrder = Number.parseInt(rawSortOrder, 10);
  if (
    !/^-?\d+$/.test(rawSortOrder) ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 100000
  ) {
    throw new Error("Display order must be a whole number from 0 to 100000.");
  }

  let submittedFields: unknown;
  try {
    submittedFields = JSON.parse(String(form.get("fields_json") ?? "[]"));
  } catch {
    throw new Error("Business-category fields are invalid.");
  }

  return {
    category: {
      name,
      slug,
      description: optionalText(form, "description", 1000),
      tagline: optionalText(form, "tagline", 240),
      theme_color: normalizeThemeColor(form.get("theme_color")),
      icon: optionalText(form, "icon", 12),
      image_path: optionalText(form, "image_path", 500),
      is_active:
        form.get("is_active") === "on" || form.get("is_active") === "true",
      sort_order: sortOrder,
    },
    fields: normalizeFieldDefinitions(submittedFields),
  };
}

type DeletionCounts = {
  productCount: number;
  productCategoryCount: number;
};

export function resolveBusinessCategoryDeletion(
  mode: "archive" | "permanent",
  counts: DeletionCounts,
):
  | { operation: "archive" | "permanent" }
  | { operation: "reject"; message: string } {
  if (mode === "archive") return { operation: "archive" };
  if (!counts.productCount && !counts.productCategoryCount) {
    return { operation: "permanent" };
  }
  const productLabel = counts.productCount === 1 ? "product" : "products";
  const categoryLabel =
    counts.productCategoryCount === 1 ? "product category" : "product categories";
  return {
    operation: "reject",
    message: `This business category is used by ${counts.productCount} ${productLabel} and ${counts.productCategoryCount} ${categoryLabel}. Reassign them before permanent deletion.`,
  };
}

