"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requireProfile } from "@/lib/auth/session";
import { parsePermanentDeletionSetting } from "@/lib/deletion/policy";
import { getDeletionMode } from "@/lib/deletion/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const settingsPath = "/admin/settings/data-management";

export async function updateDeletionModeAction(formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const nextEnabled = parsePermanentDeletionSetting(
    formData.get("permanent_deletion"),
  );
  const previous = await getDeletionMode();
  const { error } = await createSupabaseAdminClient()
    .from("system_settings")
    .upsert({
      key: "admin_deletion",
      value: { permanent_deletion_enabled: nextEnabled },
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    console.error("Deletion setting update failed", {
      code: error.code,
      message: error.message,
    });
    redirect(
      `${settingsPath}?error=${encodeURIComponent("Unable to update Permanent Deletion Mode.")}`,
    );
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "settings.permanent_deletion_changed",
    module: "settings",
    entityType: "system_setting",
    entityId: null,
    description: nextEnabled
      ? "Permanent Deletion Mode enabled by an administrator."
      : "Permanent Deletion Mode disabled by an administrator.",
    oldValues: { permanent_deletion_enabled: previous.permanentEnabled },
    newValues: { permanent_deletion_enabled: nextEnabled },
  });
  revalidatePath(settingsPath);
  revalidatePath("/admin", "layout");
  redirect(
    `${settingsPath}?success=${encodeURIComponent(
      nextEnabled
        ? "Permanent Deletion Mode is enabled."
        : "Permanent Deletion Mode is disabled. Delete actions now archive records.",
    )}`,
  );
}
