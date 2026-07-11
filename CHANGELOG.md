# Changelog

## Phase 2.5 — Premium homepage and Supabase product foundation

- Rebuilt the public homepage with a premium enterprise hero, technology showcase, Supabase-backed featured products, improved capabilities, industries, workflow, brands and final CTA sections.
- Integrated the SEN brand asset under `public/brand/` and wired it into header, mobile navigation, footer and app icon metadata.
- Added local HD-style abstract technology visuals for servers, networking, medical, energy and electronics categories.
- Added public routes for products, solutions, industries, about, contact and request quote so navigation no longer points to missing pages.
- Added a minimal Supabase `products` schema migration with RLS and optional sample data.
- Centralized server-side product queries in `lib/data/products.ts`.
