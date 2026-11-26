import { normalizeRecipient } from "../whatsapp/messages.ts";

export type BasicCustomerInput = {
  fullName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string;
  addressLine1: string;
};

export function normalizeCustomerPhone(value: string) {
  const phone = value.trim()
    .replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .replaceAll(".", "");
  const stripped = phone.replace(/[\s()-]/g, "");
  if (phone.length > 60 || !/^(?:\+\d+|00\d+|01[3-9]\d{8}|8801[3-9]\d{8})$/.test(stripped)) {
    throw new Error("Enter a Bangladesh mobile number or an international number with country code, such as +880 or +86.");
  }
  return "+" + normalizeRecipient(phone);
}

type RawBasicCustomerInput = {
  fullName: unknown;
  companyName?: unknown;
  email: unknown;
  phone: unknown;
  addressLine1: unknown;
};

export function normalizeBasicCustomerInput(
  input: RawBasicCustomerInput,
): BasicCustomerInput {
  const fullName = String(input.fullName ?? "").trim().slice(0, 200) || null;
  const companyName =
    String(input.companyName ?? "").trim().slice(0, 200) || null;
  const email =
    String(input.email ?? "").trim().toLowerCase().slice(0, 320) || null;
  const rawPhone = String(input.phone ?? "").trim();
  const addressLine1 = String(input.addressLine1 ?? "").trim().slice(0, 500);

  if (!companyName && !fullName) {
    throw new Error("Company name or full name is required.");
  }
  if (!rawPhone) throw new Error("Phone is required.");
  const phone = normalizeCustomerPhone(rawPhone);
  if (!addressLine1) throw new Error("Full address is required.");

  return { fullName, companyName, email, phone, addressLine1 };
}
