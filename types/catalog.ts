import type { getPublicProducts } from "@/lib/catalog/products";

export type AwaitedReturn = Awaited<ReturnType<typeof getPublicProducts>>[number];
