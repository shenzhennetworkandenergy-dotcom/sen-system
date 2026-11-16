"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function updateWarehouseInChargeAction(warehouseId: string, form: FormData) {
  const { profile } = await requirePermission("warehouses.edit");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(warehouseId)) notFound();
  const path = `/admin/warehouses/${warehouseId}`;
  const value = form.get("in_charge_name");
  if (typeof value !== "string" || value.length > 120) {
    redirect(`${path}?error=${encodeURIComponent("Enter a name of up to 120 characters.")}`);
  }
  const inChargeName = value.trim() || null;
  const db = createSupabaseAdminClient();
  const result = await db.from("warehouses").update({ in_charge_name: inChargeName })
    .eq("id", warehouseId).select("id").maybeSingle();
  if (result.error || !result.data) {
    redirect(`${path}?error=${encodeURIComponent("Unable to save warehouse in-charge.")}`);
  }
  await writeAuditLog({
    actorId: profile.id, actorRole: profile.role, action: "warehouse.in_charge_updated",
    module: "warehouses", entityType: "warehouse", entityId: warehouseId,
    description: "Warehouse in-charge updated.", newValues: { in_charge_name: inChargeName },
  });
  revalidatePath(path);
  revalidatePath("/admin/inventory/warehouse-report");
  revalidatePath("/admin/inventory/warehouse-report/print");
  redirect(`${path}?success=${encodeURIComponent("Warehouse in-charge saved.")}`);
}
