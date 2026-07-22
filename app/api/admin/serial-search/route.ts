import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  await requirePermission("serials.view");
  const raw = request.nextUrl.searchParams.get("q")?.replace(/^SEN:1:/, "").trim().slice(0, 160) ?? "";
  if (raw.length < 2) return NextResponse.json({ results: [] });
  const normalized = raw.replace(/[^A-Za-z0-9]/g, "");
  const { data, error } = await createSupabaseAdminClient().from("serial_numbers")
    .select("id,sen_serial,manufacturer_serial,status,condition")
    .or(`sen_serial.ilike.%${raw}%,manufacturer_serial.ilike.%${raw}%,manufacturer_serial_normalized.ilike.%${normalized}%`)
    .order("updated_at", { ascending: false }).limit(8);
  if (error) {
    console.error("Serial autocomplete failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Unable to search serials." }, { status: 500 });
  }
  return NextResponse.json({ results: data ?? [] });
}
