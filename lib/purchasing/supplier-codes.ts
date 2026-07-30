export function categoryCodeSegment(name: string) {
  const cleaned = [...name.normalize("NFKD")]
    .filter((character) => /[\p{L}\p{N}]/u.test(character))
    .join("")
    .toUpperCase();
  if (!cleaned) throw new Error("A category name must contain at least one letter or number.");
  return [...cleaned].slice(0, 4).join("");
}

export function supplierCodePrefix(categoryPath: string[]) {
  if (!categoryPath.length) throw new Error("Select a supplier category before generating a code.");
  return categoryPath.map(categoryCodeSegment).join("-");
}

export function supplierCodePreview(categoryPath: string[], suffix?: number) {
  let resolvedSuffix = suffix;
  if (resolvedSuffix === undefined) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    resolvedSuffix = values[0] % 100000;
  }
  if (!Number.isInteger(resolvedSuffix) || resolvedSuffix < 0 || resolvedSuffix > 99999) {
    throw new Error("Supplier code suffix must be a five-digit numeric value.");
  }
  return `${supplierCodePrefix(categoryPath)}-${String(resolvedSuffix).padStart(5, "0")}`;
}
