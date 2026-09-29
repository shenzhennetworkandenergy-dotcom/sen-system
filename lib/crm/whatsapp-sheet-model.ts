import { randomUUID } from "node:crypto";

import {
  normalizeWhatsappNumber,
  parseWhatsappConversation,
  WHATSAPP_CSV_HEADERS,
  whatsappLink,
  whatsappCrmStatuses,
  type WhatsappCustomerRecord,
} from "./whatsapp-records.ts";

export type WhatsappSheetHeader = (typeof WHATSAPP_CSV_HEADERS)[number];
export type WhatsappCellFormat = {
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  wrapText?: boolean;
};
export type WhatsappCellPatch = { customerId: string; header: WhatsappSheetHeader; value: string };
export type WhatsappSheetMetadata = {
  version: 1;
  columnWidths: Partial<Record<WhatsappSheetHeader, number>>;
  cellFormats: Record<string, WhatsappCellFormat>;
  editableCells: string[];
  manualRows: string[];
  activeSessionId: string | null;
};
export type WhatsappSheetSavePayload = {
  categorySlug: string;
  sessionId: string;
  revision: string;
  patches: WhatsappCellPatch[];
  unlockCells?: string[];
  columnWidths?: Partial<Record<WhatsappSheetHeader, number>>;
  cellFormats?: Record<string, WhatsappCellFormat>;
};

const headers = new Set<string>(WHATSAPP_CSV_HEADERS);
const systemHeaders = new Set<WhatsappSheetHeader>(["whatsapp_link", "created_at", "updated_at"]);
const colorPattern = /^#[0-9a-f]{6}$/i;

const uniqueStrings = (value: unknown) => [...new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [])];
const bounded = (value: unknown, minimum: number, maximum: number) => typeof value === "number" && Number.isFinite(value)
  ? Math.min(maximum, Math.max(minimum, Math.round(value)))
  : undefined;

export function cellKey(customerId: string, header: WhatsappSheetHeader) {
  return `${customerId}:${header}`;
}

export function isSystemWhatsappColumn(header: WhatsappSheetHeader) {
  return systemHeaders.has(header);
}

export function normalizeWhatsappSheetMetadata(value: unknown): WhatsappSheetMetadata {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawWidths = input.columnWidths && typeof input.columnWidths === "object" ? input.columnWidths as Record<string, unknown> : {};
  const columnWidths: WhatsappSheetMetadata["columnWidths"] = {};
  for (const [header, width] of Object.entries(rawWidths)) {
    if (!headers.has(header)) continue;
    const normalized = bounded(width, 48, 600);
    if (normalized !== undefined) columnWidths[header as WhatsappSheetHeader] = normalized;
  }

  const rawFormats = input.cellFormats && typeof input.cellFormats === "object" ? input.cellFormats as Record<string, unknown> : {};
  const cellFormats: Record<string, WhatsappCellFormat> = {};
  for (const [key, rawFormat] of Object.entries(rawFormats)) {
    if (!rawFormat || typeof rawFormat !== "object") continue;
    const inputFormat = rawFormat as Record<string, unknown>;
    const format: WhatsappCellFormat = {};
    const fontSize = bounded(inputFormat.fontSize, 8, 24);
    if (fontSize !== undefined) format.fontSize = fontSize;
    if (typeof inputFormat.color === "string" && colorPattern.test(inputFormat.color)) format.color = inputFormat.color;
    if (typeof inputFormat.backgroundColor === "string" && colorPattern.test(inputFormat.backgroundColor)) format.backgroundColor = inputFormat.backgroundColor;
    if (inputFormat.fontWeight === "normal" || inputFormat.fontWeight === "bold") format.fontWeight = inputFormat.fontWeight;
    if (inputFormat.fontStyle === "normal" || inputFormat.fontStyle === "italic") format.fontStyle = inputFormat.fontStyle;
    if (inputFormat.textDecoration === "none" || inputFormat.textDecoration === "underline") format.textDecoration = inputFormat.textDecoration;
    if (inputFormat.textAlign === "left" || inputFormat.textAlign === "center" || inputFormat.textAlign === "right") format.textAlign = inputFormat.textAlign;
    if (typeof inputFormat.wrapText === "boolean") format.wrapText = inputFormat.wrapText;
    if (Object.keys(format).length) cellFormats[key] = format;
  }

  return {
    version: 1,
    columnWidths,
    cellFormats,
    editableCells: uniqueStrings(input.editableCells),
    manualRows: uniqueStrings(input.manualRows),
    activeSessionId: typeof input.activeSessionId === "string" && input.activeSessionId ? input.activeSessionId : null,
  };
}

export function canEditWhatsappCell(record: WhatsappCustomerRecord, header: WhatsappSheetHeader, metadata: WhatsappSheetMetadata) {
  if (isSystemWhatsappColumn(header)) return false;
  return metadata.manualRows.includes(record.customer_id)
    || metadata.editableCells.includes(cellKey(record.customer_id, header))
    || !record[header];
}

function blankRecord(id: string, timestamp: string, categorySlug: string): WhatsappCustomerRecord {
  return {
    ...Object.fromEntries(WHATSAPP_CSV_HEADERS.map((header) => [header, header === "status" ? "new"
      : header === "created_at" || header === "updated_at" ? timestamp
        : ""])),
    customer_id: id,
    category_slug: categorySlug,
    assigned_to: "",
  } as WhatsappCustomerRecord;
}

function validateDate(value: string, label: string) {
  if (value && Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${label} date.`);
}

function validateRows(rows: WhatsappCustomerRecord[]) {
  const numbers = new Set<string>();
  for (const record of rows) {
    record.whatsapp_number = normalizeWhatsappNumber(record.whatsapp_number);
    record.whatsapp_link = whatsappLink(record.whatsapp_number);
    if (numbers.has(record.whatsapp_number)) throw new Error("Duplicate WhatsApp number.");
    numbers.add(record.whatsapp_number);
    if (!whatsappCrmStatuses.includes(record.status)) throw new Error("Invalid WhatsApp status.");
    validateDate(record.last_communication_at, "last communication");
    validateDate(record.next_follow_up_at, "next follow-up");
    validateDate(record.created_at, "created");
    validateDate(record.updated_at, "updated");
    if (record.conversation_history) parseWhatsappConversation(record.conversation_history);
  }
}

export function applyWhatsappCellPatches(
  sourceRows: readonly WhatsappCustomerRecord[],
  sourceMetadata: WhatsappSheetMetadata,
  patches: readonly WhatsappCellPatch[],
  now = new Date(),
  categorySlug = "uncategorized",
) {
  const metadata = normalizeWhatsappSheetMetadata(sourceMetadata);
  const rows = sourceRows.map((record) => ({ ...record }));
  const timestamp = now.toISOString();
  const newIds = new Map<string, string>();
  const changedRows = new Set<string>();

  for (const patch of patches) {
    if (!headers.has(patch.header)) throw new Error("Invalid spreadsheet column.");
    if (isSystemWhatsappColumn(patch.header)) throw new Error("System columns are locked.");
    let customerId = patch.customerId;
    let record = rows.find((candidate) => candidate.customer_id === customerId);
    if (!record && customerId.startsWith("new:")) {
      customerId = newIds.get(customerId) ?? randomUUID();
      newIds.set(patch.customerId, customerId);
      record = rows.find((candidate) => candidate.customer_id === customerId);
      if (!record) {
        record = blankRecord(customerId, timestamp, categorySlug);
        rows.push(record);
        metadata.manualRows.push(customerId);
      }
    }
    if (!record) throw new Error("Customer row is not available.");
    if (!canEditWhatsappCell(record, patch.header, metadata)) throw new Error("This collected cell is locked.");
    const value = String(patch.value ?? "").trim();
    if (record[patch.header] === value) continue;
    record[patch.header] = value as never;
    const key = cellKey(record.customer_id, patch.header);
    if (!metadata.editableCells.includes(key)) metadata.editableCells.push(key);
    changedRows.add(record.customer_id);
  }

  for (const record of rows) if (changedRows.has(record.customer_id)) record.updated_at = timestamp;
  validateRows(rows);
  return { rows, metadata: normalizeWhatsappSheetMetadata(metadata) };
}
