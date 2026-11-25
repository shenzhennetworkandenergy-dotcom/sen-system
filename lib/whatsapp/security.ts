export function isWhatsappSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || !host || (site && site !== "same-origin")) return false;
  try {
    // `next start --hostname` puts its bind address in request.url. Compare the
    // actual incoming Host instead; never accept x-forwarded-host as authority.
    const source = new URL(origin);
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const protocol = forwardedProtocol === "https" || forwardedProtocol === "http"
      ? `${forwardedProtocol}:` : new URL(request.url).protocol;
    return origin === source.origin && ["http:", "https:"].includes(protocol)
      && source.protocol === protocol && source.host === host.toLowerCase();
  } catch { return false; }
}
