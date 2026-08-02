export function permissionModuleSelectionSummary(
  permissionKeys: readonly string[],
  selected: ReadonlySet<string>,
) {
  const selectedCount = permissionKeys.filter((key) => selected.has(key)).length;
  const totalCount = permissionKeys.length;
  return {
    selectedCount,
    totalCount,
    label: `${selectedCount} of ${totalCount} selected`,
  };
}
