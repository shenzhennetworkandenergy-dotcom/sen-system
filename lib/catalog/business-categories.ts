import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toBusinessCategory } from "@/lib/catalog/themes";
import type {
  BusinessCategory,
  BusinessCategoryField,
  BusinessCategoryRow,
} from "@/types/category";

type CategoryQueryOptions = {
  includeInactive?: boolean;
  includeFields?: boolean;
  withProductCounts?: boolean;
};

const categoryColumns =
  "id,name,slug,description,tagline,theme_color,icon,image_path,is_active,sort_order,archived_at";

type SupabaseDiagnosticError = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function logSupabaseDiagnostic(
  operation: string,
  error: SupabaseDiagnosticError,
) {
  const rawCode = typeof error.code === "string" ? error.code : "";
  const code = /^[A-Za-z0-9_.-]{1,64}$/.test(rawCode)
    ? rawCode
    : "unavailable";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const category =
    code === "42501" || /permission|not authorized|row-level security/.test(message)
      ? "authorization"
      : /jwt|authentication|invalid api key/.test(message)
        ? "authentication"
        : /timeout|timed out|aborted/.test(message)
          ? "timeout"
          : /fetch failed|network|dns|enotfound|econn|tls|certificate/.test(message)
            ? "network"
            : code.startsWith("PGRST")
              ? "supabase-api"
              : /^[0-9A-Z]{5}$/.test(code)
                ? "query"
                : "unknown";
  const status =
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 100 &&
    error.status <= 599
      ? error.status
      : "unavailable";

  console.error(
    "[supabase-diagnostic]",
    JSON.stringify({
      operation,
      category,
      code,
      status,
      environment: {
        supabaseUrlPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        publishableKeyPresent: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        ),
        serverKeyPresent: Boolean(
          process.env.SUPABASE_SECRET_KEY ??
            process.env.SUPABASE_SERVICE_ROLE_KEY,
        ),
      },
    }),
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function hydrateCategories(
  rows: BusinessCategoryRow[],
  options: CategoryQueryOptions,
) {
  const db = createSupabaseAdminClient();
  const ids = rows.map((row) => row.id);
  const fieldsByCategory = new Map<string, BusinessCategoryField[]>();

  if (options.includeFields && ids.length) {
    const { data: fields, error } = await db
      .from("business_category_fields")
      .select(
        "id,business_category_id,field_key,label,field_type,placeholder,help_text,unit,options,is_required,is_filterable,use_for_variations,is_active,sort_order",
      )
      .in("business_category_id", ids)
      .eq("is_active", true)
      .order("sort_order")
      .order("label");
    if (error) throw new Error("Unable to load business-category fields.");
    for (const field of (fields ?? []) as BusinessCategoryField[]) {
      const current = fieldsByCategory.get(field.business_category_id ?? "") ?? [];
      current.push(field);
      fieldsByCategory.set(field.business_category_id ?? "", current);
    }
  }

  const productCounts = new Map<string, number>();
  if (options.withProductCounts) {
    await Promise.all(
      ids.map(async (id) => {
        const { count, error } = await db
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("business_category_id", id)
          .eq("status", "active")
          .eq("public_catalogue_visible", true);
        if (error) throw new Error("Unable to count category products.");
        productCounts.set(id, count ?? 0);
      }),
    );
  }

  const imagePaths = rows
    .map((row) => row.image_path)
    .filter((path): path is string => Boolean(path));
  const signedImages = imagePaths.length
    ? await db.storage.from("product-media").createSignedUrls(imagePaths, 3600)
    : { data: [], error: null };
  if (signedImages.error) {
    throw new Error("Unable to load business-category images.");
  }
  const imageUrlByPath = new Map(
    (signedImages.data ?? []).map((item) => [item.path, item.signedUrl]),
  );

  return rows.map((row) =>
    toBusinessCategory({
      ...row,
      image_url: row.image_path
        ? (imageUrlByPath.get(row.image_path) ?? null)
        : null,
      product_count: productCounts.get(row.id) ?? 0,
      business_category_fields: fieldsByCategory.get(row.id) ?? [],
    }),
  );
}

export async function getBusinessCategories(
  options: CategoryQueryOptions = {},
): Promise<BusinessCategory[]> {
  const db = createSupabaseAdminClient();
  let query = db
    .from("business_categories")
    .select(categoryColumns)
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) {
    logSupabaseDiagnostic("catalog.business_categories.select", error);
    throw new Error("Unable to load business categories.");
  }
  return hydrateCategories((data ?? []) as BusinessCategoryRow[], options);
}

export async function getBusinessCategory(
  identifier: string,
  options: CategoryQueryOptions = { includeFields: true },
) {
  const value = identifier.trim();
  if (!value) return null;
  const db = createSupabaseAdminClient();
  let query = db
    .from("business_categories")
    .select(categoryColumns)
    .is("archived_at", null);
  query = isUuid(value)
    ? query.eq("id", value)
    : query.eq("slug", value.toLowerCase());
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Unable to load this business category.");
  if (!data) return null;
  const [category] = await hydrateCategories(
    [data as BusinessCategoryRow],
    options,
  );
  return category ?? null;
}

export function resolveBusinessCategory(
  categories: BusinessCategory[],
  identifier: string | null | undefined,
) {
  const normalized = identifier?.trim().toLowerCase();
  if (!normalized) return null;
  return (
    categories.find(
      (category) =>
        category.id.toLowerCase() === normalized ||
        category.slug.toLowerCase() === normalized ||
        category.name.toLowerCase() === normalized,
    ) ?? null
  );
}

