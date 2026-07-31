import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8").catch(() => "");

test("chatbot inquiries persist unread state with an indexed database migration", async () => {
  const migrations = await readdir("supabase/migrations");
  const migrationName = migrations.find((name) =>
    name.includes("crm_chatbot_inquiry_unread"),
  );

  assert.ok(migrationName, "Unread inquiry migration is missing.");
  const migration = await read(`supabase/migrations/${migrationName}`);
  assert.match(migration, /read_at\s+timestamptz/i);
  assert.match(migration, /read_by\s+uuid\s+references\s+public\.profiles/i);
  assert.match(migration, /where\s+read_at\s+is\s+null/i);
});

test("dashboard and CRM module count only unread chatbot inquiries", async () => {
  const [counts, inquiryData, overview] = await Promise.all([
    read("lib/dashboard/work-counts.ts"),
    read("lib/crm/chatbot-inquiries.ts"),
    read("app/admin/crm/page.tsx"),
  ]);

  assert.match(inquiryData, /crm_chatbot_inquiries/);
  assert.match(inquiryData, /\.is\("read_at",\s*null\)/);
  assert.match(counts, /getUnreadChatbotInquiryCount/);
  assert.match(counts, /return\s+\{\s*crm,/);
  assert.match(overview, /getUnreadChatbotInquiryCount/);
  assert.match(overview, /unread inquir(?:y|ies)/i);
});

test("inquiry list exposes unread rows and opens a detail page that marks one inquiry read", async () => {
  const [listPage, detailPage, actions] = await Promise.all([
    read("app/admin/crm/chatbot/page.tsx"),
    read("app/admin/crm/chatbot/[id]/page.tsx"),
    read("app/admin/crm/chatbot/actions.ts"),
  ]);

  assert.match(listPage, /read_at/);
  assert.match(listPage, /Unread/);
  assert.match(listPage, /openChatbotInquiryAction\.bind\(null,\s*item\.id\)/);
  assert.match(actions, /markChatbotInquiryRead/);
  assert.match(actions, /redirect\(`\/admin\/crm\/chatbot\/\$\{id\}`\)/);
  assert.match(detailPage, /Product Assistant inquiry/);
});
