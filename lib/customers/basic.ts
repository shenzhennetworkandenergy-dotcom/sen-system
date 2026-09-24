import type { DuplicateCandidate } from "@/lib/customer-ocr/types";
import type { CustomerSearchOption } from "@/lib/customers/search";

export type BasicCustomerInput = {
  fullName: string;
  companyName: string | null;
  email: string;
  phone: string;
  alternatePhone: string | null;
  addressLine1: string;
  city: string;
  country: string;
  countryCode: string;
};

type RawBasicCustomerInput = {
  fullName: unknown;
  companyName?: unknown;
  email: unknown;
  phone: unknown;
  alternatePhone?: unknown;
  addressLine1: unknown;
  city?: unknown;
  country?: unknown;
  countryCode?: unknown;
};

export type BasicCustomerActionState = {
  status: "idle" | "success" | "error" | "duplicate";
  message: string;
  customer: CustomerSearchOption | null;
  duplicates: DuplicateCandidate[];
};

export const initialBasicCustomerActionState: BasicCustomerActionState = {
  status: "idle",
  message: "",
  customer: null,
  duplicates: [],
};

export function normalizeBasicCustomerInput(
  input: RawBasicCustomerInput,
): BasicCustomerInput {
  const fullName = String(input.fullName ?? "").trim().slice(0, 200);
  const companyName =
    String(input.companyName ?? "").trim().slice(0, 200) || null;
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 320);
  const phone = String(input.phone ?? "").trim().slice(0, 50);
  const alternatePhone =
    String(input.alternatePhone ?? "").trim().slice(0, 50) || null;
  const addressLine1 = String(input.addressLine1 ?? "").trim().slice(0, 500);
  const city =
    String(input.city ?? "").trim().slice(0, 160) || "Not specified";
  const country =
    String(input.country ?? "").trim().slice(0, 100) || "Bangladesh";
  const countryCode =
    String(input.countryCode ?? "").trim().toUpperCase() || "BD";

  if (!fullName || !email || !phone || !addressLine1) {
    throw new Error("Name, email, phone and address are required.");
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("Country code must use two letters.");
  }

  return {
    fullName,
    companyName,
    email,
    phone,
    alternatePhone,
    addressLine1,
    city,
    country,
    countryCode,
  };
}

export function basicCustomerInputFromForm(form: FormData) {
  return normalizeBasicCustomerInput({
    fullName: form.get("full_name"),
    companyName: form.get("company_name"),
    email: form.get("email"),
    phone: form.get("phone"),
    alternatePhone: form.get("alternate_phone"),
    addressLine1: form.get("address_line_1"),
    city: form.get("city"),
    country: form.get("country"),
    countryCode: form.get("country_code"),
  });
}
