"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { checked, optionalNumber, optionalText, productStatuses, productTypes, requiredText, slugify, uuidOrNull, businessCategories } from "@/lib/inventory/validation";
import { sanitizeProductHtml } from "@/lib/inventory/html";

function target(id?: string, type: "success" | "error" = "success", message = "Saved") { return id ? `/admin/products/${id}?${type}=${encodeURIComponent(message)}` : `/admin/products?${type}=${encodeURIComponent(message)}`; }
function payload(form: FormData) {
  const name = requiredText(form, "name"), sku = requiredText(form, "sku", 100), product_type = String(form.get("product_type")), status = String(form.get("status")), sen_business_category = String(form.get("sen_business_category")), regular_price = optionalNumber(form, "regular_price"), sale_price = optionalNumber(form, "sale_price"), stock_status = String(form.get("stock_status") ?? "in_stock");
  if (!productTypes.includes(product_type as never) || !productStatuses.includes(status as never) || !businessCategories.includes(sen_business_category as never) || !["in_stock", "out_of_stock", "on_backorder"].includes(stock_status)) throw new Error("Invalid product type, status, business category, or stock status.");
  if (sale_price !== null && regular_price !== null && sale_price > regular_price) throw new Error("Sale price cannot exceed regular price.");
  const currency = requiredText(form, "currency", 3).toUpperCase(); if (currency.length !== 3) throw new Error("Currency must be a three-letter code.");
  let specifications = {}; try { specifications = JSON.parse(String(form.get("specifications") ?? "{}")); } catch { throw new Error("Specifications must be valid JSON."); }
  const serialTracking = checked(form, "serial_tracking_required"), modelNumber = optionalText(form, "model_number", 160); if (serialTracking && !modelNumber) throw new Error("Model number is required for serial-tracked products.");
  return { name, sku, model_number: modelNumber, slug: slugify(String(form.get("slug") || name)), product_type, status, sen_business_category, brand_id: uuidOrNull(form.get("brand_id")), barcode: optionalText(form, "barcode", 100), manufacturer_part_number: optionalText(form, "manufacturer_part_number", 100), short_description: sanitizeProductHtml(optionalText(form, "short_description", 4000)), description: sanitizeProductHtml(optionalText(form, "description", 20000)), specifications, internal_notes: optionalText(form, "internal_notes", 5000), warranty_information: optionalText(form, "warranty_information", 1000), purchase_cost: optionalNumber(form, "purchase_cost"), regular_price, sale_price, currency, weight: optionalNumber(form, "weight"), length: optionalNumber(form, "length"), width: optionalNumber(form, "width"), height: optionalNumber(form, "height"), country_of_origin: optionalText(form, "country_of_origin", 100), manage_stock: checked(form, "manage_stock"), stock_status, low_stock_threshold: optionalNumber(form, "low_stock_threshold") ?? 0, allow_backorders: checked(form, "allow_backorders"), sold_individually: checked(form, "sold_individually"), serial_tracking_required: serialTracking, batch_tracking_enabled: checked(form, "batch_tracking_enabled"), featured: checked(form, "featured"), public_catalogue_visible: checked(form, "public_catalogue_visible") };
}
function safeProductError(message: string) {
  if (/SKU already exists|duplicate key.*sku/i.test(message)) return "That SKU is already used by a product or variation.";
  if (/duplicate key.*slug/i.test(message)) return "That product slug is already in use.";
  if (/Stock cannot be managed|variations cannot|cannot be changed to a simple/i.test(message)) return "Stock cannot be managed by both a variable parent and its variations.";
  if (/Active product category required/i.test(message)) return "Choose an active product category.";
  if (/Product not found/i.test(message)) return "Product not found.";
  return "Unable to save product.";
}
async function validateProductStockModel(productId: string | null, data: ReturnType<typeof payload>) {
  if (!productId) return;
  const db = createSupabaseAdminClient();
  let query = db.from("product_variations").select("id").eq("product_id", productId);
  if (data.product_type === "variable" && data.manage_stock) query = query.eq("status", "active").eq("manage_stock", true);
  const { data: variations, error } = await query.limit(1);
  if (error) throw new Error("Unable to validate product variations.");
  if (data.product_type === "simple" && variations?.length) throw new Error("A product with variations cannot be changed to a simple product.");
  if (data.product_type === "variable" && data.manage_stock && variations?.length) throw new Error("Stock cannot be managed by both a variable parent and its variations.");
}
async function saveProduct(actorId: string, productId: string | null, form: FormData) {
  const data = payload(form); await validateProductStockModel(productId, data);
  const db = createSupabaseAdminClient();
  const { data: savedId, error } = await db.rpc("admin_save_product", { actor_profile_id: actorId, requested_product_id: productId, requested_product: data, requested_category_id: uuidOrNull(form.get("category_id")) });
  if (error || !savedId) throw new Error(error?.message ?? "Product save failed");
  return String(savedId);
}

export async function createProductAction(form: FormData) {
  const { profile } = await requirePermission("products.create");
  let savedId: string;
  try { savedId = await saveProduct(profile.id, null, form); } catch (error) { const message = error instanceof Error ? error.message : "Unknown"; console.error("Product create failed", { message }); redirect(target(undefined, "error", /required|Invalid|price|JSON|Currency/i.test(message) ? message : safeProductError(message))); }
  revalidatePath("/admin/products"); if(form.get("submit_intent")==="save_generate") redirect(`/admin/products/${savedId}/serials/new`); redirect(target(savedId, "success", "Product created."));
}
export async function updateProductAction(productId: string, form: FormData) {
  const { profile } = await requirePermission("products.edit");
  try { await saveProduct(profile.id, productId, form); } catch (error) { const message = error instanceof Error ? error.message : "Unknown"; console.error("Product update failed", { message }); redirect(target(productId, "error", /required|Invalid|price|JSON|Currency|variations/i.test(message) ? message : safeProductError(message))); }
  revalidatePath(`/admin/products/${productId}`); revalidatePath("/admin/products"); if(form.get("submit_intent")==="save_generate") redirect(`/admin/products/${productId}/serials/new`); redirect(target(productId, "success", "Product updated."));
}
export async function archiveProductAction(form: FormData) { const { profile } = await requirePermission("products.archive"); const ids = [...new Set(form.getAll("productIds").map(String))].filter((item) => /^[0-9a-f-]{36}$/i.test(item)).slice(0, 100); if (!ids.length) redirect(target(undefined, "error", "Select at least one product.")); const db = createSupabaseAdminClient(); const { error } = await db.from("products").update({ status: "archived", updated_by: profile.id, updated_at: new Date().toISOString() }).in("id", ids); if (error) redirect(target(undefined, "error", "Unable to archive products.")); await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "product.archived", module: "products", entityType: "product", description: "Products archived.", newValues: { product_ids: ids, count: ids.length } }); revalidatePath("/admin/products"); redirect(target(undefined, "success", `${ids.length} product(s) archived.`)); }
export async function createVariationAction(productId: string, form: FormData) {
  const { profile } = await requirePermission("products.edit"); const db = createSupabaseAdminClient();
  const { data: parent, error: parentError } = await db.from("products").select("product_type,manage_stock").eq("id", productId).maybeSingle();
  if (parentError || !parent || parent.product_type !== "variable") redirect(target(productId, "error", "Variations require a variable parent product."));
  const manageStock = checked(form, "manage_stock"); if (parent.manage_stock && manageStock) redirect(target(productId, "error", "Stock cannot be managed by both the variable parent and its variations."));
  const data = (() => {
    try { return { product_id: productId, sku: requiredText(form, "sku", 100), combination_key: requiredText(form, "combination_key", 500), regular_price: optionalNumber(form, "regular_price"), purchase_cost: optionalNumber(form, "purchase_cost"), manage_stock: manageStock, low_stock_threshold: optionalNumber(form, "low_stock_threshold") ?? 0 }; }
    catch (error) { redirect(target(productId, "error", error instanceof Error ? error.message : "Invalid variation details.")); }
  })();
  const { data: created, error } = await db.from("product_variations").insert(data).select("id").single();
  if (error || !created) redirect(target(productId, "error", safeProductError(error?.message ?? "Unable to create variation.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "product.variation_created", module: "products", entityType: "product_variation", entityId: created.id, description: "Product variation created.", newValues: { product_id: productId, sku: data.sku, combination_key: data.combination_key } });
  revalidatePath(`/admin/products/${productId}`); redirect(target(productId, "success", "Variation created."));
}
export async function uploadProductMediaAction(productId: string, form: FormData) { const { profile } = await requirePermission("products.manage_media"); const file = form.get("file"); if (!(file instanceof File) || file.size === 0 || file.size > 10485760 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) redirect(target(productId, "error", "Choose a JPG, PNG, WebP, or PDF up to 10 MB.")); const purposes=["main_product_image","gallery_image","warranty_document","purchase_invoice","supplier_invoice","packing_list","customs_document","internal_product_document"],purpose=String(form.get("media_purpose")??"gallery_image");if(!purposes.includes(purpose))redirect(target(productId,"error","Invalid media purpose."));const isImage=file.type!=="application/pdf";if(isImage&&!['main_product_image','gallery_image'].includes(purpose))redirect(target(productId,"error","Images must be main or gallery product images."));if(!isImage&&['main_product_image','gallery_image'].includes(purpose))redirect(target(productId,"error","Product images require JPG, PNG, or WebP."));const visibility=['main_product_image','gallery_image'].includes(purpose)?'public':['warranty_document','purchase_invoice'].includes(purpose)?'customer_order_restricted':'internal'; const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.type]!; const path = `${productId}/${crypto.randomUUID()}.${ext}`, db = createSupabaseAdminClient(); const { error: uploadError } = await db.storage.from("product-media").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false }); if (uploadError) redirect(target(productId, "error", "Unable to upload media.")); const { error } = await db.from("product_media").insert({ product_id: productId, storage_path: path, original_file_name:file.name.replace(/[^A-Za-z0-9._-]/g,"_").slice(0,200), media_type: isImage ? "image" : "document", media_purpose:purpose,visibility,mime_type: file.type, file_size: file.size, alt_text: String(form.get("alt_text") ?? "").slice(0, 200),is_primary:purpose==='main_product_image',uploaded_by:profile.id }); if (error) { await db.storage.from("product-media").remove([path]); redirect(target(productId, "error", "Unable to save media details.")); } await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "product.media_added", module: "products", entityType: "product", entityId: productId, description: "Product media added.", newValues: { media_type: isImage ? "image" : "document",media_purpose:purpose,visibility } }); revalidatePath(`/admin/products/${productId}`); redirect(target(productId, "success", "Media uploaded.")); }
