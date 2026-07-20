import "server-only";
import type { AccountRole } from "@/lib/constants/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AuditEvent = {
  actorId: string;
  actorRole: AccountRole;
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  targetProfileId?: string | null;
  description: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

const blockedKeys = /password|token|cookie|authorization|secret|key/i;

function redact(value?: Record<string, unknown> | null) {
  if (!value) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, blockedKeys.test(key) ? "[redacted]" : item]));
}

export async function writeAuditLog(event: AuditEvent) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: event.actorId,
    actor_role: event.actorRole,
    target_profile_id: event.targetProfileId ?? null,
    action: event.action,
    module: event.module,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    description: event.description,
    old_values: redact(event.oldValues),
    new_values: redact(event.newValues),
    metadata: redact(event.metadata) ?? {},
  });
  if (error) console.error("Audit write failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
}
