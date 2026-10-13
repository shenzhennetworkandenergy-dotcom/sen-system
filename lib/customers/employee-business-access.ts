import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type EmployeeBusinessCategory = {
  id: string;
  name: string;
  slug: string;
};

function normalizeCategorySlugs(categorySlugs: string[]) {
  return [...new Set(categorySlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))];
}

export async function getEmployeeBusinessAccessOptions() {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("customer_business_categories")
    .select("id,name,slug")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error("Unable to load employee business access categories.");
  return data ?? [];
}

export async function getEmployeeBusinessAccess(employeeProfileId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("employee_business_category_access")
    .select("customer_business_categories(id,name,slug)")
    .eq("employee_profile_id", employeeProfileId);
  if (error) throw new Error("Unable to load employee business access.");
  return (data ?? [])
    .map((row) => row.customer_business_categories as unknown as EmployeeBusinessCategory | null)
    .filter((category): category is EmployeeBusinessCategory => Boolean(category));
}

export async function persistEmployeeBusinessAccess(employeeProfileId: string, categorySlugs: string[]) {
  const slugs = normalizeCategorySlugs(categorySlugs);
  const db = createSupabaseAdminClient();
  const { data: employee, error: employeeError } = await db
    .from("profiles")
    .select("id")
    .eq("id", employeeProfileId)
    .eq("role", "employee")
    .is("archived_at", null)
    .maybeSingle();
  if (employeeError || !employee) throw new Error("Choose a valid employee.");

  const { data: categories, error: categoryError } = slugs.length
    ? await db
      .from("customer_business_categories")
      .select("id,slug")
      .in("slug", slugs)
      .eq("is_active", true)
    : { data: [], error: null };
  if (categoryError || (categories?.length ?? 0) !== slugs.length) {
    throw new Error("Choose only active customer business categories.");
  }

  const { error: deleteError } = await db
    .from("employee_business_category_access")
    .delete()
    .eq("employee_profile_id", employeeProfileId);
  if (deleteError) throw new Error("Unable to replace employee business access.");
  if (!categories?.length) return;

  const { error: insertError } = await db
    .from("employee_business_category_access")
    .insert(categories.map((category) => ({
      employee_profile_id: employeeProfileId,
      customer_business_category_id: category.id,
    })));
  if (insertError) throw new Error("Unable to save employee business access.");
}
