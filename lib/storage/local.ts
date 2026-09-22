import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function localObjectPath(dataRoot: string, bucket: string, objectPath: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) throw new Error("Invalid local storage bucket.");
  const normalized = objectPath.replaceAll("\\", "/");
  if (!normalized || isAbsolute(objectPath) || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid local storage object path.");
  const bucketRoot = resolve(dataRoot, "storage", bucket);
  const absolutePath = resolve(bucketRoot, ...normalized.split("/"));
  const inside = relative(bucketRoot, absolutePath);
  if (!inside || inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside)) throw new Error("Invalid local storage object path.");
  return { bucketRoot, absolutePath, normalizedPath: normalized };
}

export async function putLocalObject(dataRoot: string, bucket: string, objectPath: string, bytes: Buffer | ArrayBuffer, options: { upsert: boolean }) {
  const target = localObjectPath(dataRoot, bucket, objectPath);
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  await mkdir(dirname(target.absolutePath), { recursive: true });
  if (!options.upsert) {
    try { await stat(target.absolutePath); throw new Error("Local storage object already exists."); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const temporary = `${target.absolutePath}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(payload);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await rename(temporary, target.absolutePath); } catch (error) { await rm(temporary, { force: true }); throw error; }
  return { ...target, size: payload.length, sha256: createHash("sha256").update(payload).digest("hex") };
}

export async function readLocalObject(dataRoot: string, bucket: string, objectPath: string) {
  return readFile(localObjectPath(dataRoot, bucket, objectPath).absolutePath);
}

export async function removeLocalObjects(dataRoot: string, bucket: string, objectPaths: string[]) {
  const removed: string[] = [];
  for (const objectPath of objectPaths) {
    try { await unlink(localObjectPath(dataRoot, bucket, objectPath).absolutePath); removed.push(objectPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return removed;
}

export async function infoLocalObject(dataRoot: string, bucket: string, objectPath: string) {
  const target = localObjectPath(dataRoot, bucket, objectPath);
  const details = await stat(target.absolutePath);
  return { name: objectPath, size: details.size, created_at: details.birthtime.toISOString(), updated_at: details.mtime.toISOString() };
}

function objectTokenPayload(bucket: string, objectPath: string, operation: "read" | "write", expires: number) {
  localObjectPath(".", bucket, objectPath);
  return `${operation}\n${bucket}\n${objectPath.replaceAll("\\", "/")}\n${expires}`;
}

export function createLocalObjectToken(bucket: string, objectPath: string, operation: "read" | "write", expires: number, secret: string) {
  if (secret.length < 48) throw new Error("Local storage signing secret is too short.");
  return createHmac("sha256", secret).update(objectTokenPayload(bucket, objectPath, operation, expires)).digest("base64url");
}

export function verifyLocalObjectToken(bucket: string, objectPath: string, operation: "read" | "write", expires: number, token: string, secret: string) {
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  try {
    const expected = Buffer.from(createLocalObjectToken(bucket, objectPath, operation, expires, secret));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
