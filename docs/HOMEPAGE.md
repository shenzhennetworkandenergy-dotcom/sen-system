# SEN Homepage

## Phase 2.5 purpose

The homepage now presents SEN as a premium B2B technology sourcing and infrastructure partner across enterprise servers, networking, medical equipment, energy systems, electrical/electronics and industrial automation.

## Section order

1. Premium public header
2. Dark enterprise hero with server/network visual
3. Technology showcase for four major categories
4. Supabase-backed featured products
5. Featured solutions
6. Why choose SEN
7. Industries served
8. Project workflow
9. Capabilities
10. Representative brands and technologies
11. Final CTA
12. Public footer

## Navigation

Header and footer links now point to implemented public routes or real homepage/page anchors. Search, login and tracking are not shown as active features because those workflows are not implemented in this phase.

## Brand assets

The SEN logo is stored at `public/brand/sen-logo.svg` and is used in the header, mobile navigation and footer. App icon metadata references `app/icon.svg` and `app/apple-icon.svg`, which mirror the brand asset.

## Product content

Featured products are loaded through `getFeaturedProducts()` in `lib/data/products.ts`. Supabase rows are displayed only when `published = true` and `featured = true`. Empty and unavailable states are explicit. Demo fallback records are labelled and do not imply live stock.

## Visual assets

Local abstract visuals live under `public/images/home/` and are not manufacturer photos or proof of inventory. They can later be replaced with licensed photography or Supabase Storage-hosted product images.
