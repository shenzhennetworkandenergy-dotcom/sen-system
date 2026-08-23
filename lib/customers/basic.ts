export type BasicCustomerInput = {
  fullName: string;
  companyName: string | null;
  email: string;
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
  const fullName = String(input.fullName ?? "").trim().slice(0, 200);
  const companyName =
    String(input.companyName ?? "").trim().slice(0, 200) || null;
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 320);
  const phone = String(input.phone ?? "").trim().slice(0, 50);
  const addressLine1 = String(input.addressLine1 ?? "").trim().slice(0, 500);

  if (!fullName || !email || !phone || !addressLine1) {
    throw new Error("Name, email, phone and address are required.");
  }

  return { fullName, companyName, email, phone, addressLine1 };
}
