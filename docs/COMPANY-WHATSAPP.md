# Company WhatsApp

The ERP dashboard provides a composer and inbox for active administrators and employees explicitly granted `crm.send_whatsapp`. The API resolves permissions on every request, including after a grant is revoked. The WhatsApp grant is separate from ordinary CRM view and edit rights. Permission lookup failure denies access.

The sender is selected through the private server configuration after Meta onboarding. The dashboard displays the sender only after Meta confirms it matches the configured number.

Employee sends also preserve the existing customer business-category boundary: the recipient must match the saved phone number of an active, unarchived customer visible to that employee. The server resolves visibility afresh, and lookup failures deny sending. The new permission does not make other categories' customers accessible. Administrators can enter an international recipient directly.

The migration `202611240002_company_whatsapp_permission.sql` adds this sensitive permission to the CRM catalogue. The migration `202611240003_company_whatsapp_inbox.sql` creates a private inbox table. Database access is restricted to the server service role. The ERP rechecks permissions and customer visibility when loading the inbox.

The integration uses Meta's official Cloud API. It does not open WhatsApp Web, capture a WhatsApp session or automate the mobile application. The existing CRM WhatsApp follow-up workspace is unchanged.

## Connection

Keep all credentials in the server's private environment, never a `NEXT_PUBLIC_` variable or source control:

```dotenv
WHATSAPP_ENABLED=true
WHATSAPP_SEND_ENABLED=false
WHATSAPP_ACCESS_TOKEN=<server-only system-user token>
WHATSAPP_PHONE_NUMBER_ID=<business phone number ID>
WHATSAPP_BUSINESS_NUMBER=<confirmed company number including country code>
WHATSAPP_GRAPH_API_VERSION=v27.0
WHATSAPP_ACCOUNT_ID=<account ID used to read approved templates>
WHATSAPP_OUTBOX_DIR=<absolute private persistent directory outside the release>
```

`WHATSAPP_ENABLED` enables read-only sender and template checks. Keep `WHATSAPP_SEND_ENABLED=false` while preparing the ERP and billing. The send route rejects requests on the server until this flag is explicitly set to `true` and an absolute outbox path is configured. Inbox receiving has its own configuration. Without `WHATSAPP_ACCOUNT_ID`, the composer has only free-form messages. Provision the writable outbox outside the release directory with the service account as owner, directory mode 0700 and files mode 0600. The journal stores request fingerprints and send outcomes.

Use the customer quotation page link from issued or accepted quotation drafts. Generated invoices prefill an invoice reference and total, and published products prefill a public catalogue link. These shortcuts fill the composer for review. A quotation or invoice draft carries text only.

The business number must first be registered with Meta. If it is already used in the Business app, discuss the official coexistence onboarding flow and its account/device effects with the owner before making account changes. Never remove or migrate their existing number automatically. Configure the token's messaging permission and template-reading access. Number, token, account and desk readiness still require owner setup/confirmation before a real send test.

Each send verifies Meta's actual sender number against the configured company number. The connection also requires Meta to return `is_on_biz_app: true` and `platform_type: CLOUD_API` for that phone ID, so a Cloud API-only number or a Business app-only number cannot be selected. Templates come from Meta (first 100 entries), with fresh approval and parameter checks before sending. The composer supports approved text templates with positional body parameters and static text headers or footers.

### Inbox

After applying the inbox migration, configure the account and phone IDs above and set the following on the server:

```dotenv
WHATSAPP_WEBHOOK_ENABLED=true
WHATSAPP_APP_SECRET=<Meta app secret>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<random server-only verification token>
```

Use the HTTPS callback `/api/webhooks/whatsapp` and subscribe the configured business account to the `messages` field. The callback verifies the raw message signature and checks both asset IDs before writing incoming text. Retries with the same WhatsApp message ID leave one inbox row. Leave history and contact imports off until the business has approved that access.

For deployment before billing, apply both migrations, provision the private server settings and leave sending disabled. Verify the sender and approved templates with read-only requests. After the owner approves connecting the inbox, verify the HTTPS callback using Meta and subscribe only the intended business account. Confirm the send route reports `paused` and check the inbox using test data before enabling customer messaging.

Administrators can load the 50 most recent messages across the connected number or filter by customer phone. Employees with the WhatsApp grant must load a phone belonging to an active customer within their visible categories. Selecting Reply copies the sender into the composer. The inbox does not include older app history, attachments, mobile-app outbound echoes or delivery receipts.

## Sending behavior

- Free-form messages are limited to the provider's 24-hour customer service window. After it closes, choose an approved template.
- Only send to recipients who have agreed to receive the business's messages.
- The button waits for the explicit user action. Page loads only check the connection and read templates.
- Duplicate requests are blocked by an atomic persistent journal, including concurrent requests and process restarts. A previous accepted request returns its existing message ID.
- There are no automatic POST retries. An interrupted/ambiguous result remains unresolved and cannot be silently resent with the same request ID.
- “Accepted by WhatsApp” means the provider accepted the API request. It does not mean delivered or read; this module has no delivery webhook.
- Rejected messages retain their text for review. Start a new message after correcting an error. An unresolved send requires checking the business account first.

## Validation

Run `node --test --experimental-strip-types tests/company-whatsapp.test.mts`, TypeScript, targeted ESLint and a production build. Unit tests use injected provider responses and temporary journals. Browser tests may simulate provider responses only inside the test runner; there is no application-level mock send switch or fake success in production. A real end-to-end send requires the owner's approved test recipient and securely configured Meta account. Never record actual tokens, OTPs or passwords in test reports.

Official references checked 2026-11-23:

- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
