type PriceFields = {
  sale_price: number | string | null;
  regular_price: number | string | null;
};

export type WarehouseStockBalance = {
  product_id: string;
  variation_id: string | null;
  on_hand: number | string;
  available: number | string;
  products: PriceFields & { name: string; sku: string; currency: string };
  product_variations: (PriceFields & { sku: string; combination_key: string }) | null;
};

const scale = 10_000;

export function summarizeWarehouseStock(balances: WarehouseStockBalance[]) {
  const lines = new Map<string, {
    id: string;
    name: string;
    sku: string;
    variation: string | null;
    currency: string;
    onHandUnits: number;
    availableUnits: number;
    unitPrice: number | null;
  }>();

  for (const balance of balances) {
    const quantity = Math.round(Number(balance.on_hand) * scale);
    if (quantity <= 0) continue;
    const id = balance.variation_id ?? balance.product_id;
    const product = balance.products;
    const variation = balance.product_variations;
    const price = variation?.sale_price ?? variation?.regular_price ?? product.sale_price ?? product.regular_price;
    const line = lines.get(id) ?? {
      id,
      name: product.name,
      sku: variation?.sku ?? product.sku,
      variation: variation?.combination_key ?? null,
      currency: product.currency.trim().toUpperCase(),
      onHandUnits: 0,
      availableUnits: 0,
      unitPrice: price === null ? null : Number(price),
    };
    line.onHandUnits += quantity;
    line.availableUnits += Math.round(Number(balance.available) * scale);
    lines.set(id, line);
  }

  let onHandUnits = 0;
  let availableUnits = 0;
  let unpriced = 0;
  const totals = new Map<string, number>();
  const rows = [...lines.values()].map((line) => {
    const valueUnits = line.unitPrice === null ? null : Math.round(line.onHandUnits * line.unitPrice);
    onHandUnits += line.onHandUnits;
    availableUnits += line.availableUnits;
    if (valueUnits === null) {
      unpriced += 1;
    } else {
      totals.set(line.currency, (totals.get(line.currency) ?? 0) + valueUnits);
    }
    return {
      id: line.id, name: line.name, sku: line.sku, variation: line.variation,
      currency: line.currency, unitPrice: line.unitPrice,
      onHand: line.onHandUnits / scale,
      available: line.availableUnits / scale,
      stockValue: valueUnits === null ? null : valueUnits / scale,
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.sku.localeCompare(right.sku));

  return {
    rows,
    onHand: onHandUnits / scale,
    available: availableUnits / scale,
    unpriced,
    totals: [...totals].sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, units]) => ({ currency, amount: units / scale })),
  };
}

export type WarehouseStockReport = ReturnType<typeof summarizeWarehouseStock>;

export type WarehouseReportWarehouse = {
  id: string;
  code: string;
  name: string;
  in_charge_name: string | null;
  is_active: boolean;
};
