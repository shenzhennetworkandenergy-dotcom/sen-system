# SEN Homepage

## Purpose

The Phase 2 homepage positions SEN — Shenzhen Energy & Networks as an international technology company, enterprise solution provider, industrial equipment supplier and sourcing/procurement partner connecting China-based supply capabilities with Bangladesh operations and global customers.

## Section order

1. Public header and utility bar
2. Hero section
3. Business categories
4. Company introduction
5. Featured solutions
6. Sample featured products preview
7. Why choose SEN
8. Industries served
9. Project workflow
10. Capability statements
11. Brands and technologies
12. Final call to action
13. Public footer

## Component structure

Homepage sections are implemented as reusable components under `components/home`. Shared primitives remain in `components/ui`, and global public chrome remains in `components/layout`.

## Content strategy

Copy is professional and capability-focused. It avoids unsupported claims such as market leadership, guaranteed lowest pricing, official brand partnerships, exact shipment volume or exact customer count.

## Brand assets

The public header and footer reference `/public/brand/sen-logo.svg`. App Router icon metadata references `app/icon.svg` and `app/apple-icon.svg`. The provided task did not include an accessible binary attachment in the workspace, so the current SVG is a local SEN wordmark placeholder that should be replaced with the supplied official logo file when available.

## Responsive strategy

Layouts use mobile-first grids, wrapping CTA groups and a compact client-side mobile menu. Decorative hero artwork is CSS/SVG-free layout styling and does not require remote imagery.

## Accessibility decisions

The page has one `h1`, semantic sections, named navigation landmarks, descriptive logo alt text, visible focus rings, keyboard-accessible links/buttons and an Escape-close mobile navigation dialog. Decorative visuals are hidden from assistive technology where applicable.

## Static placeholders

Featured products are a typed static dataset with no prices, stock claims or live inventory. They are intentionally marked as representative placeholders until Supabase product catalogue data replaces them.

## Future integration

Future Phase 3 work can replace static product data with Supabase catalogue records, add category/detail pages for placeholder routes and expand solution/industry content without changing the homepage component boundaries.
