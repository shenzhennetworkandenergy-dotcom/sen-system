# Product Administration

SEN products support simple and variable types, unique slugs/SKUs, optional barcodes and manufacturer numbers, four business categories, reusable categories/brands/tags/attributes, descriptions, specifications, warranty, physical dimensions, prices, tax placeholders, stock settings, and public-catalogue visibility metadata.

Variable parents may have uniquely keyed variations with variation-specific SKU, barcode, prices, image metadata, weight, dimensions, and stock settings. A database trigger prevents ambiguous stock management at both parent and variation level. Historical inventory references prevent destructive variation deletion; archive instead.

Product routes require the corresponding `products.*` permission. Creates, updates, archives, variations, and uploads use server actions and the central audit helper. The private media bucket accepts JPG, PNG, WebP, and PDF files up to 10 MB with server-generated paths.

CSV import is intentionally not presented as implemented. A validated preview/dry-run importer with duplicate-SKU and row-level error handling is the next catalogue subphase.
