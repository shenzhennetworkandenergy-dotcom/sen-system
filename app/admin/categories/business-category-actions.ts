"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import {
  parseBusinessCategoryForm,
  resolveBusinessCategoryDeletion,
} from "@/lib/catalog/business-category-policy";
import {
  registerArchiveEntry,
  removeArchiveEntry,
} from "@/lib/deletion/archive";
import { getDeletionMode } from "@/lib/deletion/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function categoryTarget(type: "success" | "error", message: string) {
  return `/admin/categories?${type}=${encodeURIComponent(message)}`;
}

function safeCategoryError(message: string) {
  if (/duplicate key|already exists/i.test(message)) {
    return "A business category already uses that name or slug.";
  }
  if (
    /required|invalid|hexadecimal|field|option|order|under|not found/i.test(
      message,
    )
  ) {
    return message;
  }
  return "Unable to save the business category.";
}

function refreshCategoryPaths() {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products/new");
}

async function saveBusinessCategory(
  categoryId: string | null,
  form: FormData,
) {
  const permission = categoryId ? "products.edit" : "products.create";
  const { profile } = await requirePermission(permission);
  try {
    const parsed = parseBusinessCategoryForm(form);
    const { data: savedId, error } = await createSupabaseAdminClient().rpc(
      "admin_save_business_category",
      {
        actor_profile_id: profile.id,
        requested_category_id: categoryId,
        requested_category: parsed.category,
        requested_fields: parsed.fields,
      },
    );
    if (error || !savedId) {
      throw new Error(error?.message ?? "Business category save failed.");
    }
    await writeAuditLog({
      actorId: profile.id,
      actorRole: profile.role,
      action: categoryId
        ? "product.business_category_updated"
        : "product.business_category_created",
      module: "products",
      entityType: "business_category",
      entityId: String(savedId),
      description: `${parsed.category.name} business category ${categoryId ? "updated" : "created"}.`,
      newValues: {
        ...parsed.category,
        field_count: parsed.fields.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Business category save failed", { message });
    redirect(categoryTarget("error", safeCategoryError(message)));
  }
  refreshCategoryPaths();
  redirect(
    categoryTarget(
      "success",
      `Business category ${categoryId ? "updated" : "created"}.`,
    ),
  );
}

export async function createBusinessCategoryAction(form: FormData) {
  return saveBusinessCategory(null, form);
}

export async function updateBusinessCategoryAction(
  categoryId: string,
  form: FormData,
) {
  return saveBusinessCategory(categoryId, form);
}

export async function moveBusinessCategoryAction(
  categoryId: string,
  direction: "up" | "down",
) {
  const { profile } = await requirePermission("products.edit");
  const { error } = await createSupabaseAdminClient().rpc(
    "admin_move_business_category",
    {
      actor_profile_id: profile.id,
      requested_category_id: categoryId,
      requested_direction: direction,
    },
  );
  if (error) {
    console.error("Business category move failed", {
      code: error.code,
      message: error.message,
    });
    redirect(categoryTarget("error", "Unable to change category order."));
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "product.business_category_reordered",
    module: "products",
    entityType: "business_category",
    entityId: categoryId,
    description: `Business category moved ${direction}.`,
  });
  refreshCategoryPaths();
  redirect(categoryTarget("success", "Business category order updated."));
}

export async function toggleBusinessCategoryAction(
  categoryId: string,
  active: boolean,
) {
  const { profile } = await requirePermission("products.edit");
  const db = createSupabaseAdminClient();
  const { data: category, error } = await db
    .from("business_categories")
    .update({
      is_active: active,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId)
    .is("archived_at", null)
    .select("id,name")
    .maybeSingle();
  if (error || !category) {
    redirect(categoryTarget("error", "Unable to change category status."));
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: active
      ? "product.business_category_activated"
      : "product.business_category_deactivated",
    module: "products",
    entityType: "business_category",
    entityId: categoryId,
    description: `${category.name} business category ${active ? "activated" : "deactivated"}.`,
  });
  refreshCategoryPaths();
  redirect(
    categoryTarget(
      "success",
      `Business category ${active ? "activated" : "deactivated"}.`,
    ),
  );
}

export async function deleteBusinessCategoryAction(categoryId: string) {
  const { profile } = await requireProfile(["admin"]);
  const db = createSupabaseAdminClient();
  const [
    { data: category },
    { count: productCount, error: productError },
    { count: productCategoryCount, error: classificationError },
    mode,
  ] = await Promise.all([
    db
      .from("business_categories")
      .select("id,name")
      .eq("id", categoryId)
      .is("archived_at", null)
      .maybeSingle(),
    db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_category_id", categoryId),
    db
      .from("product_categories")
      .select("id", { count: "exact", head: true })
      .eq("business_category_id", categoryId),
    getDeletionMode(),
  ]);
  if (!category || productError || classificationError) {
    redirect(
      categoryTarget("error", "Unable to validate this business category."),
    );
  }

  const decision = resolveBusinessCategoryDeletion(mode.operation, {
    productCount: productCount ?? 0,
    productCategoryCount: productCategoryCount ?? 0,
  });
  if (decision.operation === "reject") {
    redirect(categoryTarget("error", decision.message));
  }

  if (decision.operation === "archive") {
    const { error } = await db
      .from("business_categories")
      .update({
        is_active: false,
        archived_at: new Date().toISOString(),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", categoryId);
    if (error) {
      redirect(categoryTarget("error", "Unable to archive this category."));
    }
    await registerArchiveEntry(profile.id, {
      entityType: "business_category",
      entityId: categoryId,
      displayName: category.name,
      reason: "Deleted while Permanent Deletion Mode was disabled",
      metadata: {
        product_count: productCount ?? 0,
        product_category_count: productCategoryCount ?? 0,
      },
    });
  } else {
    const { error } = await db
      .from("business_categories")
      .delete()
      .eq("id", categoryId);
    if (error) {
      redirect(
        categoryTarget(
          "error",
          "Unable to permanently delete this business category.",
        ),
      );
    }
    try {
      await removeArchiveEntry("business_category", categoryId);
    } catch {
      // The category may never have been archived.
    }
  }

  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action:
      decision.operation === "archive"
        ? "product.business_category_archived"
        : "product.business_category_deleted",
    module: "products",
    entityType: "business_category",
    entityId: categoryId,
    description: `${category.name} business category ${decision.operation === "archive" ? "moved to the Archive" : "permanently deleted"}.`,
  });
  refreshCategoryPaths();
  revalidatePath("/admin/archive");
  redirect(
    categoryTarget(
      "success",
      decision.operation === "archive"
        ? "Business category moved to the Archive."
        : "Business category permanently deleted.",
    ),
  );
}

