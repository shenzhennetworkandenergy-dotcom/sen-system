import fs from "node:fs";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const baseUrl = process.env.CHATBOT_TEST_BASE_URL || "http://localhost:3000";
const origin = new URL(baseUrl).origin;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !serviceKey || !publicKey) throw new Error("Chatbot test credentials are missing.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const visitor = createClient(url, publicKey, { auth: { persistSession: false } });
const createdIds = [];
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const testIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
const headers = {
  origin,
  "content-type": "application/json",
  "x-forwarded-for": testIp,
};
const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const json = await response.json().catch(() => null);
  return { response, json };
};

try {
  const { data: products, error: productError } = await admin
    .from("products")
    .select("id,name,model_number,regular_price,sale_price,currency")
    .eq("status", "active")
    .eq("public_catalogue_visible", true)
    .eq("product_type", "simple")
    .not("regular_price", "is", null)
    .limit(100);
  if (productError) throw productError;
  const ids = (products ?? []).map((product) => product.id);
  const { data: balances, error: balanceError } = await admin
    .from("inventory_balances")
    .select("product_id,available,warehouses!inner(country_code,is_active)")
    .in("product_id", ids)
    .gt("available", 0)
    .eq("warehouses.is_active", true)
    .in("warehouses.country_code", ["BD", "BGD"]);
  if (balanceError) throw balanceError;
  const availableId = balances?.[0]?.product_id;
  const availableProduct = products?.find((product) => product.id === availableId);
  expect(Boolean(availableProduct), "No priced Bangladesh-stock product is available for exact search testing.");

  const sessionId = crypto.randomUUID();
  const broad = await request(`/api/chatbot/search?q=740&sessionId=${sessionId}`, {
    headers: { origin },
  });
  expect(broad.response.status === 200, "Broad 740 search did not return HTTP 200.");
  expect(broad.json?.matchType === "suggestions", "Broad 740 search did not return suggestions.");
  expect(
    broad.json?.products?.length >= 1 && broad.json.products.length <= 6,
    "Broad 740 search returned the wrong number of suggestions.",
  );
  expect(
    broad.json?.products?.every((product) => product.name.toLowerCase().includes("740")),
    "Broad 740 search returned a product whose title does not contain 740.",
  );
  const broadProduct = broad.json?.products?.find(
    (product) => product.modelNumber === "DELL-R740" || product.sku === "DELL-R740",
  ) ?? broad.json?.products?.[0];
  if (broadProduct) {
    const exactIdentifier = broadProduct.modelNumber || broadProduct.sku;
    const exactProduct = await request(`/api/chatbot/search?q=${encodeURIComponent(exactIdentifier)}&sessionId=${sessionId}`, {
      headers: { origin },
    });
    expect(exactProduct.json?.matchType === "confirmation", "Exact identifier did not require confirmation.");
    expect(exactProduct.json?.product?.id === broadProduct.id, "Exact search returned the wrong product.");
    expect(exactProduct.json?.product?.name === broadProduct.name, "Exact search omitted the complete product title.");
    const allowedProductKeys = new Set([
      "id", "variationId", "name", "slug", "sku", "modelNumber",
      "shortDescription", "productType", "price", "priceMax",
      "currency", "available", "availability", "variationLabel", "attributes",
    ]);
    expect(
      Object.keys(exactProduct.json?.product ?? {}).every((key) => allowedProductKeys.has(key)),
      "Product search exposed an unapproved field.",
    );
  }
  if (availableProduct) {
    const searchValue = availableProduct.model_number || availableProduct.name;
    const exact = await request(`/api/chatbot/search?q=${encodeURIComponent(searchValue)}&sessionId=${sessionId}`, {
      headers: { origin },
    });
    expect(exact.response.status === 200, "Exact product search did not return HTTP 200.");
    expect(exact.json?.matchType === "confirmation" && exact.json?.product?.available === true, "Exact product search was not classified as available.");
    expect(Number(exact.json?.product?.price) === Number(availableProduct.sale_price ?? availableProduct.regular_price), "Exact product search returned the wrong price.");
  }

  const noMatch = await request(`/api/chatbot/search?q=${encodeURIComponent(`nonexistent-${crypto.randomUUID()}`)}&sessionId=${sessionId}`, {
    headers: { origin },
  });
  expect(noMatch.json?.matchType === "none", "A random nonexistent product did not return no match.");

  const invalidContext = await request("/api/chatbot/inquiry/start", {
    method: "POST",
    headers,
    body: JSON.stringify({
      productQuery: "740",
      selectedProducts: [{ productId: "not-a-uuid" }],
      searchHistory: Array.from({ length: 21 }, () => ({ query: "740", resultProductIds: [] })),
      sessionId: crypto.randomUUID(),
      submissionKey: crypto.randomUUID(),
      sourcePage: "/automated-chatbot-test",
      website: "",
    }),
  });
  expect(invalidContext.response.status === 400, "Invalid or excessive chatbot context was accepted.");

  const noOrigin = await request("/api/chatbot/inquiry/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productQuery: "test", sessionId, submissionKey: crypto.randomUUID(), sourcePage: "/" }),
  });
  expect(noOrigin.response.status === 403, "Inquiry creation accepted a request without a same-origin header.");

  const submissionKey = crypto.randomUUID();
  const selectedForInquiry = broadProduct;
  const draft = await request("/api/chatbot/inquiry/start", {
    method: "POST",
    headers,
    body: JSON.stringify({
      productQuery: "740",
      selectedProducts: selectedForInquiry ? [{
        productId: selectedForInquiry.id,
        variationId: selectedForInquiry.variationId,
        name: "FORGED PRODUCT TITLE",
        price: 1,
      }] : [],
      searchHistory: [
        { query: "740", resultProductIds: broad.json?.products?.map((product) => product.id) ?? [] },
        {
          query: selectedForInquiry?.modelNumber || selectedForInquiry?.sku || "R740",
          resultProductIds: selectedForInquiry ? [selectedForInquiry.id] : [],
        },
      ],
      sessionId,
      submissionKey,
      sourcePage: "/automated-chatbot-test",
      website: "",
    }),
  });
  expect(draft.response.status === 200 && draft.json?.ok, "Draft inquiry was not created.");
  if (!draft.json?.inquiryId || !draft.json?.updateToken) throw new Error("Draft inquiry response is incomplete.");
  createdIds.push(draft.json.inquiryId);

  const duplicate = await request("/api/chatbot/inquiry/start", {
    method: "POST",
    headers,
    body: JSON.stringify({
      productQuery: "740",
      sessionId,
      submissionKey,
      sourcePage: "/automated-chatbot-test",
      website: "",
    }),
  });
  expect(duplicate.response.status >= 400, "Duplicate inquiry submission was accepted.");

  const invalidPhone = await request(`/api/chatbot/inquiry/${draft.json.inquiryId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ step: "phone", phoneNumber: "not a phone", updateToken: draft.json.updateToken, website: "" }),
  });
  expect(invalidPhone.response.status === 400, "Invalid phone number was accepted.");

  const wrongToken = await request(`/api/chatbot/inquiry/${draft.json.inquiryId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ step: "phone", phoneNumber: "+8801712345678", updateToken: "x".repeat(43), website: "" }),
  });
  expect(wrongToken.response.status === 404, "A visitor could update an inquiry using the wrong token.");

  const invalidWhatsapp = await request(`/api/chatbot/inquiry/${draft.json.inquiryId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ step: "whatsapp", whatsapp: "invalid", updateToken: draft.json.updateToken, website: "" }),
  });
  expect(invalidWhatsapp.response.status === 400, "Invalid WhatsApp number was accepted.");

  for (const payload of [{ step: "whatsapp", whatsapp: "+8801712345678" }, { step: "consent" }]) {
    const update = await request(`/api/chatbot/inquiry/${draft.json.inquiryId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...payload, updateToken: draft.json.updateToken, website: "" }),
    });
    expect(update.response.status === 200 && update.json?.ok, `Inquiry step ${payload.step} failed.`);
  }

  const { data: completed } = await admin
    .from("crm_chatbot_inquiries")
    .select("status,phone_number,whatsapp,consent_to_contact,completed_at,search_history,selected_products")
    .eq("id", draft.json.inquiryId)
    .single();
  expect(completed?.status === "new" && completed.consent_to_contact === true, "Consent did not complete the inquiry.");
  expect(completed?.phone_number === null && completed.whatsapp === "+8801712345678", "The WhatsApp-only contact was not stored correctly.");
  expect(completed?.search_history?.length === 2, "Search history was not stored.");
  expect(completed?.selected_products?.[0]?.id === selectedForInquiry?.id, "Selected product ID was not stored.");
  expect(completed?.selected_products?.[0]?.name === selectedForInquiry?.name, "Selected product title was not rebuilt by the server.");
  expect(completed?.selected_products?.[0]?.price !== 1, "A forged client product price was stored.");
  expect(Boolean(completed?.completed_at), "Completed inquiry has no completion timestamp.");

  const cancelSession = crypto.randomUUID();
  const cancellation = await request("/api/chatbot/inquiry/start", {
    method: "POST",
    headers,
    body: JSON.stringify({
      productQuery: "CHATBOT AUTOMATED TEST cancellation",
      sessionId: cancelSession,
      submissionKey: crypto.randomUUID(),
      sourcePage: "/automated-chatbot-test",
      website: "",
    }),
  });
  if (cancellation.json?.inquiryId && cancellation.json?.updateToken) {
    createdIds.push(cancellation.json.inquiryId);
    const cancelled = await request(`/api/chatbot/inquiry/${cancellation.json.inquiryId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ step: "cancel", updateToken: cancellation.json.updateToken, website: "" }),
    });
    expect(cancelled.response.status === 200, "Consent-declined inquiry was not cancelled.");
    const { data } = await admin.from("crm_chatbot_inquiries").select("status,consent_to_contact").eq("id", cancellation.json.inquiryId).single();
    expect(data?.status === "cancelled" && data.consent_to_contact === false, "Cancelled inquiry retained consent or the wrong status.");
  } else {
    failures.push("Cancellation test draft was not created.");
  }

  const anonymousRead = await visitor.from("crm_chatbot_inquiries").select("id").limit(1);
  expect(!anonymousRead.data?.length, "Anonymous visitors can read chatbot inquiries.");
  const anonymousInsert = await visitor.from("crm_chatbot_inquiries").insert({
    inquiry_number: `BAD-${crypto.randomUUID()}`,
    session_id: crypto.randomUUID(),
    submission_key: crypto.randomUUID(),
    product_query: "unauthorized",
    update_token_hash: "0".repeat(64),
  });
  expect(Boolean(anonymousInsert.error), "Anonymous visitors can insert chatbot inquiries directly.");

  const floatingChat = fs.readFileSync("components/support/FloatingChat.tsx", "utf8");
  const migration = fs.readFileSync("supabase/migrations/202607290006_crm_product_chatbot.sql", "utf8");
  const exportRoute = fs.readFileSync("app/admin/crm/chatbot/export/route.ts", "utf8");
  expect(floatingChat.includes("Product Assistant") && floatingChat.includes("Human Support"), "Human-support switching is missing.");
  expect(floatingChat.includes("আসসালামু আলাইকুম ওয়া রহমাতুল্লাহি ওয়া বারাকাতুহু"), "The bilingual full Salam is missing.");
  expect(migration.includes("enable row level security"), "Chatbot inquiry RLS is missing.");
  expect(exportRoute.includes("\\uFEFF") && exportRoute.includes("/^[=+\\-@\\t\\r]/"), "CSV BOM or formula-injection protection is missing.");
} finally {
  if (createdIds.length) {
    await admin.from("crm_chatbot_inquiries").delete().in("id", createdIds);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Product assistant search, CRM flow, consent, isolation, RLS and CSV security verified.");
