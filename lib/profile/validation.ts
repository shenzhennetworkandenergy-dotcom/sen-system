export const profileGenderValues = [
  "female",
  "male",
  "non_binary",
  "prefer_not_to_say",
] as const;

type ProfileGender = (typeof profileGenderValues)[number];

const textLimits = {
  full_name: 160,
  bio: 500,
  pronouns: 60,
  phone: 60,
  alternate_phone: 60,
  address_line: 300,
  city: 120,
  region: 120,
  postal_code: 30,
  country_name: 100,
  company_name: 200,
  job_title: 160,
  department: 160,
  professional_summary: 1000,
  emergency_contact_name: 160,
  emergency_contact_relationship: 100,
  emergency_contact_phone: 60,
} as const;

export type NormalizedProfileInput = Partial<
  Record<keyof typeof textLimits, string | null>
> & {
  date_of_birth?: string | null;
  gender?: ProfileGender | null;
  country_code?: string;
};

function optionalText(value: unknown, limit: number) {
  return String(value ?? "").trim().slice(0, limit) || null;
}

export function normalizeProfileInput(
  input: Record<string, unknown>,
): NormalizedProfileInput {
  const output: NormalizedProfileInput = {};
  for (const [key, limit] of Object.entries(textLimits) as Array<
    [keyof typeof textLimits, number]
  >) {
    if (key in input) output[key] = optionalText(input[key], limit);
  }
  if ("country_code" in input) {
    const countryCode = String(input.country_code ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode))
      throw new Error("Country code must contain two letters.");
    output.country_code = countryCode;
  }
  if ("date_of_birth" in input) {
    const date = String(input.date_of_birth ?? "").trim();
    if (date) {
      const parsed = new Date(`${date}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== date ||
        parsed > new Date()
      ) {
        throw new Error("Enter a valid date of birth.");
      }
    }
    output.date_of_birth = date || null;
  }
  if ("gender" in input) {
    const gender = String(input.gender ?? "").trim();
    if (gender && !profileGenderValues.includes(gender as ProfileGender))
      throw new Error("Choose a valid gender option.");
    output.gender = (gender as ProfileGender) || null;
  }
  return output;
}

export type SocialLinks = Partial<
  Record<"facebook" | "linkedin" | "website" | "whatsapp", string>
>;

export function normalizeSocialLinks(
  input: Record<string, unknown>,
): SocialLinks {
  const output: SocialLinks = {};
  for (const key of ["facebook", "linkedin", "website"] as const) {
    const raw = String(input[key] ?? "").trim().slice(0, 500);
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") output[key] = url.toString();
    } catch {
      // Invalid optional links are ignored rather than stored.
    }
  }
  const whatsapp = String(input.whatsapp ?? "").trim().slice(0, 60);
  if (/^\+?[0-9][0-9\s-]{6,}$/.test(whatsapp))
    output.whatsapp = whatsapp;
  return output;
}
