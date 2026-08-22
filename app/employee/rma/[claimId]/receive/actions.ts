"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { uuid } from "@/lib/orders/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseWholeNumber } from "@/lib/validation/numbers";

export type PhysicalReturnActionState = { ok: boolean; message: string; receiptId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const initialError = "Unable to confirm the physical return. No inventory was changed.";

export async function confirmPhysicalReturnReceiptAction(
  claimId: string,
  releaseItemId: string,
  operationId: string,
  _previousState: PhysicalReturnActionState,
  formData: FormData,
): Promise<PhysicalReturnActionState> {
  const { profile } = await requirePermission("rma.receive");
  let quantity: number;
  let serialIds: string[];
  try {
    if (!UUID.test(claimId)) throw new Error("RMA claim is invalid.");
    if (!UUID.test(releaseItemId)) throw new Error("Original Stock Out release is invalid.");
    if (!UUID.test(operationId)) throw new Error("Physical return operation is invalid.");
    quantity = parseWholeNumber(formData.get("quantity"), "Return quantity", {
      required: true,
      minimum: 1,
    })!;
    serialIds = [...new Set(formData.getAll("serial_id").map((value) =>
      uuid(value, "Returned SEN Serial"),
    ))];
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : initialError };
  }

  const result = await createSupabaseAdminClient().rpc("confirm_physical_return_receipt", {
    actor_profile_id: profile.id,
    requested_claim_id: claimId,
    requested_release_item_id: releaseItemId,
    requested_operation_id: operationId,
    requested_quantity: quantity,
    requested_serial_ids: serialIds,
  });
  if (result.error || !result.data) {
    const message = result.error?.message;
    return {
      ok: false,
      message: message && /return|rma|serial|warehouse|quantity|release|employee|permission|operation/i.test(message)
        ? message
        : initialError,
    };
  }

  revalidatePath(`/employee/rma/${claimId}/receive`);
  revalidatePath("/admin/inventory/daily-closing");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/orders");
  return {
    ok: true,
    message: "Physical Return Receipt confirmed. Warehouse physical inventory and Daily Closing were updated.",
    receiptId: String(result.data),
  };
}
