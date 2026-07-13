export type CountryOption = { code: string; name: string };

export const defaultCountry: CountryOption = { code: "BD", name: "Bangladesh" };

export const countries = [
  defaultCountry,
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
] as const satisfies readonly CountryOption[];

export function getCountryByCode(code: string | null | undefined): CountryOption | null {
  if (!code) return null;
  return countries.find((country) => country.code === code.toUpperCase()) ?? null;
}
