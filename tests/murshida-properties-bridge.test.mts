import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { readPropertiesAccess } from "../lib/murshida-manzil/properties-access.ts";

test("Properties authority verifies the live session and controls read versus manage access", async () => {
  const key = "local-protocol-tests-only-bridge-key-with-at-least-48-characters";
  let mode = "member";
  let calls = 0;
  const server = createServer(async (request, response) => {
    calls++;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    assert.equal(request.url, "/internal/manzil-access/");
    assert.equal(request.headers["x-forwarded-proto"], "https");
    assert.equal(request.headers["x-manzil-signature"], createHmac("sha256", key).update(raw).digest("hex"));
    assert.equal(JSON.parse(raw).session_digest, createHash("sha256").update(request.headers.cookie!).digest("hex"));
    assert.equal(request.headers.cookie, "murshida_properties_session=localSession123");
    if (mode === "denied") { response.writeHead(403); response.end('{"version":1,"reason":"access"}'); return; }
    if (mode === "bridge-error") { response.writeHead(403); response.end('{"version":1,"reason":"bridge"}'); return; }
    if (mode === "logout") { response.writeHead(401); response.end("{}"); return; }
    if (mode === "oversized") { response.end(" ".repeat(9000)); return; }
    if (mode === "invalid") { response.end('{"authorized":true}'); return; }
    response.end(JSON.stringify({ version: 1, authorized: true, viewer: { id: "42", name: "Local reviewer", email: "reviewer@example.test", can_manage: mode === "admin" } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const read = () => readPropertiesAccess("murshida_properties_session=localSession123; sb-auth-token=discard", "murshidaproperties.sen.com.bd", key, url);
  try {
    const member = await read();
    assert.equal(member.kind, "authorized");
    if (member.kind === "authorized") assert.equal(member.viewer.can_manage, false);
    mode = "admin";
    const administrator = await read();
    if (administrator.kind === "authorized") assert.equal(administrator.viewer.can_manage, true); else assert.fail("Admin denied");
    mode = "denied"; assert.deepEqual(await read(), { kind: "forbidden" });
    mode = "bridge-error"; assert.deepEqual(await read(), { kind: "unavailable" });
    mode = "logout"; assert.deepEqual(await read(), { kind: "unauthenticated" });
    mode = "invalid"; assert.deepEqual(await read(), { kind: "unavailable" });
    mode = "oversized"; assert.deepEqual(await read(), { kind: "unavailable" });
    const before = calls;
    assert.deepEqual(await readPropertiesAccess("sb-auth-token=discard", "murshidaproperties.sen.com.bd", key, url), { kind: "unauthenticated" });
    assert.deepEqual(await readPropertiesAccess("murshida_properties_session=localSession123", "murshidaproperties.sen.com.bd", key, "https://external.example.test"), { kind: "unavailable" });
    assert.equal(calls, before);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
