import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { replaceFileSafely } from "./atomic-file.ts";
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
  whatsappLink,
  WHATSAPP_CSV_HEADERS,
  type WhatsappCustomerInput,
  type WhatsappCustomerRecord,
} from "./whatsapp-records.ts";
import { getWhatsappWorkspaceStorage, type WhatsappWorkspaceStorage } from "./whatsapp-workspace-storage.ts";
import {
  workspaceCreateCategory,
  workspaceFindRow,
  workspaceReadAllRows,
  workspaceReadCategories,
  workspaceReadCategory,
  workspaceReplaceAllRows,
  workspaceReplaceCategoryRows,
  workspaceUpdateRow,
  workspaceUpsertCustomer,
} from "./whatsapp-workspace-operations.ts";

export type WhatsappCategoryStoreOptions = {
  directoryPath?: string;
  beforeReplace?: (temporaryPath: string, targetPath: string) => Promise<void>;
  storage?: WhatsappWorkspaceStorage;
};

export type CategorizedWhatsappCustomerInput = WhatsappCustomerInput & {
  categoryMessengerLinks?: Record<string, string>;
};

type RowIdentity = { customerId: string; assignedTo: string };
type StoreMetadata = {
  version: 1;
  categories: WhatsappCsvCategory[];
  identities: Record<string, RowIdentity>;
};

const queues = new Map<string, Promise<void>>();

export function resolveWhatsappCrmDirectory(env: NodeJS.ProcessEnv = process.env) {
  if (env.CRM_WHATSAPP_CSV_DIRECTORY) return path.resolve(/* turbopackIgnore: true */ env.CRM_WHATSAPP_CSV_DIRECTORY);
  if (env.CRM_WHATSAPP_CSV_PATH) return path.dirname(path.resolve(/* turbopackIgnore: true */ env.CRM_WHATSAPP_CSV_PATH));
  if (env.NODE_ENV === "production") throw new Error("CRM_WHATSAPP_CSV_DIRECTORY is required in production.");
  const root = env.LOCALAPPDATA || env.APPDATA || path.join(/* turbopackIgnore: true */ homedir(), ".sen");
  return path.join(/* turbopackIgnore: true */ root, "SEN", "CRM");
}

const directory = (options?: WhatsappCategoryStoreOptions) => options?.directoryPath
  ? path.resolve(/* turbopackIgnore: true */ options.directoryPath)
  : resolveWhatsappCrmDirectory();
const metadataPath = (root: string) => path.join(/* turbopackIgnore: true */ root, "whatsapp-category-meta.json");
const canonicalPath = (root: string) => path.join(/* turbopackIgnore: true */ root, "all-customers.csv");
const rowKey = (categorySlug: string, whatsappNumber: string) => `${categorySlug}\0${whatsappNumber}`;

function selectedWorkspace(options?: WhatsappCategoryStoreOptions) {
  if (options?.storage) return options.storage;
  if (options?.directoryPath || options?.beforeReplace) return null;
  if (process.env.CRM_WHATSAPP_STORAGE_BACKEND || process.env.NODE_ENV === "production") {
    return getWhatsappWorkspaceStorage();
  }
  return null;
}

async function locked<T>(root: string, operation: () => Promise<T>) {
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

const writeAtomic = (filePath: string, body: string, options?: WhatsappCategoryStoreOptions) => replaceFileSafely(filePath, body, {
  beforeReplace: options?.beforeReplace,
});

async function readMetadata(root: string): Promise<StoreMetadata | null> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ metadataPath(root), "utf8")) as StoreMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const metadataBody = (metadata: StoreMetadata) => `${JSON.stringify(metadata, null, 2)}\n`;

async function ensureStore(root: string, options?: WhatsappCategoryStoreOptions) {
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  let metadata = await readMetadata(root);
  if (!metadata) {
    metadata = { version: 1, categories: [...INITIAL_WHATSAPP_CATEGORIES], identities: {} };
    await writeAtomic(metadataPath(root), metadataBody(metadata), options);
  }
  for (const category of metadata.categories) {
    const target = path.join(/* turbopackIgnore: true */ root, category.fileName);
    try {
      await readFile(/* turbopackIgnore: true */ target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeAtomic(target, serializeWhatsappCustomerCsv([]), options);
    }
  }
  try {
    await readFile(/* turbopackIgnore: true */ canonicalPath(root), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeAtomic(canonicalPath(root), `category_slug,${WHATSAPP_CSV_HEADERS.join(",")}\r\n`, options);
  }
  return metadata;
}

function attachIdentity(record: WhatsappCustomerRecord, metadata: StoreMetadata) {
  const key = rowKey(record.category_slug, record.whatsapp_number);
  const identity = metadata.identities[key] ?? { customerId: record.customer_id, assignedTo: "" };
  return { ...record, customer_id: identity.customerId, assigned_to: identity.assignedTo };
}

function refreshIdentities(rows: readonly WhatsappCustomerRecord[], metadata: StoreMetadata) {
  metadata.identities = Object.fromEntries(rows.map((record) => [
    rowKey(record.category_slug, record.whatsapp_number),
    { customerId: record.customer_id, assignedTo: record.assigned_to },
  ]));
}

async function readCategoryUnlocked(category: WhatsappCsvCategory, root: string, metadata: StoreMetadata) {
  const body = await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root, category.fileName), "utf8");
  return parseWhatsappCustomerCsv(body, category.slug).map((record) => attachIdentity(record, metadata));
}

async function readAllUnlocked(root: string, metadata: StoreMetadata) {
  const groups = await Promise.all(metadata.categories.map((category) => readCategoryUnlocked(category, root, metadata)));
  return groups.flat();
}

const csvField = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
function serializeCanonical(rows: readonly WhatsappCustomerRecord[]) {
  const header = `category_slug,${WHATSAPP_CSV_HEADERS.join(",")}`;
  const lines = rows.map((record) => [record.category_slug, ...WHATSAPP_CSV_HEADERS.map((field) => record[field])]
    .map(csvField).join(","));
  return `${[header, ...lines].join("\r\n")}\r\n`;
}

async function publish(root: string, rows: readonly WhatsappCustomerRecord[], metadata: StoreMetadata, options?: WhatsappCategoryStoreOptions) {
  const outputs = metadata.categories.map((category) => {
    const categoryRows = rows.filter((record) => record.category_slug === category.slug);
    const body = serializeWhatsappCustomerCsv(categoryRows);
    parseWhatsappCustomerCsv(body, category.slug);
    return { category, body };
  });
  for (const { category, body } of outputs) {
    await writeAtomic(path.join(/* turbopackIgnore: true */ root, category.fileName), body, options);
  }
  await writeAtomic(canonicalPath(root), serializeCanonical(rows), options);
  await writeAtomic(metadataPath(root), metadataBody(metadata), options);
}

export function readWhatsappCategories(options?: WhatsappCategoryStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceReadCategories(storage);
  const root = directory(options);
  return locked(root, async () => [...(await ensureStore(root, options)).categories]);
}

export function readWhatsappCategory(categorySlug: string, options?: WhatsappCategoryStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceReadCategory(storage, categorySlug);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    const category = metadata.categories.find((item) => item.slug === categorySlug);
    if (!category) throw new Error("WhatsApp CSV category is not available.");
    return readCategoryUnlocked(category, root, metadata);
  });
}

export function readAllWhatsappCategoryRows(options?: WhatsappCategoryStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceReadAllRows(storage);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    return readAllUnlocked(root, metadata);
  });
}

export function replaceAllWhatsappCategoryRows(
  rows: readonly WhatsappCustomerRecord[],
  options?: WhatsappCategoryStoreOptions,
) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceReplaceAllRows(storage, rows);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    const validCategories = new Set(metadata.categories.map((category) => category.slug));
    if (rows.some((record) => !validCategories.has(record.category_slug))) throw new Error("WhatsApp CSV category is not available.");
    const saved = rows.map((record) => ({ ...record }));
    refreshIdentities(saved, metadata);
    await publish(root, saved, metadata, options);
    return saved;
  });
}

export function replaceWhatsappCategoryRows(
  categorySlug: string,
  selectedRows: readonly WhatsappCustomerRecord[],
  options?: WhatsappCategoryStoreOptions,
) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceReplaceCategoryRows(storage, categorySlug, selectedRows);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    if (!metadata.categories.some((category) => category.slug === categorySlug)) throw new Error("WhatsApp CSV category is not available.");
    if (selectedRows.some((record) => record.category_slug !== categorySlug)) throw new Error("Customer row belongs to another category.");
    const current = await readAllUnlocked(root, metadata);
    const priorById = new Map(current.map((record) => [record.customer_id, record]));
    const saved = selectedRows.map((record) => ({ ...record }));
    const otherRows = current.filter((record) => record.category_slug !== categorySlug);

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

    const rows = [...otherRows, ...saved];
    refreshIdentities(rows, metadata);
    await publish(root, rows, metadata, options);
    return saved;
  });
}

export function findWhatsappCategoryRow(customerId: string, options?: WhatsappCategoryStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceFindRow(storage, customerId);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    return (await readAllUnlocked(root, metadata)).find((record) => record.customer_id === customerId) ?? null;
  });
}

export function updateWhatsappCategoryRow(
  customerId: string,
  changes: Partial<WhatsappCustomerInput>,
  options?: WhatsappCategoryStoreOptions,
) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceUpdateRow(storage, customerId, changes);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    const rows = await readAllUnlocked(root, metadata);
    const index = rows.findIndex((record) => record.customer_id === customerId);
    if (index < 0) throw new Error("WhatsApp customer row is not available.");
    const current = rows[index];
    const oldNumber = current.whatsapp_number;
    const newNumber = changes.whatsapp_number ? normalizeWhatsappNumber(changes.whatsapp_number) : oldNumber;
    const saved = mergeWhatsappCustomer(current, {
      ...changes,
      whatsapp_name: changes.whatsapp_name ?? current.whatsapp_name,
      whatsapp_number: newNumber,
      conversation_history: changes.conversation_history ?? "",
    });
    rows[index] = saved;

    for (const record of rows) {
      if (record.whatsapp_number !== oldNumber || record.customer_id === customerId) continue;
      record.whatsapp_name = saved.whatsapp_name;
      record.whatsapp_number = newNumber;
      record.whatsapp_link = whatsappLink(newNumber);
      if (changes.assigned_to !== undefined) record.assigned_to = saved.assigned_to;
    }
    for (const record of rows.filter((row) => row.whatsapp_number === newNumber)) {
      const oldKey = rowKey(record.category_slug, oldNumber);
      const newKey = rowKey(record.category_slug, newNumber);
      const identity = metadata.identities[oldKey] ?? { customerId: record.customer_id, assignedTo: record.assigned_to };
      metadata.identities[newKey] = {
        customerId: identity.customerId,
        assignedTo: changes.assigned_to !== undefined ? saved.assigned_to : identity.assignedTo,
      };
      if (newKey !== oldKey) delete metadata.identities[oldKey];
      record.assigned_to = metadata.identities[newKey].assignedTo;
    }
    await publish(root, rows, metadata, options);
    return rows.find((record) => record.customer_id === customerId)!;
  });
}

export function createWhatsappCategoryCsv(name: string, options?: WhatsappCategoryStoreOptions) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceCreateCategory(storage, name);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    const category = createWhatsappCategory(name, metadata.categories);
    metadata.categories.push(category);
    await writeAtomic(path.join(/* turbopackIgnore: true */ root, category.fileName), serializeWhatsappCustomerCsv([]), options);
    await writeAtomic(metadataPath(root), metadataBody(metadata), options);
    return category;
  });
}

export function upsertCategorizedWhatsappCustomer(
  input: CategorizedWhatsappCustomerInput,
  assignments: readonly WhatsappCategoryAssignment[],
  options?: WhatsappCategoryStoreOptions,
) {
  const storage = selectedWorkspace(options);
  if (storage) return workspaceUpsertCustomer(storage, input, assignments);
  const root = directory(options);
  return locked(root, async () => {
    const metadata = await ensureStore(root, options);
    const validCategories = new Set(metadata.categories.map((category) => category.slug));
    if (!assignments.length || assignments.some((assignment) => !validCategories.has(assignment.categorySlug))) {
      throw new Error("Choose a valid WhatsApp CSV category.");
    }
    const number = normalizeWhatsappNumber(input.whatsapp_number);
    const current = await readAllUnlocked(root, metadata);
    const desired = new Set(assignments.map((assignment) => assignment.categorySlug));
    const retained = current.filter((record) => record.whatsapp_number !== number || desired.has(record.category_slug));
    const { categoryMessengerLinks = {}, ...customerInput } = input;

    for (const assignment of assignments) {
      const index = retained.findIndex((record) => record.whatsapp_number === number && record.category_slug === assignment.categorySlug);
      const existing = index >= 0 ? retained[index] : null;
      const saved = mergeWhatsappCustomer(existing, {
        ...customerInput,
        whatsapp_number: number,
        category_slug: assignment.categorySlug,
        messenger_profile_link: categoryMessengerLinks[assignment.categorySlug] || existing?.messenger_profile_link || customerInput.messenger_profile_link || "",
        interested_products: assignment.interestedProducts,
        quantity_requirements: assignment.quantityRequirements,
      });
      const key = rowKey(assignment.categorySlug, number);
      const identity = metadata.identities[key] ?? { customerId: saved.customer_id, assignedTo: saved.assigned_to };
      metadata.identities[key] = { customerId: identity.customerId, assignedTo: saved.assigned_to || identity.assignedTo };
      saved.customer_id = identity.customerId;
      saved.assigned_to = metadata.identities[key].assignedTo;
      if (index >= 0) retained[index] = saved;
      else retained.push(saved);
    }

    for (const record of retained) {
      if (record.whatsapp_number !== number) continue;
      record.whatsapp_name = customerInput.whatsapp_name.trim() || record.whatsapp_name;
      record.whatsapp_number = number;
      record.whatsapp_link = whatsappLink(number);
    }
    for (const key of Object.keys(metadata.identities)) {
      const [categorySlug, storedNumber] = key.split("\0");
      if (storedNumber === number && !desired.has(categorySlug)) delete metadata.identities[key];
    }
    await publish(root, retained, metadata, options);
    return retained.filter((record) => record.whatsapp_number === number);
  });
}
