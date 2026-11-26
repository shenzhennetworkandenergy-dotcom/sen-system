import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { canSendCompanyWhatsapp, isWhatsappReplyWindowOpen, matchesCustomerPhone, normalizeRecipient, parseMessage, supportedTemplates, templatePreview } from "../lib/whatsapp/messages.ts";
import { createCloudClient, WhatsappFailure } from "../lib/whatsapp/cloud.ts";
import { sendOnce } from "../lib/whatsapp/outbox.ts";
import { isWhatsappSameOrigin } from "../lib/whatsapp/security.ts";
import { isWhatsappWebhookSigned, whatsappInboxMessages, whatsappWebhookChallenge } from "../lib/whatsapp/webhook.ts";
import { exactWhatsappPriceMatch, whatsappPriceText, type WhatsappPriceProduct } from "../lib/whatsapp/price-inquiry.ts";
import { parseWhatsappVCard } from "../lib/whatsapp/vcard.ts";

const config = { token: "test-secret-not-a-real-token", phoneId: "123456789", businessNumber: "15555550100", version: "v27.0", accountId: "987654321" };
const message = { kind: "text" as const, to: "15555550101", text: "পণ্যটি প্রস্তুত আছে। SEN & customer" };
const approved = { name: "order_ready", language: "en_US", status: "APPROVED", components: [{ type: "BODY", text: "Hello {{1}}, order {{2}} is ready." }] };

test("contact exports normalize phone formats and skip conflicting names", () => {
  const input = [
    "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Example Customer\r\nTEL;TYPE=CELL:01712-345678\r\nEND:VCARD",
    "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Example Customer\r\nTEL;VALUE=uri:tel:+8801712345678\r\nEND:VCARD",
    "BEGIN:VCARD\r\nFN:Example A\r\nTEL:+8612345678900\r\nEND:VCARD",
    "BEGIN:VCARD\r\nFN:Example B\r\nTEL:+8612345678900\r\nEND:VCARD",
  ].join("\r\n");
  assert.deepEqual(parseWhatsappVCard(input), {
    contacts: [{ name: "Example Customer", recipient: "8801712345678" }], skipped: 0, conflicting: 1,
  });
});

const hdd: WhatsappPriceProduct = {
  name: "Seagate 16TB HDD", sku: "SEN-EXOS-16T", model_number: "ST16000NM001G",
  slug: "example-16tb-hdd", product_type: "simple", currency: "BDT", regular_price: 20000, sale_price: 18000,
};

test("automatic price replies require a unique exact model or qualified disk capacity", () => {
  assert.equal(exactWhatsappPriceMatch("16TB HDD price?", [hdd])?.price, 18000);
  assert.equal(exactWhatsappPriceMatch("১৬ টিবি হার্ড ডিস্ক এর দাম কত?", [hdd])?.price, 18000);
  assert.equal(exactWhatsappPriceMatch("একটা ১৬টিবি হার্ড ডিস্কের দাম কত?", [hdd])?.price, 18000);
  assert.equal(exactWhatsappPriceMatch("ST16000NM001G price?", [hdd])?.price, 18000);
  assert.equal(exactWhatsappPriceMatch("SEN-EXOS-16T price?", [hdd])?.price, 18000);
  assert.match(whatsappPriceText(hdd, 18000, true), /BDT 18,000\.00/);
  assert.equal(exactWhatsappPriceMatch("60TB HDD price?", [hdd]), null);
  assert.equal(exactWhatsappPriceMatch("WD 16TB HDD price?", [hdd]), null);
  assert.equal(exactWhatsappPriceMatch("16TB or 60TB HDD price?", [hdd]), null);
  assert.equal(exactWhatsappPriceMatch("16TB HDD", [hdd]), null);
  assert.equal(exactWhatsappPriceMatch("16TB HDD price BDT 18000", [hdd]), null);
  assert.equal(exactWhatsappPriceMatch("16TB HDD price?", [hdd, { ...hdd, name: "WD 16TB HDD" }]), null);
  assert.equal(exactWhatsappPriceMatch("16TB HDD price?", [{ ...hdd, product_type: "variable" }]), null);
  assert.equal(exactWhatsappPriceMatch("16TB HDD price?", [{ ...hdd, currency: "USD" }]), null);
  assert.equal(exactWhatsappPriceMatch("16TB HDD price?", [{ ...hdd, sale_price: null, regular_price: null }]), null);
});

test("webhook verification checks both the challenge mode and matching token", () => {
  const url = new URL("https://example.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=42");
  assert.equal(whatsappWebhookChallenge(url, "test-token"), "42");
  assert.equal(whatsappWebhookChallenge(url, "wrong-token"), null);
  url.searchParams.set("hub.mode", "unsupported");
  assert.equal(whatsappWebhookChallenge(url, "test-token"), null);
});

test("webhook accepts only the signed, unmodified bytes", () => {
  const secret = "test-app-secret";
  const body = Buffer.from('{"body":"বাংলা"}');
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(isWhatsappWebhookSigned(body, signature, secret), true);
  assert.equal(isWhatsappWebhookSigned(Buffer.concat([body, Buffer.from(" ")]), signature, secret), false);
  assert.equal(isWhatsappWebhookSigned(body, signature, "wrong-secret"), false);
  assert.equal(isWhatsappWebhookSigned(body, "sha256=0", secret), false);
});

test("extracts text only from the configured account and phone in a mixed webhook batch", () => {
  const item = { id: "wamid.inbound-test", type: "text", from: "15555550101", timestamp: "1760000000", text: { body: "পণ্যের দাম কত?" } };
  const change = { field: "messages", value: { metadata: { phone_number_id: config.phoneId }, messages: [
    item, { ...item, id: "wamid.bad-date", timestamp: "300000000000" }, { ...item, type: "image" }, { ...item, from: null },
  ] } };
  const payload = { object: "whatsapp_business_account", entry: [
    { id: "other", changes: [change] },
    { id: config.accountId, changes: [change, { ...change, value: { ...change.value, metadata: { phone_number_id: "other" } } }] },
  ] };
  assert.deepEqual(whatsappInboxMessages(payload, config.accountId, config.phoneId), [{
    message_id: item.id, sender: item.from, received_at: "2025-10-09T08:53:20.000Z", body: item.text.body,
  }]);
});

test("checks browser origin against the actual Host, including bind-address and HTTPS reverse-proxy cases", () => {
  const request = (headers: Record<string, string>) => new Request("http://0.0.0.0:3024/api/admin/whatsapp", { headers });
  assert.equal(isWhatsappSameOrigin(request({ host: "127.0.0.1:3024", origin: "http://127.0.0.1:3024" })), true);
  assert.equal(isWhatsappSameOrigin(request({ host: "www.sen.com.bd", origin: "https://www.sen.com.bd", "x-forwarded-proto": "https", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isWhatsappSameOrigin(request({ host: "www.sen.com.bd", origin: "https://evil.invalid", "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "https" })), false);
  assert.equal(isWhatsappSameOrigin(request({ host: "127.0.0.1:3024", origin: "http://127.0.0.1:3024", "sec-fetch-site": "cross-site" })), false);
  assert.equal(isWhatsappSameOrigin(request({ host: "127.0.0.1:3024", origin: "http://127.0.0.1:3023" })), false);
  assert.equal(isWhatsappSameOrigin(request({ host: "127.0.0.1:3024" })), false);
});

async function cleanTestDirectory(directory: string) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("sen-whatsapp-"));
  await rm(directory, { recursive: true, force: true });
}

test("only active admins or explicitly granted employees can send; CRM edit alone and customer roles cannot", () => {
  assert.equal(canSendCompanyWhatsapp({ role: "admin", status: "active" }), true);
  assert.equal(canSendCompanyWhatsapp({ role: "employee", status: "active" }, new Set(["crm.send_whatsapp"])), true);
  assert.equal(canSendCompanyWhatsapp({ role: "employee", status: "active" }, new Set(["crm.edit", "crm.view"])), false);
  assert.equal(canSendCompanyWhatsapp({ role: "customer", status: "active" }, new Set(["crm.send_whatsapp"])), false);
  assert.equal(canSendCompanyWhatsapp({ role: "admin", status: "suspended" }), false);
  assert.equal(canSendCompanyWhatsapp({ role: "employee", status: "active", archived_at: "2026-11-23" }, new Set(["crm.send_whatsapp"])), false);
  assert.equal(canSendCompanyWhatsapp(null), false);
});

test("normalizes country prefixes, Bangladesh local numbers and Bengali digits; rejects injected URLs", () => {
  for (const value of ["+880 1712-345678", "008801712345678", "01712345678", "০১৭১২৩৪৫৬৭৮"]) assert.equal(normalizeRecipient(value), "8801712345678");
  for (const value of ["", "+0 1712345678", "+1555?text=other", "https://wa.me/15555550101", "1", "1234567890123456", "call 01712345678"]) assert.throws(() => normalizeRecipient(value));
});

test("validates messages and strips caller-supplied sender and token fields", () => {
  const requestId = randomUUID();
  assert.deepEqual(parseMessage({ ...message, requestId, from: "attacker", access_token: "injected" }), { requestId, message });
  assert.throws(() => parseMessage({ ...message, requestId: "../../other" }));
  assert.throws(() => parseMessage({ ...message, requestId, text: " " }));
  assert.throws(() => parseMessage({ ...message, requestId, text: "x".repeat(4097) }));
});

test("matches visible customer phone formats and refuses missing or different numbers", () => {
  assert.equal(matchesCustomerPhone("8801712345678", "01712-345678"), true);
  assert.equal(matchesCustomerPhone("8801712345678", "+880 1712 345678"), true);
  assert.equal(matchesCustomerPhone("8801712345678", "01712-345679"), false);
  assert.equal(matchesCustomerPhone("8801712345678", null), false);
});

test("inbox replies require an incoming timestamp less than 24 hours old", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  assert.equal(isWhatsappReplyWindowOpen("2026-11-26T12:00:00Z", now), true);
  assert.equal(isWhatsappReplyWindowOpen("2026-11-25T12:00:00.001Z", now), true);
  assert.equal(isWhatsappReplyWindowOpen("2026-11-25T12:00:00Z", now), false);
  assert.equal(isWhatsappReplyWindowOpen("2026-11-26T12:00:00.001Z", now), false);
  assert.equal(isWhatsappReplyWindowOpen("invalid", now), false);
});

test("only approved supported text templates appear; ordered parameters and preview remain correct", () => {
  const result = supportedTemplates([approved, { ...approved, status: "REJECTED" },
    { ...approved, components: [{ type: "HEADER", format: "IMAGE" }] },
    { ...approved, components: [{ type: "BODY", text: "Hello {{name}}" }] },
    { ...approved, components: [{ type: "BODY", text: "Hello {{2}}" }] },
    { ...approved, components: [...approved.components, { type: "BUTTONS", buttons: [] }] }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].parameterCount, 2);
  assert.equal(templatePreview(result[0], ["রহিম", "ABC-123"]), "Hello রহিম, order ABC-123 is ready.");
});

test("uses server-selected sender endpoint and bearer header; preserves Bangla text without leaking credentials in body", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fake = (async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json(init?.method === "POST" ? { messages: [{ id: "wamid.test-accepted" }] } : {
      display_phone_number: "+1 555 555 0100",
      is_on_biz_app: true,
      platform_type: "CLOUD_API",
    });
  }) as typeof fetch;
  const cloud = createCloudClient(config, fake);
  await cloud.verifySender();
  assert.equal(new URL(requests[0].url).searchParams.get("fields"), "display_phone_number,is_on_biz_app,platform_type");
  assert.equal(await cloud.send(message), "wamid.test-accepted");
  assert.equal(requests[1].url, "https://graph.facebook.com/v27.0/123456789/messages");
  assert.equal((requests[1].init?.headers as Record<string, string>).Authorization, `Bearer ${config.token}`);
  const body = JSON.parse(String(requests[1].init?.body));
  assert.equal(body.text.body, message.text);
  assert.equal(body.to, message.to);
  assert.equal(body.from, undefined);
  assert.ok(!String(requests[1].init?.body).includes(config.token));
});

test("rejects mismatched sender before sending", async () => {
  const cloud = createCloudClient(config, (async () => Response.json({ display_phone_number: "+15555550999" })) as typeof fetch);
  await assert.rejects(cloud.verifySender(), (error: WhatsappFailure) => error.code === "account");
});

test("requires Meta to confirm both the Business app and Cloud API for the configured number", async () => {
  for (const capabilities of [
    {},
    { is_on_biz_app: true },
    { is_on_biz_app: false, platform_type: "CLOUD_API" },
  ]) {
    const cloud = createCloudClient(config, (async () => Response.json({
      display_phone_number: "+15555550100",
      ...capabilities,
    })) as typeof fetch);
    await assert.rejects(cloud.verifySender(), (error: WhatsappFailure) =>
      error.code === "account" && error.message.includes("both the WhatsApp Business app and Cloud API"));
  }
});

test("checks template approval and exact field count before using it", async () => {
  const cloud = createCloudClient(config, (async () => Response.json({ data: [approved] })) as typeof fetch);
  await cloud.validateTemplate({ to: message.to, kind: "template", name: approved.name, language: approved.language, parameters: ["Rahim", "123"] });
  await assert.rejects(cloud.validateTemplate({ to: message.to, kind: "template", name: "unapproved", language: approved.language, parameters: [] }));
  await assert.rejects(cloud.validateTemplate({ to: message.to, kind: "template", name: approved.name, language: approved.language, parameters: ["Rahim"] }));
});

test("reports closed 24-hour window, sanitizes provider errors and never retries POST", async () => {
  let requests = 0;
  const cloud = createCloudClient(config, (async () => {
    requests++;
    return Response.json({ error: { code: 131047, message: config.token } }, { status: 400 });
  }) as typeof fetch);
  await assert.rejects(cloud.send(message), (error: WhatsappFailure) => error.code === "window" && !error.message.includes(config.token));
  assert.equal(requests, 1);
});

test("reports Meta billing refusals without retrying the reply", async () => {
  let requests = 0;
  const cloud = createCloudClient(config, (async () => {
    requests++;
    return Response.json({ error: { code: 131042, message: config.token } }, { status: 400 });
  }) as typeof fetch);
  await assert.rejects(cloud.send(message), (error: WhatsappFailure) => error.code === "billing" && !error.message.includes(config.token));
  assert.equal(requests, 1);
});

test("ambiguous network failure, server error and malformed success never become accepted or retry", async () => {
  for (const response of [null, new Response("unavailable", { status: 503 }), Response.json({ success: true })]) {
    let requests = 0;
    const cloud = createCloudClient(config, (async () => { requests++; if (!response) throw new Error("timeout"); return response; }) as typeof fetch);
    await assert.rejects(cloud.send(message), (error: WhatsappFailure) => error.code === "unknown");
    assert.equal(requests, 1);
  }
});

test("durable request journal prevents concurrent and post-restart duplicate sends without storing message text", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sen-whatsapp-test-"));
  try {
    const requestId = randomUUID();
    let sends = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = sendOnce(directory, "admin-1", requestId, message, async () => { sends++; await gate; return "wamid.once"; });
    for (let index = 0; index < 100 && sends === 0; index++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(sends, 1);
    await assert.rejects(sendOnce(directory, "admin-1", requestId, message, async () => "wamid.duplicate"));
    release();
    assert.equal(await first, "wamid.once");
    assert.equal(await sendOnce(directory, "admin-1", requestId, message, async () => { sends++; return "wamid.duplicate"; }), "wamid.once");
    assert.equal(sends, 1);
    await assert.rejects(sendOnce(directory, "another-admin", requestId, message, async () => "wamid.duplicate"));
    await assert.rejects(sendOnce(directory, "admin-1", requestId, { ...message, text: "changed" }, async () => "wamid.duplicate"));
    const contents = await readFile(path.join(directory, `${requestId}.json`), "utf8");
    assert.ok(!contents.includes(message.text));
    assert.ok(!contents.includes(message.to));
    assert.deepEqual(await readdir(directory), [`${requestId}.json`]);
  } finally { await cleanTestDirectory(directory); }
});

test("unresolved sends stay blocked and a new process cannot silently resend them", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sen-whatsapp-unknown-test-"));
  try {
    const requestId = randomUUID();
    await assert.rejects(sendOnce(directory, "admin", requestId, message, async () => { throw new WhatsappFailure("unknown", "interrupted"); }));
    let sent = false;
    await assert.rejects(sendOnce(directory, "admin", requestId, message, async () => { sent = true; return "wamid.bad"; }));
    assert.equal(sent, false);
    assert.equal(JSON.parse(await readFile(path.join(directory, `${requestId}.json`), "utf8")).state, "unknown");
  } finally { await cleanTestDirectory(directory); }
});
