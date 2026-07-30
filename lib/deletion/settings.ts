import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveDeletionOperation,
  type DeletionOperation,
} from "@/lib/deletion/policy";

export type DeletionMode = {
  permanentEnabled: boolean;
  operation: DeletionOperation;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getDeletionMode(): Promise<DeletionMode> {
  const { data, error } = await createSupabaseAdminClient()
    .from("system_settings")
    .select("value,updated_at,updated_by")
    .eq("key", "admin_deletion")
    .maybeSingle();
  if (error) {
    console.error("Deletion setting query failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to load deletion settings.");
  }
  const value = data?.value as
    | { permanent_deletion_enabled?: unknown }
    | null
    | undefined;
  const permanentEnabled = value?.permanent_deletion_enabled === true;
  return {
    permanentEnabled,
    operation: resolveDeletionOperation(permanentEnabled),
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
  };
}
