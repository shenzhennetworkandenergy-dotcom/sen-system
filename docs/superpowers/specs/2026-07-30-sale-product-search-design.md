# Create Sale Product Search Design

## Goal

Replace the static Product `<select>` inside **Products and pricing** with a searchable product field. Staff can type part of a product name, SKU, or model and select a matching product from an immediate dropdown without refreshing the sale page.

## Chosen approach

The create-sale page already loads the active products needed by the sale builder. The new field will search that in-memory product list, which avoids another network request and makes results appear immediately.

Each sale row gets its own accessible combobox:

1. The input shows the selected product name, or the placeholder `Search by product name, SKU, or model`.
2. Typing performs case-insensitive partial matching across product name, SKU, and model number.
3. The dropdown shows up to 10 related products with name, SKU, model, and serialized status.
4. Clicking a result sets the product ID, fills the catalogue selling price, clears any previous variation, and refreshes the row's available-stock calculation.
5. The selected product remains visible in the input. Editing the text clears that selection and reopens matching results.
6. When no product matches, the field displays `No matching products found.`
7. Escape closes the dropdown, and focus reopens it when the typed value is searchable.

The detached section-level search box and the native product dropdown will be removed so there is only one clear product-selection interaction.

## Constraints

- The existing customer, warehouse, pricing, discount, variation, totals, and sale-submission behavior remain unchanged.
- Matching starts with the first non-whitespace character because the product list is already local.
- Search is case-insensitive and supports partial text.
- Results are limited to 10 to keep the dropdown fast and readable.
- The design remains responsive and keyboard-accessible.

## Verification

- Unit tests cover case-insensitive and partial matching, SKU/model matching, the 10-result cap, and selected-product fallback.
- A source regression check confirms the native product select and detached search box are removed.
- TypeScript, focused linting, existing sales verification, and the production build must pass.
