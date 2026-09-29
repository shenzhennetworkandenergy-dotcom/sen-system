import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("CRM overview links to the WhatsApp follow-up workspace without touching public routes", async () => {
  const page = await source("app/admin/crm/page.tsx");
  assert.match(page, /href="\/admin\/crm\/whatsapp"/);
  assert.match(page, /WhatsApp customer follow-up/i);
});

test("workspace lists only authorized rows and supports name number product status and history search", async () => {
  const page = await source("app/admin/crm/whatsapp/page.tsx");
  assert.match(page, /requirePermission\("crm\.view"\)/);
  assert.match(page, /readAllWhatsappCategoryRows/);
  assert.match(page, /canAccessWhatsappRecord/);
  for (const field of ["whatsapp_name", "whatsapp_number", "interested_products", "status", "conversation_history"]) {
    assert.match(page, new RegExp(field));
  }
});

test("detail view displays the complete chronology product evidence follow-up and editable draft", async () => {
  const page = await source("app/admin/crm/whatsapp/[customerId]/page.tsx");
  assert.match(page, /WhatsappConversation/);
  assert.match(page, /researchWhatsappProducts/);
  assert.match(page, /next_follow_up_at/);
  assert.match(page, /saveWhatsappDraftAction/);
});

test("collector form accepts full history voice transcripts and attachment descriptions as text", async () => {
  const form = await source("components/crm/WhatsappCustomerForm.tsx");
  assert.match(form, /messenger_profile_link/);
  assert.match(form, /conversation_history/);
  assert.match(form, /\[Voice transcript\]/);
  assert.match(form, /\[Attachment\]/);
  assert.match(form, /\[Do not contact\]/);
  assert.doesNotMatch(form, /type="file"/);
  for (const removed of ["company", "country", "budget", "delivery_location"]) assert.doesNotMatch(form, new RegExp(`name="${removed}"`));
});

test("every mutation rechecks CRM permission and record ownership server-side", async () => {
  const actions = await source("app/admin/crm/whatsapp/actions.ts");
  assert.match(actions, /classifyWhatsappInterest/);
  assert.match(actions, /upsertCategorizedWhatsappCustomer/);
  assert.match(actions, /findWhatsappCategoryRow/);
  assert.match(actions, /updateWhatsappCategoryRow/);
  for (const removed of ["company", "country", "budget", "delivery_location"]) assert.doesNotMatch(actions, new RegExp(`text\\(form, "${removed}"`));
  for (const name of [
    "upsertWhatsappCustomerAction",
    "syncWhatsappCustomerAction",
    "saveWhatsappDraftAction",
    "updateWhatsappCustomerStatusAction",
    "recordApprovedWhatsappSendAction",
  ]) assert.match(actions, new RegExp(`export async function ${name}`));
  assert.ok((actions.match(/requirePermission\(/g) ?? []).length >= 5);
  assert.ok((actions.match(/canAccessWhatsappRecord/g) ?? []).length >= 4);
});

test("record approved send only appends supplied sent text and never sends WhatsApp itself", async () => {
  const actions = await source("app/admin/crm/whatsapp/actions.ts");
  assert.ok((actions.match(/isWhatsappFollowupAllowed\(record\)/g) ?? []).length >= 2);
  const start = actions.indexOf("export async function recordApprovedWhatsappSendAction");
  const body = actions.slice(start);
  assert.match(body, /role:\s*"S"/);
  assert.match(body, /updateWhatsappCategoryRow/);
  assert.doesNotMatch(body, /fetch\(|wa\.me|sendMessage|whatsapp-web/i);
});

test("detail page hides draft and manual-send controls after follow-up stops", async () => {
  const page = await source("app/admin/crm/whatsapp/[customerId]/page.tsx");
  assert.match(page, /isWhatsappFollowupAllowed\(record\)/);
  assert.match(page, /canFollowup/);
});

test("CSV export validates and downloads the selected registered category", async () => {
  const route = await source("app/admin/crm/whatsapp/export/route.ts");
  assert.match(route, /requirePermission\("crm\.export"\)/);
  assert.match(route, /new URL\(request\.url\)/);
  assert.match(route, /searchParams\.get\("category"\)/);
  assert.match(route, /readWhatsappCategories/);
  assert.match(route, /readWhatsappCategory/);
  assert.match(route, /serializeWhatsappCustomerCsv/);
  assert.match(route, /category\.fileName/);
  assert.doesNotMatch(route, /resolveWhatsappCsvPath|readFile/);
  assert.match(route, /text\/csv/);
});

test("workspace links to a protected full spreadsheet-style CSV browser preview", async () => {
  const workspace = await source("app/admin/crm/whatsapp/page.tsx");
  const preview = await source("app/admin/crm/whatsapp/preview/page.tsx");
  const table = await source("components/crm/WhatsappCsvPreviewTable.tsx");
  assert.match(workspace, /href="\/admin\/crm\/whatsapp\/preview"/);
  assert.match(workspace, /Preview full CSV/i);
  assert.match(preview, /requirePermission\("crm\.export"\)/);
  assert.match(preview, /readWhatsappSheet/);
  assert.match(preview, /WhatsappCsvPreviewTable/);
  assert.match(table, /"use client"/);
  assert.match(table, /useState\(false\)/);
  assert.match(table, /WHATSAPP_CSV_HEADERS/);
  assert.match(table, /aria-pressed/);
  assert.match(table, /Wrap/);
  assert.match(table, /Straight/);
  assert.match(table, /whitespace-nowrap/);
  assert.match(table, /whitespace-pre-wrap/);
  assert.match(table, /overflow-auto/);
  assert.match(table, /sortWhatsappPreviewRows/);
  assert.match(table, /last_communication_at/);
  assert.match(table, /next_follow_up_at/);
  assert.match(table, /Latest/);
  assert.match(table, /Oldest/);
  assert.match(table, /Soonest/);
  assert.match(table, /text-\[11px\]/);
  assert.match(table, /h-6/);
  assert.match(table, /header === "conversation_history" \? 320/);
  assert.match(table, /px-1 py-0\.5/);
  assert.doesNotMatch(preview, /<pre/);
});

test("spreadsheet preview selects category CSVs and presents compact wrapped links", async () => {
  const preview = await source("app/admin/crm/whatsapp/preview/page.tsx");
  const selector = await source("components/crm/WhatsappCategorySelector.tsx");
  const table = await source("components/crm/WhatsappCsvPreviewTable.tsx");
  assert.match(preview, /readWhatsappCategories/);
  assert.match(preview, /readWhatsappCategory/);
  assert.match(preview, /rowCount/);
  assert.match(preview, /WhatsappCategorySelector/);
  assert.match(preview, /fileName=\{category\.fileName\}/);
  assert.match(preview, /key=\{category\.slug\}/);
  assert.match(preview, /export\?category=\$\{encodeURIComponent\(category\.slug\)\}/);
  assert.match(selector, /category\.rowCount/);
  assert.match(selector, /selected\.fileName/);
  assert.match(selector, /createWhatsappCategoryCsvAction/);
  assert.match(selector, /admin/);
  assert.match(selector, /router\.push/);
  assert.match(table, /whitespace-normal/);
  assert.doesNotMatch(table, /<span className="block truncate">\{header\}<\/span>/);
  assert.match(table, /header === "messenger_profile_link" \|\| header === "whatsapp_link"/);
  assert.match(table, /target="_blank"/);
  assert.match(table, /rel="noreferrer"/);
  assert.match(table, /text-\[11px\]/);
  assert.match(table, /wrapConversation/);
  assert.doesNotMatch(table, /onBlur=/, "cell blur must not race the debounced autosave");
});

test("spreadsheet mutations are admin-only and the server supplies authoritative sheet state", async () => {
  const actions = await source("app/admin/crm/whatsapp/preview/actions.ts");
  const preview = await source("app/admin/crm/whatsapp/preview/page.tsx");
  assert.match(actions, /^"use server"/);
  assert.match(actions, /requirePermission\("crm\.edit"\)/);
  assert.match(actions, /profile\.role\s*!==\s*"admin"/);
  assert.ok((actions.match(/requireWhatsappSheetAdmin\(\)/g) ?? []).length >= 5);
  for (const [action, operation] of [
    ["startWhatsappSheetEditAction", "startWhatsappSheetEdit"],
    ["saveWhatsappSheetAction", "saveWhatsappSheet"],
    ["finishWhatsappSheetEditAction", "finishWhatsappSheetEdit"],
    ["restorePreviousWhatsappSheetAction", "restorePreviousWhatsappSheet"],
  ]) {
    assert.match(actions, new RegExp(`export async function ${action}`));
    assert.match(actions, new RegExp(`${operation}\\(`));
  }
  assert.match(actions, /export async function createWhatsappCategoryCsvAction\(formData: FormData\)/);
  assert.match(actions, /createWhatsappCategoryCsv/);
  assert.match(actions, /categorySlug/);
  assert.match(preview, /requirePermission\("crm\.export"\)/);
  assert.match(preview, /readWhatsappSheet\(/);
  assert.match(preview, /admin=\{profile\.role === "admin"\}/);
  assert.match(preview, /metadata=\{sheet\.metadata\}/);
  assert.match(preview, /revision=\{sheet\.revision\}/);
  assert.match(preview, /hasSnapshot=\{sheet\.hasSnapshot\}/);
});

test("spreadsheet preview exposes full-screen formatting editing recovery and unsaved protection", async () => {
  const preview = await source("app/admin/crm/whatsapp/preview/page.tsx");
  const table = await source("components/crm/WhatsappCsvPreviewTable.tsx");
  const toolbar = await source("components/crm/WhatsappSheetToolbar.tsx");
  assert.match(preview, /title="WhatsApp\/Messenger CRM CSV Preview"/);
  assert.match(table, /overflow-wrap:anywhere/);
  assert.match(table, /style=\{\{ whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" \}\}/);
  assert.match(table, /useState\(false\)/);
  assert.match(table, /requestFullscreen/);
  assert.match(table, /exitFullscreen/);
  assert.match(table, /fullscreenchange/);
  assert.match(table, /beforeunload/);
  assert.match(table, /onPointerDown/);
  assert.match(table, /onKeyDown/);
  for (const label of [
    "Full screen",
    "Exit full screen",
    "Turn on Edit mode",
    "Finish editing",
    "Add row",
    "Unlock cell",
    "Reset column sizes",
    "Restore Previous Version",
    "Font size",
    "Text color",
    "Background color",
    "Undo",
    "Redo",
    "Bold",
    "Italic",
    "Underline",
    "Align left",
    "Align center",
    "Align right",
    "Wrap text",
    "Clip text",
    "Save status",
  ]) assert.match(toolbar, new RegExp(label, "i"));
});

test("production routes use the selected private workspace without weakening CRM authorization", async () => {
  const routePaths = [
    "app/admin/crm/whatsapp/page.tsx",
    "app/admin/crm/whatsapp/[customerId]/page.tsx",
    "app/admin/crm/whatsapp/export/route.ts",
    "app/admin/crm/whatsapp/preview/page.tsx",
    "app/admin/crm/whatsapp/actions.ts",
    "app/admin/crm/whatsapp/preview/actions.ts",
  ];
  const routes = (await Promise.all(routePaths.map((path) => readFile(path, "utf8")))).join("\n");
  const categoryStore = await readFile("lib/crm/whatsapp-category-store.ts", "utf8");
  const sheetStore = await readFile("lib/crm/whatsapp-sheet-store.ts", "utf8");
  const productionStore = await readFile("lib/crm/whatsapp-workspace-supabase.ts", "utf8");

  assert.doesNotMatch(routes, /node:fs|node:path/);
  assert.match(routes, /requirePermission\("crm\.export"\)/);
  assert.match(routes, /requirePermission\("crm\.edit"\)/);
  assert.match(routes, /profile\.role !== "admin"/);
  assert.match(categoryStore, /getWhatsappWorkspaceStorage/);
  assert.match(sheetStore, /getWhatsappWorkspaceStorage/);
  assert.match(productionStore, /WhatsApp CRM workspace is unavailable\./);
  assert.doesNotMatch(productionStore, /console\.(?:log|error)|JSON\.stringify\(error\)/);
});
