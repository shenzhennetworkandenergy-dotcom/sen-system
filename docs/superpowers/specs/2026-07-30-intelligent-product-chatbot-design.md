# Intelligent Product Chatbot Design

## Goal

Make the SEN Product Assistant reliably find catalogue products from broad or exact customer queries, guide customers through product selection and confirmation, provide concise bilingual product information, and save consented WhatsApp leads with their search and product history.

## Product Search

- Search every active, publicly visible catalogue product before considering inventory availability.
- Normalize punctuation, spacing, case, common networking terms, and model formatting.
- Treat a short or broad query such as `740` as ambiguous when multiple product titles contain the term.
- Return between one and six distinct parent products, ranked in this order:
  1. Exact model, SKU, or manufacturer part-number match.
  2. Product title begins with or contains the complete normalized query.
  3. All query terms occur in the product title.
  4. Strong model, SKU, category, tag, description, or specification match.
- Product suggestions contain only safe public catalogue data: product ID, full title, slug, SKU, model, short description, price, currency, product type, and Bangladesh availability.
- Inventory affects the availability label but never prevents a matching catalogue product from being returned.
- Variable products use the selected variation's SKU, attributes, price, and availability when a variation is identified. Otherwise the parent product displays an available price range and asks for the required attributes.

## Conversation Workflow

### Broad Query

The chatbot shows up to six compact, clickable product cards and asks the customer to choose one or enter a more exact model.

Example:

> Related products / সম্পর্কিত পণ্য  
> Select one or enter the exact model. / একটি নির্বাচন করুন অথবা সঠিক মডেল লিখুন।

The suggestions do not begin contact collection.

### Product Confirmation

After the customer selects a suggestion or the search finds one strong exact match, the chatbot displays the complete product title and asks:

> Are you looking for this product?  
> আপনি কি এই পণ্যটি খুঁজছেন?

Two buttons appear:

- `Yes / হ্যাঁ`
- `No / না`

Selecting `No / না` clears the pending selection, keeps the prior search history, and asks:

> Please enter the exact model or more details.  
> সঠিক মডেল বা আরও বিস্তারিত তথ্য লিখুন।

No inquiry is created at this stage.

### Confirmed In-Stock Product

Selecting `Yes / হ্যাঁ` displays a short bilingual product summary containing:

- Full product title
- Model and SKU when present
- Current catalogue price or variation price
- Bangladesh availability
- A concise relevant detail from the short description or selected attributes

The chatbot then asks for the customer's WhatsApp number.

### Confirmed Out-of-Stock Product

Selecting `Yes / হ্যাঁ` displays the full product title and:

> SEN can arrange this product. Please share your WhatsApp number, and we'll contact you soon.  
> SEN এই পণ্যটি সংগ্রহ করে দিতে পারবে। আপনার WhatsApp নম্বর দিন, আমরা শীঘ্রই যোগাযোগ করব।

The assistant may display a configured catalogue price as a reference price, clearly separated from the availability message. It must not claim current Bangladesh stock or China warehouse stock unless supported by database inventory.

### No Catalogue Match

The first no-match response asks once for the exact model or more details. A second no-match response offers SEN sourcing and asks for WhatsApp contact. The submitted inquiry stores the full search history even when no product was selected.

## Language, Length, and Timing

- Every customer-facing chatbot answer and question is provided in English and Bangla.
- Messages are limited to the information needed for the current decision.
- Product titles may remain long because they identify the exact catalogue record; surrounding text stays short.
- Assistant replies wait a randomized 3–6 seconds after the customer's message or button action.
- The typing animation remains visible during the delay and request processing.
- Customer messages continue to show sending and delivered states.
- Button actions are disabled while a reply is being prepared to prevent duplicates.

## WhatsApp and Consent

- The matched-product workflow requests one WhatsApp number with country code; it does not require a separate phone number.
- The existing phone-plus-WhatsApp sourcing flow is replaced with the single WhatsApp flow.
- After WhatsApp validation, the chatbot displays a short bilingual consent question.
- Contact and inquiry data are finalized only after `Yes, I agree / হ্যাঁ, সম্মত`.
- Declining consent cancels the draft and prevents follow-up.
- Rate limits, same-origin validation, honeypot checks, opaque update tokens, and row-level security remain enforced.

## Data Storage

Add two JSONB fields to `crm_chatbot_inquiries`:

- `search_history`: an ordered array of sanitized search events containing the query and the public product IDs/titles returned.
- `selected_products`: an array of server-validated product snapshots containing product ID, title, slug, SKU, model, price, currency, availability, selected attributes, and confirmation time.

The server reconstructs selected product snapshots from the database. It never trusts client-supplied titles, prices, stock status, or product details.

The inquiry continues to store:

- WhatsApp number
- Original product query
- Source page
- Consent status
- Status and timestamps
- Security and session metadata

The CRM page and CSV export display the selected product titles and the ordered search history.

## API Contract

The product search route returns one of:

- `suggestions`: one to six matching products requiring clarification
- `confirmation`: one strong product match requiring Yes/No confirmation
- `none`: no catalogue match
- `information`: an existing website-information answer

The browser sends only selected product IDs and bounded search events when creating the inquiry. The server validates every ID against active, public catalogue records and recalculates product details, price, and Bangladesh availability.

## Testing

Automated integration coverage must verify:

- `740` returns between one and six products whose titles contain `740`.
- Broad matches include out-of-stock catalogue products.
- Exact model search returns the complete product identity for confirmation.
- Search responses expose only approved public fields.
- Confirmed product snapshots are rebuilt from the database.
- Invalid product IDs, invalid WhatsApp numbers, missing consent, cross-origin requests, duplicate submissions, and excessive history are rejected.
- Search history and selected product details persist after consent.
- Anonymous database access remains blocked by row-level security.
- The browser flow covers suggestion selection, Yes/No buttons, the clarification loop, in-stock details, out-of-stock sourcing copy, WhatsApp validation, consent, and successful completion.
