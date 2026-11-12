import "server-only";

import type { Profile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CustomerVisibilityActor = Pick<Profile, "id" | "role" | "status">;

export const CUSTOMER_VISIBILITY_DENIED_MESSAGE =
  "This customer is outside your assigned business categories.";

function visibilityFunctionIsUnavailable(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || error.code === "42883" || /function .* does not exist/i.test(error.message ?? "");
}

async function getVisibleCustomerIdsFromAssignments(actorId: string) {
  const db = createSupabaseAdminClient();
  const { data: access, error: accessError } = await db
    .from("employee_business_category_access")
    .select("customer_business_category_id,customer_business_categories!inner(is_active)")
    .eq("employee_profile_id", actorId)
    .eq("customer_business_categories.is_active", true);
  if (accessError) throw accessError;
  const categoryIds = [...new Set((access ?? []).map((row) => row.customer_business_category_id))];
  if (!categoryIds.length) return [];

  const customerIds = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("customer_business_category_assignments")
      .select("customer_profile_id,profiles!inner(role,status,archived_at)")
      .in("customer_business_category_id", categoryIds)
      .eq("profiles.role", "customer")
      .eq("profiles.status", "active")
      .is("profiles.archived_at", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) customerIds.add(row.customer_profile_id);
    if ((data?.length ?? 0) < pageSize) break;
  }
  return [...customerIds];
}

export async function getVisibleCustomerIds(
  actor: CustomerVisibilityActor,
): Promise<string[] | null> {
  if (actor.role === "admin" && actor.status === "active") return null;
  if (actor.role !== "employee" || actor.status !== "active") return [];

  const { data, error } = await createSupabaseAdminClient().rpc(
    "visible_customer_profile_ids",
    { requested_actor_profile_id: actor.id },
  );
  if (error) {
    if (visibilityFunctionIsUnavailable(error)) {
      try {
        return await getVisibleCustomerIdsFromAssignments(actor.id);
      } catch (fallbackError) {
        console.error("Customer visibility compatibility lookup failed", fallbackError);
        throw new Error("Unable to verify customer visibility.");
      }
    }
    console.error("Customer visibility lookup failed", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    throw new Error("Unable to verify customer visibility.");
  }
  const rows = (data ?? []) as Array<{ customer_profile_id: string }>;
  return [...new Set(rows.map((row) => row.customer_profile_id))];
}

export async function assertCustomerVisibleToActor(
  actor: CustomerVisibilityActor,
  customerProfileId: string,
) {
  if (actor.role === "admin" && actor.status === "active") return;
  if (actor.role !== "employee" || actor.status !== "active") {
    throw new Error(CUSTOMER_VISIBILITY_DENIED_MESSAGE);
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    "customer_is_visible_to_actor",
    {
      requested_actor_profile_id: actor.id,
      requested_customer_profile_id: customerProfileId,
    },
  );
  if (error) {
    if (visibilityFunctionIsUnavailable(error)) {
      try {
        const visibleCustomerIds = await getVisibleCustomerIdsFromAssignments(actor.id);
        if (!visibleCustomerIds.includes(customerProfileId)) throw new Error(CUSTOMER_VISIBILITY_DENIED_MESSAGE);
        return;
      } catch (fallbackError) {
        if (fallbackError instanceof Error && fallbackError.message === CUSTOMER_VISIBILITY_DENIED_MESSAGE) throw fallbackError;
        console.error("Customer visibility compatibility assertion failed", fallbackError);
        throw new Error("Unable to verify customer visibility.");
      }
    }
    console.error("Customer visibility assertion failed", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    throw new Error("Unable to verify customer visibility.");
  }
  if (data !== true) throw new Error(CUSTOMER_VISIBILITY_DENIED_MESSAGE);
}

export function customerIdIsVisible(
  visibleCustomerIds: string[] | null,
  customerProfileId: string,
) {
  return visibleCustomerIds === null || visibleCustomerIds.includes(customerProfileId);
}

export async function getAssignableCustomerCategorySlugs(
  actor: CustomerVisibilityActor,
): Promise<string[] | null> {
  if (actor.role === "admin" && actor.status === "active") return null;
  if (actor.role !== "employee" || actor.status !== "active") return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("employee_business_category_access")
    .select("customer_business_categories!inner(slug)")
    .eq("employee_profile_id", actor.id);
  if (error) {
    console.error("Employee customer category lookup failed", { code: error.code, message: error.message });
    throw new Error("Unable to verify customer category access.");
  }
  return [...new Set((data ?? []).flatMap((row) => {
    const category = row.customer_business_categories as unknown as { slug: string } | null;
    return category?.slug ? [category.slug] : [];
  }))];
}

export async function assertCustomerCategoriesAssignableToActor(
  actor: CustomerVisibilityActor,
  requestedSlugs: string[],
) {
  const allowed = await getAssignableCustomerCategorySlugs(actor);
  if (allowed === null) return;
  const requested = [...new Set(requestedSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))];
  if (!requested.length || requested.some((slug) => !allowed.includes(slug))) {
    throw new Error("Choose only your assigned business categories for this customer.");
  }
}
