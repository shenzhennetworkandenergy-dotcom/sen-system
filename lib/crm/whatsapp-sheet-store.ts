import { createHash, randomUUID } from "node:crypto";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { replaceFileSafely } from "./atomic-file.ts";
import {
  readAllWhatsappCategoryRows,
  readWhatsappCategory,
  replaceAllWhatsappCategoryRows,
  replaceWhatsappCategoryRows,
  resolveWhatsappCrmDirectory,
  type WhatsappCategoryStoreOptions,
} from "./whatsapp-category-store.ts";
import { serializeWhatsappCustomerCsv } from "./whatsapp-csv.ts";
import {
  applyWhatsappCellPatches,
  isSystemWhatsappColumn,
  normalizeWhatsappSheetMetadata,
  type WhatsappSheetHeader,
  type WhatsappSheetMetadata,
  type WhatsappSheetSavePayload,
} from "./whatsapp-sheet-model.ts";
import { WHATSAPP_CSV_HEADERS, type WhatsappCustomerRecord } from "./whatsapp-records.ts";
import { getWhatsappWorkspaceStorage } from "./whatsapp-workspace-storage.ts";
import {
  workspaceFinishSheetEdit,
  workspaceReadSheet,
  workspaceRestoreSheet,
  workspaceSaveSheet,
  workspaceStartSheetEdit,
} from "./whatsapp-workspace-operations.ts";

export type WhatsappSheetStoreOptions = WhatsappCategoryStoreOptions & {
  beforeMetadataReplace?: (temporaryPath: string, targetPath: string) => Promise<void>;
};
export type WhatsappSheetState = {
  categorySlug: string;
  rows: WhatsappCustomerRecord[];
  metadata: WhatsappSheetMetadata;
  revision: string;
  hasSnapshot: boolean;
};

type Snapshot = { rows: WhatsappCustomerRecord[]; metadata: WhatsappSheetMetadata };
const queues = new Map<string, Promise<void>>();

function selectedWorkspace(options?: WhatsappSheetStoreOptions) {
  if (options?.storage) return options.storage;
  if (options?.directoryPath || options?.beforeReplace || options?.beforeMetadataReplace) return null;
  if (process.env.CRM_WHATSAPP_STORAGE_BACKEND || process.env.NODE_ENV === "production") {
    return getWhatsappWorkspaceStorage();
  }
  return null;
}

const rootFor = (options?: WhatsappSheetStoreOptions) => options?.directoryPath
  ? path.resolve(/* turbopackIgnore: true */ options.directoryPath)
  : resolveWhatsappCrmDirectory();

async function locked<T>(options: WhatsappSheetStoreOptions | undefined, operation: () => Promise<T>) {
  const root = rootFor(options);
  const previous = queues.get(root) ?? Promise.resolve();
  let release = () => {};
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => turn);
  queues.set(root, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(root) === tail) queues.delete(root);
  }
}

function files(categorySlug: string, options?: WhatsappSheetStoreOptions) {
  const root = rootFor(options);
  return {
    view: path.join(/* turbopackIgnore: true */ root, `${categorySlug}.view.json`),
    previous: path.join(/* turbopackIgnore: true */ root, `${categorySlug}.previous.json`),
  };
}

async function exists(filePath: string) {
  try {
    await access(/* turbopackIgnore: true */ filePath);
    return true;
  } catch {
    return false;
  }
}

async function readMetadata(filePath: string) {
  try {
    return normalizeWhatsappSheetMetadata(JSON.parse(await readFile(/* turbopackIgnore: true */ filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return normalizeWhatsappSheetMetadata(undefined);
    throw error;
  }
}

const writeAtomic = (filePath: string, body: string, beforeReplace?: (temporaryPath: string, targetPath: string) => Promise<void>) => replaceFileSafely(filePath, body, { beforeReplace });
const metadataJson = (metadata: WhatsappSheetMetadata) => `${JSON.stringify(normalizeWhatsappSheetMetadata(metadata), null, 2)}\n`;
const revisionFor = (categorySlug: string, rows: readonly WhatsappCustomerRecord[], metadata: WhatsappSheetMetadata) => createHash("sha256")
  .update(categorySlug)
  .update(serializeWhatsappCustomerCsv(rows))
  .update(metadataJson(metadata))
  .digest("hex");

async function readState(categorySlug: string, options?: WhatsappSheetStoreOptions): Promise<WhatsappSheetState> {
  const target = files(categorySlug, options);
  const rows = await readWhatsappCategory(categorySlug, options);
  const metadata = await readMetadata(target.view);
  return {
    categorySlug,
    rows,
    metadata,
    revision: revisionFor(categorySlug, rows, metadata),
    hasSnapshot: await exists(target.previous),
  };
}

export function readWhatsappSheet(categorySlug: string, options?: WhatsappSheetStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceReadSheet(storage, categorySlug);
  return locked(options, () => readState(categorySlug, options));
}

export function startWhatsappSheetEdit(categorySlug: string, options?: WhatsappSheetStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceStartSheetEdit(storage, categorySlug);
  return locked(options, async () => {
  const target = files(categorySlug, options);
  const current = await readState(categorySlug, options);
  if (current.metadata.activeSessionId && current.hasSnapshot) return current;
  const priorSnapshot = await exists(target.previous) ? await readFile(/* turbopackIgnore: true */ target.previous, "utf8") : null;
  const snapshot: Snapshot = {
    rows: await readAllWhatsappCategoryRows(options),
    metadata: normalizeWhatsappSheetMetadata({ ...current.metadata, activeSessionId: null }),
  };
  try {
    await writeAtomic(target.previous, `${JSON.stringify(snapshot)}\n`);
    const metadata = normalizeWhatsappSheetMetadata({ ...current.metadata, activeSessionId: randomUUID() });
    await writeAtomic(target.view, metadataJson(metadata), options?.beforeMetadataReplace);
    return { ...current, metadata, revision: revisionFor(categorySlug, current.rows, metadata), hasSnapshot: true };
  } catch (error) {
    if (priorSnapshot === null) await rm(/* turbopackIgnore: true */ target.previous, { force: true });
    else await writeAtomic(target.previous, priorSnapshot);
    throw error;
  }
  });
}

function unlockedMetadata(current: WhatsappSheetState, payload: WhatsappSheetSavePayload) {
  const editableCells = [...current.metadata.editableCells];
  for (const key of payload.unlockCells ?? []) {
    const separator = key.lastIndexOf(":");
    const customerId = key.slice(0, separator);
    const header = key.slice(separator + 1) as WhatsappSheetHeader;
    const record = current.rows.find((candidate) => candidate.customer_id === customerId);
    if (!record || !WHATSAPP_CSV_HEADERS.includes(header) || isSystemWhatsappColumn(header)) throw new Error("Invalid cell unlock request.");
    if (!editableCells.includes(key)) editableCells.push(key);
  }
  return normalizeWhatsappSheetMetadata({ ...current.metadata, editableCells });
}

export function saveWhatsappSheet(payload: WhatsappSheetSavePayload, options?: WhatsappSheetStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceSaveSheet(storage, payload);
  return locked(options, async () => {
  const current = await readState(payload.categorySlug, options);
  if (payload.categorySlug !== current.categorySlug) throw new Error("The spreadsheet category changed. Reload before saving.");
  if (!payload.sessionId || payload.sessionId !== current.metadata.activeSessionId) throw new Error("The spreadsheet category or edit session is no longer active.");
  if (payload.revision !== current.revision) throw new Error("The spreadsheet changed in another tab. Reload before saving.");
  const unlocked = unlockedMetadata(current, payload);
  const applied = applyWhatsappCellPatches(current.rows, unlocked, payload.patches, new Date(), payload.categorySlug);
  const metadata = normalizeWhatsappSheetMetadata({
    ...applied.metadata,
    columnWidths: { ...applied.metadata.columnWidths, ...payload.columnWidths },
    cellFormats: { ...applied.metadata.cellFormats, ...payload.cellFormats },
  });
  const allBefore = await readAllWhatsappCategoryRows(options);
  await replaceWhatsappCategoryRows(payload.categorySlug, applied.rows, options);
  try {
    await writeAtomic(files(payload.categorySlug, options).view, metadataJson(metadata), options?.beforeMetadataReplace);
  } catch (error) {
    await replaceAllWhatsappCategoryRows(allBefore, options);
    await writeAtomic(files(payload.categorySlug, options).view, metadataJson(current.metadata));
    throw error;
  }
    return {
    categorySlug: payload.categorySlug,
    rows: applied.rows,
    metadata,
    revision: revisionFor(payload.categorySlug, applied.rows, metadata),
    hasSnapshot: current.hasSnapshot,
    };
  });
}

export function finishWhatsappSheetEdit(categorySlug: string, sessionId: string, options?: WhatsappSheetStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceFinishSheetEdit(storage, categorySlug, sessionId);
  return locked(options, async () => {
  const current = await readState(categorySlug, options);
  if (!sessionId || sessionId !== current.metadata.activeSessionId) throw new Error("The spreadsheet edit session is no longer active.");
  const metadata = normalizeWhatsappSheetMetadata({ ...current.metadata, activeSessionId: null });
  await writeAtomic(files(categorySlug, options).view, metadataJson(metadata), options?.beforeMetadataReplace);
    return { ...current, metadata, revision: revisionFor(categorySlug, current.rows, metadata) };
  });
}

export function restorePreviousWhatsappSheet(categorySlug: string, options?: WhatsappSheetStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceRestoreSheet(storage, categorySlug);
  return locked(options, async () => {
  await readWhatsappCategory(categorySlug, options);
  const target = files(categorySlug, options);
  if (!await exists(target.previous)) throw new Error("No previous version snapshot is available.");
  const snapshot = JSON.parse(await readFile(/* turbopackIgnore: true */ target.previous, "utf8")) as Snapshot;
  await replaceAllWhatsappCategoryRows(snapshot.rows, options);
  const metadata = normalizeWhatsappSheetMetadata({ ...snapshot.metadata, activeSessionId: null });
  await writeAtomic(target.view, metadataJson(metadata), options?.beforeMetadataReplace);
  await rm(/* turbopackIgnore: true */ target.previous, { force: true });
  const rows = await readWhatsappCategory(categorySlug, options);
    return { categorySlug, rows, metadata, revision: revisionFor(categorySlug, rows, metadata), hasSnapshot: false };
  });
}
