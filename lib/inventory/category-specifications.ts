import {
  validateCategorySpecifications,
  type CategoryFieldDefinition,
} from "../catalog/business-category-domain.ts";

export function selectActiveBusinessCategory<
  T extends { id: string; active: boolean },
>(categories: T[], categoryId: string | null | undefined) {
  return (
    categories.find(
      (category) => category.id === categoryId && category.active,
    ) ?? null
  );
}

export function parseStoredSpecifications(
  value: unknown,
): Record<string, unknown> {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value || "{}");
    } catch {
      throw new Error("Specifications must contain valid JSON.");
    }
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Specifications must be a JSON object.");
  }
  return { ...(parsed as Record<string, unknown>) };
}

export function mergeCategorySpecifications(
  fields: CategoryFieldDefinition[],
  submitted: unknown,
  legacy: unknown,
) {
  const legacyObject = parseStoredSpecifications(legacy);
  const schemaKeys = new Set(fields.map((field) => field.field_key));
  const preserved = Object.fromEntries(
    Object.entries(legacyObject).filter(([key]) => !schemaKeys.has(key)),
  );
  return {
    ...preserved,
    ...validateCategorySpecifications(fields, submitted),
  };
}

export function categoryVariationSuggestions(
  fields: CategoryFieldDefinition[],
  specifications: Record<string, unknown>,
) {
  return fields
    .filter(
      (field) =>
        field.is_active &&
        field.use_for_variations &&
        specifications[field.field_key] !== undefined &&
        specifications[field.field_key] !== null &&
        String(specifications[field.field_key]).trim() !== "",
    )
    .map((field) => ({
      name: field.label,
      values: String(specifications[field.field_key]),
      universal: false,
      variation: true,
    }));
}

export function categorySpecificationInput(
  form: FormData,
  fields: CategoryFieldDefinition[],
) {
  return Object.fromEntries(
    fields.map((field) => [
      field.field_key,
      form.get(`category_spec_${field.field_key}`),
    ]),
  );
}

