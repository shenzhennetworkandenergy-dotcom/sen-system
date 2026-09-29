import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { replaceFileSafely } from "./atomic-file.ts";
import type {
  WhatsappWorkspacePublication,
  WhatsappWorkspaceSnapshot,
  WhatsappWorkspaceStorage,
} from "./whatsapp-workspace-storage.ts";

export type FilesystemWhatsappWorkspaceOptions = {
  directoryPath?: string;
  beforeReplace?: (temporaryPath: string, targetPath: string) => Promise<void>;
};

const queues = new Map<string, Promise<void>>();

function workspaceDirectory(options?: FilesystemWhatsappWorkspaceOptions) {
  if (options?.directoryPath) return path.resolve(/* turbopackIgnore: true */ options.directoryPath);
  if (process.env.CRM_WHATSAPP_CSV_DIRECTORY) return path.resolve(/* turbopackIgnore: true */ process.env.CRM_WHATSAPP_CSV_DIRECTORY);
  const root = process.env.LOCALAPPDATA || process.env.APPDATA || path.join(/* turbopackIgnore: true */ homedir(), ".sen");
  return path.join(/* turbopackIgnore: true */ root, "SEN", "CRM");
}

async function locked<T>(key: string, operation: () => Promise<T>) {
  const previous = queues.get(key) ?? Promise.resolve();
  let release = () => {};
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => turn);
  queues.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(key) === tail) queues.delete(key);
  }
}

function snapshot(value: WhatsappWorkspacePublication, previousRevision: string | null): WhatsappWorkspaceSnapshot {
  return {
    ...structuredClone(value),
    revision: randomUUID(),
    previousRevision,
    updatedAt: new Date().toISOString(),
  };
}

async function readSnapshot(filePath: string) {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ filePath, "utf8")) as WhatsappWorkspaceSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("WhatsApp CRM workspace is unavailable.");
  }
}

export function createFilesystemWhatsappWorkspaceStorage(
  options?: FilesystemWhatsappWorkspaceOptions,
): WhatsappWorkspaceStorage {
  const root = workspaceDirectory(options);
  const activePath = path.join(/* turbopackIgnore: true */ root, "whatsapp-workspace.json");
  const previousPath = path.join(/* turbopackIgnore: true */ root, "whatsapp-workspace.previous.json");
  const write = (filePath: string, value: WhatsappWorkspaceSnapshot) =>
    replaceFileSafely(filePath, `${JSON.stringify(value)}\n`, { beforeReplace: options?.beforeReplace });

  return {
    read: () => locked(root, () => readSnapshot(activePath)),
    initialize: (value) => locked(root, async () => {
      const current = await readSnapshot(activePath);
      if (current) return current;
      await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
      const created = snapshot(value, null);
      await write(activePath, created);
      return created;
    }),
    publish: (expectedRevision, value, publishOptions) => locked(root, async () => {
      const current = await readSnapshot(activePath);
      if (!current || current.revision !== expectedRevision) throw new Error("WhatsApp CRM workspace revision changed; reload before saving.");
      const preservePrevious = publishOptions?.preservePreviousRevision && current.previousRevision;
      const next = snapshot(value, preservePrevious || current.revision);
      if (!preservePrevious) await write(previousPath, current);
      try {
        await write(activePath, next);
      } catch (error) {
        if (!preservePrevious) await rm(/* turbopackIgnore: true */ previousPath, { force: true });
        throw error;
      }
      return next;
    }),
    restore: (expectedRevision) => locked(root, async () => {
      const current = await readSnapshot(activePath);
      if (!current || current.revision !== expectedRevision) throw new Error("WhatsApp CRM workspace revision changed; reload before restoring.");
      const previous = await readSnapshot(previousPath);
      if (!previous) throw new Error("No previous WhatsApp CRM workspace version is available.");
      const restored = snapshot({ categories: previous.categories, rows: previous.rows, views: previous.views }, null);
      await write(activePath, restored);
      await rm(/* turbopackIgnore: true */ previousPath, { force: true });
      return restored;
    }),
  };
}
