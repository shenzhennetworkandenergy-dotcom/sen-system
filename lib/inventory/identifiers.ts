export function normalizeIdentifier(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
export function automaticSku(brand: string, model: string) {
  const brandKey = normalizeIdentifier(brand), modelKey = normalizeIdentifier(model);
  return brandKey && modelKey ? `SEN-${brandKey}-${modelKey}` : "";
}
