import { NextResponse } from "next/server";

import { localDatabaseConfig } from "@/lib/backend/config";
import { putLocalObject, readLocalObject, verifyLocalObjectToken } from "@/lib/storage/local";

export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  pdf: "application/pdf", csv: "text/csv; charset=utf-8", txt: "text/plain; charset=utf-8", json: "application/json; charset=utf-8",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function contentType(path: string) {
  return contentTypes[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function authorization(request: Request, bucket: string, path: string, operation: "read" | "write") {
  const url = new URL(request.url);
  const expires = Number(url.searchParams.get("expires"));
  const token = url.searchParams.get("token") ?? "";
  return Number.isInteger(expires) && verifyLocalObjectToken(bucket, path, operation, expires, token, localDatabaseConfig().sessionSecret);
}

export async function GET(request: Request, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path: segments } = await params;
  const path = segments.join("/");
  if (!authorization(request, bucket, path, "read")) return NextResponse.json({ error: "Invalid or expired file link." }, { status: 403 });
  try {
    const bytes = await readLocalObject(localDatabaseConfig().dataRoot, bucket, path);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(bytes, { headers: { "content-type": contentType(path), "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.split("/").at(-1) ?? "file")}`, "cache-control": "private, max-age=60" } });
  } catch { return NextResponse.json({ error: "File not found." }, { status: 404 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path: segments } = await params;
  const path = segments.join("/");
  if (!authorization(request, bucket, path, "write")) return NextResponse.json({ error: "Invalid or expired upload link." }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 10 * 1024 * 1024) return NextResponse.json({ error: "File is too large." }, { status: 413 });
  try {
    const saved = await putLocalObject(localDatabaseConfig().dataRoot, bucket, path, await request.arrayBuffer(), { upsert: false });
    return NextResponse.json({ path, size: saved.size, sha256: saved.sha256 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 }); }
}
