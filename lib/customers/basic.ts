export type BasicCustomerInput = {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
};

const bounded = (value: unknown, maximum: number) =>
  String(value ?? "").trim().slice(0, maximum);

export function normalizeBasicCustomerInput(input: {
  fullName: unknown;
  email: unknown;
  phone: unknown;
  addressLine1: unknown;
}): BasicCustomerInput {
  const fullName = bounded(input.fullName, 160);
  const email = bounded(input.email, 254).toLowerCase();
  const phone = bounded(input.phone, 50);
  const addressLine1 = bounded(input.addressLine1, 240);

  if (!fullName) throw new Error("Customer name is required.");
  if (!email) throw new Error("Customer email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Customer email must be valid.");
  }
  if (!phone) throw new Error("Customer phone is required.");
  if (!addressLine1) throw new Error("Customer address is required.");

  return { fullName, email, phone, addressLine1 };
}
