import { NextResponse } from "next/server";

import { getEffectivePermissions } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { getEmployeeInventoryWorkCounts } from "@/lib/inventory/employee-inventory-work-counts";

export const dynamic = "force-dynamic";

export async function GET() {
  const { profile } = await getCurrentProfile();
  if (
    !profile ||
    profile.role !== "employee" ||
    profile.status !== "active"
  ) {
    return NextResponse.json({ error: "Employee access required." }, { status: 403 });
  }

  try {
    const permissions = await getEffectivePermissions(profile.id);
    const counts = await getEmployeeInventoryWorkCounts(profile.id, permissions);
    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Employee inventory work counts unavailable", error);
    return NextResponse.json(
      { error: "Inventory work counts are temporarily unavailable." },
      { status: 503 },
    );
  }
}
