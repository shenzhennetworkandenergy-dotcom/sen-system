"use client";

import { useRef, useState } from "react";

type Props = {
  name: string;
  label: string;
  maxDimension?: number;
  className?: string;
  accept?: string;
  allowDocuments?: boolean;
};

export function CompressedImageInput({
  name,
  label,
  maxDimension = 1600,
  className = "",
  accept = "image/jpeg,image/png,image/webp",
  allowDocuments = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState(
    allowDocuments
      ? "Images are optimized before upload. PDF, text and ZIP files are also accepted."
      : "JPG, PNG or WebP. Images are optimized before upload.",
  );

  async function optimize(file: File) {
    if (!file.type.startsWith("image/")) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
  }

  async function changed(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const optimized = await optimize(file);
      const transfer = new DataTransfer();
      transfer.items.add(optimized);
      if (inputRef.current) inputRef.current.files = transfer.files;
      setMessage(`Ready: ${(optimized.size / 1024).toFixed(0)} KB${optimized.size < file.size ? ` (reduced from ${(file.size / 1024).toFixed(0)} KB)` : ""}`);
    } catch {
      setMessage("The original image will be uploaded securely.");
    }
  }

  return <label className={className}>{label}<input ref={inputRef} name={name} type="file" accept={accept} onChange={changed} className="mt-1 block w-full rounded-xl border px-3 py-2.5"/><span className="mt-1 block text-xs text-[var(--muted-text)]">{message}</span></label>;
}
