class NativeBrowserStorageBucket {
  constructor(private readonly bucket: string) {}
  async uploadToSignedUrl(path: string, token: string, file: Blob) {
    try {
      const [expires, signature] = token.split(".", 2);
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(`/api/local-storage/${encodeURIComponent(this.bucket)}/${encoded}?expires=${encodeURIComponent(expires)}&token=${encodeURIComponent(signature)}`, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      if (!response.ok) throw new Error("Local upload failed.");
      return { data: { path, fullPath: `${this.bucket}/${path}` }, error: null };
    } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Local upload failed." } }; }
  }
}

export const nativeBrowserClient = { storage: { from(bucket: string) { return new NativeBrowserStorageBucket(bucket); } } };
