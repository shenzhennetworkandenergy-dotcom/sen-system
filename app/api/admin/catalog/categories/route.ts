import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/permissions";
import { slugify } from "@/lib/inventory/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  await requirePermission("products.create");
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    businessCategoryId?: string;
  } | null;
  const name = body?.name?.trim().slice(0, 120) ?? "";
  const businessCategoryId = body?.businessCategoryId?.trim() ?? "";
  if (!name) {
    return NextResponse.json(
      { error: "Category name is required." },
      { status: 400 },
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(businessCategoryId)) {
    return NextResponse.json(
      { error: "Choose an active business category." },
      { status: 400 },
    );
  }
  const db = createSupabaseAdminClient();
  const { data: businessCategory } = await db
    .from("business_categories")
    .select("id,name")
    .eq("id", businessCategoryId)
    .eq("is_active", true)
    .is("archived_at", null)
    .maybeSingle();
  if (!businessCategory) {
    return NextResponse.json(
      { error: "Choose an active business category." },
      { status: 400 },
    );
  }
  const { data, error } = await db
    .from("product_categories")
    .insert({
      name,
      slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`,
      business_category_id: businessCategory.id,
      sen_business_category: businessCategory.name,
    })
    .select("id,name,business_category_id")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Unable to create category. It may already exist." },
      { status: 409 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}

