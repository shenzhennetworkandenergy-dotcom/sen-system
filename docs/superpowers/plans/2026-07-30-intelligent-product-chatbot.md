# Intelligent Product Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual product assistant that returns up to six catalogue matches, confirms a product with clickable Yes/No buttons, provides concise product information, and stores consented WhatsApp leads with validated product and search history.

**Architecture:** Keep catalogue matching and inventory calculation in the server-only search module, expose a small discriminated API contract, and model the browser conversation as explicit React states. Extend the existing secured inquiry routes and table with bounded JSONB history fields; the server reconstructs product snapshots from database IDs so client data cannot forge titles, prices, or availability.

**Tech Stack:** Next.js 16.2.12 App Router and Route Handlers, React 19, TypeScript, Supabase/PostgreSQL, Node integration tests, Tailwind/CSS.

## Global Constraints

- Every customer-facing answer and question is provided in English and Bangla.
- Assistant replies wait a randomized 3–6 seconds after customer text or button actions.
- Broad catalogue matching is independent of Bangladesh inventory availability.
- Return no more than six public products for one search.
- Never claim Bangladesh or China stock without supporting inventory records.
- Do not trust client-supplied product titles, prices, or availability.
- Store WhatsApp data only through same-origin, rate-limited server routes protected by opaque update tokens and RLS.
- Preserve current website-information answers and human-support chat behavior.

---

### Task 1: Catalogue search contract and ranking

**Files:**
- Modify: `lib/chatbot/search.ts`
- Modify: `app/api/chatbot/search/route.ts`
- Modify: `scripts/verify-chatbot.mjs`

**Interfaces:**
- Produces: `ChatbotProduct`, `ChatbotSearchEvent`, and `ProductChatSearchResult`.
- Produces: `searchProductsForChatbot(query)` returning `suggestions`, `confirmation`, or `none`.
- Produces: `getChatbotProductsBySelection(selections)` for trusted inquiry snapshots.

- [ ] **Step 1: Add failing integration assertions**

Extend `scripts/verify-chatbot.mjs` so `GET /api/chatbot/search?q=740` must return:

```js
expect(broad.json?.matchType === "suggestions", "740 did not return suggestions.");
expect(broad.json?.products?.length >= 1 && broad.json.products.length <= 6, "740 returned the wrong suggestion count.");
expect(
  broad.json.products.every((product) => product.name.toLowerCase().includes("740")),
  "740 returned a product whose title does not contain 740.",
);
```

Choose one returned product with a model or SKU and search that exact identifier. Assert:

```js
expect(exact.json?.matchType === "confirmation", "Exact identifier did not require confirmation.");
expect(exact.json?.product?.id === expected.id, "Exact search returned the wrong product.");
expect(exact.json?.product?.name === expected.name, "Exact search omitted the complete title.");
```

Assert the approved public product keys only:

```js
const allowed = new Set([
  "id", "variationId", "name", "slug", "sku", "modelNumber",
  "shortDescription", "productType", "price", "priceMax",
  "currency", "available", "availability", "variationLabel", "attributes",
]);
expect(Object.keys(exact.json.product).every((key) => allowed.has(key)), "Search exposed a private field.");
```

- [ ] **Step 2: Run the chatbot test and verify RED**

Run: `npm run test:chatbot`

Expected: FAIL because `740` currently returns a price-only `exact` result and no product identity.

- [ ] **Step 3: Implement the server-only product contract**

Define:

```ts
export type ChatbotProductSelection = {
  productId: string;
  variationId?: string | null;
};

export type ChatbotProduct = {
  id: string;
  variationId: string | null;
  name: string;
  slug: string;
  sku: string;
  modelNumber: string | null;
  shortDescription: string | null;
  productType: string;
  price: number | null;
  priceMax: number | null;
  currency: string;
  available: boolean;
  availability: "in_stock" | "sourceable";
  variationLabel: string | null;
  attributes: Record<string, string>;
};

export type ProductChatSearchResult =
  | { matchType: "suggestions"; products: ChatbotProduct[] }
  | { matchType: "confirmation"; product: ChatbotProduct }
  | { matchType: "none" };
```

Build one trusted catalogue loader that retrieves active public products, active variations, brands/categories/tags, and active Bangladesh balances. Calculate product identity first and availability second.

- [ ] **Step 4: Implement deterministic ranking**

Apply this order:

```text
unique exact variation SKU
unique exact product model/SKU/manufacturer part number/title
multiple title contains complete query -> up to six suggestions
unique title contains complete query -> confirmation
all normalized query terms in title -> suggestions or confirmation by count
strong metadata matches -> suggestions or confirmation
otherwise none
```

Deduplicate suggestions by parent product ID. For a variable parent, use the min/max active variation prices and mark available when any valid variation is in Bangladesh stock or allows backorders.

- [ ] **Step 5: Run the chatbot test and verify GREEN for search**

Run: `npm run test:chatbot`

Expected: the new broad and exact search assertions pass; persistence assertions may remain unchanged until Task 2.

---

### Task 2: Consented search and selected-product persistence

**Files:**
- Create: `supabase/migrations/202607300001_intelligent_chatbot_workflow.sql`
- Modify: `app/api/chatbot/inquiry/start/route.ts`
- Modify: `app/api/chatbot/inquiry/[id]/route.ts`
- Modify: `app/admin/crm/chatbot/page.tsx`
- Modify: `app/admin/crm/chatbot/export/route.ts`
- Modify: `scripts/verify-chatbot.mjs`

**Interfaces:**
- Consumes: `ChatbotProductSelection` and `getChatbotProductsBySelection`.
- Produces: inquiry rows with `search_history jsonb` and `selected_products jsonb`.
- Produces: a WhatsApp-only `whatsapp` then `consent` update sequence.

- [ ] **Step 1: Add failing persistence assertions**

Start an inquiry using:

```js
{
  productQuery: "740",
  selectedProducts: [{ productId: selected.id, variationId: selected.variationId }],
  searchHistory: [
    { query: "740", resultProductIds: broad.json.products.map((product) => product.id) },
    { query: selected.modelNumber || selected.sku, resultProductIds: [selected.id] },
  ],
  sessionId,
  submissionKey,
  sourcePage: "/automated-chatbot-test",
  website: "",
}
```

Assert that:

```js
expect(draft.response.status === 200 && draft.json?.ok, "Product inquiry draft was not created.");
expect(invalidWhatsapp.response.status === 400, "Invalid WhatsApp was accepted.");
expect(validWhatsapp.response.status === 200, "Valid WhatsApp was rejected.");
expect(consent.response.status === 200, "WhatsApp-only consent failed.");
```

Read the row and assert:

```js
expect(row.whatsapp === "+8801712345678", "WhatsApp was not stored.");
expect(row.phone_number === null, "The new workflow unexpectedly required a phone number.");
expect(row.search_history.length === 2, "Search history was not stored.");
expect(row.selected_products[0].id === selected.id, "Selected product was not stored.");
expect(row.selected_products[0].name === selected.name, "The server did not rebuild the product title.");
```

Send a forged title/price and verify the stored snapshot still equals the database product. Reject more than 20 history events, more than six product IDs per event, invalid UUIDs, and more than six selected products.

- [ ] **Step 2: Run the persistence test and verify RED**

Run: `npm run test:chatbot`

Expected: FAIL because the columns and new request fields do not exist and consent requires both phone and WhatsApp.

- [ ] **Step 3: Add and apply the additive migration**

Create:

```sql
alter table public.crm_chatbot_inquiries
  add column if not exists search_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(search_history) = 'array'),
  add column if not exists selected_products jsonb not null default '[]'::jsonb
    check (jsonb_typeof(selected_products) = 'array');

create index if not exists crm_chatbot_inquiries_selected_products_gin
  on public.crm_chatbot_inquiries using gin(selected_products);
```

Apply only this pending additive migration to the local Supabase instance.

- [ ] **Step 4: Validate and rebuild inquiry snapshots**

In the start route:

```ts
type SearchEventInput = { query?: unknown; resultProductIds?: unknown };
type StartBody = {
  productQuery?: unknown;
  selectedProducts?: unknown;
  searchHistory?: unknown;
  sessionId?: unknown;
  submissionKey?: unknown;
  sourcePage?: unknown;
  website?: unknown;
};
```

Validate at most 20 search events, 6 result IDs per event, and 6 selected references. Query active public products on the server and store only rebuilt snapshots. Store history results as `{ id, name }` records obtained from the database, never client titles.

- [ ] **Step 5: Switch contact updates to WhatsApp-only**

Allow `step: "whatsapp"` when the draft is collecting contact even if `phone_number` is null. Allow `step: "consent"` when WhatsApp is present. Preserve the existing optional `phone` branch for backwards compatibility, cancellation, update-token checks, rate limits, and honeypot validation.

- [ ] **Step 6: Display and export stored context**

Add concise server-rendered columns for selected product titles and search queries. Add `Selected products` and `Search history` columns to the CSV, passing values through the existing formula-injection-safe CSV encoder.

- [ ] **Step 7: Run persistence verification and verify GREEN**

Run: `npm run test:chatbot`

Expected: all search, CRM, consent, isolation, RLS, and CSV security assertions pass.

---

### Task 3: Bilingual conversation state machine and product cards

**Files:**
- Create: `lib/chatbot/conversation.ts`
- Create: `tests/chatbot-conversation.test.ts`
- Modify: `components/support/FloatingChat.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `suggestions`, `confirmation`, `none`, and `information` search results.
- Produces: pure conversation timing constants and state-transition helpers used by the client component.
- Produces: clickable suggestion cards, Yes/No confirmation controls, a WhatsApp-only consent flow, and 3–6 second replies.

- [ ] **Step 1: Add failing UI contract assertions**

Create `tests/chatbot-conversation.test.ts` using Node's test runner. Assert:

```ts
assert.equal(CHATBOT_REPLY_DELAY_MIN_MS, 3000);
assert.equal(CHATBOT_REPLY_DELAY_MAX_MS, 6000);
assert.equal(nextStepForSearchResult({ matchType: "suggestions" }), "search");
assert.equal(nextStepForSearchResult({ matchType: "confirmation" }), "confirm");
assert.equal(nextStepAfterConfirmation(false), "search");
assert.equal(nextStepAfterConfirmation(true), "whatsapp");
```

The production changes that make this fail are missing or incorrect conversation transitions and delay bounds.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --experimental-strip-types tests/chatbot-conversation.test.ts`

Expected: FAIL because `lib/chatbot/conversation.ts` does not exist.

- [ ] **Step 3: Model explicit conversation state**

Use:

```ts
type AssistantStep =
  | "search"
  | "confirm"
  | "whatsapp"
  | "consent"
  | "complete"
  | "cancelled"
  | "error";
```

Implement and consume the pure helpers tested in Step 1:

```ts
export const CHATBOT_REPLY_DELAY_MIN_MS = 3000;
export const CHATBOT_REPLY_DELAY_MAX_MS = 6000;
export function nextStepForSearchResult(result: { matchType: string }): "search" | "confirm";
export function nextStepAfterConfirmation(confirmed: boolean): "search" | "whatsapp";
```

Track:

```ts
pendingProduct: ChatbotProduct | null
searchHistory: SearchEventInput[]
selectedProducts: ChatbotProductSelection[]
noMatchCount: number
inquiry: Inquiry | null
```

Messages can carry `products?: ChatbotProduct[]` and `confirmation?: ChatbotProduct` so the rendered UI remains tied to the message that introduced the choice.

- [ ] **Step 4: Render suggestions and confirmation buttons**

Render up to six accessible product buttons with full title, model, and SKU. After selection or an exact search response, show the complete title with:

```text
Are you looking for this product?
আপনি কি এই পণ্যটি খুঁজছেন?
```

Render `Yes / হ্যাঁ` and `No / না` buttons. Disable both while busy. `No` clears the pending product and returns to search with the short bilingual exact-model prompt.

- [ ] **Step 5: Implement concise confirmed-product messages**

For in-stock products, show title, model/SKU, price, availability, and one short detail. For sourceable products, show:

```text
SEN can arrange this product. Please share your WhatsApp number, and we'll contact you soon.
SEN এই পণ্যটি সংগ্রহ করে দিতে পারবে। আপনার WhatsApp নম্বর দিন, আমরা শীঘ্রই যোগাযোগ করব।
```

Create the secured draft with current search history and selected references, then enter the WhatsApp step.

- [ ] **Step 6: Implement WhatsApp-only consent and natural delay**

Use:

```ts
const CHATBOT_REPLY_DELAY_MIN_MS = 3000;
const CHATBOT_REPLY_DELAY_MAX_MS = 6000;

function responseDelay() {
  const span = CHATBOT_REPLY_DELAY_MAX_MS - CHATBOT_REPLY_DELAY_MIN_MS;
  return new Promise((resolve) =>
    window.setTimeout(resolve, CHATBOT_REPLY_DELAY_MIN_MS + Math.floor(Math.random() * (span + 1))),
  );
}
```

Apply it after customer text, product-card selection, Yes, and No. Keep typing visible and controls disabled. Ask for WhatsApp, validate it, update the draft, then show short bilingual consent buttons.

- [ ] **Step 7: Style compact product controls**

Add scoped styles for compact cards, focus rings, title wrapping, model metadata, Yes/No actions, mobile sizing, disabled states, and high-contrast hover states without changing the human-support tab.

- [ ] **Step 8: Run automated verification**

Run:

```text
node --test --experimental-strip-types tests/chatbot-conversation.test.ts
npm run test:chatbot
npm run lint
npm run build
```

Expected: every command exits successfully with no new warnings.

- [ ] **Step 9: Verify the complete browser flow**

On the local site:

1. Search `740`.
2. Confirm 1–6 title-matching products appear.
3. Select a product and confirm the Yes/No buttons.
4. Click No and confirm the exact-model prompt returns.
5. Search/select again, click Yes, and verify concise bilingual details.
6. Confirm the reply delay is between 3 and 6 seconds with typing visible.
7. Enter an invalid then valid WhatsApp number.
8. Decline consent in one run and accept it in a second run.
9. Verify the accepted inquiry appears in CRM with WhatsApp, product snapshot, and search history.
