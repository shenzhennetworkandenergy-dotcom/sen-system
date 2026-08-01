"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { routes } from "@/lib/constants/routes";
import type { ArchiveEntityType } from "@/lib/deletion/policy";
import { getDeletionMode } from "@/lib/deletion/settings";
import {
  parseTrashSelection,
  summarizeTrashResult,
} from "@/lib/deletion/trash-policy";
import {
  permanentlyDeleteTrashEntry,
  type TrashEntrySnapshot,
} from "@/lib/deletion/trash-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function destination(type: "success" | "error", message: string) {
  return `${routes.adminTrashBin}?${type}=${encodeURIComponent(message)}`;
}

function revalidateTrashDestinations() {
  revalidatePath(routes.adminTrashBin);
  revalidatePath("/admin/archive");
  revalidatePath("/admin/products");
  revalidatePath("/admin/users");
  revalidatePath("/admin/categories/business");
  revalidatePath("/admin/hr/employees");
  revalidatePath("/products");
  revalidatePath("/admin");
}

export async function processTrashSelectionAction(formData: FormData) {
  const { profile } = await requireProfile(["admin"]);

  let selectedIds: string[];
  try {
    selectedIds = parseTrashSelection(formData.getAll("trash_entry_ids"));
  } catch (error) {
    redirect(
      destination(
        "error",
        error instanceof Error ? error.message : "Invalid Trash Bin selection.",
      ),
    );
  }

  const operation = String(formData.get("operation") ?? "");
  if (!["restore", "permanent"].includes(operation)) {
    redirect(destination("error", "Choose a valid Trash Bin action."));
  }

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("archive_entries")
    .select(
      "id,entity_type,entity_id,display_name,reason,metadata,archived_by,archived_at,purge_token,purge_started_by,purge_started_at",
    )
    .in("id", selectedIds);
  if (error || !data || data.length !== selectedIds.length) {
    redirect(
      destination(
        "error",
        "One or more selected Trash Bin items are no longer available.",
      ),
    );
  }

  if (operation === "restore") {
    const result = await db.rpc("admin_restore_trash_entries", {
      actor_profile_id: profile.id,
      requested_entry_ids: selectedIds,
    });
    if (result.error) {
      console.error("Trash Bin restore failed", {
        code: result.error.code,
        message: result.error.message,
      });
      redirect(
        destination(
          "error",
          "The selected items could not be restored. No records were changed.",
        ),
      );
    }
    revalidateTrashDestinations();
    redirect(
      destination(
        "success",
        `${Number(result.data ?? selectedIds.length)} item(s) restored.`,
      ),
    );
  }

  const mode = await getDeletionMode();
  if (!mode.permanentEnabled) {
    redirect(
      destination(
        "error",
        "Permanent Deletion Mode is disabled. Enable it in Data Management first.",
      ),
    );
  }

  let succeeded = 0;
  const failures: string[] = [];
  for (const row of data) {
    const entry = {
      ...row,
      entity_type: row.entity_type as ArchiveEntityType,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    } satisfies TrashEntrySnapshot;
    try {
      await permanentlyDeleteTrashEntry(entry, {
        id: profile.id,
        role: profile.role,
      });
      succeeded += 1;
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : `${entry.display_name}: permanent deletion failed.`,
      );
    }
  }

  revalidateTrashDestinations();
  const summary = summarizeTrashResult({ succeeded, failures });
  redirect(destination(failures.length === 0 ? "success" : "error", summary));
}
