export async function whatsappRequest<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/admin/whatsapp/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not complete the request.");
  return data as T;
}
