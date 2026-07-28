import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/inventory/validation";

export async function POST(request: Request) {
  await requirePermission("products.create");
  const body = await request.json().catch(() => null) as { name?: string } | null;
  const name = body?.name?.trim().slice(0, 120) ?? "";
  if (!name) return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("brands").insert({ name, slug: slugify(name) }).select("id,name").single();
  if (error || !data) return NextResponse.json({ error: "Unable to create brand. It may already exist." }, { status: 409 });
  return NextResponse.json(data, { status: 201 });
}
