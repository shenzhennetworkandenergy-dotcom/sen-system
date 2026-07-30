export const PRODUCT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_SELECTION = 10;

export type ProductImageMimeType = (typeof PRODUCT_IMAGE_MIME_TYPES)[number];
export type ProductImageMetadata = {
  name: string;
  type: string;
  size: number;
};

const extensionByMimeType: Record<ProductImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isProductImageMimeType(type: string): type is ProductImageMimeType {
  return PRODUCT_IMAGE_MIME_TYPES.includes(type as ProductImageMimeType);
}

export function validateProductImageMetadata(
  metadata: ProductImageMetadata,
): asserts metadata is ProductImageMetadata & { type: ProductImageMimeType } {
  if (!Number.isFinite(metadata.size) || metadata.size <= 0) {
    throw new Error("The selected image is empty.");
  }
  if (metadata.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("Each product image must be 10 MB or smaller.");
  }
  if (!isProductImageMimeType(metadata.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
}

export function sanitizeMediaFileName(name: string) {
  return (name || "image").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
}

export function buildProductImagePath(productId: string, mimeType: string, uploadId = crypto.randomUUID()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
    throw new Error("Invalid product identifier.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
    throw new Error("Invalid upload identifier.");
  }
  if (!isProductImageMimeType(mimeType)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  return `${productId}/${uploadId}.${extensionByMimeType[mimeType]}`;
}
