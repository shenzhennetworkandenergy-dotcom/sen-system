export const archiveEntityTypes = [
  "product",
  "user",
  "brand",
  "attribute",
] as const;

export type ArchiveEntityType = (typeof archiveEntityTypes)[number];
export type DeletionOperation = "archive" | "permanent";

export type ArchiveRecordInput = {
  entityType: string;
  entityId: string;
  displayName: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type NormalizedArchiveRecord = {
  entityType: ArchiveEntityType;
  entityId: string;
  displayName: string;
  reason: string | null;
  metadata: Record<string, unknown>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveDeletionOperation(
  permanentEnabled: boolean,
): DeletionOperation {
  return permanentEnabled ? "permanent" : "archive";
}

export function parsePermanentDeletionSetting(
  value: FormDataEntryValue | null,
) {
  return value === "enabled";
}

export function deletionActionCopy(permanentEnabled: boolean) {
  return permanentEnabled
    ? {
        button: "Delete permanently",
        confirmation:
          "Permanently delete this record? This action cannot be undone.",
      }
    : {
        button: "Move to archive",
        confirmation: "Move this record to the archive?",
      };
}

export function normalizeArchiveRecord(
  input: ArchiveRecordInput,
): NormalizedArchiveRecord {
  const entityType = input.entityType.trim();
  if (!archiveEntityTypes.includes(entityType as ArchiveEntityType)) {
    throw new Error("Unsupported archive entity type.");
  }
  if (!uuidPattern.test(input.entityId)) {
    throw new Error("Invalid archive entity identifier.");
  }
  const displayName = input.displayName.trim().slice(0, 200);
  if (!displayName) throw new Error("Archive display name is required.");
  const reason = input.reason?.trim().slice(0, 500) || null;
  return {
    entityType: entityType as ArchiveEntityType,
    entityId: input.entityId,
    displayName,
    reason,
    metadata: input.metadata ?? {},
  };
}
