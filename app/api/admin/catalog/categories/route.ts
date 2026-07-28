import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/inventory/validation";

const businessCategories = ["Networking", "Energy", "Medical Equipment", "Others"];

export async function POST(request: Request) {
  await requirePermission("products.create");
  const body = await request.json().catch(() => null) as { name?: string; businessCategory?: string } | null;
  const name = body?.name?.trim().slice(0, 120) ?? "";
  const sen_business_category = businessCategories.includes(body?.businessCategory ?? "") ? body!.businessCategory! : "Others";
  if (!name) return NextResponse.json({ error: "Category name is required." }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("product_categories").insert({ name, slug: slugify(name), sen_business_category }).select("id,name").single();
  if (error || !data) return NextResponse.json({ error: "Unable to create category. It may already exist." }, { status: 409 });
  return NextResponse.json(data, { status: 201 });
}
