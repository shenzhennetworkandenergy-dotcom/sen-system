import "server-only";

import { localDatabaseConfig } from "@/lib/backend/config";
import { createLocalObjectToken, infoLocalObject, putLocalObject, removeLocalObjects } from "@/lib/storage/local";

function signedPath(bucket: string, objectPath: string, operation: "read" | "write", expiresIn: number, download = false) {
  const config = localDatabaseConfig();
  const expires = Math.floor(Date.now() / 1000) + Math.max(1, Math.min(expiresIn, 86_400));
  const token = createLocalObjectToken(bucket, objectPath, operation, expires, config.sessionSecret);
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`/api/local-storage/${encodeURIComponent(bucket)}/${encodedPath}`, config.publicOrigin);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("token", token);
  if (download) url.searchParams.set("download", "1");
  return { url: url.toString(), token: `${expires}.${token}` };
}

class NativeStorageBucket {
  constructor(private readonly bucket: string) {}

  async upload(path: string, body: File | Blob | ArrayBuffer | Buffer, options?: { upsert?: boolean }) {
    try {
      const bytes = body instanceof Blob ? await body.arrayBuffer() : body;
      await putLocalObject(localDatabaseConfig().dataRoot, this.bucket, path, bytes, { upsert: options?.upsert === true });
      return { data: { path, fullPath: `${this.bucket}/${path}` }, error: null };
    } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Local upload failed." } }; }
  }

  async remove(paths: string[]) {
    try { return { data: (await removeLocalObjects(localDatabaseConfig().dataRoot, this.bucket, paths)).map((name) => ({ name })), error: null }; }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Local removal failed." } }; }
  }

  async info(path: string) {
    try { return { data: await infoLocalObject(localDatabaseConfig().dataRoot, this.bucket, path), error: null }; }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Local object not found." } }; }
  }

  async createSignedUrl(path: string, expiresIn: number, options?: { download?: boolean }) {
    try { return { data: { signedUrl: signedPath(this.bucket, path, "read", expiresIn, options?.download === true).url }, error: null }; }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Unable to sign local URL." } }; }
  }

  async createSignedUrls(paths: string[], expiresIn: number) {
    try { return { data: paths.map((path) => ({ path, signedUrl: signedPath(this.bucket, path, "read", expiresIn).url, error: null })), error: null }; }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Unable to sign local URLs." } }; }
  }

  async createSignedUploadUrl(path: string) {
    try { const signed = signedPath(this.bucket, path, "write", 900); return { data: { path, token: signed.token, signedUrl: signed.url }, error: null }; }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Unable to authorize local upload." } }; }
  }
}

export function createNativeStorageClient() {
  return { from(bucket: string) { return new NativeStorageBucket(bucket); } };
}
