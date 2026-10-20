import { normalizeProfileInput } from "../profile/validation.ts";

export const customerEditFields = [
  "full_name", "company_name", "customer_type", "phone", "alternate_phone",
  "country", "address_line", "city", "region", "postal_code",
] as const;

export const customerAddressEditFields = [
  "recipient_name", "phone", "alternate_phone", "address_line_1", "address_line_2",
  "area", "city", "region", "postal_code", "country_code", "delivery_instructions", "map_label",
] as const;

type CustomerEditField = (typeof customerEditFields)[number];

export function normalizeCustomerEdit(input: Record<string, unknown>, options: { allowEmptyPhone?: boolean } = {}) {
  const checked = normalizeProfileInput(Object.fromEntries(
    ["full_name", "company_name", "phone", "alternate_phone", "address_line", "city", "region", "postal_code"]
      .map((key) => [key, input[key]]),
  ));
  const country = String(input.country ?? "").trim();
  if (country.length > 100) throw new Error("Country must be 100 characters or fewer.");
  const customerType = String(input.customer_type ?? "").trim();
  if (customerType && customerType !== "individual" && customerType !== "company") throw new Error("Choose Individual or Company.");
  if (!checked.full_name && !checked.company_name) throw new Error("Enter a full name or company name.");
  if (!checked.phone && !options.allowEmptyPhone) throw new Error("Enter a phone number.");
  return { ...checked, customer_type: customerType || null, country: country || null };
}

export function changedCustomerFields(current: Record<string, unknown>, next: ReturnType<typeof normalizeCustomerEdit>) {
  const patch: Record<string, string | null> = {};
  for (const field of customerEditFields) {
    const existing = field === "country"
      ? current.country ?? current.country_name ?? current.country_code ?? null
      : current[field] ?? null;
    const value = next[field] ?? null;
    if (existing !== value) patch[field] = value;
  }
  return patch;
}

export function changedCustomerAddressFields(
  current: Record<string, unknown>,
  next: Partial<Record<(typeof customerAddressEditFields)[number], string | null>>,
) {
  const patch: Record<string, string | null> = {};
  for (const field of customerAddressEditFields) {
    const value = next[field] ?? null;
    if ((current[field] ?? null) !== value) patch[field] = value;
  }
  return patch;
}

export function rejectUnexpectedCustomerFields(keys: Iterable<string>, allowed: readonly string[]) {
  const expected = new Set(allowed);
  for (const key of keys) {
    if (!key.startsWith("$ACTION_") && !expected.has(key)) throw new Error("This form contains an unsupported field.");
  }
}
