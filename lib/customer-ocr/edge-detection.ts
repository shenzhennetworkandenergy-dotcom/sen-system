export type EdgePoint = { x: number; y: number };
export type EdgeQuad = [EdgePoint, EdgePoint, EdgePoint, EdgePoint];

function grayscale(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return (
    pixels[offset] * 0.299 +
    pixels[offset + 1] * 0.587 +
    pixels[offset + 2] * 0.114
  );
}

function polygonArea(points: EdgeQuad) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function orderedExtremes(points: EdgePoint[]): EdgeQuad | null {
  if (points.length < 4) return null;
  let smallestSum = Number.POSITIVE_INFINITY;
  let largestSum = Number.NEGATIVE_INFINITY;
  let smallestDifference = Number.POSITIVE_INFINITY;
  let largestDifference = Number.NEGATIVE_INFINITY;
  let topLeft = points[0];
  let topRight = points[0];
  let bottomRight = points[0];
  let bottomLeft = points[0];

  for (const point of points) {
    const sum = point.x + point.y;
    const difference = point.y - point.x;
    if (sum < smallestSum) {
      smallestSum = sum;
      topLeft = point;
    }
    if (sum > largestSum) {
      largestSum = sum;
      bottomRight = point;
    }
    if (difference < smallestDifference) {
      smallestDifference = difference;
      topRight = point;
    }
    if (difference > largestDifference) {
      largestDifference = difference;
      bottomLeft = point;
    }
  }

  const corners: EdgeQuad = [
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
  ];
  const unique = new Set(corners.map((point) => `${point.x}:${point.y}`));
  return unique.size === 4 ? corners : null;
}

export function detectCardQuad(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): EdgeQuad | null {
  if (width < 40 || height < 24 || pixels.length < width * height * 4) {
    return null;
  }
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 900));
  const points: EdgePoint[] = [];
  for (let y = stride; y < height - stride; y += stride) {
    for (let x = stride; x < width - stride; x += stride) {
      const horizontal = Math.abs(
        grayscale(pixels, width, x + stride, y) -
          grayscale(pixels, width, x - stride, y),
      );
      const vertical = Math.abs(
        grayscale(pixels, width, x, y + stride) -
          grayscale(pixels, width, x, y - stride),
      );
      if (horizontal + vertical >= 90) points.push({ x, y });
    }
  }

  const corners = orderedExtremes(points);
  if (!corners) return null;
  const area = polygonArea(corners);
  const areaRatio = area / (width * height);
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const boundsArea =
    (Math.max(...xs) - Math.min(...xs)) *
    (Math.max(...ys) - Math.min(...ys));
  const rectangularity = area / Math.max(1, boundsArea);
  if (
    areaRatio < 0.25 ||
    areaRatio > 0.98 ||
    rectangularity < 0.7
  ) {
    return null;
  }
  return corners;
}

export function bilinearQuadPoint(
  [topLeft, topRight, bottomRight, bottomLeft]: EdgeQuad,
  u: number,
  v: number,
) {
  const inverseU = 1 - u;
  const inverseV = 1 - v;
  return {
    x: Math.round(
      inverseU * inverseV * topLeft.x +
        u * inverseV * topRight.x +
        u * v * bottomRight.x +
        inverseU * v * bottomLeft.x,
    ),
    y: Math.round(
      inverseU * inverseV * topLeft.y +
        u * inverseV * topRight.y +
        u * v * bottomRight.y +
        inverseU * v * bottomLeft.y,
    ),
  };
}

function distance(first: EdgePoint, second: EdgePoint) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function warpCardPixels(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  corners: EdgeQuad,
) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const naturalWidth = Math.max(
    distance(topLeft, topRight),
    distance(bottomLeft, bottomRight),
  );
  const naturalHeight = Math.max(
    distance(topLeft, bottomLeft),
    distance(topRight, bottomRight),
  );
  const scale = Math.min(1, 2400 / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const output = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0 : x / (width - 1);
      const point = bilinearQuadPoint(corners, u, v);
      const sourceX = Math.max(0, Math.min(sourceWidth - 1, point.x));
      const sourceY = Math.max(0, Math.min(sourceHeight - 1, point.y));
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const outputOffset = (y * width + x) * 4;
      output[outputOffset] = source[sourceOffset];
      output[outputOffset + 1] = source[sourceOffset + 1];
      output[outputOffset + 2] = source[sourceOffset + 2];
      output[outputOffset + 3] = source[sourceOffset + 3];
    }
  }
  return { pixels: output.buffer, width, height };
}
