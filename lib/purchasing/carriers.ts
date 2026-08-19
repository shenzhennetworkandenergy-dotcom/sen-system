export type PurchaseCarrierStatus = "active" | "inactive";

export type PurchaseCarrierInput = {
  name: string;
  phone_number: string;
  address: string;
  description: string | null;
  status: PurchaseCarrierStatus;
};

function required(form: FormData, key: string, maxLength: number) {
  const value = String(form.get(key) ?? "").trim().slice(0, maxLength);
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`);
  return value;
}

export function normalizePurchaseCarrier(form: FormData): PurchaseCarrierInput {
  const status = String(form.get("status") ?? "active");
  if (status !== "active" && status !== "inactive") {
    throw new Error("Carrier status is invalid.");
  }

  return {
    name: required(form, "name", 200),
    phone_number: required(form, "phone_number", 60),
    address: required(form, "address", 500),
    description: String(form.get("description") ?? "").trim().slice(0, 1000) || null,
    status,
  };
}
