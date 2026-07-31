# Customer commerce, profiles, support and payments

## Scope

This foundation connects the public catalogue to authenticated customer
services without changing the existing inventory, sales, purchasing,
accounting, HR or permission models.

## Customer account

- Customers and administrators can edit their own public profile fields.
- A profile picture can be an approved emoji or an uploaded JPG, PNG or WebP.
- Uploaded images are resized and compressed in the browser before storage.
- Saved addresses are summarized on **My Profile** and remain manageable from
  the existing address page.
- Account pages expose orders, sales history, quotation requests and support
  conversations.

## Archive-safe administration

An administrator may remove an unused user or product. If operational,
financial, inventory, serial, order or audit history exists, removal becomes an
archive operation:

- user sign-in is disabled while its business history remains;
- a product is hidden from the public catalogue while its stock and transaction
  history remains;
- archive metadata records when and why the record was archived.

## Catalogue and dynamic category themes

The public catalogue reads active business categories from the database.
Administrators can add, organize, activate, and theme categories without a
source-code change. A category's configured color is applied to its homepage
card, catalogue controls, product cards, and product page.

Selecting a business category while creating or editing a product also loads
that category's configured specification fields. See
[`DYNAMIC_BUSINESS_CATEGORIES.md`](DYNAMIC_BUSINESS_CATEGORIES.md) for the
administration and data-model details.

## Cart and orders

In-stock public products can be added to an authenticated cart. Checkout uses a
saved shipping address and creates a sales order through the
`customer_checkout_cart` database function. Existing order, shipment, serial
allocation and payment records remain the source of truth after checkout.

## Quotations and support

- Out-of-stock products expose **Request quotation** and **Talk to SEN**.
- Customers can track quotation requests in their account.
- Authorized staff can review and update quotation status.
- Product conversations accept text and optional JPG, PNG, WebP, PDF, text or
  ZIP files up to 10 MB.
- Images use client-side compression before upload.
- Support files are private and delivered through an authorization-checked
  signed-link route.

## Payment gateways

The payment layer uses database-configured gateway records and server-only
adapter code. UddoktaPay, EPS and manual/cash-on-delivery adapters are seeded.

Provider secrets are never stored in public database configuration. Online
gateways require server environment variables:

- `UDDOKTAPAY_BASE_URL`
- `UDDOKTAPAY_API_KEY`
- `UDDOKTAPAY_WEBHOOK_SECRET`
- `EPS_BASE_URL`
- `EPS_API_KEY`
- `EPS_WEBHOOK_SECRET`

An online gateway must not be enabled until its exact merchant API paths,
request contract and signed webhook verification have been confirmed against
the merchant account documentation. A return page alone never marks an order
paid.

## Offline verification

Apply the migration to local Supabase, then verify:

1. the three seeded products appear in the public catalogue;
2. each of the four category filters changes the theme;
3. an in-stock product can be added to a cart;
4. an out-of-stock product can create a quotation and support conversation;
5. the admin quotation and support inboxes load those records;
6. profile editing, emoji selection and image upload render correctly;
7. saved addresses appear on **My Profile**;
8. payment settings list UddoktaPay, EPS and cash on delivery.

