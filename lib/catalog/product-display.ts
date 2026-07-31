export function publicStockCount(available: number) {
  if (!Number.isFinite(available)) return 0;
  return Math.max(0, Math.floor(available));
}

export function publicStockLabel(available: number) {
  return `Stock: ${publicStockCount(available)}`;
}

export function hasPublicPrice(price: number | null): price is number {
  return price !== null && Number.isFinite(price) && price >= 0;
}

export function schemaAvailability(
  available: number,
  incoming: number,
  allowBackorders: boolean,
) {
  if (publicStockCount(available) > 0) return "https://schema.org/InStock";
  if (publicStockCount(incoming) > 0 || allowBackorders) {
    return "https://schema.org/PreOrder";
  }
  return "https://schema.org/OutOfStock";
}
