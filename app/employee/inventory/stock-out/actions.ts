"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { uuid } from "@/lib/orders/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StockOutActionState = {
  ok: boolean;
  message: string;
  releaseId?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeStockOutError(message: string | undefined, fallback: string) {
  return message && /stock|release|serial|warehouse|packed|reserved|physical|invoice|revision|permission|employee|quantity|request|concurrent|updated|completed/i.test(message)
    ? message
    : fallback;
}

function refreshStockOutViews(requestId: string) {
  revalidatePath("/employee/inventory/stock-out");
  revalidatePath(`/employee/inventory/stock-out/${requestId}`);
  revalidatePath("/api/employee/inventory/work-counts");
  revalidatePath("/admin/inventory/daily-closing");
}

export async function confirmStockOutAction(
  requestId: string,
  _previousState: StockOutActionState,
  formData: FormData,
): Promise<StockOutActionState> {
  const { profile } = await requirePermission("inventory.release_sales_stock");
  let operationId: string;
  let payload: unknown;
  try {
    if (!UUID.test(requestId)) throw new Error("Stock Out request is invalid.");
    operationId = uuid(formData.get("operation_id"), "Stock Out operation");
    payload = JSON.parse(String(formData.get("release_payload") ?? ""));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Stock Out release details are invalid.");
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Stock Out release details are invalid.",
    };
  }

  const result = await createSupabaseAdminClient().rpc("confirm_sales_stock_out", {
    actor_profile_id: profile.id,
    requested_request_id: requestId,
    requested_operation_id: operationId,
    requested_items: payload,
  });
  if (result.error || !result.data) {
    return {
      ok: false,
      message: safeStockOutError(
        result.error?.message,
        "Unable to confirm Stock Out. No inventory was changed.",
      ),
    };
  }

  refreshStockOutViews(requestId);
  return {
    ok: true,
    message: "Stock Out confirmed. Physical inventory and Daily Closing were updated.",
    releaseId: String(result.data),
  };
}

export async function replaceStockOutSerialAction(
  requestItemId: string,
  previousSerialId: string,
  operationId: string,
  _previousState: StockOutActionState,
  formData: FormData,
): Promise<StockOutActionState> {
  const { profile } = await requirePermission("inventory.release_sales_stock");
  let replacementSerialId: string;
  const reason = String(formData.get("replacement_reason") ?? "").trim().slice(0, 1000);
  try {
    if (!UUID.test(requestItemId)) throw new Error("Stock Out request product is invalid.");
    if (!UUID.test(previousSerialId)) throw new Error("Assigned SEN Serial is invalid.");
    if (!UUID.test(operationId)) throw new Error("Serial replacement operation is invalid.");
    replacementSerialId = uuid(formData.get("replacement_serial_id"), "Replacement SEN Serial");
    if (reason.length < 3) throw new Error("A replacement reason is required.");
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Serial replacement details are invalid.",
    };
  }

  const result = await createSupabaseAdminClient().rpc("replace_stock_out_serial", {
    actor_profile_id: profile.id,
    requested_request_item_id: requestItemId,
    requested_previous_serial_id: previousSerialId,
    requested_replacement_serial_id: replacementSerialId,
    requested_reason: reason,
    requested_operation_id: operationId,
  });
  if (result.error || !result.data) {
    return {
      ok: false,
      message: safeStockOutError(
        result.error?.message,
        "Unable to replace the SEN Serial. No serial assignment was changed.",
      ),
    };
  }

  revalidatePath("/employee/inventory/stock-out");
  return { ok: true, message: "SEN Serial replacement recorded in the audit history." };
}
