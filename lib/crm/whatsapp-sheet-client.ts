import type {
  WhatsappCellFormat,
  WhatsappCellPatch,
  WhatsappSheetHeader,
  WhatsappSheetSavePayload,
} from "./whatsapp-sheet-model.ts";

export type WhatsappSheetSaveState = "idle" | "dirty" | "saving" | "saved" | "invalid" | "error";
export type WhatsappSheetChanges = {
  categorySlug: string;
  sessionId: string;
  revision: string;
  patches: Record<string, WhatsappCellPatch>;
  columnWidths: Partial<Record<WhatsappSheetHeader, number>>;
  cellFormats: Record<string, WhatsappCellFormat>;
  unlockCells: string[];
};

export function resizeColumnWidth(startWidth: number, pointerDelta: number) {
  return Math.min(600, Math.max(48, Math.round(startWidth + pointerDelta)));
}

export function buildWhatsappSheetSavePayload(changes: WhatsappSheetChanges): WhatsappSheetSavePayload {
  const payload: WhatsappSheetSavePayload = {
    categorySlug: changes.categorySlug,
    sessionId: changes.sessionId,
    revision: changes.revision,
    patches: Object.values(changes.patches),
  };
  if (Object.keys(changes.columnWidths).length) payload.columnWidths = changes.columnWidths;
  if (Object.keys(changes.cellFormats).length) payload.cellFormats = changes.cellFormats;
  if (changes.unlockCells.length) payload.unlockCells = [...new Set(changes.unlockCells)];
  return payload;
}

export function shouldWarnBeforeUnload(state: WhatsappSheetSaveState) {
  return state === "dirty" || state === "saving" || state === "invalid" || state === "error";
}
