import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SupplierCategory = {
  id: string;
  name: string;
  category_type: "normal";
  parent_id: string | null;
  category_level: number;
  code_segment: string;
  description: string | null;
  image_url: string | null;
  icon: string | null;
  is_active: boolean;
  display_order: number;
};

export type SupplierCategoryOption = SupplierCategory & {
  pathIds: string[];
  pathNames: string[];
  pathLabel: string;
};

export function buildSupplierCategoryOptions(categories: SupplierCategory[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const resolvePath = (category: SupplierCategory) => {
    const path: SupplierCategory[] = [];
    const visited = new Set<string>();
    let current: SupplierCategory | undefined = category;
    while (current) {
      if (visited.has(current.id)) throw new Error("Supplier category cycle detected.");
      visited.add(current.id);
      path.unshift(current);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return path;
  };
  return categories.map((category) => {
    const path = resolvePath(category);
    return {
      ...category,
      pathIds: path.map((item) => item.id),
      pathNames: path.map((item) => item.name),
      pathLabel: path.map((item) => item.name).join(" → "),
    };
  }).sort((a, b) => a.pathLabel.localeCompare(b.pathLabel));
}

export async function getSupplierCategoryOptions(includeInactive = false) {
  const db = createSupabaseAdminClient();
  let query = db.from("supplier_categories").select("*").order("display_order").order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) {
    console.error("Supplier category query failed", { code: error.code, message: error.message });
    throw new Error("Unable to load supplier categories.");
  }
  return buildSupplierCategoryOptions((data ?? []) as SupplierCategory[]);
}

export async function getSupplierCategory(id: string) {
  const categories = await getSupplierCategoryOptions(true);
  const category = categories.find((item) => item.id === id);
  if (!category) return null;
  const descendantIds = categories
    .filter((item) => item.pathIds.includes(id) && item.id !== id)
    .map((item) => item.id);
  return { category, categories, descendantIds };
}

export async function getSuppliersForCategory(categoryId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("suppliers")
    .select("id,code,name,supplier_type,contact_person,email,phone,country_name,status,brands(id,name)")
    .eq("supplier_category_id", categoryId)
    .order("name");
  if (error) {
    console.error("Supplier category member query failed", { code: error.code, message: error.message });
    throw new Error("Unable to load suppliers for this category.");
  }
  return (data ?? []).map(({ brands, ...supplier }) => ({
    ...supplier,
    brand: Array.isArray(brands) ? (brands[0] ?? null) : brands,
  }));
}

export async function getSupplierFormOptions() {
  const db = createSupabaseAdminClient();
  const [categories, brandsResult] = await Promise.all([
    getSupplierCategoryOptions(),
    db.from("brands").select("id,name").eq("is_active", true).order("name"),
  ]);
  if (brandsResult.error) {
    console.error("Supplier brand query failed", { code: brandsResult.error.code, message: brandsResult.error.message });
    throw new Error("Unable to load supplier brands.");
  }
  return { categories, brands: brandsResult.data ?? [] };
}
