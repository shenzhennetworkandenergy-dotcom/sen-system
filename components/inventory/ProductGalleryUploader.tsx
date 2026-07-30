"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cleanupPreparedProductImageUploadAction,
  finalizeProductImageUploadAction,
  prepareProductImageUploadAction,
} from "@/app/admin/products/actions";
import {
  MAX_PRODUCT_IMAGE_SELECTION,
  validateProductImageMetadata,
} from "@/lib/inventory/product-media";
import { supabase } from "@/lib/supabase/client";

type UploadStatus = "waiting" | "preparing" | "uploading" | "saving" | "complete" | "failed";
type UploadItem = {
  name: string;
  status: UploadStatus;
  error?: string;
};

const statusLabel: Record<UploadStatus, string> = {
  waiting: "Waiting",
  preparing: "Preparing",
  uploading: "Uploading",
  saving: "Saving",
  complete: "Complete",
  failed: "Failed",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to upload this image.";
}

export function ProductGalleryUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [purpose, setPurpose] = useState<"gallery_image" | "main_product_image">("gallery_image");
  const [altText, setAltText] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");

  const updateItem = (index: number, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  };

  const upload = async () => {
    const files = Array.from(inputRef.current?.files ?? []);
    setSummary("");
    if (!files.length) {
      setSummary("Choose at least one product image.");
      return;
    }
    if (files.length > MAX_PRODUCT_IMAGE_SELECTION) {
      setSummary(`Choose no more than ${MAX_PRODUCT_IMAGE_SELECTION} images at a time.`);
      return;
    }
    try {
      files.forEach((file) => validateProductImageMetadata(file));
    } catch (error) {
      setSummary(errorMessage(error));
      return;
    }

    setBusy(true);
    setItems(files.map((file) => ({ name: file.name, status: "waiting" })));
    let completed = 0;

    for (const [index, file] of files.entries()) {
      let prepared: { path: string; token: string } | null = null;
      try {
        updateItem(index, { status: "preparing" });
        const imagePurpose = purpose === "main_product_image" && index > 0
          ? "gallery_image"
          : purpose;
        prepared = await prepareProductImageUploadAction(productId, {
          name: file.name,
          type: file.type,
          size: file.size,
          purpose: imagePurpose,
          altText,
        });

        updateItem(index, { status: "uploading" });
        const { error: uploadError } = await supabase.storage
          .from("product-media")
          .uploadToSignedUrl(prepared.path, prepared.token, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) {
          await cleanupPreparedProductImageUploadAction(productId, prepared.path);
          throw new Error(uploadError.message || "Storage rejected this image.");
        }

        updateItem(index, { status: "saving" });
        await finalizeProductImageUploadAction(productId, {
          path: prepared.path,
          name: file.name,
          type: file.type,
          size: file.size,
          purpose: imagePurpose,
          altText,
        });
        completed += 1;
        updateItem(index, { status: "complete" });
      } catch (error) {
        updateItem(index, { status: "failed", error: errorMessage(error) });
      }
    }

    setBusy(false);
    setSummary(
      completed === files.length
        ? `${completed} image${completed === 1 ? "" : "s"} uploaded successfully.`
        : `${completed} of ${files.length} images uploaded. Review the failed files below.`,
    );
    if (completed) {
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  };

  return <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
    <div className="grid gap-3 md:grid-cols-2">
      <label>
        New images
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={busy}
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 block w-full rounded border bg-white p-2"
        />
        <span className="mt-1 block text-xs text-[var(--muted-text)]">
          JPG, PNG or WebP. Up to 10 MB each and {MAX_PRODUCT_IMAGE_SELECTION} images per batch. Original quality is preserved.
        </span>
      </label>
      <label>
        Purpose
        <select
          value={purpose}
          disabled={busy}
          onChange={(event) => setPurpose(event.target.value as typeof purpose)}
          className="mt-1 block w-full rounded border bg-white p-2"
        >
          <option value="gallery_image">Gallery images</option>
          <option value="main_product_image">Main image first, remaining images in gallery</option>
        </select>
      </label>
      <label className="md:col-span-2">
        Alt text
        <input
          value={altText}
          disabled={busy}
          maxLength={200}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="Describe the product image for accessibility and SEO"
          className="mt-1 block w-full rounded border bg-white p-2"
        />
      </label>
    </div>
    <button
      type="button"
      disabled={busy}
      onClick={upload}
      className="mt-3 rounded bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)] disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? "Uploading images…" : "Upload selected images"}
    </button>

    {items.length ? <ul className="mt-4 space-y-2" aria-live="polite">
      {items.map((item, index) => <li key={`${item.name}-${index}`} className="rounded border bg-white px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-medium">{item.name}</span>
          <span className={item.status === "failed" ? "font-semibold text-red-700" : item.status === "complete" ? "font-semibold text-green-700" : "text-blue-700"}>
            {statusLabel[item.status]}
          </span>
        </div>
        {item.error ? <p className="mt-1 text-red-700">{item.error}</p> : null}
      </li>)}
    </ul> : null}
    {summary ? <p className="mt-3 text-sm font-semibold" role="status">{summary}</p> : null}
  </div>;
}
