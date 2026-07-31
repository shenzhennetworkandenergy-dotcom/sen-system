export const employeeDocumentAccept = ".pdf,image/jpeg,image/png,image/webp";
export const employeeDocumentMaxBytes = 10 * 1024 * 1024;
export const employeeDocumentTotalMaxBytes = 50 * 1024 * 1024;

const extensions: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export type EmployeeDocumentFile = {
  name: string;
  type: string;
  size: number;
};

export function safeEmployeeDocumentName(name: string) {
  const normalized = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(-120) || "document";
}

export function validateEmployeeDocuments<T extends EmployeeDocumentFile>(files: T[]) {
  if (files.length > 20) throw new Error("Attach no more than 20 files at once.");
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > employeeDocumentTotalMaxBytes) {
    throw new Error("Combined employee documents must be 50 MB or smaller.");
  }
  return files.map((file): { file: T; safeName: string } => {
    if (!file.size) throw new Error(`${file.name || "Document"} is empty.`);
    if (file.size > employeeDocumentMaxBytes) {
      throw new Error(`${file.name || "Document"} must be 10 MB or smaller.`);
    }
    const allowedExtensions = extensions[file.type];
    const lowerName = file.name.toLowerCase();
    if (!allowedExtensions?.some((extension) => lowerName.endsWith(extension))) {
      throw new Error("Only matching PDF, JPG, PNG and WebP documents are accepted.");
    }
    return { file, safeName: safeEmployeeDocumentName(file.name) };
  });
}
