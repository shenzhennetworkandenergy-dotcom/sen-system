"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { registerArchiveEntry, removeArchiveEntry } from "@/lib/deletion/archive";
import { getDeletionMode } from "@/lib/deletion/settings";
import { checked, optionalMoney, optionalNumber, optionalText, optionalWholeNumber, productStatuses, productTypes, requiredText, slugify, uuidOrNull } from "@/lib/inventory/validation";
import { sanitizeProductHtml } from "@/lib/inventory/html";
import { automaticSku, normalizeIdentifier } from "@/lib/inventory/identifiers";
import {
  categorySpecificationInput,
  mergeCategorySpecifications,
  parseStoredSpecifications,
} from "@/lib/inventory/category-specifications";
import type { CategoryFieldDefinition } from "@/lib/catalog/business-category-domain";
import {
  buildProductImagePath,
  sanitizeMediaFileName,
  validateProductImageMetadata,
  type ProductImageMetadata,
} from "@/lib/inventory/product-media";
import {
  buildProductCategoryIdentity,
  productSaveError,
} from "@/lib/inventory/product-editing";

function target(id?: string, type: "success" | "error" = "success", message = "Saved") { return id ? `/admin/products/${id}?${type}=${encodeURIComponent(message)}` : `/admin/products?${type}=${encodeURIComponent(message)}`; }
function createErrorTarget(message: string) { return `/admin/products/new?error=${encodeURIComponent(message)}`; }
function payload(form: FormData) {
  const name = requiredText(form, "name"), sku = requiredText(form, "sku", 100), product_type = String(form.get("product_type")), status = String(form.get("status")), regular_price = optionalMoney(form, "regular_price", "Regular price"), sale_price = optionalMoney(form, "sale_price", "Sale price"), stock_status = String(form.get("stock_status") ?? "in_stock");
  if (!productTypes.includes(product_type as never) || !productStatuses.includes(status as never) || !["in_stock", "out_of_stock", "on_backorder"].includes(stock_status)) throw new Error("Invalid product type, status, or stock status.");
  if (sale_price !== null && regular_price !== null && sale_price > regular_price) throw new Error("Sale price cannot exceed regular price.");
  const currency = requiredText(form, "currency", 3).toUpperCase(); if (currency !== "BDT") throw new Error("SEN product prices must use BDT.");
  const specifications = parseStoredSpecifications(String(form.get("specifications") ?? "{}"));
  const serialTracking = checked(form, "serial_tracking_required"), modelNumber = optionalText(form, "model_number", 160); if (serialTracking && !modelNumber) throw new Error("Model number is required for serial-tracked products.");
  return { name, sku, model_number: modelNumber, slug: slugify(String(form.get("slug") || name)), product_type, status, brand_id: uuidOrNull(form.get("brand_id")), barcode: optionalText(form, "barcode", 100), manufacturer_part_number: optionalText(form, "manufacturer_part_number", 100), short_description: sanitizeProductHtml(optionalText(form, "short_description", 4000)), description: sanitizeProductHtml(optionalText(form, "description", 20000)), specifications, internal_notes: optionalText(form, "internal_notes", 5000), warranty_information: optionalText(form, "warranty_information", 1000), purchase_cost: optionalMoney(form, "purchase_cost", "Purchase cost"), regular_price, sale_price, currency, weight: optionalNumber(form, "weight"), length: optionalNumber(form, "length"), width: optionalNumber(form, "width"), height: optionalNumber(form, "height"), country_of_origin: optionalText(form, "country_of_origin", 100), manage_stock: checked(form, "manage_stock"), stock_status, low_stock_threshold: optionalWholeNumber(form, "low_stock_threshold", "Low-stock threshold") ?? 0, allow_backorders: checked(form, "allow_backorders"), sold_individually: checked(form, "sold_individually"), serial_tracking_required: serialTracking, batch_tracking_enabled: checked(form, "batch_tracking_enabled"), featured: checked(form, "featured"), public_catalogue_visible: checked(form, "public_catalogue_visible") };
}
const safeProductError = productSaveError;
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
type SubmittedAttribute = { name?: string; values?: string; universal?: boolean; variation?: boolean };
async function saveSubmittedAttributes(productId: string, form: FormData) {
  const raw = String(form.get("product_attributes_json") ?? "[]");
  let submitted: SubmittedAttribute[] = [];
  try { submitted = JSON.parse(raw); } catch { throw new Error("Product attributes are invalid."); }
  if (!Array.isArray(submitted) || submitted.length > 30) throw new Error("Product attributes are invalid.");
  const rows = submitted.map((row) => ({
    name: String(row.name ?? "").trim().slice(0, 120),
    values: [...new Set(String(row.values ?? "").split(",").map((value) => value.trim().slice(0, 120)).filter(Boolean))].slice(0, 100),
    universal: Boolean(row.universal),
    variation: Boolean(row.variation),
  })).filter((row) => row.name && row.values.length);
  if (!rows.length) return;
  const db = createSupabaseAdminClient();
  for (const [index, row] of rows.entries()) {
    let attributeId: string | null = null;
    if (row.universal) {
      const { data } = await db.from("attributes").select("id").eq("scope", "universal").ilike("name", row.name).maybeSingle();
      attributeId = data?.id ?? null;
    }
    if (!attributeId) {
      const baseSlug = slugify(row.name);
      const { data, error } = await db.from("attributes").insert({
        name: row.name,
        slug: row.universal ? baseSlug : `${baseSlug}-${productId.slice(0, 8)}`,
        scope: row.universal ? "universal" : "product",
        owner_product_id: row.universal ? null : productId,
        sort_order: index,
      }).select("id").single();
      if (error || !data) throw new Error(`Unable to create the ${row.name} attribute.`);
      attributeId = data.id;
    }
    const valueRows = row.values.map((value, valueIndex) => ({ attribute_id: attributeId, value, slug: slugify(value), sort_order: valueIndex }));
    const { error: valueError } = await db.from("attribute_values").upsert(valueRows, { onConflict: "attribute_id,slug", ignoreDuplicates: true });
    if (valueError) throw new Error(`Unable to save values for ${row.name}.`);
    const { error: assignmentError } = await db.from("product_attributes").upsert({ product_id: productId, attribute_id: attributeId, is_variation: row.variation, is_visible: true, sort_order: index }, { onConflict: "product_id,attribute_id" });
    if (assignmentError) throw new Error(`Unable to assign ${row.name} to this product.`);
  }
}
async function saveProduct(actorId: string, productId: string | null, form: FormData, canManageIdentifiers: boolean) {
  const baseData = payload(form);
  const warrantyEnabled = checked(form, "warranty_enabled");
  const warrantyDurationMonths = optionalWholeNumber(form, "warranty_duration_months", "Warranty duration") ?? 0;
  if (warrantyEnabled && warrantyDurationMonths < 1) throw new Error("Warranty duration must be at least 1 month when warranty is enabled.");
  if (warrantyDurationMonths > 240) throw new Error("Warranty duration cannot exceed 240 months.");
  const structuredWarranty = {
    warranty_enabled: warrantyEnabled,
    warranty_duration_months: warrantyDurationMonths,
    warranty_terms: optionalText(form, "warranty_terms", 5000),
    warranty_exclusions: optionalText(form, "warranty_exclusions", 5000),
  };
  const businessCategoryId = uuidOrNull(form.get("business_category_id"));
  if (!businessCategoryId) throw new Error("An active business category is required.");
  const db = createSupabaseAdminClient();
  const [{ data: businessCategory, error: categoryError }, { data: fieldRows, error: fieldsError }] = await Promise.all([
    db.from("business_categories").select("id,name").eq("id", businessCategoryId).eq("is_active", true).is("archived_at", null).maybeSingle(),
    db.from("business_category_fields").select("field_key,label,field_type,placeholder,help_text,unit,options,is_required,is_filterable,use_for_variations,is_active,sort_order").eq("business_category_id", businessCategoryId).eq("is_active", true).order("sort_order"),
  ]);
  if (categoryError || fieldsError || !businessCategory) throw new Error("An active business category is required.");
  const categoryFields = (fieldRows ?? []) as CategoryFieldDefinition[];
  const specifications = mergeCategorySpecifications(
    categoryFields,
    categorySpecificationInput(form, categoryFields),
    baseData.specifications,
  );
  const data = {
    ...baseData,
    specifications,
    ...buildProductCategoryIdentity({
      title: baseData.name,
      businessCategoryId,
      businessCategoryName: businessCategory.name,
    }),
  };
  await validateProductStockModel(productId, data);
  if (!productId) data.public_catalogue_visible = true;
  const { data: brand } = data.brand_id ? await db.from("brands").select("name").eq("id", data.brand_id).eq("is_active", true).maybeSingle() : { data: null };
  if (!brand || !data.model_number) throw new Error("An active brand and model number are required.");
  const generatedSku = automaticSku(brand.name, data.model_number), customSku = checked(form, "custom_sku");
  if (customSku && !canManageIdentifiers) throw new Error("Permission denied for custom product identifiers.");
  if (!customSku) data.sku = generatedSku;
  let duplicateQuery = db.from("products").select("id,name,sku").eq("brand_id", data.brand_id).eq("normalized_model_number", normalizeIdentifier(data.model_number)).neq("status", "archived").limit(1);
  if (productId) duplicateQuery = duplicateQuery.neq("id", productId);
  const { data: duplicate } = await duplicateQuery.maybeSingle();
  if (duplicate) throw new Error(`This product model already exists as ${duplicate.name} (${duplicate.sku}).`);
  const { data: savedId, error } = await db.rpc("admin_save_product", { actor_profile_id: actorId, requested_product_id: productId, requested_product: data, requested_category_id: uuidOrNull(form.get("category_id")) });
  if (error || !savedId) throw new Error(error?.message ?? "Product save failed");
  const { error: warrantyError } = await db.from("products").update(structuredWarranty).eq("id", String(savedId));
  if (warrantyError) throw new Error(warrantyError.message || "Unable to save product warranty settings.");
  await saveSubmittedAttributes(String(savedId), form);
  return String(savedId);
}

async function uploadFormImages(productId: string, actorId: string, form: FormData) {
  const image = form.get("main_image");
  if (!(image instanceof File) || !image.size) return [];
  try {
    validateProductImageMetadata(image);
  } catch {
    return [image.name];
  }
  const db = createSupabaseAdminClient();
  const path = buildProductImagePath(productId, image.type);
  const { error: uploadError } = await db.storage
    .from("product-media")
    .upload(path, await image.arrayBuffer(), { contentType: image.type, upsert: false });
  if (uploadError) return [image.name];
  const { error } = await db.from("product_media").insert({
    product_id: productId,
    storage_path: path,
    original_file_name: sanitizeMediaFileName(image.name),
    media_type: "image",
    media_purpose: "main_product_image",
    visibility: "public",
    mime_type: image.type,
    file_size: image.size,
    alt_text: image.name,
    is_primary: true,
    uploaded_by: actorId,
  });
  if (error) {
    await db.storage.from("product-media").remove([path]);
    return [image.name];
  }
  return [];
}

export async function createProductAction(form: FormData) {
  const { profile, permissions } = await requirePermission("products.create");
  let savedId: string;
  try { savedId = await saveProduct(profile.id, null, form, profile.role==="admin"||permissions.has("products.manage_identifiers")); } catch (error) { const message = error instanceof Error ? error.message : "Unknown"; console.error("Product create failed", { message }); redirect(createErrorTarget(/required|Invalid|price|JSON|Currency|already exists/i.test(message) ? message : safeProductError(message))); }
  revalidatePath("/admin/products"); revalidatePath("/products"); if(form.get("submit_intent")==="save_generate") redirect(`/admin/products/${savedId}/serials/new`); redirect(target(savedId, "success", "Product created. You can now add its main and gallery images below."));
}
export async function updateProductAction(productId: string, form: FormData) {
  const { profile, permissions } = await requirePermission("products.edit");
  try { await saveProduct(profile.id, productId, form, profile.role==="admin"||permissions.has("products.manage_identifiers")); } catch (error) { const message = error instanceof Error ? error.message : "Unknown"; console.error("Product update failed", { message }); redirect(target(productId, "error", /required|Invalid|price|JSON|Currency|variations|already exists/i.test(message) ? message : safeProductError(message))); }
  revalidatePath(`/admin/products/${productId}`); revalidatePath("/admin/products"); revalidatePath("/products"); if(form.get("submit_intent")==="save_generate") redirect(`/admin/products/${productId}/serials/new`); redirect(target(productId, "success", "Product updated."));
}
export async function archiveProductAction(form: FormData) {
  const { profile } = await requirePermission("products.archive");
  const ids = [...new Set(form.getAll("productIds").map(String))]
    .filter((item) => /^[0-9a-f-]{36}$/i.test(item))
    .slice(0, 100);
  if (!ids.length)
    redirect(target(undefined, "error", "Select at least one product."));
  const db = createSupabaseAdminClient();
  const { data: products, error: lookupError } = await db
    .from("products")
    .select("id,name,sku,status")
    .in("id", ids);
  if (lookupError || !products?.length)
    redirect(target(undefined, "error", "Unable to load selected products."));
  const archivedAt = new Date().toISOString();
  const { error } = await db
    .from("products")
    .update({
      status: "archived",
      public_catalogue_visible: false,
      archived_at: archivedAt,
      archived_by: profile.id,
      archive_reason: "Archived from the product list",
      updated_by: profile.id,
      updated_at: archivedAt,
    })
    .in(
      "id",
      products.map((product) => product.id),
    );
  if (error)
    redirect(target(undefined, "error", "Unable to archive products."));
  try {
    await Promise.all(
      products.map((product) =>
        registerArchiveEntry(profile.id, {
          entityType: "product",
          entityId: product.id,
          displayName: product.name,
          reason: "Archived from the product list",
          metadata: { sku: product.sku, previous_status: product.status },
        }),
      ),
    );
  } catch {
    redirect(
      target(
        undefined,
        "error",
        "Products were hidden, but the Archive index could not be updated.",
      ),
    );
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "product.archived",
    module: "products",
    entityType: "product",
    description: "Products archived.",
    newValues: {
      product_ids: products.map((product) => product.id),
      count: products.length,
    },
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin/archive");
  revalidatePath("/products");
  redirect(
    target(undefined, "success", `${products.length} product(s) archived.`),
  );
}
export async function deleteProductAction(productId: string) {
  const { profile } = await requireProfile(["admin"]), db = createSupabaseAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(productId)) redirect(target(undefined, "error", "Invalid product."));
  const { data: product, error: productError } = await db.from("products").select("id,name,sku").eq("id", productId).maybeSingle();
  if (productError || !product) redirect(target(undefined, "error", "Product not found."));
  const mode = await getDeletionMode();
  if (mode.operation === "archive") {
    const archivedAt = new Date().toISOString();
    const reason = "Deleted while Permanent Deletion Mode was disabled";
    const { error: archiveError } = await db
      .from("products")
      .update({
        status: "archived",
        public_catalogue_visible: false,
        archived_at: archivedAt,
        archived_by: profile.id,
        archive_reason: reason,
        updated_by: profile.id,
        updated_at: archivedAt,
      })
      .eq("id", productId);
    if (archiveError)
      redirect(target(productId, "error", "Unable to archive this product."));
    try {
      await registerArchiveEntry(profile.id, {
        entityType: "product",
        entityId: productId,
        displayName: product.name,
        reason,
        metadata: { sku: product.sku },
      });
    } catch {
      redirect(
        target(
          productId,
          "error",
          "The product was hidden, but the Archive index could not be updated.",
        ),
      );
    }
    await writeAuditLog({
      actorId: profile.id,
      actorRole: profile.role,
      action: "product.archived",
      module: "products",
      entityType: "product",
      entityId: productId,
      description:
        "Product moved to the Archive while permanent deletion was disabled.",
      oldValues: { name: product.name, sku: product.sku },
    });
    revalidatePath("/admin/products");
    revalidatePath("/admin/archive");
    revalidatePath("/products");
    redirect(
      target(undefined, "success", "Product moved to the Archive."),
    );
  }
  const checks = await Promise.all([
    db.from("inventory_balances").select("id", { count: "exact", head: true }).eq("product_id", productId),
    db.from("inventory_movement_items").select("id", { count: "exact", head: true }).eq("product_id", productId),
    db.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("product_id", productId),
    db.from("serial_numbers").select("id", { count: "exact", head: true }).eq("product_id", productId),
    db.from("serial_generation_batches").select("id", { count: "exact", head: true }).eq("product_id", productId),
    db.from("sales_order_items").select("id", { count: "exact", head: true }).eq("product_id", productId),
    db.from("product_variations").select("id", { count: "exact", head: true }).eq("product_id", productId),
  ]);
  if (checks.some((result) => result.error || (result.count ?? 0) > 0)) {
    redirect(
      target(
        productId,
        "error",
        "This product has stock, serial, order, variation, or financial history. Remove that test history first or turn off Permanent Deletion Mode to archive it.",
      ),
    );
  }
  const { data: media } = await db.from("product_media").select("storage_path").eq("product_id", productId);
  const cleanupResults = await Promise.all([
    db.from("product_identifier_history").delete().eq("product_id", productId),
    db.from("product_revisions").delete().eq("product_id", productId),
  ]);
  if (cleanupResults.some((result) => result.error)) redirect(target(productId, "error", "Unable to prepare this unused product for deletion."));
  const { error } = await db.from("products").delete().eq("id", productId);
  if (error) redirect(target(productId, "error", "Unable to delete this product. Archive it instead."));
  try {
    await removeArchiveEntry("product", productId);
  } catch {
    console.error("Deleted product archive entry cleanup failed", { productId });
  }
  const storagePaths = (media ?? []).map((item) => item.storage_path);
  if (storagePaths.length) await db.storage.from("product-media").remove(storagePaths);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "product.deleted", module: "products", entityType: "product", entityId: productId, description: "Unused product permanently deleted.", oldValues: { name: product.name, sku: product.sku } });
  revalidatePath("/admin/products"); revalidatePath("/admin/archive"); revalidatePath("/admin/inventory"); revalidatePath("/products");
  redirect(target(undefined, "success", "Unused product permanently deleted."));
}
export async function quickUpdateProductAction(productId:string,form:FormData){
  const {profile}=await requirePermission("products.edit"),db=createSupabaseAdminClient();
  const status=String(form.get("status")??""),stock_status=String(form.get("stock_status")??""),regular_price=optionalMoney(form,"regular_price","Regular price"),sale_price=optionalMoney(form,"sale_price","Sale price");
  if(!productStatuses.includes(status as never)||!["in_stock","out_of_stock","on_backorder"].includes(stock_status))redirect(target(undefined,"error","Invalid quick-edit values."));
  if(sale_price!==null&&regular_price!==null&&sale_price>regular_price)redirect(target(undefined,"error","Sale price cannot exceed regular price."));
  const changes={status,stock_status,regular_price,sale_price,featured:checked(form,"featured"),public_catalogue_visible:checked(form,"public_catalogue_visible"),updated_by:profile.id,updated_at:new Date().toISOString()};
  const{error}=await db.from("products").update(changes).eq("id",productId);
  if(error)redirect(target(undefined,"error","Unable to quick-edit product."));
  await writeAuditLog({actorId:profile.id,actorRole:profile.role,action:"product.quick_updated",module:"products",entityType:"product",entityId:productId,description:"Product listing fields updated.",newValues:changes});
  revalidatePath("/admin/products");revalidatePath("/products");redirect(target(undefined,"success","Product updated."));
}

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map((value) => value.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

export async function importProductsCsvAction(form: FormData) {
  const { profile, permissions } = await requirePermission("products.create");
  const csv = form.get("csv");
  if (!(csv instanceof File) || !csv.size || csv.size > 2_000_000) redirect("/admin/products/import?error=Choose%20a%20CSV%20file%20up%20to%202%20MB.");
  const records = parseCsv(await csv.text()).slice(0, 500);
  if (!records.length) redirect("/admin/products/import?error=The%20CSV%20contains%20no%20product%20rows.");
  const db = createSupabaseAdminClient(), images = new Map(form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0).map((file) => [file.name.toLowerCase(), file]));
  let imported = 0; const failures: string[] = [];
  for (const [index, record] of records.entries()) {
    try {
      if (!record.name || !record.model || !record.brand || !record.category) throw new Error("name, model, brand and category are required");
      let { data: brand } = await db.from("brands").select("id").ilike("name", record.brand).maybeSingle();
      if (!brand) {
        const result = await db.from("brands").insert({ name: record.brand.slice(0, 120), slug: `${slugify(record.brand)}-${crypto.randomUUID().slice(0, 6)}` }).select("id").single();
        if (result.error || !result.data) throw new Error("brand could not be created"); brand = result.data;
      }
      const requestedBusinessCategory = record.business_category?.trim() || "Others";
      let { data: businessCategory } = await db.from("business_categories").select("id,name").is("archived_at", null).eq("is_active", true).ilike("name", requestedBusinessCategory).maybeSingle();
      if (!businessCategory) {
        const fallback = await db.from("business_categories").select("id,name").eq("slug", "others").eq("is_active", true).is("archived_at", null).maybeSingle();
        businessCategory = fallback.data;
      }
      if (!businessCategory) throw new Error("an active business category is required");
      let { data: category } = await db.from("product_categories").select("id").eq("business_category_id", businessCategory.id).ilike("name", record.category).maybeSingle();
      if (!category) {
        const result = await db.from("product_categories").insert({ name: record.category.slice(0, 120), slug: `${slugify(record.category)}-${crypto.randomUUID().slice(0, 6)}`, business_category_id: businessCategory.id, sen_business_category: businessCategory.name }).select("id").single();
        if (result.error || !result.data) throw new Error("category could not be created"); category = result.data;
      }
      const productForm = new FormData();
      const fields: Record<string, string> = {
        name: record.name, model_number: record.model, sku: record.sku || automaticSku(record.brand, record.model), brand_id: brand.id, category_id: category.id,
        product_type: ["simple", "variable"].includes(record.product_type) ? record.product_type : "simple",
        status: ["draft", "active"].includes(record.status) ? record.status : "draft",
        business_category_id: businessCategory.id,
        currency: "BDT", stock_status: ["in_stock", "out_of_stock", "on_backorder"].includes(record.stock_status) ? record.stock_status : "out_of_stock",
        purchase_cost: record.purchase_cost ?? "", regular_price: record.regular_price ?? "", sale_price: record.sale_price ?? "",
        short_description: record.short_description ?? "", description: record.description ?? "", specifications: record.specifications || "{}",
        low_stock_threshold: record.low_stock_threshold || "0",
      };
      Object.entries(fields).forEach(([key, value]) => productForm.set(key, value));
      if (record.public_catalogue_visible?.toLowerCase() === "true") productForm.set("public_catalogue_visible", "on");
      if (record.manage_stock?.toLowerCase() !== "false") productForm.set("manage_stock", "on");
      const image = images.get((record.image_file ?? "").toLowerCase()); if (image) productForm.set("main_image", image);
      const productId = await saveProduct(profile.id, null, productForm, profile.role === "admin" || permissions.has("products.manage_identifiers"));
      const imageFailures = await uploadFormImages(productId, profile.id, productForm); if (imageFailures.length) failures.push(`row ${index + 2}: product saved, image failed`);
      imported++;
    } catch (error) { failures.push(`row ${index + 2}: ${error instanceof Error ? error.message : "import failed"}`); }
  }
  revalidatePath("/admin/products"); revalidatePath("/products");
  const summary = `${imported} product(s) imported.${failures.length ? ` ${failures.length} row(s) need attention: ${failures.slice(0, 3).join("; ")}` : ""}`;
  redirect(`/admin/products/import?${failures.length ? "error" : "success"}=${encodeURIComponent(summary)}`);
}

export async function createVariationAction(productId: string, form: FormData) {
  const { profile } = await requirePermission("products.edit"); const db = createSupabaseAdminClient();
  const { data: parent, error: parentError } = await db.from("products").select("product_type,manage_stock").eq("id", productId).maybeSingle();
  if (parentError || !parent || parent.product_type !== "variable") redirect(target(productId, "error", "Variations require a variable parent product."));
  const manageStock = checked(form, "manage_stock"); if (parent.manage_stock && manageStock) redirect(target(productId, "error", "Stock cannot be managed by both the variable parent and its variations."));
  const data = (() => {
    try { return { product_id: productId, sku: requiredText(form, "sku", 100), combination_key: requiredText(form, "combination_key", 500), regular_price: optionalMoney(form, "regular_price", "Variation regular price"), purchase_cost: optionalMoney(form, "purchase_cost", "Variation purchase cost"), manage_stock: manageStock, low_stock_threshold: optionalWholeNumber(form, "low_stock_threshold", "Variation low-stock threshold") ?? 0 }; }
    catch (error) { redirect(target(productId, "error", error instanceof Error ? error.message : "Invalid variation details.")); }
  })();
  const { data: created, error } = await db.from("product_variations").insert(data).select("id").single();
  if (error || !created) redirect(target(productId, "error", safeProductError(error?.message ?? "Unable to create variation.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "product.variation_created", module: "products", entityType: "product_variation", entityId: created.id, description: "Product variation created.", newValues: { product_id: productId, sku: data.sku, combination_key: data.combination_key } });
  revalidatePath(`/admin/products/${productId}`); redirect(target(productId, "success", "Variation created."));
}

type ProductImagePurpose = "main_product_image" | "gallery_image";
type ProductImageUploadRequest = ProductImageMetadata & {
  purpose: ProductImagePurpose;
  altText?: string;
};
type PreparedProductImageUpload = ProductImageUploadRequest & {
  path: string;
};

function validateImagePurpose(purpose: string): asserts purpose is ProductImagePurpose {
  if (!["main_product_image", "gallery_image"].includes(purpose)) {
    throw new Error("Choose main image or gallery image.");
  }
}

function validatePreparedImagePath(productId: string, path: string, mimeType: string) {
  const expectedPath = buildProductImagePath(
    productId,
    mimeType,
    path.split("/").at(-1)?.split(".")[0] ?? "",
  );
  if (path !== expectedPath) throw new Error("Invalid product image upload path.");
}

export async function prepareProductImageUploadAction(
  productId: string,
  request: ProductImageUploadRequest,
) {
  await requirePermission("products.manage_media");
  validateProductImageMetadata(request);
  validateImagePurpose(request.purpose);
  const db = createSupabaseAdminClient();
  const { data: product, error: productError } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (productError || !product) throw new Error("Product not found.");

  const path = buildProductImagePath(productId, request.type);
  const { data, error } = await db.storage
    .from("product-media")
    .createSignedUploadUrl(path);
  if (error || !data?.token) throw new Error("Unable to prepare this image upload.");
  return { path, token: data.token };
}

export async function cleanupPreparedProductImageUploadAction(productId: string, path: string) {
  await requirePermission("products.manage_media");
  if (!path.startsWith(`${productId}/`)) return;
  await createSupabaseAdminClient().storage.from("product-media").remove([path]);
}

export async function finalizeProductImageUploadAction(
  productId: string,
  upload: PreparedProductImageUpload,
) {
  const { profile } = await requirePermission("products.manage_media");
  validateProductImageMetadata(upload);
  validateImagePurpose(upload.purpose);
  validatePreparedImagePath(productId, upload.path, upload.type);

  const db = createSupabaseAdminClient();
  const [{ data: product, error: productError }, { data: stored, error: storedError }] = await Promise.all([
    db.from("products").select("id,slug").eq("id", productId).maybeSingle(),
    db.storage.from("product-media").info(upload.path),
  ]);
  if (productError || !product) {
    await db.storage.from("product-media").remove([upload.path]);
    throw new Error("Product not found.");
  }
  const storedMetadata = stored?.metadata as Record<string, unknown> | undefined;
  const storedSize = Number(stored?.size ?? storedMetadata?.size);
  const storedType = String(stored?.contentType ?? storedMetadata?.mimetype ?? "");
  if (storedError || !stored || storedSize !== upload.size || storedType !== upload.type) {
    await db.storage.from("product-media").remove([upload.path]);
    throw new Error("The uploaded image could not be verified.");
  }

  const { data: lastMedia } = await db
    .from("product_media")
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: created, error: insertError } = await db.from("product_media").insert({
    product_id: productId,
    storage_path: upload.path,
    original_file_name: sanitizeMediaFileName(upload.name),
    media_type: "image",
    media_purpose: upload.purpose === "main_product_image" ? "gallery_image" : upload.purpose,
    visibility: "public",
    mime_type: upload.type,
    file_size: upload.size,
    alt_text: String(upload.altText || upload.name).trim().slice(0, 200),
    is_primary: false,
    sort_order: Number(lastMedia?.sort_order ?? -1) + 1,
    uploaded_by: profile.id,
  }).select("id").single();
  if (insertError || !created) {
    await db.storage.from("product-media").remove([upload.path]);
    throw new Error("Unable to save this image.");
  }

  if (upload.purpose === "main_product_image") {
    const { data: previousMain } = await db
      .from("product_media")
      .select("id")
      .eq("product_id", productId)
      .eq("media_type", "image")
      .eq("is_primary", true)
      .maybeSingle();
    const { error: demoteError } = await db
      .from("product_media")
      .update({ is_primary: false, media_purpose: "gallery_image" })
      .eq("product_id", productId)
      .eq("media_type", "image")
      .eq("is_primary", true);
    const { error: promoteError } = demoteError
      ? { error: demoteError }
      : await db
        .from("product_media")
        .update({ is_primary: true, media_purpose: "main_product_image" })
        .eq("id", created.id);
    if (promoteError) {
      if (previousMain?.id) {
        await db.from("product_media").update({
          is_primary: true,
          media_purpose: "main_product_image",
        }).eq("id", previousMain.id);
      }
      await db.from("product_media").delete().eq("id", created.id);
      await db.storage.from("product-media").remove([upload.path]);
      throw new Error("Unable to set the main product image.");
    }
  }

  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "product.media_added",
    module: "products",
    entityType: "product",
    entityId: productId,
    description: "Product image added through a signed direct upload.",
    newValues: {
      media_purpose: upload.purpose,
      storage_path: upload.path,
      file_size: upload.size,
    },
  });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath(`/products/${product.slug}`);
  return { mediaId: created.id };
}
