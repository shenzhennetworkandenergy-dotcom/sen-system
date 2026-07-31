type ProductCategoryIdentityInput = {
  title: string;
  businessCategoryId: string;
  businessCategoryName: string;
};

export function productSlugFromTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function buildProductCategoryIdentity({
  title,
  businessCategoryId,
  businessCategoryName,
}: ProductCategoryIdentityInput) {
  return {
    slug: productSlugFromTitle(title),
    business_category_id: businessCategoryId,
    sen_business_category: businessCategoryName,
  };
}

export function productSaveError(rawMessage: string) {
  const message = rawMessage.replace(/\s+/g, " ").trim().slice(0, 300);
  if (/SKU already exists|duplicate key.*(?:sku|products_sku)/i.test(message)) {
    return "That SKU is already used by another product or variation.";
  }
  if (/duplicate key.*(?:slug|products_slug)/i.test(message)) {
    return "Another product already uses this title-generated URL. Change the product title so its URL is unique.";
  }
  if (/Product classification must use the selected business category/i.test(message)) {
    return "The selected product classification belongs to a different business category. Choose a classification listed under the selected business category, then save again.";
  }
  if (/Active product category required/i.test(message)) {
    return "Choose an active product category.";
  }
  if (/business category.*required|valid business category|required business category/i.test(message)) {
    return "Choose an active business category.";
  }
  if (/permission denied|not authorized|insufficient privilege/i.test(message)) {
    return "Your account does not have permission to edit this product.";
  }
  if (/schema cache|column .* does not exist|function .* does not exist|PGRST202/i.test(message)) {
    return "The product database is not up to date. Apply the latest Supabase migrations, then try again.";
  }
  if (/Stock cannot be managed|variations cannot|cannot be changed to a simple/i.test(message)) {
    return "Stock cannot be managed by both a variable parent and its variations.";
  }
  if (/Product not found/i.test(message)) return "Product not found.";
  return `Unable to save product. Technical reason: ${message || "No database error details were returned."}`;
}
