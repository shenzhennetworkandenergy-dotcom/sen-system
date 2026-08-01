import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getEmployeePrimaryWarehouseId(
  profileId: string,
): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("profile_warehouse_assignments")
    .select("warehouse_id")
    .eq("profile_id", profileId)
    .eq("is_primary", true)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Employee warehouse assignment unavailable", {
      profileId,
      code: error.code,
    });
    throw new Error("Unable to verify the employee warehouse assignment.");
  }
  return data?.warehouse_id ?? null;
}
