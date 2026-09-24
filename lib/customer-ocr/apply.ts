import type { ReviewedBusinessCard } from "./types.ts";

export type CustomerFormValues = {
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  addressLine1: string;
  city: string;
  country: string;
  countryCode: string;
};

export type CustomerFormConflict = {
  field: keyof CustomerFormValues;
  currentValue: string;
  proposedValue: string;
};

const countryCodes = new Map<string, string>([
  ["bangladesh", "BD"],
  ["বাংলাদেশ", "BD"],
  ["china", "CN"],
  ["中国", "CN"],
  ["united states", "US"],
  ["usa", "US"],
  ["united arab emirates", "AE"],
  ["uae", "AE"],
  ["india", "IN"],
]);

export function countryCodeForReview(country: string) {
  return countryCodes.get(country.normalize("NFKC").trim().toLocaleLowerCase()) ?? "";
}

export function applyReviewedBusinessCard(
  current: CustomerFormValues,
  reviewed: ReviewedBusinessCard,
  options: { overwriteConflicts?: boolean } = {},
) {
  const countryCode = countryCodeForReview(reviewed.country.value);
  const proposed: Partial<CustomerFormValues> = {
    fullName: reviewed.contactName.value,
    companyName: reviewed.companyName.value,
    email: reviewed.emailAddress.value,
    phone: reviewed.mobileNumber.value,
    alternatePhone: reviewed.alternatePhone.value,
    addressLine1: reviewed.fullAddress.value,
    city: reviewed.city.value,
    country: reviewed.country.value,
    ...(countryCode ? { countryCode } : {}),
  };
  const values = { ...current };
  const conflicts: CustomerFormConflict[] = [];

  for (const [field, rawValue] of Object.entries(proposed) as Array<
    [keyof CustomerFormValues, string]
  >) {
    const proposedValue = rawValue.trim();
    if (!proposedValue) continue;
    const currentValue = current[field].trim();
    if (
      currentValue &&
      currentValue !== proposedValue &&
      !options.overwriteConflicts
    ) {
      conflicts.push({ field, currentValue, proposedValue });
      continue;
    }
    values[field] = proposedValue;
  }

  return { values, conflicts };
}
