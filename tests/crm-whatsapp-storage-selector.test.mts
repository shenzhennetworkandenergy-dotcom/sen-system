import assert from "node:assert/strict";
import test from "node:test";

import { getWhatsappWorkspaceStorage, type WhatsappWorkspaceStorage } from "../lib/crm/whatsapp-workspace-storage.ts";

const fake = (name: string) => ({ name }) as unknown as WhatsappWorkspaceStorage;

test("selects only an explicit workspace backend and fails closed in production", () => {
  const filesystem = fake("filesystem");
  const supabase = fake("supabase");
  const factories = { filesystem: () => filesystem, supabase: () => supabase };

  assert.equal(getWhatsappWorkspaceStorage({ CRM_WHATSAPP_STORAGE_BACKEND: "filesystem" }, factories), filesystem);
  assert.equal(getWhatsappWorkspaceStorage({ CRM_WHATSAPP_STORAGE_BACKEND: "supabase" }, factories), supabase);
  assert.throws(() => getWhatsappWorkspaceStorage({ NODE_ENV: "production" }, factories), /backend.*required/i);
  assert.throws(() => getWhatsappWorkspaceStorage({ CRM_WHATSAPP_STORAGE_BACKEND: "unknown" }, factories), /unsupported/i);
});

test("uses filesystem by default only outside production", () => {
  const filesystem = fake("filesystem");
  assert.equal(
    getWhatsappWorkspaceStorage({ NODE_ENV: "development" }, { filesystem: () => filesystem, supabase: () => fake("supabase") }),
    filesystem,
  );
});

test("supabase storage receives a validated isolated namespace", () => {
  const seen: string[] = [];
  const storage = fake("supabase");
  const factories = {
    filesystem: () => fake("filesystem"),
    supabase: (namespace: string) => {
      seen.push(namespace);
      return storage;
    },
  };

  assert.equal(getWhatsappWorkspaceStorage({ CRM_WHATSAPP_STORAGE_BACKEND: "supabase" }, factories), storage);
  assert.equal(getWhatsappWorkspaceStorage({
    CRM_WHATSAPP_STORAGE_BACKEND: "supabase",
    CRM_WHATSAPP_STORAGE_NAMESPACE: "preview-crm-release",
  }, factories), storage);
  assert.deepEqual(seen, ["production", "preview-crm-release"]);
  assert.throws(() => getWhatsappWorkspaceStorage({
    CRM_WHATSAPP_STORAGE_BACKEND: "supabase",
    CRM_WHATSAPP_STORAGE_NAMESPACE: "../production",
  }, factories), /namespace/i);
});
