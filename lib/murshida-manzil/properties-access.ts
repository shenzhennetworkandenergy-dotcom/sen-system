import { createHash, createHmac, randomBytes } from "node:crypto";
import { request } from "node:http";

export type PropertiesViewer = { id: string; name: string; email: string; can_manage: boolean };
export type PropertiesAccess = { kind: "authorized"; viewer: PropertiesViewer }
  | { kind: "unauthenticated" | "forbidden" | "unavailable" };

export function isPropertiesCookie(name: string) {
  return name === "murshida_properties_session" || name === "sen_control_murshida_session";
}

export function propertiesCookieHeader(raw: string) {
  return raw.split(";").map(value => value.trim()).filter(value => {
    const separator = value.indexOf("=");
    return separator > 0 && isPropertiesCookie(value.slice(0, separator))
      && /^[a-zA-Z0-9_-]{1,256}$/.test(value.slice(separator + 1));
  }).join("; ");
}

export async function readPropertiesAccess(rawCookie: string, host: string, key: string,
  authority = "http://127.0.0.1:3109"): Promise<PropertiesAccess> {
  const cookie = propertiesCookieHeader(rawCookie);
  if (!cookie) return { kind: "unauthenticated" };
  let target: URL;
  try {
    target = new URL(authority);
    if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.username || target.password
      || target.search || target.hash || target.pathname !== "/" || key.length < 48) return { kind: "unavailable" };
    target.pathname = "/internal/manzil-access/";
  } catch { return { kind: "unavailable" }; }
  const body = JSON.stringify({ audience: "murshida-manzil", timestamp: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString("hex"), session_digest: createHash("sha256").update(cookie).digest("hex") });
  const signature = createHmac("sha256", key).update(body).digest("hex");
  return new Promise(resolve => {
    const outgoing = request(target, { method: "POST", headers: { host, cookie,
      "x-forwarded-proto": host === "murshidaproperties.sen.com.bd" ? "https" : "http", "content-type": "application/json",
      "content-length": Buffer.byteLength(body), "x-manzil-signature": signature } }, incoming => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 8192) { resolve({ kind: "unavailable" }); incoming.destroy(); } else chunks.push(chunk);
      });
      incoming.on("error", () => resolve({ kind: "unavailable" }));
      incoming.on("end", () => {
        if (incoming.statusCode === 401) return resolve({ kind: "unauthenticated" });
        if (incoming.statusCode === 403) {
          try {
            const error = JSON.parse(Buffer.concat(chunks).toString());
            return resolve({ kind: error.version === 1 && error.reason === "access" ? "forbidden" : "unavailable" });
          } catch { return resolve({ kind: "unavailable" }); }
        }
        if (incoming.statusCode !== 200) return resolve({ kind: "unavailable" });
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const viewer = data.viewer;
          if (data.version !== 1 || data.authorized !== true || !viewer || typeof viewer.id !== "string"
            || !/^\d+$/.test(viewer.id) || typeof viewer.name !== "string" || viewer.name.length > 254
            || typeof viewer.email !== "string" || !viewer.email || viewer.email.length > 254
            || typeof viewer.can_manage !== "boolean") return resolve({ kind: "unavailable" });
          resolve({ kind: "authorized", viewer });
        } catch { resolve({ kind: "unavailable" }); }
      });
    });
    const timeout = setTimeout(() => { resolve({ kind: "unavailable" }); outgoing.destroy(); }, 5000);
    outgoing.once("close", () => clearTimeout(timeout));
    outgoing.on("error", () => resolve({ kind: "unavailable" }));
    outgoing.end(body);
  });
}
