import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildEmployeeWorkplaceSummary,
  type EmployeeWorkplaceSummary,
  type WarehouseAssignment,
  type WorkLocationAssignment,
} from "@/lib/hr/profile-workplace-domain";

export async function getEmployeeWorkplaceSummary(profileId: string): Promise<EmployeeWorkplaceSummary> {
  const db = createSupabaseAdminClient();
  const [workplaceResult, warehouseResult] = await Promise.all([
    db.from("profile_work_locations").select("work_locations(name,code,city,country_code)").eq("profile_id", profileId).eq("is_primary", true).eq("is_active", true).maybeSingle(),
    db.from("profile_warehouse_assignments").select("warehouses(name,code,address,country_name)").eq("profile_id", profileId).eq("is_primary", true).eq("is_active", true).maybeSingle(),
  ]);

  const error = workplaceResult.error ?? warehouseResult.error;
  if (error) {
    console.error("Employee workplace assignment query failed", { profileId, code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error("Unable to load employee workplace assignments.");
  }

  return buildEmployeeWorkplaceSummary(workplaceResult.data as WorkLocationAssignment, warehouseResult.data as WarehouseAssignment);
}
