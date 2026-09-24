export type Point = { x: number; y: number };

export type ProcessedBusinessCard = {
  blob: Blob;
  width: number;
  height: number;
  usedPerspectiveCorrection: boolean;
  warning: string;
};

export type PreprocessBusinessCardOptions = {
  rotation?: number;
  detectCard?: boolean;
};

export const cardEdgeWorkerTimeoutMs = 5_000;

export function orderQuadCorners(points: Point[]): [Point, Point, Point, Point] {
  if (points.length !== 4) {
    throw new Error("A detected card must have four corners.");
  }
  const sums = points.map((point) => point.x + point.y);
  const differences = points.map((point) => point.y - point.x);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[differences.indexOf(Math.min(...differences))],
    points[sums.indexOf(Math.max(...sums))],
    points[differences.indexOf(Math.max(...differences))],
  ];
}

export function rotatedDimensions(
  width: number,
  height: number,
  rotation: number,
) {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 270
    ? { width: height, height: width }
    : { width, height };
}

export function shouldUseDetectedCard(input: {
  areaRatio: number;
  rectangularity: number;
}) {
  return (
    input.areaRatio >= 0.25 &&
    input.areaRatio <= 0.98 &&
    input.rectangularity >= 0.75
  );
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Unable to prepare the business-card image.")),
      "image/png",
      0.92,
    );
  });
}

async function decodeAndRotate(image: Blob, rotation: number) {
  const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale =
      longestSide > 2400
        ? 2400 / longestSide
        : longestSide < 1400
          ? Math.min(2, 1400 / Math.max(1, longestSide))
          : 1;
    const sourceWidth = Math.max(1, Math.round(bitmap.width * scale));
    const sourceHeight = Math.max(1, Math.round(bitmap.height * scale));
    const size = rotatedDimensions(sourceWidth, sourceHeight, rotation);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image processing is unavailable.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((((rotation % 360) + 360) % 360 * Math.PI) / 180);
    context.drawImage(
      bitmap,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight,
    );
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function detectAndWarpCard(sourceCanvas: HTMLCanvasElement) {
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image processing is unavailable.");
  const imageData = context.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );

  return new Promise<HTMLCanvasElement | null>((resolve, reject) => {
    const worker = new Worker(new URL("./card-edge-worker.ts", import.meta.url), {
      type: "module",
      name: "business-card-edge-detection",
    });
    let settled = false;
    const finish = (result: HTMLCanvasElement | null, error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const timeout = window.setTimeout(
      () => finish(null, new Error("Card-edge detection timed out.")),
      cardEdgeWorkerTimeoutMs,
    );
    worker.onerror = () =>
      finish(null, new Error("Card-edge detection was unavailable."));
    worker.onmessage = (
      event: MessageEvent<{
        error?: string;
        pixels?: ArrayBuffer;
        width?: number;
        height?: number;
      }>,
    ) => {
      const { error, pixels, width, height } = event.data;
      if (error) {
        finish(null, new Error(error));
        return;
      }
      if (!pixels || !width || !height) {
        finish(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const outputContext = canvas.getContext("2d");
      if (!outputContext) {
        finish(null, new Error("Image processing is unavailable."));
        return;
      }
      outputContext.putImageData(
        new ImageData(new Uint8ClampedArray(pixels), width, height),
        0,
        0,
      );
      finish(canvas);
    };
    const pixels = imageData.data.buffer as ArrayBuffer;
    worker.postMessage(
      { pixels, width: imageData.width, height: imageData.height },
      [pixels],
    );
  });
}

function enhanceForOcr(source: HTMLCanvasElement) {
  const border = 20;
  const canvas = document.createElement("canvas");
  canvas.width = source.width + border * 2;
  canvas.height = source.height + border * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = "grayscale(1) contrast(1.22) brightness(1.04)";
  context.drawImage(source, border, border);
  context.filter = "none";
  return canvas;
}

export async function preprocessBusinessCard(
  image: Blob,
  options: PreprocessBusinessCardOptions = {},
): Promise<ProcessedBusinessCard> {
  const rotation = options.rotation ?? 0;
  const source = await decodeAndRotate(image, rotation);
  let selected = source;
  let usedPerspectiveCorrection = false;
  let warning = "";

  if (options.detectCard !== false) {
    try {
      const warped = await detectAndWarpCard(source);
      if (warped) {
        selected = warped;
        usedPerspectiveCorrection = true;
      } else {
        warning =
          "A reliable card edge was not found. Review the full image before OCR.";
      }
    } catch {
      warning =
        "Automatic crop was unavailable. Review the full image before OCR.";
    }
  }

  const enhanced = enhanceForOcr(selected);
  return {
    blob: await canvasToBlob(enhanced),
    width: enhanced.width,
    height: enhanced.height,
    usedPerspectiveCorrection,
    warning,
  };
}
