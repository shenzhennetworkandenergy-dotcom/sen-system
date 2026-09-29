import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/permissions";
import {
  escapeInventoryIlikePattern,
  INVENTORY_PRODUCT_SEARCH_FIELDS,
  INVENTORY_PRODUCT_SEARCH_LIMIT,
  INVENTORY_PRODUCT_SEARCH_MIN_LENGTH,
  mergeInventorySearchResults,
  normalizeInventorySearchQuery,
  type InventoryProductSearchResult,
  type InventoryVariationSearchResult,
} from "@/lib/inventory/product-search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const scopePermissions = {
  "serial-generate": "serials.generate",
  "serial-list": "serials.view",
  adjust: "inventory.adjust_stock",
  transfer: "inventory.transfer",
} as const;

type SearchScope = keyof typeof scopePermissions;

const productSelection = "id,name,sku,model_number,serial_tracking_required";
const variationSelection = "id,product_id,sku,combination_key";
const variationSearchFields = ["sku", "combination_key", "barcode"] as const;

function isSearchScope(value: string): value is SearchScope {
  return value in scopePermissions;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function searchProducts(scope: SearchScope, query: string) {
  const db = createSupabaseAdminClient();
  const pattern = `%${escapeInventoryIlikePattern(query)}%`;
  const results = await Promise.all(
    INVENTORY_PRODUCT_SEARCH_FIELDS.map(async (field) => {
      let request = db
        .from("products")
        .select(productSelection)
        .neq("status", "archived")
        .ilike(field, pattern)
        .order("name")
        .limit(INVENTORY_PRODUCT_SEARCH_LIMIT);
      if (scope === "serial-generate") {
        request = request.eq("serial_tracking_required", true);
      }
      const result = await request;
      return result;
    }),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
  return mergeInventorySearchResults(
    results.flatMap((result) => (result.data ?? []) as InventoryProductSearchResult[]),
  );
}

async function searchVariations(scope: SearchScope, query: string, productId: string) {
  if (scope !== "adjust" && scope !== "transfer") {
    return { error: "Variation search is only available for stock operations." } as const;
  }
  if (!isUuid(productId)) return { error: "A valid product is required." } as const;

  const db = createSupabaseAdminClient();
  const { data: product, error: productError } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .neq("status", "archived")
    .maybeSingle();
  if (productError) throw productError;
  if (!product) return { error: "Product not found." } as const;

  const pattern = `%${escapeInventoryIlikePattern(query)}%`;
  const results = await Promise.all(
    variationSearchFields.map((field) =>
      db
        .from("product_variations")
        .select(variationSelection)
        .eq("product_id", productId)
        .eq("status", "active")
        .ilike(field, pattern)
        .order("sku")
        .limit(INVENTORY_PRODUCT_SEARCH_LIMIT),
    ),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
  return {
    variations: mergeInventorySearchResults(
      results.flatMap((result) => (result.data ?? []) as InventoryVariationSearchResult[]),
    ),
  } as const;
}

export async function GET(request: NextRequest) {
  const scopeValue = request.nextUrl.searchParams.get("scope") ?? "";
  if (!isSearchScope(scopeValue)) {
    return NextResponse.json({ error: "A valid Inventory search scope is required." }, { status: 400 });
  }
  await requirePermission(scopePermissions[scopeValue]);

  const kind = request.nextUrl.searchParams.get("kind") ?? "product";
  const query = normalizeInventorySearchQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (query.length < INVENTORY_PRODUCT_SEARCH_MIN_LENGTH) {
    return NextResponse.json(kind === "variation" ? { variations: [] } : { products: [] });
  }

  try {
    if (kind === "variation") {
      const result = await searchVariations(
        scopeValue,
        query,
        request.nextUrl.searchParams.get("product_id") ?? "",
      );
      if ("error" in result) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (kind !== "product") {
      return NextResponse.json({ error: "Unknown Inventory search entity." }, { status: 400 });
    }
    return NextResponse.json({ products: await searchProducts(scopeValue, query) });
  } catch (error) {
    console.error("Inventory product search failed", {
      code: (error as { code?: string })?.code,
      message: (error as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Unable to search Inventory products." }, { status: 500 });
  }
}

