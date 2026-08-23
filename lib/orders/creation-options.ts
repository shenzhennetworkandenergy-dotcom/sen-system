export type RequiredOrderCreationOptions = {
  customerId: string;
  addressIds: string[];
  lines: Array<{ productId: string; variationId: string | null }>;
};

type Identified = { id: string };
type VariationOption = Identified & { product_id: string };
type AddressOption = Identified & { profile_id: string };
type BalanceOption = {
  product_id: string;
  variation_id: string | null;
  warehouse_id: string;
};

type OrderCreationOptionCollections = {
  customers: Identified[];
  products: Identified[];
  variations: VariationOption[];
  balances: BalanceOption[];
  warehouses: Identified[];
  addresses: AddressOption[];
};

type ExactOrderCreationOptions<T extends OrderCreationOptionCollections> = {
  customers: T["customers"];
  products: T["products"];
  variations: T["variations"];
  balances: T["balances"];
  addresses: T["addresses"];
};

function mergeByKey<T>(
  bounded: T[],
  exact: T[],
  key: (item: T) => string,
) {
  const merged = [...bounded];
  const indexes = new Map(merged.map((item, index) => [key(item), index]));
  for (const item of exact) {
    const itemKey = key(item);
    const index = indexes.get(itemKey);
    if (index === undefined) {
      indexes.set(itemKey, merged.length);
      merged.push(item);
    } else {
      merged[index] = item;
    }
  }
  return merged;
}

export function mergeRequiredOrderCreationOptions<
  T extends OrderCreationOptionCollections,
>(
  bounded: T,
  exact: ExactOrderCreationOptions<T>,
  required?: RequiredOrderCreationOptions,
): T | null {
  if (!required) return bounded;

  const requiredAddressIds = new Set(required.addressIds);
  const requiredProductIds = new Set(required.lines.map((line) => line.productId));
  const requiredVariations = required.lines.filter(
    (line): line is { productId: string; variationId: string } =>
      line.variationId !== null,
  );
  if (!exact.customers.some((customer) => customer.id === required.customerId)) {
    return null;
  }
  if ([...requiredAddressIds].some((addressId) =>
    !exact.addresses.some((address) =>
      address.id === addressId && address.profile_id === required.customerId,
    ))) {
    return null;
  }
  if ([...requiredProductIds].some((productId) =>
    !exact.products.some((product) => product.id === productId))) {
    return null;
  }
  if (requiredVariations.some(({ productId, variationId }) =>
    !exact.variations.some((variation) =>
      variation.id === variationId && variation.product_id === productId,
    ))) {
    return null;
  }

  return {
    ...bounded,
    customers: mergeByKey(bounded.customers, exact.customers, (item) => item.id),
    products: mergeByKey(bounded.products, exact.products, (item) => item.id),
    variations: mergeByKey(bounded.variations, exact.variations, (item) => item.id),
    balances: mergeByKey(
      bounded.balances,
      exact.balances,
      (item) => `${item.product_id}:${item.variation_id ?? ""}:${item.warehouse_id}`,
    ),
    addresses: mergeByKey(bounded.addresses, exact.addresses, (item) => item.id),
  } as T;
}
