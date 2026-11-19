// Local composition of the Properties site and the ERP, matching the Caddy routes.
import { createServer, request } from "node:http";

const properties = "http://127.0.0.1:8773";
const erp = "http://127.0.0.1:3019";
const origin = "http://127.0.0.1:3021";
createServer((incoming, outgoing) => {
  const path = new URL(incoming.url, origin).pathname;
  if (path.startsWith("/internal/")) { outgoing.writeHead(404); outgoing.end("Not found"); return; }
  const modulePath = path === "/admin/murshida-manzil" || path.startsWith("/admin/murshida-manzil/");
  const accountsPath = modulePath
    || path.startsWith("/_next/static/") || path === "/_next/image"
    || ["/murshida-manzil/murshida-seal.png", "/murshida-manzil/murshida-architecture.png"].includes(path);
  const upstream = request(new URL(incoming.url, accountsPath ? erp : properties), {
    method: incoming.method,
    headers: { ...incoming.headers, host: "127.0.0.1:3021", "x-forwarded-host": "127.0.0.1:3021", "x-forwarded-proto": "http" },
  }, (response) => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("Local preview service is starting. Please refresh shortly."); });
  incoming.pipe(upstream);
}).listen(3021, "127.0.0.1", () => console.log(`Murshida Properties & Accounts preview: ${origin}`));
