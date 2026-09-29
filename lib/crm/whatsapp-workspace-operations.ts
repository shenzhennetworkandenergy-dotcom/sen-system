import { randomUUID } from "node:crypto";

import type { WhatsappCategoryAssignment } from "./whatsapp-category-classifier.ts";
import {
  createWhatsappCategory,
  INITIAL_WHATSAPP_CATEGORIES,
  type WhatsappCsvCategory,
} from "./whatsapp-categories.ts";
import { parseWhatsappCustomerCsv, serializeWhatsappCustomerCsv } from "./whatsapp-csv.ts";
import {
  mergeWhatsappCustomer,
  normalizeWhatsappNumber,
  WHATSAPP_CSV_HEADERS,
  whatsappLink,
  type WhatsappCustomerInput,
  type WhatsappCustomerRecord,
} from "./whatsapp-records.ts";
import {
  applyWhatsappCellPatches,
  isSystemWhatsappColumn,
  normalizeWhatsappSheetMetadata,
  type WhatsappSheetHeader,
  type WhatsappSheetMetadata,
  type WhatsappSheetSavePayload,
} from "./whatsapp-sheet-model.ts";
import type {
  WhatsappWorkspacePublication,
  WhatsappWorkspaceSnapshot,
  WhatsappWorkspaceStorage,
} from "./whatsapp-workspace-storage.ts";

export type WorkspaceCategorizedWhatsappCustomerInput = WhatsappCustomerInput & {
  categoryMessengerLinks?: Record<string, string>;
};

export type WorkspaceWhatsappSheetState = {
  categorySlug: string;
  rows: WhatsappCustomerRecord[];
  metadata: WhatsappSheetMetadata;
  revision: string;
  hasSnapshot: boolean;
};

const initialWorkspace = (): WhatsappWorkspacePublication => ({
  categories: [...INITIAL_WHATSAPP_CATEGORIES],
  rows: [],
  views: {},
});

const publication = (snapshot: WhatsappWorkspaceSnapshot): WhatsappWorkspacePublication => ({
  categories: snapshot.categories,
  rows: snapshot.rows,
  views: snapshot.views,
});

async function readWorkspace(storage: WhatsappWorkspaceStorage) {
  return await storage.read() ?? storage.initialize(initialWorkspace());
}

function categoryFor(snapshot: WhatsappWorkspaceSnapshot, categorySlug: string) {
  const category = snapshot.categories.find((item) => item.slug === categorySlug);
  if (!category) throw new Error("WhatsApp CSV category is not available.");
  return category;
}

function validateRows(categories: readonly WhatsappCsvCategory[], rows: readonly WhatsappCustomerRecord[]) {
  const validCategories = new Set(categories.map((category) => category.slug));
  if (rows.some((row) => !validCategories.has(row.category_slug))) throw new Error("WhatsApp CSV category is not available.");
  for (const category of categories) {
    const csv = serializeWhatsappCustomerCsv(rows.filter((row) => row.category_slug === category.slug));
    parseWhatsappCustomerCsv(csv, category.slug);
  }
}

async function publish(
  storage: WhatsappWorkspaceStorage,
  current: WhatsappWorkspaceSnapshot,
  next: WhatsappWorkspacePublication,
  preservePreviousRevision = false,
) {
  validateRows(next.categories, next.rows);
  return storage.publish(current.revision, next, { preservePreviousRevision });
}

function replaceCategoryRows(
  current: WhatsappWorkspaceSnapshot,
  categorySlug: string,
  selectedRows: readonly WhatsappCustomerRecord[],
) {
  categoryFor(current, categorySlug);
  if (selectedRows.some((record) => record.category_slug !== categorySlug)) throw new Error("Customer row belongs to another category.");
  const priorById = new Map(current.rows.map((record) => [record.customer_id, record]));
  const saved = selectedRows.map((record) => ({ ...record }));
  const otherRows = current.rows.filter((record) => record.category_slug !== categorySlug).map((record) => ({ ...record }));
  for (const changed of saved) {
    const prior = priorById.get(changed.customer_id);
    if (!prior) continue;
    for (const other of otherRows) {
      if (other.whatsapp_number !== prior.whatsapp_number) continue;
      other.whatsapp_name = changed.whatsapp_name;
      other.whatsapp_number = changed.whatsapp_number;
      other.whatsapp_link = changed.whatsapp_link;
    }
  }
  return { saved, rows: [...otherRows, ...saved] };
}

export async function workspaceReadCategories(storage: WhatsappWorkspaceStorage) {
  return [...(await readWorkspace(storage)).categories];
}

export async function workspaceReadCategory(storage: WhatsappWorkspaceStorage, categorySlug: string) {
  const current = await readWorkspace(storage);
  categoryFor(current, categorySlug);
  return current.rows.filter((row) => row.category_slug === categorySlug).map((row) => ({ ...row }));
}

export async function workspaceReadAllRows(storage: WhatsappWorkspaceStorage) {
  return (await readWorkspace(storage)).rows.map((row) => ({ ...row }));
}

export async function workspaceReplaceAllRows(storage: WhatsappWorkspaceStorage, rows: readonly WhatsappCustomerRecord[]) {
  const current = await readWorkspace(storage);
  const saved = rows.map((row) => ({ ...row }));
  await publish(storage, current, { ...publication(current), rows: saved });
  return saved;
}

export async function workspaceReplaceCategoryRows(
  storage: WhatsappWorkspaceStorage,
  categorySlug: string,
  selectedRows: readonly WhatsappCustomerRecord[],
) {
  const current = await readWorkspace(storage);
  const { saved, rows } = replaceCategoryRows(current, categorySlug, selectedRows);
  await publish(storage, current, { ...publication(current), rows });
  return saved;
}

export async function workspaceFindRow(storage: WhatsappWorkspaceStorage, customerId: string) {
  return (await readWorkspace(storage)).rows.find((row) => row.customer_id === customerId) ?? null;
}

export async function workspaceUpdateRow(
  storage: WhatsappWorkspaceStorage,
  customerId: string,
  changes: Partial<WhatsappCustomerInput>,
) {
  const current = await readWorkspace(storage);
  const rows = current.rows.map((row) => ({ ...row }));
  const index = rows.findIndex((row) => row.customer_id === customerId);
  if (index < 0) throw new Error("WhatsApp customer row is not available.");
  const previous = rows[index];
  const oldNumber = previous.whatsapp_number;
  const newNumber = changes.whatsapp_number ? normalizeWhatsappNumber(changes.whatsapp_number) : oldNumber;
  const saved = mergeWhatsappCustomer(previous, {
    ...changes,
    whatsapp_name: changes.whatsapp_name ?? previous.whatsapp_name,
    whatsapp_number: newNumber,
    conversation_history: changes.conversation_history ?? "",
  });
  rows[index] = saved;
  for (const row of rows) {
    if (row.customer_id === customerId || row.whatsapp_number !== oldNumber) continue;
    row.whatsapp_name = saved.whatsapp_name;
    row.whatsapp_number = newNumber;
    row.whatsapp_link = whatsappLink(newNumber);
    if (changes.assigned_to !== undefined) row.assigned_to = saved.assigned_to;
  }
  await publish(storage, current, { ...publication(current), rows });
  return saved;
}

export async function workspaceCreateCategory(storage: WhatsappWorkspaceStorage, name: string) {
  const current = await readWorkspace(storage);
  const category = createWhatsappCategory(name, current.categories);
  await publish(storage, current, { ...publication(current), categories: [...current.categories, category] });
  return category;
}

export async function workspaceUpsertCustomer(
  storage: WhatsappWorkspaceStorage,
  input: WorkspaceCategorizedWhatsappCustomerInput,
  assignments: readonly WhatsappCategoryAssignment[],
) {
  const current = await readWorkspace(storage);
  const validCategories = new Set(current.categories.map((category) => category.slug));
  if (!assignments.length || assignments.some((assignment) => !validCategories.has(assignment.categorySlug))) {
    throw new Error("Choose a valid WhatsApp CSV category.");
  }
  const number = normalizeWhatsappNumber(input.whatsapp_number);
  const desired = new Set(assignments.map((assignment) => assignment.categorySlug));
  const retained = current.rows
    .filter((row) => row.whatsapp_number !== number || desired.has(row.category_slug))
    .map((row) => ({ ...row }));
  const { categoryMessengerLinks = {}, ...customerInput } = input;
  for (const assignment of assignments) {
    const index = retained.findIndex((row) => row.whatsapp_number === number && row.category_slug === assignment.categorySlug);
    const existing = index >= 0 ? retained[index] : null;
    const saved = mergeWhatsappCustomer(existing, {
      ...customerInput,
      whatsapp_number: number,
      category_slug: assignment.categorySlug,
      messenger_profile_link: categoryMessengerLinks[assignment.categorySlug] || existing?.messenger_profile_link || customerInput.messenger_profile_link || "",
      interested_products: assignment.interestedProducts,
      quantity_requirements: assignment.quantityRequirements,
    });
    if (index >= 0) retained[index] = saved;
    else retained.push(saved);
  }
  for (const row of retained) {
    if (row.whatsapp_number !== number) continue;
    row.whatsapp_name = customerInput.whatsapp_name.trim() || row.whatsapp_name;
    row.whatsapp_number = number;
    row.whatsapp_link = whatsappLink(number);
  }
  await publish(storage, current, { ...publication(current), rows: retained });
  return retained.filter((row) => row.whatsapp_number === number);
}

function sheetState(snapshot: WhatsappWorkspaceSnapshot, categorySlug: string): WorkspaceWhatsappSheetState {
  categoryFor(snapshot, categorySlug);
  return {
    categorySlug,
    rows: snapshot.rows.filter((row) => row.category_slug === categorySlug).map((row) => ({ ...row })),
    metadata: normalizeWhatsappSheetMetadata(snapshot.views[categorySlug]),
    revision: snapshot.revision,
    hasSnapshot: snapshot.previousRevision !== null,
  };
}

export async function workspaceReadSheet(storage: WhatsappWorkspaceStorage, categorySlug: string) {
  return sheetState(await readWorkspace(storage), categorySlug);
}

export async function workspaceStartSheetEdit(storage: WhatsappWorkspaceStorage, categorySlug: string) {
  const current = await readWorkspace(storage);
  const state = sheetState(current, categorySlug);
  if (state.metadata.activeSessionId && state.hasSnapshot) return state;
  const metadata = normalizeWhatsappSheetMetadata({ ...state.metadata, activeSessionId: randomUUID() });
  const next = await publish(storage, current, {
    ...publication(current),
    views: { ...current.views, [categorySlug]: metadata },
  });
  return sheetState(next, categorySlug);
}

function unlockedMetadata(current: WorkspaceWhatsappSheetState, payload: WhatsappSheetSavePayload) {
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

export async function workspaceSaveSheet(storage: WhatsappWorkspaceStorage, payload: WhatsappSheetSavePayload) {
  const current = await readWorkspace(storage);
  const state = sheetState(current, payload.categorySlug);
  if (!payload.sessionId || payload.sessionId !== state.metadata.activeSessionId) throw new Error("The spreadsheet category or edit session is no longer active.");
  if (payload.revision !== state.revision) throw new Error("The spreadsheet changed in another tab. Reload before saving.");
  const applied = applyWhatsappCellPatches(state.rows, unlockedMetadata(state, payload), payload.patches, new Date(), payload.categorySlug);
  const metadata = normalizeWhatsappSheetMetadata({
    ...applied.metadata,
    columnWidths: { ...applied.metadata.columnWidths, ...payload.columnWidths },
    cellFormats: { ...applied.metadata.cellFormats, ...payload.cellFormats },
  });
  const { rows } = replaceCategoryRows(current, payload.categorySlug, applied.rows);
  const next = await publish(storage, current, {
    ...publication(current),
    rows,
    views: { ...current.views, [payload.categorySlug]: metadata },
  }, true);
  return sheetState(next, payload.categorySlug);
}

export async function workspaceFinishSheetEdit(storage: WhatsappWorkspaceStorage, categorySlug: string, sessionId: string) {
  const current = await readWorkspace(storage);
  const state = sheetState(current, categorySlug);
  if (!sessionId || sessionId !== state.metadata.activeSessionId) throw new Error("The spreadsheet edit session is no longer active.");
  const metadata = normalizeWhatsappSheetMetadata({ ...state.metadata, activeSessionId: null });
  const next = await publish(storage, current, {
    ...publication(current),
    views: { ...current.views, [categorySlug]: metadata },
  }, true);
  return sheetState(next, categorySlug);
}

export async function workspaceRestoreSheet(storage: WhatsappWorkspaceStorage, categorySlug: string) {
  const current = await readWorkspace(storage);
  categoryFor(current, categorySlug);
  const restored = await storage.restore(current.revision);
  return sheetState(restored, categorySlug);
}
