import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_WHATSAPP_CATEGORIES } from "../lib/crm/whatsapp-categories.ts";
import { mergeWhatsappCustomer } from "../lib/crm/whatsapp-records.ts";
import {
  createSupabaseWhatsappWorkspaceStorage,
  type WhatsappManifest,
  type WhatsappSupabaseStoragePort,
} from "../lib/crm/whatsapp-workspace-supabase.ts";

class MemoryPort implements WhatsappSupabaseStoragePort {
  manifests = new Map<string, WhatsappManifest>();
  objects = new Map<string, string>();
  failUploadAt = 0;
  failCas = false;
  uploadCount = 0;

  async readManifest(namespace: string) {
    const manifest = this.manifests.get(namespace);
    return manifest ? structuredClone(manifest) : null;
  }
  async download(path: string) {
    const value = this.objects.get(path);
    if (value === undefined) throw new Error("missing");
    return value;
  }
  async upload(path: string, body: string) {
    this.uploadCount += 1;
    if (this.failUploadAt === this.uploadCount) throw new Error("upload failed");
    if (this.objects.has(path)) throw new Error("duplicate object");
    this.objects.set(path, body);
  }
  async compareAndSwap(namespace: string, expectedRevision: string | null, next: WhatsappManifest) {
    if (this.failCas) throw new Error("rpc failed");
    if ((this.manifests.get(namespace)?.revision ?? null) !== expectedRevision) return false;
    this.manifests.set(namespace, structuredClone(next));
    return true;
  }
}

const empty = { categories: [...INITIAL_WHATSAPP_CATEGORIES], rows: [], views: {} };

test("initialization is private immutable and converges under a race", async () => {
  const port = new MemoryPort();
  const first = createSupabaseWhatsappWorkspaceStorage(port);
  const second = createSupabaseWhatsappWorkspaceStorage(port);
  const [left, right] = await Promise.all([first.initialize(empty), second.initialize(empty)]);
  assert.equal(left.revision, right.revision);
  assert.equal(port.manifests.get("production")?.previousRevision, null);
  const activeObjects = [...port.objects.keys()].filter((key) => key.startsWith(`production/revisions/${left.revision}/`));
  assert.equal(activeObjects.filter((key) => /\/categories\/.*-customers\.csv$/.test(key)).length, 9);
});

test("only one publication wins and failures never replace the active manifest", async () => {
  const port = new MemoryPort();
  const store = createSupabaseWhatsappWorkspaceStorage(port);
  const initial = await store.initialize(empty);
  const customer = mergeWhatsappCustomer(null, {
    category_slug: "networking",
    whatsapp_name: "Customer",
    whatsapp_number: "8801712345678",
    conversation_history: "2026-09-29T09:00:00.000Z|C|Need a switch",
    interested_products: "Cisco switch",
  });
  const next = { ...empty, rows: [customer] };
  const race = await Promise.allSettled([store.publish(initial.revision, next), store.publish(initial.revision, next)]);
  assert.equal(race.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(race.filter((item) => item.status === "rejected").length, 1);
  const active = await store.read();
  assert.equal(active?.rows[0].interested_products, "Cisco switch");

  const activeRevision = active!.revision;
  port.failUploadAt = port.uploadCount + 2;
  await assert.rejects(() => store.publish(activeRevision, empty), /unavailable/i);
  assert.equal(port.manifests.get("production")?.revision, activeRevision);
  port.failUploadAt = 0;
  port.failCas = true;
  await assert.rejects(() => store.publish(activeRevision, empty), /unavailable/i);
  assert.equal(port.manifests.get("production")?.revision, activeRevision);
});

test("missing active objects fail generically and restore is one step", async () => {
  const port = new MemoryPort();
  const store = createSupabaseWhatsappWorkspaceStorage(port);
  const initial = await store.initialize(empty);
  const customer = mergeWhatsappCustomer(null, {
    category_slug: "networking",
    whatsapp_name: "Customer",
    whatsapp_number: "8801712345678",
    conversation_history: "2026-09-29T09:00:00.000Z|C|Need a switch",
  });
  const published = await store.publish(initial.revision, { ...empty, rows: [customer] });
  const restored = await store.restore(published.revision);
  assert.deepEqual(restored.rows, []);
  assert.equal(restored.previousRevision, null);
  await assert.rejects(() => store.restore(restored.revision), /previous|restore/i);

  port.objects.delete(`production/revisions/${restored.revision}/metadata/categories.json`);
  await assert.rejects(() => store.read(), /^Error: WhatsApp CRM workspace is unavailable\.$/);
});

test("preview and production use separate manifests and object prefixes", async () => {
  const port = new MemoryPort();
  const production = createSupabaseWhatsappWorkspaceStorage(port, "production");
  const preview = createSupabaseWhatsappWorkspaceStorage(port, "preview-crm-release");

  const productionSnapshot = await production.initialize(empty);
  const previewSnapshot = await preview.initialize(empty);

  assert.notEqual(productionSnapshot.revision, previewSnapshot.revision);
  assert.equal(port.manifests.size, 2);
  assert.ok([...port.objects.keys()].some((key) => key.startsWith(`production/revisions/${productionSnapshot.revision}/`)));
  assert.ok([...port.objects.keys()].some((key) => key.startsWith(`preview-crm-release/revisions/${previewSnapshot.revision}/`)));
});
