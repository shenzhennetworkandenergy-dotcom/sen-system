"use client";

import Image, { type ImageProps } from "next/image";
import { useMemo, useState } from "react";

const FALLBACK_IMAGE_SRC = "/images/placeholder.svg";
const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSI5Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB4Mj0iMSIgeTE9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZWZmNmZmIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYmZkYmZlIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjkiLz48L3N2Zz4=";

type SafeImageProps = Omit<ImageProps, "src" | "alt" | "placeholder" | "blurDataURL"> & {
  src: string;
  alt: string;
  fallbackSrc?: string;
};

export function SafeImage({ src, alt, fallbackSrc = FALLBACK_IMAGE_SRC, onError, ...props }: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);

  const isSvg = useMemo(() => currentSrc.toLowerCase().endsWith(".svg"), [currentSrc]);

  return (
    <Image
      {...props}
      src={currentSrc}
      alt={alt}
      placeholder="blur"
      blurDataURL={BLUR_DATA_URL}
      loading={props.priority ? "eager" : props.loading ?? "lazy"}
      unoptimized={props.unoptimized ?? isSvg}
      onError={(event) => {
        if (currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        }
        onError?.(event);
      }}
    />
  );
}
