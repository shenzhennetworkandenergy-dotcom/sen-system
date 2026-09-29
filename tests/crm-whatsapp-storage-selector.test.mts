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
