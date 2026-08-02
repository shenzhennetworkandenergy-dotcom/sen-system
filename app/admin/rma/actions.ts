"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import { routes } from "@/lib/constants/routes";
import { rmaStatuses, type RmaStatus } from "@/lib/rma/workflow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function claimPath(id: string) {
  return `${routes.adminRma}/${id}`;
}

function errorPath(id: string, message: string) {
  return `${claimPath(id)}?error=${encodeURIComponent(message)}`;
}

function permissionForStatus(status: RmaStatus) {
  if (status === "product_received") return "rma.receive";
  if (status === "resolution_in_progress") return "rma.resolve";
  if (status === "closed") return "rma.close";
  return "rma.review";
}

export async function assignRmaClaimAction(formData: FormData) {
  const claimId = String(formData.get("claim_id") ?? "");
  const assignedTo = String(formData.get("assigned_to") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!uuidPattern.test(claimId)) redirect(routes.adminRma);
  if (assignedTo && !uuidPattern.test(assignedTo)) redirect(errorPath(claimId, "Choose a valid SEN team member."));

  const { profile } = await requirePermission("rma.assign");
  const db = createSupabaseAdminClient();
  const { error } = await db.rpc("assign_rma_claim", {
    actor_profile_id: profile.id,
    requested_claim_id: claimId,
    requested_assigned_to: assignedTo || null,
    requested_note: note || null,
  });
  if (error) {
    console.error("RMA assignment failed", { code: error.code, message: error.message });
    redirect(errorPath(claimId, error.message || "Unable to update RMA assignment."));
  }
  revalidatePath(routes.adminRma);
  revalidatePath(claimPath(claimId));
  redirect(`${claimPath(claimId)}?success=${encodeURIComponent("RMA assignment updated.")}`);
}

export async function transitionRmaClaimAction(formData: FormData) {
  const claimId = String(formData.get("claim_id") ?? "");
  const status = String(formData.get("status") ?? "") as RmaStatus;
  const resolution = String(formData.get("resolution") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!uuidPattern.test(claimId)) redirect(routes.adminRma);
  if (!rmaStatuses.includes(status)) redirect(errorPath(claimId, "Choose a valid RMA status."));
  if (status === "closed" && !resolution) redirect(errorPath(claimId, "Choose a resolution before closing the claim."));

  const { profile } = await requirePermission(permissionForStatus(status));
  const db = createSupabaseAdminClient();
  const { error } = await db.rpc("transition_rma_claim", {
    actor_profile_id: profile.id,
    requested_claim_id: claimId,
    requested_status: status,
    requested_resolution: resolution || null,
    requested_note: note || null,
    requested_assigned_to: null,
  });
  if (error) {
    console.error("RMA transition failed", { code: error.code, message: error.message });
    redirect(errorPath(claimId, error.message || "Unable to update the RMA claim."));
  }
  revalidatePath(routes.adminRma);
  revalidatePath(claimPath(claimId));
  revalidatePath(routes.accountRma);
  revalidatePath(`${routes.accountRma}/${claimId}`);
  redirect(`${claimPath(claimId)}?success=${encodeURIComponent("RMA status updated and the customer was notified.")}`);
}
