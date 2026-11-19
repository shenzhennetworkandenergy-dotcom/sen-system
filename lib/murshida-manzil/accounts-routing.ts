export const ACCOUNTS_ENTRY = "/manzil";
export const MURSHIDA_ROOT = "/admin/murshida-manzil";
export const ACCOUNTS_REQUEST_PATH = "x-murshida-accounts-path";
export const PROPERTIES_HOST = "murshidaproperties.sen.com.bd";

export function isAccountsHost(host: string | null, previewOrigin = process.env.MURSHIDA_ACCOUNTS_PREVIEW_ORIGIN) {
  if (!host) return false;
  if (host.toLowerCase() === PROPERTIES_HOST) return true;
  if (!previewOrigin) return false;
  try {
    const preview = new URL(previewOrigin);
    return preview.protocol === "http:" && ["127.0.0.1", "localhost"].includes(preview.hostname)
      && preview.origin === previewOrigin && host.toLowerCase() === preview.host;
  } catch {
    return false;
  }
}

export function accountsHost(requestHeaders: Pick<Headers, "get">) {
  const host = requestHeaders.get("host");
  if (isAccountsHost(host)) return host!.toLowerCase();
  // Next streams Server Action redirects through its loopback listener. The
  // original host survives in X-Forwarded-Host, which Caddy sets on public requests.
  if (host && /^(?:127\.0\.0\.1|localhost):\d+$/i.test(host)) {
    const forwarded = requestHeaders.get("x-forwarded-host");
    if (isAccountsHost(forwarded)) return forwarded!.toLowerCase();
  }
  return null;
}

export function isMurshidaPath(path: string) {
  return path === MURSHIDA_ROOT || path.startsWith(`${MURSHIDA_ROOT}/`);
}

export function accountsReturnPath(value: unknown) {
  if (typeof value !== "string" || /[\\\x00-\x20\x7f]/.test(value)) return MURSHIDA_ROOT;
  try {
    const base = "https://murshidaproperties.sen.com.bd";
    const target = new URL(value, base);
    if (!value.startsWith("/") || target.origin !== base || !isMurshidaPath(target.pathname)) return MURSHIDA_ROOT;
    // Reject encoded path separators and traversal, including double-encoded input.
    if (/%(?:2e|2f|5c|25)/i.test(target.pathname)) return MURSHIDA_ROOT;
    return `${target.pathname}${target.search}`;
  } catch {
    return MURSHIDA_ROOT;
  }
}

export function isAccountsRoute(path: string) {
  return isMurshidaPath(path) || [
    "/murshida-manzil/murshida-seal.png", "/murshida-manzil/murshida-architecture.png"].includes(path);
}
