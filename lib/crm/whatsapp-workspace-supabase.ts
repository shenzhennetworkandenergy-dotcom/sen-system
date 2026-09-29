import { randomUUID } from "node:crypto";

import { parseWhatsappCustomerCsv, serializeWhatsappCustomerCsv } from "./whatsapp-csv.ts";
import { WHATSAPP_CSV_HEADERS, type WhatsappCustomerRecord } from "./whatsapp-records.ts";
import { normalizeWhatsappSheetMetadata } from "./whatsapp-sheet-model.ts";
import type {
  WhatsappWorkspacePublication,
  WhatsappWorkspaceSnapshot,
  WhatsappWorkspaceStorage,
} from "./whatsapp-workspace-storage.ts";

const bucket = "crm-whatsapp-csv";

export type WhatsappManifest = {
  revision: string;
  previousRevision: string | null;
  updatedAt: string;
};

export interface WhatsappSupabaseStoragePort {
  readManifest(): Promise<WhatsappManifest | null>;
  download(path: string): Promise<string>;
  upload(path: string, body: string): Promise<void>;
  compareAndSwap(expectedRevision: string | null, next: WhatsappManifest): Promise<boolean>;
}

type Identity = { customerId: string; assignedTo: string };
type CategoryMetadata = {
  categories: WhatsappWorkspacePublication["categories"];
  identities: Record<string, Identity>;
};

const rowKey = (categorySlug: string, whatsappNumber: string) => `${categorySlug}\0${whatsappNumber}`;
const object = (revision: string, suffix: string) => `revisions/${revision}/${suffix}`;
const csvField = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

function canonicalCsv(rows: readonly WhatsappCustomerRecord[]) {
  const lines = rows.map((record) => [record.category_slug, ...WHATSAPP_CSV_HEADERS.map((header) => record[header])]
    .map(csvField).join(","));
  return `category_slug,${WHATSAPP_CSV_HEADERS.join(",")}\r\n${lines.length ? `${lines.join("\r\n")}\r\n` : ""}`;
}

function revisionObjects(revision: string, value: WhatsappWorkspacePublication) {
  const identities = Object.fromEntries(value.rows.map((row) => [
    rowKey(row.category_slug, row.whatsapp_number),
    { customerId: row.customer_id, assignedTo: row.assigned_to },
  ]));
  const outputs = new Map<string, string>();
  outputs.set(object(revision, "all-customers.csv"), canonicalCsv(value.rows));
  outputs.set(object(revision, "metadata/categories.json"), JSON.stringify({ categories: value.categories, identities } satisfies CategoryMetadata));
  for (const category of value.categories) {
    const rows = value.rows.filter((row) => row.category_slug === category.slug);
    const csv = serializeWhatsappCustomerCsv(rows);
    parseWhatsappCustomerCsv(csv, category.slug);
    outputs.set(object(revision, `categories/${category.fileName}`), csv);
    outputs.set(object(revision, `metadata/${category.slug}.view.json`), JSON.stringify(normalizeWhatsappSheetMetadata(value.views[category.slug])));
  }
  return outputs;
}

async function readRevision(port: WhatsappSupabaseStoragePort, manifest: WhatsappManifest): Promise<WhatsappWorkspaceSnapshot> {
  try {
    const metadata = JSON.parse(await port.download(object(manifest.revision, "metadata/categories.json"))) as CategoryMetadata;
    if (!Array.isArray(metadata.categories) || !metadata.identities || typeof metadata.identities !== "object") throw new Error("invalid metadata");
    const rowGroups = await Promise.all(metadata.categories.map(async (category) => {
      const rows = parseWhatsappCustomerCsv(await port.download(object(manifest.revision, `categories/${category.fileName}`)), category.slug);
      return rows.map((row) => {
        const identity = metadata.identities[rowKey(category.slug, row.whatsapp_number)];
        return identity ? { ...row, customer_id: identity.customerId, assigned_to: identity.assignedTo } : row;
      });
    }));
    const viewEntries = await Promise.all(metadata.categories.map(async (category) => [
      category.slug,
      normalizeWhatsappSheetMetadata(JSON.parse(await port.download(object(manifest.revision, `metadata/${category.slug}.view.json`)))),
    ] as const));
    return { ...manifest, categories: metadata.categories, rows: rowGroups.flat(), views: Object.fromEntries(viewEntries) };
  } catch {
    throw new Error("WhatsApp CRM workspace is unavailable.");
  }
}

async function publishRevision(
  port: WhatsappSupabaseStoragePort,
  expectedRevision: string | null,
  previousRevision: string | null,
  value: WhatsappWorkspacePublication,
) {
  const manifest: WhatsappManifest = { revision: randomUUID(), previousRevision, updatedAt: new Date().toISOString() };
  try {
    for (const [path, body] of revisionObjects(manifest.revision, value)) await port.upload(path, body);
    if (!await port.compareAndSwap(expectedRevision, manifest)) return null;
    return readRevision(port, manifest);
  } catch {
    throw new Error("WhatsApp CRM workspace is unavailable.");
  }
}

function defaultPort(): WhatsappSupabaseStoragePort {
  const client = async () => (await import("@/lib/supabase/admin")).createSupabaseAdminClient();
  return {
    async readManifest() {
      const { data, error } = await (await client()).from("system_settings").select("value").eq("key", "crm_whatsapp_csv_manifest").maybeSingle();
      if (error) throw error;
      const value = data?.value as Partial<WhatsappManifest> | undefined;
      return value?.revision && value.updatedAt ? value as WhatsappManifest : null;
    },
    async download(path) {
      const { data, error } = await (await client()).storage.from(bucket).download(path);
      if (error || !data) throw error ?? new Error("missing object");
      return data.text();
    },
    async upload(path, body) {
      const { error } = await (await client()).storage.from(bucket).upload(path, body, { contentType: path.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json", upsert: false });
      if (error) throw error;
    },
    async compareAndSwap(expectedRevision, next) {
      const { data, error } = await (await client()).rpc("publish_crm_whatsapp_csv_manifest", { expected_revision: expectedRevision, next_manifest: next });
      if (error) throw error;
      return data === true;
    },
  };
}

export function createSupabaseWhatsappWorkspaceStorage(
  port: WhatsappSupabaseStoragePort = defaultPort(),
): WhatsappWorkspaceStorage {
  return {
    async read() {
      const manifest = await port.readManifest();
      return manifest ? readRevision(port, manifest) : null;
    },
    async initialize(value) {
      const current = await port.readManifest();
      if (current) return readRevision(port, current);
      const created = await publishRevision(port, null, null, value);
      if (created) return created;
      const winner = await port.readManifest();
      if (!winner) throw new Error("WhatsApp CRM workspace is unavailable.");
      return readRevision(port, winner);
    },
    async publish(expectedRevision, value, options) {
      const current = await port.readManifest();
      if (!current || current.revision !== expectedRevision) throw new Error("WhatsApp CRM workspace revision changed; reload before saving.");
      const previousRevision = options?.preservePreviousRevision && current.previousRevision
        ? current.previousRevision
        : expectedRevision;
      const published = await publishRevision(port, expectedRevision, previousRevision, value);
      if (!published) throw new Error("WhatsApp CRM workspace revision changed; reload before saving.");
      return published;
    },
    async restore(expectedRevision) {
      const current = await port.readManifest();
      if (!current || current.revision !== expectedRevision) throw new Error("WhatsApp CRM workspace revision changed; reload before restoring.");
      if (!current.previousRevision) throw new Error("No previous WhatsApp CRM workspace version is available.");
      const previous = await readRevision(port, { revision: current.previousRevision, previousRevision: null, updatedAt: current.updatedAt });
      const restored = await publishRevision(port, current.revision, null, {
        categories: previous.categories,
        rows: previous.rows,
        views: previous.views,
      });
      if (!restored) throw new Error("WhatsApp CRM workspace revision changed; reload before restoring.");
      return restored;
    },
  };
}
