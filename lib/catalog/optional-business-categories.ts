export async function loadOptionalBusinessCategories<T>(
  loadCategories: () => Promise<readonly T[]>,
): Promise<readonly T[]> {
  try {
    return await loadCategories();
  } catch {
    return [];
  }
}
