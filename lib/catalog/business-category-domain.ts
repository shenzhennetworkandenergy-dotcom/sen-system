export const categoryFieldTypes = [
  "text",
  "textarea",
  "number",
  "select",
  "boolean",
] as const;

export type CategoryFieldType = (typeof categoryFieldTypes)[number];

export type CategoryFieldDefinition = {
  field_key: string;
  label: string;
  field_type: CategoryFieldType;
  placeholder: string | null;
  help_text: string | null;
  unit: string | null;
  options: string[];
  is_required: boolean;
  is_filterable: boolean;
  use_for_variations: boolean;
  is_active: boolean;
  sort_order: number;
};

type SubmittedFieldDefinition = {
  fieldKey?: unknown;
  label?: unknown;
  fieldType?: unknown;
  placeholder?: unknown;
  helpText?: unknown;
  unit?: unknown;
  options?: unknown;
  required?: unknown;
  filterable?: unknown;
  useForVariations?: unknown;
  active?: unknown;
};

function limitedText(value: unknown, maximum: number) {
  const text = String(value ?? "").trim();
  if (text.length > maximum) {
    throw new Error(`Category field text must be under ${maximum} characters.`);
  }
  return text || null;
}

function fieldKey(value: unknown, label: string) {
  const source = String(value ?? "").trim() || label;
  const key = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  if (!key) throw new Error("Every category field needs a valid key.");
  return key;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "on" || value === 1;
}

export function normalizeThemeColor(value: unknown) {
  const color = String(value ?? "").trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) {
    throw new Error("Theme color must be a six-digit hexadecimal value such as #0D6EFD.");
  }
  return color;
}

function channelLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  const normalized = normalizeThemeColor(color);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

function contrastRatio(first: number, second: number) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastColor(color: string): "#ffffff" | "#10152f" {
  const background = luminance(color);
  const whiteContrast = contrastRatio(background, 1);
  const inkContrast = contrastRatio(background, luminance("#10152F"));
  return whiteContrast >= inkContrast ? "#ffffff" : "#10152f";
}

function normalizedOptions(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [
    ...new Set(
      source
        .map((option) => String(option).trim().slice(0, 120))
        .filter(Boolean),
    ),
  ].slice(0, 100);
}

export function normalizeFieldDefinitions(
  input: unknown,
): CategoryFieldDefinition[] {
  if (!Array.isArray(input) || input.length > 40) {
    throw new Error("A business category can contain up to 40 fields.");
  }
  const keys = new Set<string>();
  return input
    .map((entry, index) => {
      const row = (entry ?? {}) as SubmittedFieldDefinition;
      const label = String(row.label ?? "").trim().slice(0, 120);
      if (!label) throw new Error("Every category field needs a label.");
      const key = fieldKey(row.fieldKey, label);
      if (keys.has(key)) {
        throw new Error("Category field keys must be unique.");
      }
      keys.add(key);
      const type = String(row.fieldType ?? "text") as CategoryFieldType;
      if (!categoryFieldTypes.includes(type)) {
        throw new Error(`${label} has an invalid field type.`);
      }
      const options = normalizedOptions(row.options);
      if (type === "select" && !options.length) {
        throw new Error(`${label} needs at least one option.`);
      }
      return {
        field_key: key,
        label,
        field_type: type,
        placeholder: limitedText(row.placeholder, 200),
        help_text: limitedText(row.helpText, 500),
        unit: limitedText(row.unit, 40),
        options: type === "select" ? options : [],
        is_required: booleanValue(row.required),
        is_filterable: booleanValue(row.filterable),
        use_for_variations: booleanValue(row.useForVariations),
        is_active: row.active === undefined ? true : booleanValue(row.active),
        sort_order: index,
      };
    })
    .filter((row) => row.is_active);
}

export function validateCategorySpecifications(
  fields: CategoryFieldDefinition[],
  input: unknown,
) {
  const submitted =
    input && !Array.isArray(input) && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const result: Record<string, string | number | boolean> = {};

  for (const field of fields.filter((candidate) => candidate.is_active)) {
    const raw = submitted[field.field_key];
    const isEmpty = raw === null || raw === undefined || String(raw).trim() === "";
    if (isEmpty) {
      if (field.is_required) throw new Error(`${field.label} is required.`);
      continue;
    }

    if (field.field_type === "number") {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`${field.label} must be a number.`);
      }
      result[field.field_key] = value;
      continue;
    }

    if (field.field_type === "boolean") {
      if (![true, false, "true", "false", "on", "off", "1", "0", 1, 0].includes(raw as never)) {
        throw new Error(`${field.label} must be yes or no.`);
      }
      result[field.field_key] = [true, "true", "on", "1", 1].includes(raw as never);
      continue;
    }

    const value = String(raw).trim();
    if (value.length > 5000) throw new Error(`${field.label} is too long.`);
    if (field.field_type === "select" && !field.options.includes(value)) {
      throw new Error(`Choose a valid ${field.label} option.`);
    }
    result[field.field_key] = value;
  }

  return result;
}

