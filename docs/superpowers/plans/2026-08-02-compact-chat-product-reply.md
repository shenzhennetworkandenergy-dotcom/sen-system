# Compact Chat Product Reply Implementation Plan

## Task 1: Add failing reply-contract tests

- Extend `tests/product-home-chat-improvements.test.mts`.
- Assert the confirmed reply contains only name, formatted price, concise availability, and WhatsApp prompt.
- Assert single and ranged prices are formatted correctly.
- Assert the renderer exposes a dedicated price element styled larger and extra bold.

## Task 2: Build the structured reply

- Add `lib/chatbot/product-reply.ts` with a pure reply builder.
- Extend the assistant message shape in `components/support/FloatingChat.tsx`.
- Replace the legacy flattened reply with structured fields.
- Remove model, SKU, and short description from the confirmed reply.

## Task 3: Style and verify

- Add compact reply and highlighted-price styles to `app/globals.css`.
- Run focused tests, lint, chatbot tests, full standalone tests, and a production build.
- Verify the assistant remains responsive at desktop, mobile portrait, and short landscape sizes.

## Task 4: Release

- Commit and push the focused change.
- Wait for the deployment checks.
- Deploy to Vercel production and verify public routes and the live assistant shell.
