import type {
  BusinessCardFieldKey,
  ReviewedBusinessCard,
} from "./types.ts";

export type OcrAssistantState = {
  phase: "idle" | "image" | "processing" | "review";
  fileName: string;
  reviewed: ReviewedBusinessCard | null;
  error: string;
};

export type OcrAssistantEvent =
  | { type: "image-selected"; fileName: string }
  | { type: "ocr-started" }
  | { type: "ocr-succeeded"; reviewed: ReviewedBusinessCard }
  | { type: "ocr-failed"; message: string }
  | { type: "field-edited"; field: BusinessCardFieldKey; value: string }
  | { type: "reset" };

export const initialOcrAssistantState: OcrAssistantState = {
  phase: "idle",
  fileName: "",
  reviewed: null,
  error: "",
};

export function ocrAssistantReducer(
  state: OcrAssistantState,
  event: OcrAssistantEvent,
): OcrAssistantState {
  switch (event.type) {
    case "image-selected":
      return {
        phase: "image",
        fileName: event.fileName,
        reviewed: null,
        error: "",
      };
    case "ocr-started":
      return state.phase === "image"
        ? { ...state, phase: "processing", error: "" }
        : state;
    case "ocr-succeeded":
      return state.phase === "processing"
        ? { ...state, phase: "review", reviewed: event.reviewed, error: "" }
        : state;
    case "ocr-failed":
      return state.phase === "processing"
        ? { ...state, phase: "image", error: event.message }
        : state;
    case "field-edited":
      if (state.phase !== "review" || !state.reviewed) return state;
      return {
        ...state,
        reviewed: {
          ...state.reviewed,
          [event.field]: {
            ...state.reviewed[event.field],
            value: event.value,
          },
        },
      };
    case "reset":
      return initialOcrAssistantState;
  }
}
