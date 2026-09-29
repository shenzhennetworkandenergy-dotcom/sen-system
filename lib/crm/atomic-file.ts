import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type RenameFile = (source: string, target: string) => Promise<void>;

export type SafeReplaceOptions = {
  beforeReplace?: (temporaryPath: string, targetPath: string) => Promise<void>;
  renameFile?: RenameFile;
  validate?: (temporaryPath: string) => Promise<void>;
};

async function exists(filePath: string) {
  try {
    await access(/* turbopackIgnore: true */ filePath);
    return true;
  } catch {
    return false;
  }
}

export async function replaceFileSafely(targetPath: string, body: string, options: SafeReplaceOptions = {}) {
  await mkdir(/* turbopackIgnore: true */ path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  const backupPath = `${targetPath}.${randomUUID()}.backup`;
  const renameFile = options.renameFile ?? rename;
  let backupMoved = false;
  try {
    await writeFile(/* turbopackIgnore: true */ temporaryPath, body, "utf8");
    await options.validate?.(temporaryPath);
    await options.beforeReplace?.(temporaryPath, targetPath);
    try {
      await renameFile(temporaryPath, targetPath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!await exists(targetPath) || !["EPERM", "EEXIST", "ENOTEMPTY"].includes(code ?? "")) throw error;
    }

    await renameFile(targetPath, backupPath);
    backupMoved = true;
    try {
      await renameFile(temporaryPath, targetPath);
      await rm(/* turbopackIgnore: true */ backupPath, { force: true });
      backupMoved = false;
    } catch (error) {
      await rm(/* turbopackIgnore: true */ targetPath, { force: true }).catch(() => undefined);
      await renameFile(backupPath, targetPath);
      backupMoved = false;
      throw error;
    }
  } finally {
    await rm(/* turbopackIgnore: true */ temporaryPath, { force: true }).catch(() => undefined);
    if (!backupMoved) await rm(/* turbopackIgnore: true */ backupPath, { force: true }).catch(() => undefined);
  }
}
