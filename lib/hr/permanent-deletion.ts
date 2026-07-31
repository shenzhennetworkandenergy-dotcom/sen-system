const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePermanentHrDeletion(
  modeEnabled: boolean,
  values: unknown[],
  maximum: number,
) {
  if (!modeEnabled) {
    throw new Error("Permanent Deletion Mode is disabled.");
  }
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error("Permanent deletion selection limit is invalid.");
  }
  const ids = [...new Set(values.map((value) => String(value).trim()))];
  if (!ids.length || (ids.length === 1 && !ids[0])) {
    throw new Error("Select at least one record.");
  }
  if (ids.length > maximum) {
    throw new Error(`Select up to ${maximum} records at a time.`);
  }
  if (ids.some((id) => !uuidPattern.test(id))) {
    throw new Error("The selection contains an invalid record.");
  }
  return ids;
}
