export async function captureMutationOutcome<T>(
  operation: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error };
  }
}
