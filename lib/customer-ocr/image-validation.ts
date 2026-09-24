export const MAX_BUSINESS_CARD_IMAGE_BYTES = 12 * 1024 * 1024;

const supportedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type BusinessCardImageMetadata = {
  type: string;
  size: number;
};

export type BusinessCardImageValidation = {
  ok: boolean;
  message: string;
};

export function validateBusinessCardImage(
  image: BusinessCardImageMetadata,
): BusinessCardImageValidation {
  if (!Number.isFinite(image.size) || image.size <= 0) {
    return { ok: false, message: "The selected image is empty." };
  }
  if (image.size > MAX_BUSINESS_CARD_IMAGE_BYTES) {
    return {
      ok: false,
      message: "Choose a business-card image no larger than 12 MB.",
    };
  }
  if (!supportedImageTypes.has(image.type.toLocaleLowerCase())) {
    return {
      ok: false,
      message: "Choose a JPEG, PNG, WebP, HEIC, or HEIF image.",
    };
  }
  return { ok: true, message: "" };
}
