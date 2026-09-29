import type { WhatsappCsvCategory } from "./whatsapp-categories.ts";
import type { WhatsappCustomerRecord } from "./whatsapp-records.ts";
import type { WhatsappSheetMetadata } from "./whatsapp-sheet-model.ts";
import { createFilesystemWhatsappWorkspaceStorage } from "./whatsapp-workspace-filesystem.ts";
import {
  createSupabaseWhatsappWorkspaceStorage,
  normalizeWhatsappWorkspaceNamespace,
} from "./whatsapp-workspace-supabase.ts";

export type WhatsappWorkspaceSnapshot = {
  revision: string;
  previousRevision: string | null;
  updatedAt: string;
  categories: WhatsappCsvCategory[];
  rows: WhatsappCustomerRecord[];
  views: Record<string, WhatsappSheetMetadata>;
};

export type WhatsappWorkspacePublication = Omit<
  WhatsappWorkspaceSnapshot,
  "revision" | "previousRevision" | "updatedAt"
>;

export interface WhatsappWorkspaceStorage {
  read(): Promise<WhatsappWorkspaceSnapshot | null>;
  initialize(value: WhatsappWorkspacePublication): Promise<WhatsappWorkspaceSnapshot>;
  publish(
    expectedRevision: string,
    value: WhatsappWorkspacePublication,
    options?: { preservePreviousRevision?: boolean },
  ): Promise<WhatsappWorkspaceSnapshot>;
  restore(expectedRevision: string): Promise<WhatsappWorkspaceSnapshot>;
}

export type WhatsappWorkspaceStorageFactories = {
  filesystem: () => WhatsappWorkspaceStorage;
  supabase: (namespace: string) => WhatsappWorkspaceStorage;
};

const defaults: WhatsappWorkspaceStorageFactories = {
  filesystem: () => createFilesystemWhatsappWorkspaceStorage(),
  supabase: (namespace) => createSupabaseWhatsappWorkspaceStorage(undefined, namespace),
};

export function getWhatsappWorkspaceStorage(
  env: Readonly<Record<string, string | undefined>> = process.env,
  factories: WhatsappWorkspaceStorageFactories = defaults,
) {
  const backend = env.CRM_WHATSAPP_STORAGE_BACKEND?.trim().toLowerCase();
  if (!backend) {
    if (env.NODE_ENV === "production") throw new Error("CRM WhatsApp storage backend is required in production.");
    return factories.filesystem();
  }
  if (backend === "filesystem") {
    if (env.VERCEL) throw new Error("Filesystem WhatsApp CRM storage is not supported on Vercel.");
    return factories.filesystem();
  }
  if (backend === "supabase") {
    const namespace = normalizeWhatsappWorkspaceNamespace(env.CRM_WHATSAPP_STORAGE_NAMESPACE);
    return factories.supabase(namespace);
  }
  throw new Error("Unsupported CRM WhatsApp storage backend.");
}
