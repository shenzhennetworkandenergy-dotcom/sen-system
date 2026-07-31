type UnknownRecord = Record<string, unknown>;

export type InquiryProductDisplay = {
  id: string | null;
  name: string;
  sku: string | null;
  slug: string | null;
  modelNumber: string | null;
  price: number | null;
  priceMax: number | null;
  currency: string;
  available: boolean | null;
  variationLabel: string | null;
  shortDescription: string | null;
  confirmedAt: string | null;
  attributes: Array<[string, string]>;
};

export type InquirySearchEventDisplay = {
  sequence: number;
  query: string;
  recordedAt: string | null;
  results: Array<{ id: string | null; name: string }>;
};

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
const text = (value: unknown) => {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
};
const amount = (value: unknown) => {
  const result = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
};

export function normalizeInquirySelectedProducts(value: unknown): InquiryProductDisplay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    const name = text(source?.name);
    if (!source || !name) return [];
    const rawAttributes = record(source.attributes);
    const attributes = rawAttributes
      ? Object.entries(rawAttributes).flatMap(([key, itemValue]) => {
          const displayValue = text(itemValue);
          return displayValue ? [[key, displayValue] as [string, string]] : [];
        })
      : [];
    return [{
      id: text(source.id),
      name,
      sku: text(source.sku),
      slug: text(source.slug),
      modelNumber: text(source.modelNumber),
      price: amount(source.price),
      priceMax: amount(source.priceMax),
      currency: text(source.currency) ?? "BDT",
      available: typeof source.available === "boolean" ? source.available : null,
      variationLabel: text(source.variationLabel),
      shortDescription: text(source.shortDescription),
      confirmedAt: text(source.confirmedAt),
      attributes,
    }];
  });
}

export function normalizeInquirySearchHistory(value: unknown): InquirySearchEventDisplay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const source = record(item);
    const query = text(source?.query);
    if (!source || !query) return [];
    const results = Array.isArray(source.results)
      ? source.results.flatMap((result) => {
          const resultRecord = record(result);
          const name = text(resultRecord?.name);
          return resultRecord && name
            ? [{ id: text(resultRecord.id), name }]
            : [];
        })
      : [];
    return [{
      sequence: Number.isInteger(source.sequence) ? Number(source.sequence) : index,
      query,
      recordedAt: text(source.recordedAt),
      results,
    }];
  }).sort((left, right) => left.sequence - right.sequence);
}
