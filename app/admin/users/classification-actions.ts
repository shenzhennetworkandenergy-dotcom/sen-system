"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { persistCustomerClassification } from "@/lib/customers/classification-server";

export async function saveCustomerClassificationAction(customerId: string, form: FormData) {
  await requireProfile(["admin"]);
  const categorySlugs = form.getAll("category_slugs").map(String);
  const districtCode = String(form.get("district_code") ?? "").trim() || null;
  try {
    await persistCustomerClassification(customerId, categorySlugs, districtCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save classification.";
    redirect(`/admin/users/${customerId}?classificationError=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/users/${customerId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/sales/new");
  redirect(`/admin/users/${customerId}?classificationSuccess=Classification%20saved.`);
}
