"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedTypes = new Set(["warranty", "damaged", "defective", "return"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxAttachmentSize = 10 * 1024 * 1024;

function target(kind: "success" | "error", message: string, id?: string) {
  return `${id ? `/account/rma/${id}` : "/account/rma"}?${kind}=${encodeURIComponent(message)}`;
}

export async function submitRmaClaimAction(form: FormData) {
  const { profile } = await requireProfile(["customer", "admin"]);
  const coverageId = String(form.get("coverage_id") ?? "").trim();
  const claimType = String(form.get("claim_type") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const quantity = Number(form.get("quantity"));
  const attachment = form.get("attachment");

  if (!coverageId || !allowedTypes.has(claimType) || !Number.isInteger(quantity) || quantity < 1 || description.length < 10) {
    redirect(target("error", "Choose a covered product, claim type and whole-number quantity, then describe the issue in at least 10 characters."));
  }
  if (attachment instanceof File && attachment.size > 0 && (!allowedMimeTypes.has(attachment.type) || attachment.size > maxAttachmentSize)) {
    redirect(target("error", "Evidence must be a JPG, PNG, WebP or PDF file no larger than 10 MB."));
  }

  const db = createSupabaseAdminClient();
  const { data: claimId, error } = await db.rpc("submit_rma_claim", {
    actor_profile_id: profile.id,
    requested_coverage_id: coverageId,
    requested_claim_type: claimType,
    requested_quantity: quantity,
    requested_description: description,
  });
  if (error || !claimId) {
    console.error("RMA submission failed", { code: error?.code, message: error?.message });
    redirect(target("error", error?.message ?? "Unable to submit the warranty claim."));
  }

  let attachmentWarning = "";
  if (attachment instanceof File && attachment.size > 0) {
    const extension = attachment.name.includes(".") ? attachment.name.split(".").pop()?.toLowerCase() : "bin";
    const storagePath = `${profile.id}/${claimId}/${crypto.randomUUID()}.${extension}`;
    const upload = await db.storage.from("rma-attachments").upload(storagePath, attachment, {
      contentType: attachment.type,
      upsert: false,
    });
    if (upload.error) {
      console.error("RMA evidence upload failed", { message: upload.error.message });
      attachmentWarning = " The claim was saved, but the attachment could not be uploaded.";
    } else {
      const saved = await db.from("rma_attachments").insert({
        rma_claim_id: claimId,
        storage_path: storagePath,
        original_file_name: attachment.name.slice(0, 255),
        mime_type: attachment.type,
        size_bytes: attachment.size,
        uploaded_by: profile.id,
      });
      if (saved.error) {
        await db.storage.from("rma-attachments").remove([storagePath]);
        console.error("RMA evidence record failed", { code: saved.error.code, message: saved.error.message });
        attachmentWarning = " The claim was saved, but the attachment could not be linked.";
      }
    }
  }

  revalidatePath("/account/rma");
  revalidatePath("/account/orders");
  redirect(target("success", `Warranty claim submitted.${attachmentWarning}`, String(claimId)));
}
