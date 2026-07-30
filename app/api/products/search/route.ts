import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (!query) return NextResponse.json({ products: [] });

  const escaped = query
    .replace(/[%_(),.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!escaped) return NextResponse.json({ products: [] });
  const { data, error } = await createSupabaseAdminClient()
    .from("products")
    .select("id,name,slug,sku,model_number,business_categories!products_business_category_id_fkey(name,slug)")
    .eq("status", "active")
    .eq("public_catalogue_visible", true)
    .or(
      `name.ilike.%${escaped}%,sku.ilike.%${escaped}%,model_number.ilike.%${escaped}%,short_description.ilike.%${escaped}%`,
    )
    .order("featured", { ascending: false })
    .order("name")
    .limit(8);

  if (error) {
    console.error("Public product suggestion search failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ products: [] }, { status: 500 });
  }

  return NextResponse.json({
    products: (data ?? []).map((product) => {
      const category = product.business_categories[0];
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        category: category?.name ?? "Products",
        categorySlug: category?.slug ?? null,
      };
    }),
  });
}
