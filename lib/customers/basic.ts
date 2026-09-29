export type BasicCustomerInput = {
  fullName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string;
  addressLine1: string;
};

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
  const phone = String(input.phone ?? "").trim().slice(0, 50);
  const addressLine1 = String(input.addressLine1 ?? "").trim().slice(0, 500);

  if (!companyName && !fullName) {
    throw new Error("Company name or full name is required.");
  }
  if (!phone) throw new Error("Phone is required.");
  if (!addressLine1) throw new Error("Full address is required.");

  return { fullName, companyName, email, phone, addressLine1 };
}
