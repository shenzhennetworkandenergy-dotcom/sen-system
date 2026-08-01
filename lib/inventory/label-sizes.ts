export type SerialLabelSizeInput = {
  name: unknown;
  widthMm: unknown;
  heightMm: unknown;
};

export type SerialPrintSelection =
  | { kind: "ids"; ids: string[] }
  | { kind: "batch"; id: string }
  | { kind: "product"; id: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dimension(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid number.`);
  if (parsed < 10 || parsed > 300) throw new Error(`${field} must be between 10 and 300 mm.`);
  return Math.round(parsed * 100) / 100;
}

export function normalizeLabelSizeInput(input: SerialLabelSizeInput) {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) throw new Error("Label size name must contain at least 2 characters.");
  return {
    name,
    widthMm: dimension(input.widthMm, "Width"),
    heightMm: dimension(input.heightMm, "Height"),
  };
}

export function parseSerialPrintSelection(params: { ids?: string; batch?: string; product?: string }): SerialPrintSelection | null {
  const ids = [...new Set(String(params.ids ?? "").split(",").map((id) => id.trim()).filter((id) => uuidPattern.test(id)))].slice(0, 500);
  if (ids.length) return { kind: "ids", ids };
  if (uuidPattern.test(String(params.batch ?? ""))) return { kind: "batch", id: String(params.batch) };
  if (uuidPattern.test(String(params.product ?? ""))) return { kind: "product", id: String(params.product) };
  return null;
}

export function serialPrintQuery(selection: SerialPrintSelection, sizeId?: string | null) {
  const query = new URLSearchParams();
  if (selection.kind === "ids") query.set("ids", selection.ids.join(","));
  else query.set(selection.kind, selection.id);
  if (sizeId && uuidPattern.test(sizeId)) query.set("size", sizeId);
  return query.toString();
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}
