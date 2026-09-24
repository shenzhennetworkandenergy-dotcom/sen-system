import { NextRequest, NextResponse } from "next/server";

import { getEffectivePermissions } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { searchEligibleStockOutSerials } from "@/lib/inventory/stock-out-data";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "employee" || profile.status !== "active") {
    return NextResponse.json({ error: "Employee access required." }, { status: 403 });
  }
  const permissions = await getEffectivePermissions(profile.id);
  if (!permissions.has("inventory.release_sales_stock")) {
    return NextResponse.json({ error: "Stock Out permission required." }, { status: 403 });
  }
  const requestItemId = request.nextUrl.searchParams.get("requestItemId") ?? "";
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!UUID.test(requestItemId)) {
    return NextResponse.json({ error: "A valid Stock Out item is required." }, { status: 400 });
  }
  try {
    const serials = await searchEligibleStockOutSerials(profile.id, requestItemId, q);
    return NextResponse.json({ serials });
  } catch (error) {
    console.error("Stock Out SEN Serial search failed", error);
    return NextResponse.json({ error: "Unable to search eligible SEN Serials." }, { status: 503 });
  }
}
