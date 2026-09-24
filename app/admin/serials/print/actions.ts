"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import {
  isUuid,
  normalizeLabelSizeInput,
  parseSerialPrintSelection,
  serialPrintQuery,
} from "@/lib/inventory/label-sizes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function destination(form: FormData, kind: "success" | "error", message: string) {
  const selection = parseSerialPrintSelection({
    ids: String(form.get("ids") ?? ""),
    batch: String(form.get("batch") ?? ""),
    product: String(form.get("product") ?? ""),
  });
  const query = new URLSearchParams(selection ? serialPrintQuery(selection) : "");
  query.set(kind, message);
  return `/admin/serials/print?${query}`;
}

export async function createSerialLabelSizeAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  let size: ReturnType<typeof normalizeLabelSizeInput>;
  try {
    size = normalizeLabelSizeInput({
      name: form.get("name"),
      widthMm: form.get("width_mm"),
      heightMm: form.get("height_mm"),
    });
  } catch (error) {
    redirect(destination(form, "error", error instanceof Error ? error.message : "Invalid label size."));
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("serial_label_sizes")
    .insert({ name: size.name, width_mm: size.widthMm, height_mm: size.heightMm, created_by: profile.id })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Serial label size creation failed", { code: error?.code, message: error?.message });
    const message = error?.code === "23505" ? "A label size with this name or dimensions already exists." : "Unable to add the label size.";
    redirect(destination(form, "error", message));
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "serial_label_size.created", module: "serials", entityType: "serial_label_size", entityId: data.id, description: `Serial label size ${size.name} created.`, newValues: size });
  revalidatePath("/admin/serials/print");
  redirect(destination(form, "success", `${size.name} added to the label-size list.`));
}

export async function deleteSerialLabelSizeAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const sizeId = String(form.get("size_id") ?? "");
  if (!isUuid(sizeId)) redirect(destination(form, "error", "Choose a valid label size."));
  const db = createSupabaseAdminClient();
  const { data: size, error: lookupError } = await db.from("serial_label_sizes").select("id,name,width_mm,height_mm").eq("id", sizeId).maybeSingle();
  if (lookupError || !size) redirect(destination(form, "error", "Label size not found."));
  const { error } = await db.from("serial_label_sizes").delete().eq("id", sizeId);
  if (error) {
    console.error("Serial label size deletion failed", { code: error.code, message: error.message, sizeId });
    redirect(destination(form, "error", "Unable to delete the label size."));
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "serial_label_size.deleted", module: "serials", entityType: "serial_label_size", entityId: sizeId, description: `Serial label size ${size.name} deleted.`, oldValues: size });
  revalidatePath("/admin/serials/print");
  redirect(destination(form, "success", `${size.name} deleted from the label-size list.`));
}
