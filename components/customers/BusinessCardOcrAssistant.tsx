"use client";

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent,
  type ChangeEvent,
} from "react";

import { validateBusinessCardImage } from "@/lib/customer-ocr/image-validation";
import {
  businessCardFieldKeys,
  type BusinessCardFieldKey,
  type ReviewedBusinessCard,
} from "@/lib/customer-ocr/types";
import {
  initialOcrAssistantState,
  ocrAssistantReducer,
} from "@/lib/customer-ocr/workflow";

const labels: Record<BusinessCardFieldKey, string> = {
  companyName: "Company / Organization Name",
  contactName: "Contact Person Name",
  designation: "Designation / Job Title",
  mobileNumber: "Mobile Number",
  alternatePhone: "Alternate Phone Number",
  emailAddress: "Email Address",
  website: "Website",
  fullAddress: "Full Address",
  city: "City",
  country: "Country",
};

const fieldClass =
  "mt-1 w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm";

export function BusinessCardOcrAssistant({
  onApply,
}: {
  onApply: (reviewed: ReviewedBusinessCard) => void;
}) {
  const uploadId = useId();
  const cameraId = useId();
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [state, dispatch] = useReducer(
    ocrAssistantReducer,
    initialOcrAssistantState,
  );
  const [image, setImage] = useState<File | Blob | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [processedPreview, setProcessedPreview] = useState("");
  const [rotation, setRotation] = useState(0);
  const [detectCard, setDetectCard] = useState(true);
  const [progress, setProgress] = useState({ stage: "", progress: 0 });
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    return () => {
      if (processedPreview) URL.revokeObjectURL(processedPreview);
    };
  }, [processedPreview]);

  function receiveImage(nextImage: File | Blob, name = "Pasted business card") {
    const validation = validateBusinessCardImage(nextImage);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }
    setImage(nextImage);
    setImagePreview(URL.createObjectURL(nextImage));
    setProcessedPreview("");
    setRotation(0);
    setDetectCard(true);
    setProgress({ stage: "", progress: 0 });
    setMessage(
      "Image stays on this device. Rotate or keep the original crop, then run OCR.",
    );
    dispatch({
      type: "image-selected",
      fileName: nextImage instanceof File ? nextImage.name : name,
    });
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) receiveImage(file);
    event.target.value = "";
  }

  function receivePaste(event: ClipboardEvent<HTMLElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    receiveImage(file);
  }

  async function readClipboardImage() {
    if (!navigator.clipboard?.read) {
      setMessage(
        "Direct clipboard image access is unavailable. Focus this panel and press Ctrl+V, or upload the image.",
      );
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          receiveImage(await item.getType(imageType));
          return;
        }
      }
      setMessage("The clipboard does not contain an image.");
    } catch {
      setMessage(
        "Clipboard permission was not granted. Focus this panel and press Ctrl+V, or upload the image.",
      );
    }
  }

  async function runOcr() {
    if (!image || state.phase !== "image") return;
    dispatch({ type: "ocr-started" });
    setMessage("");
    setProgress({ stage: "Preparing image", progress: 0 });
    try {
      const [{ preprocessBusinessCard }, { createTesseractBusinessCardProvider }] =
        await Promise.all([
          import("@/lib/customer-ocr/preprocess"),
          import("@/lib/customer-ocr/providers/tesseract-browser"),
        ]);
      const processed = await preprocessBusinessCard(image, {
        rotation,
        detectCard,
      });
      setProcessedPreview(URL.createObjectURL(processed.blob));
      if (processed.warning) setMessage(processed.warning);
      const provider = await createTesseractBusinessCardProvider();
      const reviewed = await provider.recognize(processed.blob, {
        onProgress: setProgress,
      });
      dispatch({ type: "ocr-succeeded", reviewed });
      setProgress({ stage: "Recognition complete", progress: 1 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      dispatch({
        type: "ocr-failed",
        message: detail || "Business-card OCR could not be completed.",
      });
      setMessage(
        detail ||
          "Business-card OCR could not be completed. Manual entry remains available.",
      );
    }
  }

  function reset() {
    setImage(null);
    setImagePreview("");
    setProcessedPreview("");
    setRotation(0);
    setDetectCard(true);
    setProgress({ stage: "", progress: 0 });
    setMessage("");
    dispatch({ type: "reset" });
  }

  return (
    <section
      className="mt-4 rounded-xl border border-dashed bg-[var(--muted-surface)] p-4"
      onPaste={receivePaste}
      tabIndex={0}
      aria-label="Business card OCR assistant"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">Business Card OCR / Scan Assistant</h3>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted-text)]">
            Optional. Images and OCR stay in this browser. Review and correct
            every value before applying it; applying never saves a customer.
          </p>
        </div>
        {state.phase !== "idle" ? (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            Reset card
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={uploadRef}
          id={uploadId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={onFileChange}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]"
        >
          Upload / Paste Business Card
        </button>
        <button
          type="button"
          onClick={readClipboardImage}
          className="rounded-lg border px-4 py-2 font-semibold"
        >
          Paste from clipboard
        </button>
        <input
          ref={cameraRef}
          id={cameraId}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileChange}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="rounded-lg border px-4 py-2 font-semibold"
        >
          Scan Business Card
        </button>
      </div>

      {imagePreview ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Original card</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Original business card preview"
              className="mt-2 max-h-72 w-full rounded-lg border bg-white object-contain"
            />
          </div>
          {processedPreview ? (
            <div>
              <p className="text-sm font-semibold">Processed for OCR</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={processedPreview}
                alt="Processed business card preview"
                className="mt-2 max-h-72 w-full rounded-lg border bg-white object-contain"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {state.phase === "image" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRotation((current) => current - 90)}
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            Rotate left
          </button>
          <button
            type="button"
            onClick={() => setRotation((current) => current + 90)}
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            Rotate right
          </button>
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={!detectCard}
              onChange={(event) => setDetectCard(!event.target.checked)}
            />
            Use original crop
          </label>
          <button
            type="button"
            onClick={runOcr}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]"
          >
            Read card with OCR
          </button>
        </div>
      ) : null}

      {state.phase === "processing" ? (
        <div className="mt-4 rounded-lg border bg-[var(--surface)] p-3" aria-live="polite">
          <p className="text-sm font-semibold capitalize">
            {progress.stage || "Loading OCR"}
          </p>
          <progress
            className="mt-2 w-full"
            value={progress.progress}
            max={1}
          />
          <p className="mt-1 text-xs text-[var(--muted-text)]">
            The OCR engine and English, Bangla, and Chinese language data are
            loaded from this offline installation. No card data is uploaded.
          </p>
        </div>
      ) : null}

      {message || state.error ? (
        <p className="mt-3 text-sm text-amber-800" aria-live="polite">
          {state.error || message}
        </p>
      ) : null}

      {state.phase === "review" && state.reviewed ? (
        <div className="mt-5 rounded-xl border bg-[var(--surface)] p-4">
          <div>
            <h4 className="text-lg font-bold">Review Extracted Information</h4>
            <p className="mt-1 text-sm text-[var(--muted-text)]">
              Correct every value. Low-confidence and ambiguous fields need
              special attention.
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {businessCardFieldKeys.map((key) => {
              const reviewed = state.reviewed![key];
              const needsReview = reviewed.status !== "ok";
              return (
                <label key={key} className="text-sm font-semibold">
                  <span className="flex flex-wrap items-center gap-2">
                    {labels[key]}
                    {needsReview ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                        {reviewed.status === "ambiguous"
                          ? "Ambiguous — review"
                          : "Low confidence — review"}
                      </span>
                    ) : null}
                  </span>
                  <input
                    value={reviewed.value}
                    onChange={(event) =>
                      dispatch({
                        type: "field-edited",
                        field: key,
                        value: event.target.value,
                      })
                    }
                    className={`${fieldClass} ${
                      needsReview ? "border-amber-400" : ""
                    }`}
                  />
                  <span className="mt-1 block text-xs font-normal text-[var(--muted-text)]">
                    {reviewed.confidence === null
                      ? "Not detected"
                      : `OCR confidence ${Math.round(reviewed.confidence)}%`}
                    {key === "designation" || key === "website"
                      ? " · Not stored by the current customer form"
                      : ""}
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onApply(state.reviewed!)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]"
          >
            Apply to Customer Form
          </button>
        </div>
      ) : null}
    </section>
  );
}
