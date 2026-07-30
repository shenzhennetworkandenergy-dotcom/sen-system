import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  normalizeArchiveRecord,
  type ArchiveRecordInput,
} from "@/lib/deletion/policy";

export async function registerArchiveEntry(
  actorId: string,
  input: ArchiveRecordInput,
) {
  const record = normalizeArchiveRecord(input);
  const { error } = await createSupabaseAdminClient()
    .from("archive_entries")
    .upsert(
      {
        entity_type: record.entityType,
        entity_id: record.entityId,
        display_name: record.displayName,
        reason: record.reason,
        metadata: record.metadata,
        archived_by: actorId,
        archived_at: new Date().toISOString(),
      },
      { onConflict: "entity_type,entity_id" },
    );
  if (error) {
    console.error("Archive registration failed", {
      code: error.code,
      message: error.message,
      entityType: record.entityType,
      entityId: record.entityId,
    });
    throw new Error("Unable to register this archived record.");
  }
}

export async function removeArchiveEntry(
  entityType: string,
  entityId: string,
) {
  const record = normalizeArchiveRecord({
    entityType,
    entityId,
    displayName: "Archive entry",
  });
  const { error } = await createSupabaseAdminClient()
    .from("archive_entries")
    .delete()
    .eq("entity_type", record.entityType)
    .eq("entity_id", record.entityId);
  if (error) {
    console.error("Archive removal failed", {
      code: error.code,
      message: error.message,
      entityType: record.entityType,
      entityId: record.entityId,
    });
    throw new Error("Unable to remove this archive entry.");
  }
}
