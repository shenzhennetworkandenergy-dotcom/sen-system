# Dynamic business categories

Business categories are stored in Supabase and managed from **Admin → Products
→ Product categories**. They are no longer limited to a fixed list in the
application source.

## Administration

An administrator can:

- create and edit a business category;
- set its name, URL slug, description, tagline, icon or image, and theme color;
- activate or deactivate it;
- move it up or down in the public display order;
- define category-specific product specification fields;
- archive an unused category, or permanently delete it when permanent deletion
  mode is enabled.

A category that is assigned to products or product classifications cannot be
deleted. It must first be reassigned or retained as an archived category.

## Theme colors

The theme color is entered with a color picker or a six-digit hexadecimal
value. The application derives readable foreground and surface colors from
that value and applies them to:

- homepage category cards;
- catalogue filters and category headers;
- product cards and product detail pages;
- category links and other category-labelled controls.

Choose a color with enough contrast against both white and dark backgrounds.
The editor previews the selected color before saving.

## Homepage and catalogue

The homepage reads active categories directly from the database, orders them by
their configured display order, and shows each category's current public
product count. Creating and activating a category therefore adds it to the
homepage and catalogue without a source-code change.

The public URL uses the category slug:

```text
/products?category=networking
```

Changing a slug changes that public URL. Prefer stable, descriptive slugs.

## Category-specific product fields

Each category owns an ordered list of specification fields. A field has:

- a stable key;
- a public label;
- a field type (text, number, select, multiselect, boolean, or textarea);
- optional choices;
- required, filterable, and variation flags;
- a display order.

After an administrator selects a business category on the product form, only
that category's configured fields are displayed. Values are stored in the
product specifications object. Fields marked **Use for variations** are also
offered when configuring variable products.

Add or change fields in the category editor instead of adding category-specific
form controls to the application source.

## Database compatibility

`products.business_category_id` and
`product_categories.business_category_id` are the authoritative relationships.
The existing `sen_business_category` text columns remain synchronized for
backward compatibility with reports and older integrations.

The migration seeds the original Networking, Medical Equipment, Energy, and
Others categories and links existing records automatically.

