# EPS online checkout

EPS is an additional payment choice for the existing public product catalogue and customer cart. Cash on Delivery retains its original checkout RPC. Existing customers sign in, choose their saved delivery address, review contact details and the exact BDT total, then continue to EPS. Customers enter card/wallet credentials only on EPS.

Existing non-EPS orders retain their enabled manual/UddoktaPay payment choices. A new EPS checkout cannot switch payment methods through a modified form while its online payment needs verification.

## Private server configuration

Keep credentials outside Git, client bundles, public gateway configuration and logs. The supplied credential documents and their passwords must not be copied into the repository.

```dotenv
EPS_ENABLED=false
EPS_LIVE_ENABLED=false
PAYMENT_PUBLIC_ORIGIN=https://sen.com.bd
EPS_RECEIVING_ADMIN_ID=
EPS_RECONCILIATION_SECRET=
EPS_SANDBOX_USERNAME=
EPS_SANDBOX_PASSWORD=
EPS_SANDBOX_HASH_KEY=
EPS_SANDBOX_MERCHANT_ID=
EPS_SANDBOX_STORE_ID=
EPS_LIVE_USERNAME=
EPS_LIVE_PASSWORD=
EPS_LIVE_HASH_KEY=
EPS_LIVE_MERCHANT_ID=
EPS_LIVE_STORE_ID=
EPS_SANDBOX_IPN_KEY=
EPS_LIVE_IPN_KEY=
```

The database gateway's `test_mode` selects the matching credential set. Live operation additionally requires `EPS_LIVE_ENABLED=true` and an active receiving Admin. No credentials or enabled flags are introduced by the migration. The gateway must be enabled separately after deployment approval.

`PAYMENT_PUBLIC_ORIGIN` is a fixed server setting; customer form fields and incoming Host headers cannot change callbacks. HTTPS is required outside localhost. EPS API and checkout hosts are fixed per environment. A redirect to another host or environment is rejected.

## Verification and money

- The server implements GetToken, InitializeEPS and CheckMerchantTransactionStatus, including EPS's UTF-8 HMAC-SHA512/base64 signing. Merchant references are numeric, unique, and at most 30 characters (confirmed against the sandbox API).
- Prices and stock come from the database. The amount must still match the customer's review total. The new checkout RPC locks the cart, snapshots lines and reserves inventory atomically. An operation ID prevents duplicate orders.
- Each payment attempt is saved before the provider is called. An ambiguous initialization blocks a new payment until its status is checked. Reopening a ready attempt reuses its checkout.
- Success/fail/cancel query parameters are untrusted. Callbacks, manual checks and background reconciliation all query EPS on the server. Merchant reference, BDT amount and optional returned currency must match before any settlement.
- A locked, service-only settlement RPC records a verified live payment in `sale_payments`, refreshes order paid totals and creates a balanced journal: debit **EPS.CLEARING**, credit the existing **4000** sales account. An explicit receiving Admin is recorded as the configured operator; the audit entry identifies the automated EPS verification.
- Gateway acceptance is not a bank settlement. This workflow does not add cash or money to a personal cashbook. EPS fees, actual bank settlement and refunds remain separate authorized accounting actions.
- Sandbox success is labelled **sandbox_paid**. It never creates a real sale payment, ledger entry or paid order balance.
- Duplicate callbacks cannot duplicate income or downgrade paid results. Money received for a cancelled order, changed outstanding amount or unavailable receiving Admin is held for staff review; the customer must not pay again. Refunds are not automated.
- A later failed or pending notification cannot erase a received-payment review or reopen charging.

## Callbacks and recovery

Browser callback: `/api/payments/eps/return/{attemptId}` (GET/POST). It verifies the stored attempt and redirects to the authorized account payment page. The route ignores any callback status or amount supplied by the browser.

Optional IPN: `POST /api/payments/eps/ipn`, `{"Data":"base64IV:base64Ciphertext"}`. Request bodies are bounded to 25 KB. AES-256-CBC decoding only extracts the reference; EPS status is still independently verified. Configure a provider-issued IPN key and the endpoint with EPS before enabling delivery. Do not assume the HMAC key is the IPN encryption key.

Fallback reconciliation: `POST /api/payments/eps/reconcile`, authenticated with `Authorization: Bearer <EPS_RECONCILIATION_SECRET>` (at least 32 random characters). Install a VPS-local scheduled caller as part of an approved deployment, for example every minute. It checks up to ten unresolved attempts with a maximum of two concurrent checks. Secrets belong in a private service environment, never in a public URL or process command line. No scheduler has been installed by development.

An unpaid online order has a 30-minute start window. Cleanup releases stock only for untouched, confirmed orders with no unresolved payment (no attempts, or all attempts definitively failed/cancelled). Pending/unknown transactions keep their stock and require further verification or Admin review. Paid, sandbox-paid, allocated and shipped orders are not automatically cancelled.

Admin review: `/admin/settings/payments/eps`. **Verify with EPS** checks the provider; it is not a manual “mark paid” shortcut. Customer history and printable A4 receipt are available under their own order. Unknown account orders return no payment data.

## Validation and release

1. `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/eps-payment.test.mts`
2. Run `supabase/tests/eps_payment_gateway.sql` only on an explicitly selected local database. Its fixtures are rolled back; it exercises settlement, replay, amount/owner protection, sandbox isolation, balanced clearing entries and abandoned-order cleanup.
3. Verify checkout/COD, WebKit and Chromium in mobile/desktop light/dark modes, ownership, Admin access, callback recovery and A4 receipt printing. Test fixtures must be clearly identified; simulated provider results do not constitute an actual EPS payment test.
4. Complete an actual EPS sandbox checkout and verify the returned outcome against EPS. Local screenshots or a mocked success do not satisfy this gate.
5. Scan all changed files and client bundles for credential values. Review the additive migration and configured receiving Admin before production approval.
6. Obtain local owner approval, then GitHub/PR/merge approval and VPS credential readiness. Enable live payment only after the approved migration/configuration and callback/reconciliation checks succeed.

The local preview uses isolated demonstration data. There has been no production database mutation, live payment, GitHub push or VPS deployment during development.

## Primary references

- Merchant-supplied EPS Merchant API Integration Guide V5 and Sandbox Guide V4 (private package; not stored here).
- [EPS official integration implementation](https://github.com/EPS-PG/EPS_Laravel)
- [EPS IPN specification](https://www.eps.com.bd/ipn)
- [EPS payment flow and sandbox guidance](https://www.eps.com.bd/join-us/payment-flow)
