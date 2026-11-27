export type EpsProductSelection = { quantity: number; variationId: string | null };

export type EpsShippingAddress = {
  id: string;
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  postal_code: string | null;
  country_code: string;
  is_default_shipping: boolean;
};

export function readEpsProductSelection(quantity: unknown, variation: unknown): EpsProductSelection | null {
  if (typeof quantity !== "string" || !/^[1-9][0-9]?$/.test(quantity)) return null;
  if (variation !== null && variation !== "" && (
    typeof variation !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(variation)
  )) return null;
  return { quantity: Number(quantity), variationId: variation ? String(variation).toLowerCase() : null };
}

export function epsProductResumePath(slug: string, selection: EpsProductSelection) {
  const params = new URLSearchParams({ buy: "1", qty: String(selection.quantity) });
  if (selection.variationId) params.set("variation", selection.variationId);
  return `/products/${encodeURIComponent(slug)}?${params}#purchase`;
}

export function safeEpsProductResume(value: unknown) {
  if (typeof value !== "string" || value.length > 512) return null;
  const match = /^\/products\/([a-z0-9_-]+)\?([^#]+)(?:#purchase)?$/i.exec(value);
  if (!match) return null;
  const query = new URLSearchParams(match[2]);
  if (query.get("buy") !== "1") return null;
  const selection = readEpsProductSelection(query.get("qty"), query.get("variation"));
  return selection ? epsProductResumePath(match[1], selection) : null;
}

export function epsProductTotal(unitPrice: number | null, quantity: number) {
  const price = /^(\d{1,12})(?:\.(\d{1,4}))?$/.exec(String(unitPrice));
  if (!price || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
  const fraction = (price[2] ?? "").padEnd(3, "0");
  const cents = Number(price[1]) * 100 + Number(fraction.slice(0, 2)) + Number(Number(fraction[2]) >= 5);
  const total = cents * quantity;
  if (total <= 0 || total > 99_999_999_999_999) return null;
  return (total / 100).toFixed(2);
}
