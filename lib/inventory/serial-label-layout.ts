export const SERIAL_LABEL_CANVAS_WIDTH_MM = 70;
export const SERIAL_LABEL_CANVAS_HEIGHT_MM = 42;
export const SERIAL_LABEL_SAFE_INSET_MM = 0.75;

export type SerialLabelLayout = {
  canvasWidthMm: number;
  canvasHeightMm: number;
  scale: number;
  scaledWidthMm: number;
  scaledHeightMm: number;
  offsetXmm: number;
  offsetYmm: number;
};

export function createSerialLabelLayout(widthMm: number, heightMm: number): SerialLabelLayout {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) {
    throw new Error("Label dimensions must be finite numbers.");
  }
  if (widthMm <= 0 || heightMm <= 0) {
    throw new Error("Label dimensions must be positive.");
  }

  const availableWidthMm = widthMm - SERIAL_LABEL_SAFE_INSET_MM * 2;
  const availableHeightMm = heightMm - SERIAL_LABEL_SAFE_INSET_MM * 2;
  if (availableWidthMm <= 0 || availableHeightMm <= 0) {
    throw new Error("Label dimensions must be larger than the safe inset.");
  }

  const scale = Math.min(
    availableWidthMm / SERIAL_LABEL_CANVAS_WIDTH_MM,
    availableHeightMm / SERIAL_LABEL_CANVAS_HEIGHT_MM,
  );
  const scaledWidthMm = SERIAL_LABEL_CANVAS_WIDTH_MM * scale;
  const scaledHeightMm = SERIAL_LABEL_CANVAS_HEIGHT_MM * scale;

  return {
    canvasWidthMm: SERIAL_LABEL_CANVAS_WIDTH_MM,
    canvasHeightMm: SERIAL_LABEL_CANVAS_HEIGHT_MM,
    scale,
    scaledWidthMm,
    scaledHeightMm,
    offsetXmm: (widthMm - scaledWidthMm) / 2,
    offsetYmm: (heightMm - scaledHeightMm) / 2,
  };
}

export function selectSingleSerialForLabelPrinter<T>(rows: readonly T[]): T[] {
  return rows.length ? [rows[0]] : [];
}
