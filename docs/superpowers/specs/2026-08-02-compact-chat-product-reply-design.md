# Compact Chat Product Reply Design

## Goal

Make the product assistant's confirmed-product reply shorter and easier to scan without changing product search, confirmation, or inquiry behavior.

## Selected design

The reply becomes structured UI instead of one plain-text block. It contains only:

1. Product name.
2. Price, displayed as the strongest visual element.
3. One short availability line.
4. The existing bilingual WhatsApp prompt.

The confirmed reply intentionally excludes model, SKU, and short description. Search suggestions may continue to show model and SKU because they help users choose the correct product before confirmation.

## Presentation

- Product name: compact semibold text.
- Price: larger, extra-bold blue text with its own semantic element.
- Availability and prompt: compact normal text.
- Missing prices use the same highlighted position with “Price on request / মূল্য জানতে যোগাযোগ করুন”.

## Implementation

A pure reply builder formats the display data. `FloatingChat` stores that structured reply on the assistant message and renders each field separately. Dedicated CSS classes make the price independently styleable and keep the response responsive.

## Verification

- Unit tests verify single and ranged prices and the exact compact reply data.
- Source-contract tests verify the structured reply renderer is used.
- CSS tests verify that price typography is larger and extra bold.
- Lint, chatbot tests, standalone tests, production build, and responsive browser checks must pass.
