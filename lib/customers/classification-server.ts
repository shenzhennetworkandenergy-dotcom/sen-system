import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  BANGLADESH_DISTRICTS,
  CUSTOMER_BUSINESS_CATEGORIES,
  validateCustomerClassification,
} from "@/lib/customers/classification";

export async function getCustomerClassificationOptions() {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("customer_business_categories")
    .select("id,name,slug")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error("Unable to load customer business categories.");
  return {
    categories: data?.length ? data : CUSTOMER_BUSINESS_CATEGORIES,
    districts: BANGLADESH_DISTRICTS,
  };
}

export async function persistCustomerClassification(
  customerProfileId: string,
  categorySlugs: string[],
  districtCode: string | null,
) {
  const validation = validateCustomerClassification(categorySlugs, districtCode);
  if (!validation.ok) throw new Error(validation.message);
  const db = createSupabaseAdminClient();
  const { data: customer, error: customerError } = await db
    .from("profiles")
    .select("id")
    .eq("id", customerProfileId)
    .eq("role", "customer")
    .maybeSingle();
  if (customerError || !customer) throw new Error("Choose a valid customer.");
  const { data: categories, error: categoryError } = await db
    .from("customer_business_categories")
    .select("id,slug")
    .in("slug", [...new Set(categorySlugs.map((slug) => slug.trim().toLowerCase()))])
    .eq("is_active", true);
  if (categoryError || (categories?.length ?? 0) !== new Set(categorySlugs).size) {
    throw new Error("Choose only active customer business categories.");
  }
  const { error: classificationError } = await db
    .from("customer_classifications")
    .upsert({ customer_profile_id: customerProfileId, district_code: districtCode?.toLowerCase() ?? null, updated_at: new Date().toISOString() });
  if (classificationError) throw new Error("Unable to save customer district.");
  const { error: deleteError } = await db
    .from("customer_business_category_assignments")
    .delete()
    .eq("customer_profile_id", customerProfileId);
  if (deleteError) throw new Error("Unable to replace customer categories.");
  const { error: insertError } = await db.from("customer_business_category_assignments").insert(
    (categories ?? []).map((category) => ({ customer_profile_id: customerProfileId, customer_business_category_id: category.id })),
  );
  if (insertError) throw new Error("Unable to save customer categories.");
}

export async function getCustomerClassification(customerProfileId: string) {
  const db = createSupabaseAdminClient();
  const [{ data: classification }, { data: assignments }] = await Promise.all([
    db.from("customer_classifications").select("district_code").eq("customer_profile_id", customerProfileId).maybeSingle(),
    db.from("customer_business_category_assignments").select("customer_business_categories(slug,name)").eq("customer_profile_id", customerProfileId),
  ]);
  return {
    districtCode: classification?.district_code ?? null,
    categories: (assignments ?? []).map((row) => row.customer_business_categories as unknown as { slug: string; name: string }).filter(Boolean),
  };
}
