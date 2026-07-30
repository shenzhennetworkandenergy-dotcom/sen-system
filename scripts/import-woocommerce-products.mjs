import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const projectRoot = process.cwd();
const { loadEnvConfig } = nextEnv;
const defaultCsv = "C:/Users/szwaq/Downloads/wc-product-export-24-7-2026-1784860539428.csv";
const importRoot = path.join(projectRoot, "data", "woocommerce-import-2026-07-24");
const manifestPath = path.join(importRoot, "manifest.json");
const reportPath = path.join(importRoot, "report.json");
const reviewPath = path.join(importRoot, "review-decisions.json");
const mode = process.argv.includes("--stage") ? "stage" : process.argv.includes("--import") ? "import" : process.argv.includes("--verify") ? "verify" : "";
const environmentFile = process.argv.find((value) => value.startsWith("--environment-file="))?.slice(19) || null;
const csvPath = process.argv.find((value) => value.startsWith("--csv="))?.slice(6) || defaultCsv;
const mediaRoots = process.argv
  .filter((value) => value.startsWith("--media-root="))
  .map((value) => path.resolve(value.slice(13)));

if (!mode) {
  console.error("Use --stage, --import, or --verify. Stage options: --csv=/path/export.csv --media-root=/path/wp-content/uploads.");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map((value) => value.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

function decodeHtml(value = "") {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value
    .replace(/&(#x?[0-9a-f]+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
      if (entity[0] === "#") {
        const hex = entity[1]?.toLowerCase() === "x";
        return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
      }
      return named[entity.toLowerCase()] ?? _;
    })
    .replace(/\\n/g, "\n");
}

function textValue(value = "") {
  return decodeHtml(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalized(value = "") {
  return textValue(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value = "") {
  return normalized(value).replace(/\s+/g, "-").slice(0, 100) || "product";
}

function optionalNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function truthy(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function splitList(value = "") {
  return unique(value.split(",").map((item) => textValue(item)).filter(Boolean));
}

function imageUrls(value = "") {
  return unique(value.split(/,\s*(?=https?:\/\/)/i).map((item) => item.trim()).filter(Boolean));
}

function inferBrand(row) {
  const supplied = splitList(row.Brands)[0];
  if (supplied) return supplied;
  const name = textValue(row.Name);
  const known = ["Dell", "Intel", "Cisco", "Huawei", "Supermicro", "Mellanox", "Samsung", "ZTE", "MikroTik", "Inspur", "Finisar", "Photop", "Raisecom", "MACHINIST"];
  return known.find((brand) => name.toLowerCase().startsWith(brand.toLowerCase())) ?? null;
}

function businessCategory(row) {
  const description = normalized([
    row.Name,
    row.Categories,
    row.Tags,
    row["Short description"],
    row.Description,
  ].join(" "));
  const networkingTerms = [
    "network", "server", "switch", "router", "olt", "onu", "gpon", "epon",
    "fiber", "optic", "transceiver", "sfp", "qsfp", "ethernet", "firewall",
    "rack", "processor", "xeon", "cpu", "motherboard", "ram", "memory", "ddr",
    "storage", "hdd", "hard drive", "ssd", "nvme", "sas", "sata", "raid",
    "backplane", "idrac", "network card", "nic", "power supply", "psu",
    "heatsink", "cooling", "chassis", "caddy", "controller",
  ];
  if (networkingTerms.some((term) => description.includes(term))) return "Networking";
  return "Others";
}

function approvedImagesFor(staged, manifest, review) {
  const override = review.imageOverrides?.[staged.sourceId];
  if (override) {
    const source = manifest.rows.find((row) => row.sourceId === override.sourceId);
    const image = source?.images[override.imageIndex ?? 0];
    if (!image) throw new Error(`Approved image override for ${staged.sourceId} is missing source ${override.sourceId}.`);
    const minimum = override.minimumPixels ?? 1000;
    if (Math.min(image.width, image.height) < minimum) {
      throw new Error(`Approved image override for ${staged.sourceId} is below ${minimum}px.`);
    }
    return [image];
  }
  return staged.images.filter((image) => Math.min(image.width, image.height) >= 1000);
}

function attributesFor(row) {
  const result = [];
  for (let index = 1; index <= 3; index++) {
    const rawName = textValue(row[`Attribute ${index} name`]);
    const name =
      normalized(rawName) === "frequency mhz"
        ? "Frequency"
        : normalized(rawName) === "storage size form factors"
          ? "Form Factor"
          : rawName;
    const values = splitList(row[`Attribute ${index} value(s)`]).map((value) => value.replace(/^"|"$/g, ""));
    if (name && values.length) result.push({ name, values, visible: truthy(row[`Attribute ${index} visible`]), global: truthy(row[`Attribute ${index} global`]) });
  }
  return result;
}

function extensionFor(contentType, url) {
  const type = contentType.toLowerCase().split(";")[0];
  if (type === "image/jpeg") return { ext: "jpg", mime: "image/jpeg" };
  if (type === "image/png") return { ext: "png", mime: "image/png" };
  if (type === "image/webp") return { ext: "webp", mime: "image/webp" };
  const urlExt = path.extname(new URL(url).pathname).toLowerCase();
  if (urlExt === ".jpg" || urlExt === ".jpeg") return { ext: "jpg", mime: "image/jpeg" };
  if (urlExt === ".png") return { ext: "png", mime: "image/png" };
  if (urlExt === ".webp") return { ext: "webp", mime: "image/webp" };
  throw new Error(`Unsupported image type: ${contentType || "unknown"}`);
}

async function stage() {
  const csv = await fs.readFile(csvPath, "utf8");
  const sourceRows = parseCsv(csv);
  const validRows = sourceRows.filter((row) => row.ID && row.Name && ["simple", "variable", "variation"].includes(row.Type));
  const invalidRows = sourceRows.filter((row) => !validRows.includes(row));
  const childIds = new Set(validRows.filter((row) => row.Type === "variation").map((row) => row.Parent.replace(/^id:/, "")));
  const products = validRows.filter((row) => row.Type !== "variation");
  const variations = validRows.filter((row) => row.Type === "variation");
  const failures = [];
  const firstImageUrl = validRows.flatMap((row) => imageUrls(row.Images))[0];
  let mediaHostReachable = true;

  if (firstImageUrl && !mediaRoots.length) {
    try {
      const response = await fetch(firstImageUrl, {
        headers: { "user-agent": "SEN-Catalogue-Migration/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      await response.body?.cancel();
    } catch (error) {
      mediaHostReachable = false;
      failures.push({
        sourceId: null,
        name: null,
        url: firstImageUrl,
        error: `Media host preflight failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  await fs.mkdir(importRoot, { recursive: true });
  const stagedRows = [];
  for (const [rowIndex, row] of validRows.entries()) {
    const urls = imageUrls(row.Images);
    const productDir = path.join(importRoot, "products", row.ID);
    await fs.mkdir(productDir, { recursive: true });
    const images = [];
    for (const [imageIndex, url] of urls.entries()) {
      if (!mediaHostReachable) continue;
      try {
        let bytes;
        let contentType = "";
        if (mediaRoots.length) {
          const marker = "/wp-content/uploads/";
          const pathname = decodeURIComponent(new URL(url).pathname);
          const relative = pathname.includes(marker) ? pathname.split(marker)[1] : "";
          if (!relative) throw new Error("URL is not inside wp-content/uploads");
          let sourcePath = null;
          for (const root of mediaRoots) {
            const candidate = path.resolve(root, ...relative.split("/"));
            if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe media path");
            try {
              await fs.access(candidate);
              sourcePath = candidate;
              break;
            } catch {
              // Try the next explicitly supplied media archive.
            }
          }
          if (!sourcePath) throw new Error(`Image is absent from the supplied archives: ${relative}`);
          bytes = await fs.readFile(sourcePath);
          contentType = extensionFor("", url).mime;
        } else {
          const response = await fetch(url, {
            headers: { "user-agent": "SEN-Catalogue-Migration/1.0" },
            redirect: "follow",
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          bytes = Buffer.from(await response.arrayBuffer());
          contentType = response.headers.get("content-type") ?? "";
        }
        if (bytes.length > 10_485_760) throw new Error("larger than 10 MB");
        const metadata = await sharp(bytes).metadata();
        if (!metadata.width || !metadata.height || !metadata.format) throw new Error("invalid image");
        const detected = extensionFor(contentType, url);
        const fileName = `${String(imageIndex + 1).padStart(2, "0")}-${slugify(path.basename(new URL(url).pathname, path.extname(new URL(url).pathname)))}.${detected.ext}`;
        const absolutePath = path.join(productDir, fileName);
        await fs.writeFile(absolutePath, bytes);
        images.push({
          sourceUrl: url,
          file: path.relative(projectRoot, absolutePath).replaceAll("\\", "/"),
          mimeType: detected.mime,
          size: bytes.length,
          width: metadata.width,
          height: metadata.height,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        });
      } catch (error) {
        failures.push({ sourceId: row.ID, name: textValue(row.Name), url, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const staged = {
      sourceId: row.ID,
      sourceType: row.Type,
      parentSourceId: row.Parent.replace(/^id:/, "") || null,
      sku: row.SKU || `SEN-WC-${row.ID}`,
      name: textValue(row.Name),
      raw: row,
      attributes: attributesFor(row),
      imageSources: urls,
      images,
    };
    stagedRows.push(staged);
    await fs.writeFile(path.join(productDir, "content.json"), `${JSON.stringify(staged, null, 2)}\n`, "utf8");
    console.log(`[stage ${rowIndex + 1}/${validRows.length}] ${row.ID} ${textValue(row.Name)} (${images.length} image${images.length === 1 ? "" : "s"})`);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    sourceCsv: csvPath.replaceAll("\\", "/"),
    mediaRoots: mediaRoots.map((root) => root.replaceAll("\\", "/")),
    sourceRowCount: sourceRows.length,
    productCount: products.length,
    variationCount: variations.length,
    skippedRows: invalidRows.map((row) => ({ id: row.ID || null, reason: "Missing product name or unsupported row type" })),
    corrections: [
      ...products.filter((row) => childIds.has(row.ID) && row.Type !== "variable").map((row) => ({ id: row.ID, correction: "Imported as variable because the CSV contains a child variation." })),
    ],
    mediaHostReachable,
    failures,
    rows: stagedRows,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Staged ${products.length} products, ${variations.length} variations, and ${stagedRows.reduce((sum, row) => sum + row.images.length, 0)} validated images.`);
  if (failures.length) {
    console.error(`${failures.length} image download(s) failed. Import is blocked until the source images are fixed.`);
    process.exitCode = 1;
  }
}

async function database() {
  loadEnvConfig(projectRoot);
  if (environmentFile) {
    const environmentText = await fs.readFile(path.resolve(environmentFile), "utf8");
    for (const line of environmentText.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase administrator credentials are missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function one(db, query, message) {
  const result = await query;
  if (result.error) throw new Error(`${message}: ${result.error.message}`);
  return result.data;
}

async function ensureBrand(db, name, caches) {
  if (!name) return null;
  const key = normalized(name);
  if (caches.brands.has(key)) return caches.brands.get(key);
  let brand = await one(db, db.from("brands").select("id,name").ilike("name", name).maybeSingle(), `Unable to read brand ${name}`);
  if (!brand) brand = await one(db, db.from("brands").insert({ name, slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}` }).select("id,name").single(), `Unable to create brand ${name}`);
  caches.brands.set(key, brand.id);
  return brand.id;
}

async function ensureBusinessCategory(db, requestedName, caches) {
  const key = normalized(requestedName || "Others");
  if (caches.businessCategories.has(key)) return caches.businessCategories.get(key);
  let category = await one(
    db,
    db.from("business_categories").select("id,name").eq("is_active", true).is("archived_at", null).ilike("name", requestedName || "Others").maybeSingle(),
    `Unable to read business category ${requestedName || "Others"}`,
  );
  if (!category) {
    category = await one(
      db,
      db.from("business_categories").select("id,name").eq("slug", "others").eq("is_active", true).is("archived_at", null).maybeSingle(),
      "Unable to read the fallback business category",
    );
  }
  if (!category) throw new Error("No active fallback business category is available.");
  caches.businessCategories.set(key, category);
  return category;
}

async function ensureCategoryPath(db, categoryPath, businessCategory, caches) {
  let parentId = null;
  let leaf = null;
  const rawParts = categoryPath.split(">").map((value) => textValue(value)).filter(Boolean);
  const parts = rawParts.length > 1 ? [rawParts[0], rawParts.at(-1)] : rawParts;
  for (const part of unique(parts)) {
    const cacheKey = `${businessCategory.id}:${parentId ?? "root"}:${normalized(part)}`;
    if (caches.categories.has(cacheKey)) {
      leaf = caches.categories.get(cacheKey);
      parentId = leaf;
      continue;
    }
    let category = await one(
      db,
      parentId
        ? db.from("product_categories").select("id,business_category_id").eq("business_category_id", businessCategory.id).eq("parent_id", parentId).ilike("name", part).maybeSingle()
        : db.from("product_categories").select("id,business_category_id").eq("business_category_id", businessCategory.id).is("parent_id", null).ilike("name", part).maybeSingle(),
      `Unable to read category ${part}`,
    );
    if (!category) {
      category = await one(db, db.from("product_categories").insert({
        name: part,
        slug: `${slugify(part)}-${crypto.randomUUID().slice(0, 6)}`,
        parent_id: parentId,
        business_category_id: businessCategory.id,
        sen_business_category: businessCategory.name,
      }).select("id").single(), `Unable to create category ${part}`);
    }
    leaf = category.id;
    parentId = category.id;
    caches.categories.set(cacheKey, category.id);
  }
  return leaf;
}

async function ensureAttribute(db, attribute, caches) {
  const key = normalized(attribute.name);
  let attributeId = caches.attributes.get(key);
  if (!attributeId) {
    let record = await one(db, db.from("attributes").select("id").eq("scope", "universal").ilike("name", attribute.name).maybeSingle(), `Unable to read attribute ${attribute.name}`);
    if (!record) record = await one(db, db.from("attributes").insert({ name: attribute.name, slug: `${slugify(attribute.name)}-${crypto.randomUUID().slice(0, 6)}`, scope: "universal" }).select("id").single(), `Unable to create attribute ${attribute.name}`);
    attributeId = record.id;
    caches.attributes.set(key, attributeId);
  }
  const values = new Map();
  for (const value of attribute.values) {
    const valueKey = `${attributeId}:${normalized(value)}`;
    let valueId = caches.attributeValues.get(valueKey);
    if (!valueId) {
      let record = await one(db, db.from("attribute_values").select("id").eq("attribute_id", attributeId).ilike("value", value).maybeSingle(), `Unable to read attribute value ${value}`);
      if (!record) record = await one(db, db.from("attribute_values").insert({ attribute_id: attributeId, value, slug: `${slugify(value)}-${crypto.randomUUID().slice(0, 6)}` }).select("id").single(), `Unable to create attribute value ${value}`);
      valueId = record.id;
      caches.attributeValues.set(valueKey, valueId);
    }
    values.set(normalized(value), valueId);
  }
  return { attributeId, values };
}

function productPayload(staged, existing, hasChildren, brandId, businessCategory, internalNote) {
  const row = staged.raw;
  const regularPrice = optionalNumber(row["Regular price"]);
  const salePrice = optionalNumber(row["Sale price"]);
  return {
    name: staged.name,
    slug: existing?.slug ?? `${slugify(staged.name)}-wc-${staged.sourceId}`,
    sku: existing?.sku ?? staged.sku,
    model_number: existing?.model_number || row.SKU || `WC-${staged.sourceId}`,
    product_type: hasChildren || staged.sourceType === "variable" ? "variable" : "simple",
    status: "draft",
    featured: truthy(row["Is featured?"]),
    business_category_id: businessCategory.id,
    sen_business_category: businessCategory.name,
    brand_id: brandId,
    short_description: decodeHtml(row["Short description"]),
    description: decodeHtml(row.Description),
    specifications: Object.fromEntries(staged.attributes.map((attribute) => [attribute.name, attribute.values])),
    internal_notes: internalNote,
    regular_price: regularPrice,
    sale_price: salePrice !== null && (regularPrice === null || salePrice <= regularPrice) ? salePrice : null,
    currency: "BDT",
    tax_status: row["Tax status"] || "taxable",
    tax_class: row["Tax class"] || null,
    weight: optionalNumber(row["Weight (kg)"]),
    length: optionalNumber(row["Length (cm)"]),
    width: optionalNumber(row["Width (cm)"]),
    height: optionalNumber(row["Height (cm)"]),
    shipping_class: row["Shipping class"] || null,
    manage_stock: hasChildren || staged.sourceType === "variable" ? false : true,
    stock_status: truthy(row["In stock?"]) ? "in_stock" : truthy(row["Backorders allowed?"]) ? "on_backorder" : "out_of_stock",
    low_stock_threshold: optionalNumber(row["Low stock amount"]) ?? 0,
    allow_backorders: truthy(row["Backorders allowed?"]),
    sold_individually: truthy(row["Sold individually?"]),
    public_catalogue_visible: false,
  };
}

async function attachCategories(db, productId, staged, businessCategory, caches) {
  const paths = splitList(staged.raw.Categories).sort((left, right) => right.split(">").length - left.split(">").length);
  if (!paths.length) return;
  const categoryId = await ensureCategoryPath(db, paths[0], businessCategory, caches);
  if (!categoryId) return;
  await one(db, db.from("product_category_assignments").delete().eq("product_id", productId), "Unable to replace product categories");
  await one(db, db.from("product_category_assignments").insert({ product_id: productId, category_id: categoryId, is_primary: true }), "Unable to assign a product category");
}

function mergedAttributes(parent, children) {
  const valuesByName = new Map();
  for (const attribute of [parent, ...children].flatMap((row) => row.attributes)) {
    const key = normalized(attribute.name);
    const current = valuesByName.get(key) ?? { ...attribute, values: [] };
    current.values = unique([...current.values, ...attribute.values]);
    current.visible ||= attribute.visible;
    valuesByName.set(key, current);
  }
  return [...valuesByName.values()];
}

async function attachTags(db, productId, staged, caches) {
  for (const tagName of splitList(staged.raw.Tags)) {
    const key = normalized(tagName);
    let tagId = caches.tags.get(key);
    if (!tagId) {
      let tag = await one(db, db.from("product_tags").select("id").ilike("name", tagName).maybeSingle(), `Unable to read tag ${tagName}`);
      if (!tag) tag = await one(db, db.from("product_tags").insert({ name: tagName, slug: `${slugify(tagName)}-${crypto.randomUUID().slice(0, 6)}` }).select("id").single(), `Unable to create tag ${tagName}`);
      tagId = tag.id;
      caches.tags.set(key, tagId);
    }
    await one(db, db.from("product_tag_assignments").upsert({ product_id: productId, tag_id: tagId }, { onConflict: "product_id,tag_id" }), "Unable to assign a product tag");
  }
}

async function attachAttributes(db, productId, staged, caches, variationAttributeNames) {
  const result = new Map();
  for (const [index, attribute] of staged.attributes.entries()) {
    const ensured = await ensureAttribute(db, attribute, caches);
    await one(db, db.from("product_attributes").upsert({
      product_id: productId,
      attribute_id: ensured.attributeId,
      is_variation: variationAttributeNames.has(normalized(attribute.name)),
      is_visible: attribute.visible,
      sort_order: index,
    }, { onConflict: "product_id,attribute_id" }), "Unable to assign a product attribute");
    result.set(normalized(attribute.name), ensured);
  }
  return result;
}

async function uploadImages(db, productId, variationId, staged, manifest, review) {
  const approvedImages = approvedImagesFor(staged, manifest, review);
  if (!variationId && approvedImages.length) {
    await one(
      db,
      db.from("product_media")
        .update({ is_primary: false, media_purpose: "gallery_image", updated_at: new Date().toISOString() })
        .eq("product_id", productId)
        .eq("is_primary", true),
      `Unable to replace the existing primary image for ${staged.sourceId}`,
    );
  }
  for (const [index, image] of approvedImages.entries()) {
    const ext = path.extname(image.file).slice(1).toLowerCase();
    const storagePath = `${productId}/woocommerce-${staged.sourceId}-${String(index + 1).padStart(2, "0")}.${ext}`;
    const bytes = await fs.readFile(path.join(projectRoot, image.file));
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (digest !== image.sha256) throw new Error(`Staged image changed: ${image.file}`);
    const upload = await db.storage.from("product-media").upload(storagePath, bytes, { contentType: image.mimeType, upsert: true });
    if (upload.error) throw new Error(`Unable to upload ${image.file}: ${upload.error.message}`);
    const media = {
      product_id: productId,
      variation_id: variationId,
      storage_path: storagePath,
      original_file_name: path.basename(image.file),
      media_type: "image",
      media_purpose: variationId || index > 0 ? "gallery_image" : "main_product_image",
      visibility: "public",
      mime_type: image.mimeType,
      file_size: image.size,
      alt_text: staged.name.slice(0, 200),
      sort_order: index,
      is_primary: !variationId && index === 0,
      updated_at: new Date().toISOString(),
    };
    await one(db, db.from("product_media").upsert(media, { onConflict: "storage_path" }), `Unable to record ${image.file}`);
  }
}

async function importProducts() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const review = JSON.parse(await fs.readFile(reviewPath, "utf8"));
  const excludedSourceIds = new Set(review.excluded.map((item) => item.sourceId));
  if (manifest.failures.length) throw new Error("The staged manifest contains failed image downloads. Run --stage again after fixing them.");
  const db = await database();
  const existingProducts = await one(db, db.from("products").select("id,name,slug,sku,model_number,internal_notes"), "Unable to read existing products");
  const existingBySourceId = new Map();
  const existingBySku = new Map(existingProducts.map((product) => [product.sku.toLowerCase(), product]));
  const existingByName = new Map(existingProducts.map((product) => [normalized(product.name), product]));
  for (const product of existingProducts) {
    const match = product.internal_notes?.match(/WooCommerce source ID:\s*(\d+)/i);
    if (match) existingBySourceId.set(match[1], product);
  }
  const caches = { brands: new Map(), businessCategories: new Map(), categories: new Map(), attributes: new Map(), attributeValues: new Map(), tags: new Map() };
  const parentRows = manifest.rows.filter((row) => row.sourceType !== "variation" && !excludedSourceIds.has(row.sourceId));
  const variationRows = manifest.rows.filter((row) => row.sourceType === "variation" && !excludedSourceIds.has(row.sourceId));
  const imageMissing = [...parentRows, ...variationRows].filter(
    (row) => approvedImagesFor(row, manifest, review).length === 0,
  );
  if (imageMissing.length) {
    throw new Error(
      `Import blocked because approved rows lack high-quality images: ${imageMissing.map((row) => row.sourceId).join(", ")}`,
    );
  }
  const childrenByParent = new Map();
  for (const row of variationRows) {
    if (!childrenByParent.has(row.parentSourceId)) childrenByParent.set(row.parentSourceId, []);
    childrenByParent.get(row.parentSourceId).push(row);
  }
  const imported = [];
  const parentMap = new Map();

  for (const [index, staged] of parentRows.entries()) {
    const hasChildren = childrenByParent.has(staged.sourceId);
    const existing = existingBySourceId.get(staged.sourceId) ?? existingBySku.get(staged.sku.toLowerCase()) ?? existingByName.get(normalized(staged.name)) ?? null;
    const brandId = await ensureBrand(db, inferBrand(staged.raw), caches);
    const resolvedBusinessCategory = await ensureBusinessCategory(db, businessCategory(staged.raw), caches);
    const sourceNote = `WooCommerce source ID: ${staged.sourceId}\nImported from sen.com.bd on ${new Date().toISOString().slice(0, 10)}.`;
    const internalNote = existing?.internal_notes?.includes(`WooCommerce source ID: ${staged.sourceId}`) ? existing.internal_notes : [existing?.internal_notes, sourceNote].filter(Boolean).join("\n\n");
    const payload = productPayload(staged, existing, hasChildren, brandId, resolvedBusinessCategory, internalNote);
    let product;
    if (existing) product = await one(db, db.from("products").update(payload).eq("id", existing.id).select("id,sku,slug").single(), `Unable to update ${staged.name}`);
    else product = await one(db, db.from("products").insert(payload).select("id,sku,slug").single(), `Unable to create ${staged.name}`);
    parentMap.set(staged.sourceId, product.id);
    await attachCategories(db, product.id, staged, resolvedBusinessCategory, caches);
    await attachTags(db, product.id, staged, caches);
    const variationAttributeNames = new Set(
      (childrenByParent.get(staged.sourceId) ?? [])
        .flatMap((child) => child.attributes)
        .map((attribute) => normalized(attribute.name)),
    );
    await attachAttributes(
      db,
      product.id,
      { ...staged, attributes: mergedAttributes(staged, childrenByParent.get(staged.sourceId) ?? []) },
      caches,
      variationAttributeNames,
    );
    await uploadImages(db, product.id, null, staged, manifest, review);
    imported.push({
      sourceId: staged.sourceId,
      productId: product.id,
      sku: product.sku,
      slug: product.slug,
      action: existing ? "updated" : "created",
      images: approvedImagesFor(staged, manifest, review).length,
    });
    console.log(`[import product ${index + 1}/${parentRows.length}] ${existing ? "updated" : "created"} ${staged.sourceId} ${staged.name}`);
  }

  const importedVariations = [];
  for (const [index, staged] of variationRows.entries()) {
    const productId = parentMap.get(staged.parentSourceId);
    if (!productId) throw new Error(`Variation ${staged.sourceId} has no imported parent ${staged.parentSourceId}.`);
    const attributeParts = staged.attributes.flatMap((attribute) => attribute.values.map((value) => `${attribute.name}=${value}`));
    const combinationKey = attributeParts.join(" | ") || `WooCommerce variation ${staged.sourceId}`;
    const row = staged.raw;
    const regularPrice = optionalNumber(row["Regular price"]);
    const salePrice = optionalNumber(row["Sale price"]);
    const variationPayload = {
      product_id: productId,
      sku: staged.sku,
      combination_key: combinationKey,
      regular_price: regularPrice,
      sale_price: salePrice !== null && (regularPrice === null || salePrice <= regularPrice) ? salePrice : null,
      manage_stock: true,
      stock_status: truthy(row["In stock?"]) ? "in_stock" : truthy(row["Backorders allowed?"]) ? "on_backorder" : "out_of_stock",
      low_stock_threshold: optionalNumber(row["Low stock amount"]) ?? 0,
      allow_backorders: truthy(row["Backorders allowed?"]),
      weight: optionalNumber(row["Weight (kg)"]),
      length: optionalNumber(row["Length (cm)"]),
      width: optionalNumber(row["Width (cm)"]),
      height: optionalNumber(row["Height (cm)"]),
      status: "active",
      updated_at: new Date().toISOString(),
    };
    const variation = await one(db, db.from("product_variations").upsert(variationPayload, { onConflict: "sku" }).select("id").single(), `Unable to import variation ${staged.sourceId}`);
    await one(db, db.from("variation_attribute_values").delete().eq("variation_id", variation.id), "Unable to refresh variation attributes");
    for (const attribute of staged.attributes) {
      const ensured = await ensureAttribute(db, attribute, caches);
      for (const value of attribute.values) {
        const attributeValueId = ensured.values.get(normalized(value));
        if (attributeValueId) await one(db, db.from("variation_attribute_values").upsert({ variation_id: variation.id, attribute_value_id: attributeValueId }, { onConflict: "variation_id,attribute_value_id" }), "Unable to assign variation value");
      }
    }
    await uploadImages(db, productId, variation.id, staged, manifest, review);
    importedVariations.push({
      sourceId: staged.sourceId,
      variationId: variation.id,
      parentSourceId: staged.parentSourceId,
      sku: staged.sku,
      images: approvedImagesFor(staged, manifest, review).length,
    });
    console.log(`[import variation ${index + 1}/${variationRows.length}] ${staged.sourceId} ${combinationKey}`);
  }

  for (const staged of parentRows) {
    const productId = parentMap.get(staged.sourceId);
    const published = truthy(staged.raw.Published);
    const visible = published && staged.raw["Visibility in catalog"] !== "hidden";
    await one(db, db.from("products").update({
      status: published ? "active" : "draft",
      public_catalogue_visible: visible,
      updated_at: new Date().toISOString(),
    }).eq("id", productId), `Unable to publish ${staged.name}`);
  }

  const report = {
    importedAt: new Date().toISOString(),
    products: imported,
    variations: importedVariations,
    stagedImageCount: manifest.rows.reduce((sum, row) => sum + row.images.length, 0),
    uploadedHighQualityImageCount: [...parentRows, ...variationRows].reduce(
      (sum, row) => sum + approvedImagesFor(row, manifest, review).length,
      0,
    ),
    skippedRows: review.excluded,
    corrections: manifest.corrections,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Imported ${imported.length} products and ${importedVariations.length} variations. Run --verify for the final audit.`);
}

async function verify() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const review = JSON.parse(await fs.readFile(reviewPath, "utf8"));
  const excludedSourceIds = new Set(review.excluded.map((item) => item.sourceId));
  const db = await database();
  const failures = [];
  let productCount = 0, variationCount = 0, imageCount = 0;
  for (const staged of manifest.rows.filter((row) => row.sourceType !== "variation" && !excludedSourceIds.has(row.sourceId))) {
    const result = await one(db, db.from("products").select("id,name,status,public_catalogue_visible,internal_notes").ilike("internal_notes", `%WooCommerce source ID: ${staged.sourceId}%`).maybeSingle(), `Unable to verify product ${staged.sourceId}`);
    if (!result) {
      failures.push(`Product ${staged.sourceId} is missing.`);
      continue;
    }
    productCount++;
    const published = truthy(staged.raw.Published);
    const visible = published && staged.raw["Visibility in catalog"] !== "hidden";
    if (result.status !== (published ? "active" : "draft") || result.public_catalogue_visible !== visible) {
      failures.push(`Product ${staged.sourceId} publication status does not match the CSV.`);
    }
    const categories = await one(
      db,
      db.from("product_category_assignments").select("category_id", { count: "exact" }).eq("product_id", result.id),
      `Unable to verify categories for ${staged.sourceId}`,
    );
    if (categories.length > 1) failures.push(`Product ${staged.sourceId} has more than one assigned category.`);
    const media = await one(db, db.from("product_media").select("id,storage_path,file_size,mime_type,is_primary").eq("product_id", result.id), `Unable to verify images for ${staged.sourceId}`);
    const expectedRows = manifest.rows.filter((row) => !excludedSourceIds.has(row.sourceId) && (row.sourceId === staged.sourceId || row.parentSourceId === staged.sourceId));
    const expectedImages = expectedRows.flatMap((row) =>
      approvedImagesFor(row, manifest, review)
        .map((image, index) => {
          const ext = path.extname(image.file).slice(1).toLowerCase();
          return {
            ...image,
            storagePath: `${result.id}/woocommerce-${row.sourceId}-${String(index + 1).padStart(2, "0")}.${ext}`,
          };
        }),
    );
    const importedMedia = media.filter((item) => item.storage_path.includes("/woocommerce-"));
    imageCount += importedMedia.length;
    if (importedMedia.length !== expectedImages.length) failures.push(`Product ${staged.sourceId} has ${importedMedia.length} uploaded images; expected ${expectedImages.length}.`);
    if (!importedMedia.some((item) => item.is_primary && item.storage_path.includes(`woocommerce-${staged.sourceId}-`))) {
      failures.push(`Product ${staged.sourceId} has no verified primary image.`);
    }
    for (const expected of expectedImages) {
      const recorded = importedMedia.find((item) => item.storage_path === expected.storagePath);
      if (!recorded || Number(recorded.file_size) !== expected.size || recorded.mime_type !== expected.mimeType) {
        failures.push(`Product ${staged.sourceId} has invalid media metadata for ${expected.storagePath}.`);
        continue;
      }
      const downloaded = await db.storage.from("product-media").download(expected.storagePath);
      if (downloaded.error || !downloaded.data) {
        failures.push(`Product ${staged.sourceId} image cannot be downloaded: ${expected.storagePath}.`);
        continue;
      }
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      const digest = crypto.createHash("sha256").update(bytes).digest("hex");
      if (digest !== expected.sha256) failures.push(`Product ${staged.sourceId} image checksum differs: ${expected.storagePath}.`);
    }
  }
  for (const staged of manifest.rows.filter((row) => row.sourceType === "variation" && !excludedSourceIds.has(row.sourceId))) {
    const result = await one(db, db.from("product_variations").select("id,product_id,manage_stock,status").eq("sku", staged.sku).maybeSingle(), `Unable to verify variation ${staged.sourceId}`);
    if (!result) failures.push(`Variation ${staged.sourceId} is missing.`);
    else {
      variationCount++;
      const parent = await one(
        db,
        db.from("products").select("product_type,manage_stock").eq("id", result.product_id).single(),
        `Unable to verify variation parent ${staged.parentSourceId}`,
      );
      if (parent.product_type !== "variable" || parent.manage_stock || !result.manage_stock || result.status !== "active") {
        failures.push(`Variation ${staged.sourceId} has invalid parent or stock-management settings.`);
      }
    }
  }
  const audit = { verifiedAt: new Date().toISOString(), productCount, variationCount, imageCount, skipped: review.excluded, failures };
  await fs.writeFile(path.join(importRoot, "verification.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(audit, null, 2));
  if (failures.length) process.exitCode = 1;
}

try {
  if (mode === "stage") await stage();
  else if (mode === "import") await importProducts();
  else await verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
