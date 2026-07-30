export type SaleDiscountType = "percentage" | "fixed";

export type NormalizedSaleLineEdit = {
  id: string;
  quantity: number;
  unitPrice: number;
  discountType: SaleDiscountType;
  discountValue: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function numeric(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid number.`);
  return parsed;
}

export function normalizeSaleLineEdit(
  input: Record<string, unknown>,
): NormalizedSaleLineEdit {
  const id = String(input.id ?? "").trim();
  if (!UUID.test(id)) throw new Error("Sale item is invalid.");

  const quantity = numeric(input.quantity, "Quantity");
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be a whole number of at least 1.");
  }

  const unitPrice = cents(numeric(input.unit_price, "Unit price"));
  if (unitPrice < 0) throw new Error("Unit price cannot be negative.");

  const discountType = String(input.discount_type ?? "") as SaleDiscountType;
  if (!["percentage", "fixed"].includes(discountType)) {
    throw new Error("Discount type must be percentage or fixed.");
  }
  const discountValue = cents(numeric(input.discount_value, "Discount"));
  if (discountValue < 0) throw new Error("Discount cannot be negative.");
  if (discountType === "percentage" && discountValue > 100) {
    throw new Error("Percentage discount cannot exceed 100.");
  }

  calculateEditedLine({ quantity, unitPrice, discountType, discountValue });
  return { id, quantity, unitPrice, discountType, discountValue };
}

export function calculateEditedLine({
  quantity,
  unitPrice,
  discountType,
  discountValue,
}: Omit<NormalizedSaleLineEdit, "id">) {
  const subtotal = cents(quantity * unitPrice);
  const discount = cents(
    discountType === "percentage"
      ? subtotal * (discountValue / 100)
      : discountValue,
  );
  if (discount > subtotal) {
    throw new Error("Fixed discount cannot exceed the line subtotal.");
  }
  return { subtotal, discount, total: cents(subtotal - discount) };
}

export function validateFulfilmentFloor(
  quantity: number,
  fulfilment: {
    status: string;
    allocated: number;
    packed: number;
    shipped: number;
    delivered: number;
  },
) {
  if (["delivered", "cancelled"].includes(fulfilment.status)) {
    throw new Error(`A ${fulfilment.status} sale cannot be edited.`);
  }
  const floor = Math.max(
    fulfilment.allocated,
    fulfilment.packed,
    fulfilment.shipped,
    fulfilment.delivered,
  );
  if (quantity < floor) {
    throw new Error(`Quantity cannot be reduced below ${floor} fulfilled units.`);
  }
}

export function calculateEditedSaleTotal({
  lineTotals,
  orderDiscount,
  shipping,
  service,
  tax,
}: {
  lineTotals: number[];
  orderDiscount: number;
  shipping: number;
  service: number;
  tax: number;
}) {
  const subtotal = cents(lineTotals.reduce((sum, value) => sum + value, 0));
  const total = cents(subtotal - orderDiscount + shipping + service + tax);
  if (total < 0) throw new Error("Sale total cannot be negative.");
  return { subtotal, total };
}
