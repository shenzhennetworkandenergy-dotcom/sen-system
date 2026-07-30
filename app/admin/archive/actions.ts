"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requireProfile } from "@/lib/auth/session";
import { removeArchiveEntry } from "@/lib/deletion/archive";
import {
  archiveEntityTypes,
  type ArchiveEntityType,
} from "@/lib/deletion/policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function archiveTarget(type: "success" | "error", message: string) {
  return `/admin/archive?${type}=${encodeURIComponent(message)}`;
}

export async function restoreArchivedRecordAction(
  entityType: string,
  entityId: string,
) {
  const { profile } = await requireProfile(["admin"]);
  if (
    !archiveEntityTypes.includes(entityType as ArchiveEntityType) ||
    !/^[0-9a-f-]{36}$/i.test(entityId)
  ) {
    redirect(archiveTarget("error", "Invalid archived record."));
  }
  const db = createSupabaseAdminClient();
  const { data: entry, error: entryError } = await db
    .from("archive_entries")
    .select("entity_type,entity_id,display_name,metadata")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (entryError || !entry)
    redirect(archiveTarget("error", "Archived record not found."));

  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  if (entityType === "product") {
    const previousStatus = ["active", "draft"].includes(
      String(metadata.previous_status),
    )
      ? String(metadata.previous_status)
      : "draft";
    const { error } = await db
      .from("products")
      .update({
        status: previousStatus,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entityId);
    if (error)
      redirect(archiveTarget("error", "Unable to restore this product."));
  } else if (entityType === "user") {
    const previousStatus = ["active", "suspended", "disabled"].includes(
      String(metadata.previous_status),
    )
      ? String(metadata.previous_status)
      : "active";
    const { error } = await db
      .from("profiles")
      .update({
        status: previousStatus,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entityId);
    if (error)
      redirect(archiveTarget("error", "Unable to restore this account."));
  } else {
    const table = entityType === "brand" ? "brands" : "attributes";
    const { error } = await db
      .from(table)
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", entityId);
    if (error)
      redirect(
        archiveTarget(
          "error",
          `Unable to restore this ${entityType}.`,
        ),
      );
  }

  try {
    await removeArchiveEntry(entityType, entityId);
  } catch {
    redirect(
      archiveTarget(
        "error",
        "The record was restored, but its Archive index could not be removed.",
      ),
    );
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: `${entityType}.restored`,
    module: entityType === "user" ? "users" : "products",
    entityType,
    entityId,
    targetProfileId: entityType === "user" ? entityId : null,
    description: `${entry.display_name} restored from the Archive.`,
    oldValues: { archived: true },
    newValues: { archived: false },
  });
  revalidatePath("/admin/archive");
  const listPath =
    entityType === "product"
      ? "/admin/products"
      : entityType === "user"
        ? "/admin/users"
        : `/admin/${entityType}s`;
  revalidatePath(listPath);
  revalidatePath("/products");
  revalidatePath("/admin");
  redirect(archiveTarget("success", `${entry.display_name} restored.`));
}
