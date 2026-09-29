import "server-only";

import { getBusinessDateInDhaka, type EmployeeDailyClosingScope } from "@/lib/inventory/daily-closing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type EmployeeDailyClosingAssignment = EmployeeDailyClosingScope & {
  warehouseName: string;
  warehouseCode: string;
  countryName: string | null;
};

export async function getEmployeeDailyClosingAssignment(profileId: string): Promise<EmployeeDailyClosingAssignment | null> {
  const db = createSupabaseAdminClient();
  const assignmentResult = await db
    .from("profile_warehouse_assignments")
    .select("warehouse_id")
    .eq("profile_id", profileId)
    .eq("is_primary", true)
    .eq("is_active", true)
    .maybeSingle();
  if (assignmentResult.error) throw new Error("Unable to load the employee warehouse assignment.");
  if (!assignmentResult.data?.warehouse_id) return null;

  const warehouseResult = await db
    .from("warehouses")
    .select("id,name,code,country_name")
    .eq("id", assignmentResult.data.warehouse_id)
    .eq("is_active", true)
    .maybeSingle();
  if (warehouseResult.error) throw new Error("Unable to load the assigned warehouse.");
  if (!warehouseResult.data) return null;

  return {
    inventoryDate: getBusinessDateInDhaka(),
    warehouseId: warehouseResult.data.id,
    warehouseName: warehouseResult.data.name,
    warehouseCode: warehouseResult.data.code,
    countryName: warehouseResult.data.country_name,
  };
}

